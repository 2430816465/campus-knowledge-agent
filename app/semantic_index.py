"""Rebuildable float32/memmap index with a resumable, single-writer job cache.

No ORM or Chunk.vector access occurs here. Callers provide a current metadata
snapshot and fetch candidate text from the business database before returning
evidence. The database remains the authority for visibility and source state.
"""
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import uuid
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .model_gate import FileMutex, ModelBusy
from .source_scope import eligibility


TEMPLATE = 'title-newline-text-v1'
SCHEMA = 1
GENERATION_NAME = re.compile(r'^gen-[0-9a-f]{32}$')
HASH = re.compile(r'^[0-9a-f]{64}$')


def now():
    return datetime.now(timezone.utc).isoformat()


def sha_text(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def sha_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def inside(root, *parts):
    root = Path(root).resolve()
    path = root.joinpath(*parts).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Semantic index path escapes its root.')
    return path


def replace_path(source, destination):
    # Windows scanners/readers can briefly deny rename even after our own
    # handles close. Keep the old pointer and retry a bounded interval.
    for attempt in range(5):
        try:
            os.replace(source, destination)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        replace_path(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def embedding_input(title, text):
    if not isinstance(title, str) or not isinstance(text, str) or not text.strip():
        raise ValueError('A chunk requires a title and nonempty text.')
    return title + '\n' + text


@dataclass(frozen=True)
class SourceChunk:
    chunk_id: str
    document_id: str
    source_sha256: str
    title: str
    text: str

    def task(self, model_digest, dimensions):
        if not self.chunk_id or not self.document_id or not HASH.fullmatch(self.source_sha256):
            raise ValueError('Invalid chunk/document identity or source hash.')
        content = embedding_input(self.title, self.text)
        identity = [self.chunk_id, self.document_id, self.source_sha256, sha_text(content),
                    model_digest, dimensions, TEMPLATE]
        key = sha_text(json.dumps(identity, ensure_ascii=False, separators=(',', ':')))
        return key, identity, content


def normalized_vectors(vectors, count, dimensions):
    try:
        array = np.asarray(vectors, dtype=np.float32)
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError('Invalid embedding matrix.') from error
    if array.shape != (count, dimensions) or not np.isfinite(array).all():
        raise ValueError('Embedding count, dimension or finite values are invalid.')
    norms = np.linalg.norm(array.astype(np.float64), axis=1)
    if not np.isfinite(norms).all() or (norms <= 0).any():
        raise ValueError('Embedding vectors must have a positive finite norm.')
    return np.ascontiguousarray(array / norms[:, None], dtype=np.float32)


class SemanticIndexBuilder:
    """Use as a context manager. Only its OS-lock owner may change the cache."""

    def __init__(self, root, model_digest, dimensions=1024):
        if not isinstance(model_digest, str) or not model_digest.strip():
            raise ValueError('An immutable model digest is required.')
        if not isinstance(dimensions, int) or isinstance(dimensions, bool) or dimensions < 1:
            raise ValueError('Embedding dimensions must be positive.')
        self.root = Path(root).resolve()
        self.model_digest, self.dimensions = model_digest, dimensions
        self.lock = FileMutex(inside(self.root, 'builder.lock'), timeout=0)
        self.connection = None

    def __enter__(self):
        self.lock.acquire()
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            self.connection = sqlite3.connect(inside(self.root, 'cache.sqlite3'), timeout=10)
            self.connection.row_factory = sqlite3.Row
            self.connection.execute('PRAGMA journal_mode=WAL')
            self.connection.executescript('''
                CREATE TABLE IF NOT EXISTS jobs (
                    job_key TEXT PRIMARY KEY, chunk_id TEXT NOT NULL, document_id TEXT NOT NULL,
                    source_sha256 TEXT NOT NULL, input_sha256 TEXT NOT NULL, model_digest TEXT NOT NULL,
                    dimensions INTEGER NOT NULL, template TEXT NOT NULL, input_text TEXT NOT NULL,
                    title_sha256 TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0,
                    state TEXT NOT NULL CHECK (state IN ('pending','working','ready','failed')),
                    vector BLOB, attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS jobs_active_state ON jobs(active,state);
                CREATE INDEX IF NOT EXISTS jobs_chunk ON jobs(chunk_id);
            ''')
            # Recovery is safe only after taking the single-writer OS lock.
            self.connection.execute("UPDATE jobs SET state='pending',error='interrupted',updated_at=? WHERE state='working'", (now(),))
            self.connection.commit()
            return self
        except BaseException:
            self.__exit__()
            raise

    def __exit__(self, *_):
        if self.connection is not None:
            self.connection.close()
            self.connection = None
        self.lock.release()

    def _db(self):
        if self.connection is None:
            raise RuntimeError('SemanticIndexBuilder must hold its context lock.')
        return self.connection

    def sync_inventory(self, sources, metadata_by_id):
        """Atomically replace the eligible inventory; unchanged ready jobs survive.

        The caller must read sources/metadata in one fresh database snapshot.
        No UUID watermark is used: newly imported arbitrary IDs are discovered.
        An interrupted scan rolls back instead of publishing a partial inventory.
        """
        db, counts, seen = self._db(), Counter(), set()
        try:
            db.execute('BEGIN IMMEDIATE')
            db.execute('UPDATE jobs SET active=0')
            for source in sources:
                if source.chunk_id in seen:
                    raise ValueError('Duplicate chunk ID in the current inventory.')
                seen.add(source.chunk_id)
                decision = eligibility(source.document_id, metadata_by_id)
                metadata = metadata_by_id.get(source.document_id, {})
                if not decision['eligible']:
                    counts['excluded'] += 1
                    continue
                if metadata.get('sha256') != source.source_sha256 or metadata.get('title') != source.title:
                    raise ValueError('Source metadata changed within the inventory snapshot.')
                key, identity, content = source.task(self.model_digest, self.dimensions)
                created = now()
                inserted = db.execute('''INSERT OR IGNORE INTO jobs
                    (job_key,chunk_id,document_id,source_sha256,input_sha256,model_digest,
                     dimensions,template,input_text,title_sha256,active,state,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,1,'pending',?,?)''',
                    (key, *identity, content, sha_text(source.title), created, created)).rowcount
                db.execute('UPDATE jobs SET active=1 WHERE job_key=?', (key,))
                counts['enqueued' if inserted else 'unchanged'] += 1
            db.commit()
            return dict(counts)
        except BaseException:
            db.rollback()
            raise

    def retry_failed(self):
        db = self._db()
        count = db.execute("UPDATE jobs SET state='pending',error=NULL,updated_at=? WHERE active=1 AND state='failed'", (now(),)).rowcount
        db.commit()
        return count

    def build_pending(self, embedder, *, limit=200, batch_size=4):
        if limit < 0 or batch_size < 1:
            raise ValueError('Limit must be nonnegative and batch size positive.')
        db, counts = self._db(), Counter()
        while counts['attempted'] < limit:
            rows = db.execute("SELECT job_key,input_text FROM jobs WHERE active=1 AND state='pending' AND model_digest=? AND dimensions=? AND template=? ORDER BY created_at,job_key LIMIT ?",
                              (self.model_digest, self.dimensions, TEMPLATE, min(batch_size, limit - counts['attempted']))).fetchall()
            if not rows:
                break
            db.executemany("UPDATE jobs SET state='working',updated_at=? WHERE job_key=?", [(now(), row['job_key']) for row in rows])
            db.commit()
            try:
                matrix = normalized_vectors(embedder([row['input_text'] for row in rows]), len(rows), self.dimensions)
            except ModelBusy:
                db.executemany("UPDATE jobs SET state='pending',error='model_busy',updated_at=? WHERE job_key=?", [(now(), row['job_key']) for row in rows])
                db.commit()
                counts['busy'] += len(rows)
                break
            except Exception as error:
                # Persist only the error class, never prompts or response bodies.
                db.executemany("UPDATE jobs SET state='failed',attempts=attempts+1,error=?,updated_at=? WHERE job_key=?", [(type(error).__name__, now(), row['job_key']) for row in rows])
                db.commit()
                counts['failed'] += len(rows)
                counts['attempted'] += len(rows)
                # Model changes require a new inventory/digest, not retries of
                # more old-digest tasks in the same invocation.
                if type(error).__name__ == 'ModelVersionChanged':
                    raise
                continue
            db.executemany("UPDATE jobs SET state='ready',vector=?,attempts=attempts+1,error=NULL,updated_at=? WHERE job_key=?", [(matrix[i].tobytes(), now(), row['job_key']) for i, row in enumerate(rows)])
            db.commit()
            counts['ready'] += len(rows)
            counts['attempted'] += len(rows)
        return dict(counts)

    def stats(self):
        db = self._db()
        counts = {row['state']: row['n'] for row in db.execute('SELECT state,count(*) n FROM jobs WHERE active=1 GROUP BY state')}
        return {'active': sum(counts.values()), 'states': counts,
                'cached_versions': db.execute('SELECT count(*) FROM jobs').fetchone()[0]}

    def publish(self):
        """Publish a complete immutable generation, then replace its pointer."""
        db = self._db()
        clauses = "active=1 AND state='ready' AND model_digest=? AND dimensions=? AND template=?"
        parameters = (self.model_digest, self.dimensions, TEMPLATE)
        count = db.execute('SELECT count(*) FROM jobs WHERE ' + clauses, parameters).fetchone()[0]
        fingerprint = hashlib.sha256()
        for row in db.execute('SELECT job_key FROM jobs WHERE ' + clauses + ' ORDER BY chunk_id', parameters):
            fingerprint.update((row[0] + '\n').encode('ascii'))
        inventory_sha = fingerprint.hexdigest()
        try:
            current = _generation(self.root)
            manifest = current[1]
            if (manifest['inventory_sha256'] == inventory_sha and manifest['model_digest'] == self.model_digest
                    and manifest['dimensions'] == self.dimensions):
                return {'published': False, 'generation': current[0].name, 'rows': count, 'reason': 'unchanged'}
        except (OSError, ValueError, KeyError, json.JSONDecodeError, sqlite3.Error):
            pass
        name = 'gen-' + uuid.uuid4().hex
        stage = inside(self.root, '.staging-' + uuid.uuid4().hex)
        stage.mkdir()
        vectors_path, rows_path = stage / 'vectors.npy', stage / 'rows.sqlite3'
        matrix = np.lib.format.open_memmap(vectors_path, mode='w+', dtype=np.float32, shape=(count, self.dimensions))
        rows_db = sqlite3.connect(rows_path)
        try:
            rows_db.execute('''CREATE TABLE rows (
                ordinal INTEGER PRIMARY KEY,job_key TEXT NOT NULL UNIQUE,
                chunk_id TEXT NOT NULL UNIQUE,document_id TEXT NOT NULL,
                source_sha256 TEXT NOT NULL,input_sha256 TEXT NOT NULL,title_sha256 TEXT NOT NULL)''')
            rows_db.execute('CREATE INDEX rows_document ON rows(document_id)')
            columns = 'job_key,chunk_id,document_id,source_sha256,input_sha256,title_sha256,vector'
            for ordinal, row in enumerate(db.execute('SELECT ' + columns + ' FROM jobs WHERE ' + clauses + ' ORDER BY chunk_id', parameters)):
                vector = np.frombuffer(row['vector'], dtype=np.float32)
                if vector.shape != (self.dimensions,) or not np.isfinite(vector).all() or not np.isclose(np.linalg.norm(vector), 1, atol=1e-5):
                    raise ValueError('Cached vector is corrupt; rebuild the affected task.')
                matrix[ordinal] = vector
                rows_db.execute('INSERT INTO rows VALUES (?,?,?,?,?,?,?)', (ordinal, *[row[column] for column in columns.split(',')[:-1]]))
            rows_db.commit()
            matrix.flush()
        finally:
            rows_db.close()
            matrix._mmap.close()
        manifest = {'schema': SCHEMA, 'generation': name, 'created_at': now(),
                    'dimensions': self.dimensions, 'model_digest': self.model_digest, 'template': TEMPLATE,
                    'rows': count, 'dtype': 'float32', 'normalized': True, 'inventory_sha256': inventory_sha,
                    'vectors_sha256': sha_file(vectors_path), 'rows_sha256': sha_file(rows_path)}
        atomic_json(stage / 'manifest.json', manifest)
        final = inside(self.root, name)
        replace_path(stage, final)
        atomic_json(inside(self.root, 'current.json'), {'schema': SCHEMA, 'generation': name})
        return {'published': True, 'generation': name, 'rows': count}

    def collect_generations(self, keep=3):
        """Remove only verified old derived files under this builder's OS lock.

        Retain the newest ``keep`` directories plus current. Open Windows mmap
        files are tried first, so busy readers leave their entire generation.
        Never recursively delete, follow symlinks, or touch cache/source files.
        """
        self._db()
        if type(keep) is not int or keep < 1:
            raise ValueError('At least one recent generation must be retained.')
        pointer = json.loads(inside(self.root, 'current.json').read_text(encoding='utf-8'))
        current = pointer.get('generation') if isinstance(pointer, dict) else None
        if not isinstance(current, str) or not GENERATION_NAME.fullmatch(current):
            raise ValueError('Cannot collect generations without a valid current pointer.')
        # Validate the live generation before touching anything else.
        _read_generation(self.root, current)
        def created_timestamp(path):
            try:
                metadata = json.loads(inside(self.root, path.name, 'manifest.json').read_text(encoding='utf-8'))
                created = datetime.fromisoformat(metadata['created_at'])
                if created.tzinfo is None:
                    raise ValueError('Generation timestamp must include timezone.')
                return created.timestamp()
            except (OSError, ValueError, KeyError, TypeError):
                return float('-inf')
        directories = sorted((path for path in self.root.iterdir() if GENERATION_NAME.fullmatch(path.name)
                              and path.is_dir() and not path.is_symlink()), key=created_timestamp, reverse=True)
        retained = {path.name for path in directories[:keep]} | {current}
        result = {'keep_recent': keep, 'retained': sorted(retained), 'deleted': [], 'skipped': []}
        fixed = ('vectors.npy', 'rows.sqlite3', 'manifest.json')
        for directory in directories:
            if directory.name in retained:
                continue
            removed = []
            try:
                directory = inside(self.root, directory.name)
                entries = list(directory.iterdir())
                if {entry.name for entry in entries} != set(fixed) or any(entry.is_symlink() or not entry.is_file() for entry in entries):
                    raise ValueError('Unexpected files or links in generation.')
                _read_generation(self.root, directory.name)
                # Probe the mmap file first: mapped Windows files deny unlink.
                for filename in fixed:
                    inside(self.root, directory.name, filename).unlink()
                    removed.append(filename)
                directory.rmdir()
                result['deleted'].append(directory.name)
            except (OSError, ValueError, KeyError, sqlite3.Error) as error:
                result['skipped'].append({'generation': directory.name, 'error_type': type(error).__name__,
                                          'removed_files': removed})
        return result


def _generation(root):
    pointer = json.loads(inside(root, 'current.json').read_text(encoding='utf-8'))
    if not isinstance(pointer, dict):
        raise ValueError('Invalid semantic generation pointer.')
    name = pointer.get('generation', '')
    if pointer.get('schema') != SCHEMA or not isinstance(name, str) or not GENERATION_NAME.fullmatch(name):
        raise ValueError('Invalid semantic generation pointer.')
    return _read_generation(root, name)


def _read_generation(root, name):
    if not isinstance(name, str) or not GENERATION_NAME.fullmatch(name):
        raise ValueError('Invalid semantic generation directory.')
    directory = inside(root, name)
    manifest = json.loads(inside(root, name, 'manifest.json').read_text(encoding='utf-8'))
    if not isinstance(manifest, dict):
        raise ValueError('Invalid semantic generation manifest.')
    if (manifest.get('schema') != SCHEMA or manifest.get('generation') != name
            or manifest.get('template') != TEMPLATE or manifest.get('dtype') != 'float32'
            or manifest.get('normalized') is not True or type(manifest.get('rows')) is not int
            or manifest['rows'] < 0 or type(manifest.get('dimensions')) is not int
            or manifest['dimensions'] < 1 or not isinstance(manifest.get('model_digest'), str)
            or not manifest['model_digest']):
        raise ValueError('Invalid semantic generation manifest.')
    for filename, field in [('vectors.npy', 'vectors_sha256'), ('rows.sqlite3', 'rows_sha256')]:
        if sha_file(inside(root, name, filename)) != manifest.get(field):
            raise ValueError('Semantic generation checksum mismatch.')
    return directory, manifest


class SemanticIndexReader:
    """Keep one read-only mmap per generation; never load JSON vectors."""

    def __init__(self, root):
        self.root = Path(root).resolve()
        self.matrix, self.rows, self.manifest, self.pointer_bytes = None, [], None, None
        self._lock = threading.RLock()

    def close(self):
        with self._lock:
            self._close()

    def _close(self):
        if self.matrix is not None:
            self.matrix._mmap.close()
        self.matrix, self.rows, self.manifest, self.pointer_bytes = None, [], None, None

    def refresh(self):
        with self._lock:
            self._refresh()

    def describe(self):
        """Small consistent generation description; no vectors or source text."""
        with self._lock:
            self._refresh()
            return {key: self.manifest[key] for key in
                    ('generation', 'rows', 'dimensions', 'model_digest')}

    def _refresh(self):
        pointer = inside(self.root, 'current.json').read_bytes()
        if self.matrix is not None and pointer == self.pointer_bytes:
            return
        directory, manifest = _generation(self.root)
        matrix = np.load(directory / 'vectors.npy', mmap_mode='r', allow_pickle=False)
        try:
            if matrix.dtype != np.float32 or matrix.shape != (manifest['rows'], manifest['dimensions']):
                raise ValueError('Semantic matrix shape/dtype mismatch.')
            with sqlite3.connect((directory / 'rows.sqlite3').as_uri() + '?mode=ro', uri=True) as connection:
                connection.row_factory = sqlite3.Row
                rows = [dict(row) for row in connection.execute('SELECT * FROM rows ORDER BY ordinal')]
            if len(rows) != manifest['rows'] or [row['ordinal'] for row in rows] != list(range(len(rows))):
                raise ValueError('Semantic row mapping mismatch.')
        except BaseException:
            matrix._mmap.close()
            raise
        self.close()
        self.matrix, self.rows, self.manifest, self.pointer_bytes = matrix, rows, manifest, pointer

    def search(self, query_vector, *, model_digest, metadata_by_id, fetch_chunks, limit=100,
               allowed_document_ids=None, kinds=('knowledge', 'policy', 'notice'), years=None,
               max_candidates=None):
        """Return fresh evidence or an explicit lexical-fallback reason.

        fetch_chunks(ids) must make a fresh selective query without Chunk.vector
        and return {id: {document_id,text,location}}. All metadata (including
        every ancestor) must be freshly read. Final answers need another state
        check after generation; this method cannot guarantee future validity.
        """
        with self._lock:
            return self._search(query_vector, model_digest=model_digest, metadata_by_id=metadata_by_id,
                                fetch_chunks=fetch_chunks, limit=limit, allowed_document_ids=allowed_document_ids,
                                kinds=kinds, years=years, max_candidates=max_candidates)

    def _search(self, query_vector, *, model_digest, metadata_by_id, fetch_chunks, limit,
                allowed_document_ids, kinds, years, max_candidates):
        result = {'available': False, 'reason': None, 'matches': [], 'stale_candidates': 0,
                  'candidate_limit_reached': False, 'generation': None}
        if limit < 1 or (max_candidates is not None and max_candidates < 1):
            raise ValueError('Search limits must be positive.')
        try:
            self.refresh()
        except (OSError, ValueError, KeyError, sqlite3.Error):
            return {**result, 'reason': 'index_unavailable'}
        if self.manifest['model_digest'] != model_digest:
            return {**result, 'reason': 'model_digest_mismatch'}
        query = normalized_vectors([query_vector], 1, self.manifest['dimensions'])[0]
        result.update(available=True, reason='indexed', generation=self.manifest['generation'])
        decisions, allowed = {}, np.zeros(len(self.rows), dtype=bool)
        for ordinal, row in enumerate(self.rows):
            document_id = row['document_id']
            metadata = metadata_by_id.get(document_id, {})
            if document_id not in decisions:
                decisions[document_id] = eligibility(document_id, metadata_by_id)
            decision = decisions[document_id]
            if (not decision['eligible'] or metadata.get('sha256') != row['source_sha256']
                    or not isinstance(metadata.get('title'), str) or sha_text(metadata['title']) != row['title_sha256']):
                continue
            if allowed_document_ids is not None and document_id not in allowed_document_ids:
                continue
            if kinds is not None and metadata.get('kind') not in kinds:
                continue
            if years is not None and not set(years).intersection(decision['effective_years']):
                continue
            allowed[ordinal] = True
        indices = np.flatnonzero(allowed)
        if not len(indices):
            result['reason'] = 'no_current_eligible_vectors'
            return result
        # Dot reads the mmap directly; no matrix[all_eligible] float-matrix copy.
        scores = self.matrix @ query
        budget = max_candidates or max(limit * 8, 256)
        if len(indices) > budget:
            indices = indices[np.argpartition(scores[indices], -budget)[-budget:]]
            result['candidate_limit_reached'] = True
        ordered = sorted(indices.tolist(), key=lambda i: (-float(scores[i]), self.rows[i]['chunk_id']))
        for start in range(0, len(ordered), 64):
            window = ordered[start:start + 64]
            fresh = fetch_chunks([self.rows[i]['chunk_id'] for i in window])
            if not isinstance(fresh, Mapping):
                raise ValueError('Fresh chunk lookup must return a mapping.')
            for ordinal in window:
                row, chunk = self.rows[ordinal], fresh.get(self.rows[ordinal]['chunk_id'])
                metadata = metadata_by_id[row['document_id']]
                if (not isinstance(chunk, Mapping) or chunk.get('document_id') != row['document_id']
                        or not isinstance(chunk.get('text'), str) or not chunk['text'].strip()
                        or sha_text(embedding_input(metadata['title'], chunk['text'])) != row['input_sha256']):
                    result['stale_candidates'] += 1
                    continue
                result['matches'].append({**row, 'score': float(scores[ordinal]),
                    'text': chunk['text'], 'location': chunk.get('location'),
                    'eligibility': decisions[row['document_id']]})
                if len(result['matches']) == limit:
                    return result
        return result


def reciprocal_rank_fusion(rankings, *, limit=100, k=60):
    """Rank eligible lexical/semantic lists; duplicate IDs count once per list."""
    if limit < 1 or k < 0:
        raise ValueError('Invalid RRF parameters.')
    scores, matches = Counter(), {}
    for ranking in rankings:
        seen = set()
        for rank, item in enumerate(ranking, 1):
            key = item['chunk_id']
            if key in seen:
                continue
            seen.add(key)
            scores[key] += 1.0 / (k + rank)
            matches.setdefault(key, item)
    return [{**matches[key], 'rrf_score': scores[key]} for key in sorted(scores, key=lambda key: (-scores[key], key))[:limit]]
