"""Derived verified grid rows; business DB remains source/permission authority."""
from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3

from sqlalchemy import select
from .db import Document
from .source_scope import eligibility

PARSER = 'verified-grid-row-v1'
NOTICE = '表格按列展示，非连续原文句子；单元格文字已核验，未经教师审核。'


def compact(value):
    return re.sub(r'\s+', '', value)


def verified_rows(audit):
    """Only complete rows with a verified same-table identifier header."""
    result = []
    for table in audit['tables']:
        header = None
        identifier_columns = []
        for row in table['rows']:
            if not row['complete_verified_rectangle']:
                continue
            cells = row['cells']
            labels = [compact(c['text']) for c in cells]
            identifiers = [i for i, label in enumerate(labels)
                           if re.fullmatch(r'(?:项目)?编号|项目代码', label)]
            if identifiers and len(cells) >= 2:
                header, identifier_columns = row, identifiers
                continue
            if header is None or len(cells) != len(header['cells']):
                continue
            keys = [labels[i] for i in identifier_columns
                    if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{5,39}', labels[i])
                    and re.search(r'\d', labels[i])]
            if not keys:
                continue
            # Each field retains both original cell bounds, not an invented quote.
            fields = [{'header': h['text'], 'header_bbox': h['bbox'],
                       'text': c['text'], 'bbox': c['bbox'], 'column': c['column']}
                      for h,c in zip(header['cells'], cells)]
            identity = f"pdf-grid:{audit['sha256']}:{table['page']}:{table['table']}:{row['row']}"
            result.append({'id': identity, 'sha256': audit['sha256'], 'page': table['page'],
                           'table': table['table'], 'row': row['row'], 'keys': keys, 'fields': fields})
    return result


def row_text(row):
    return '\n'.join(f"{compact(f['header'])}：{f['text']}" for f in row['fields'])


def open_writer(path):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=5)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS documents (sha TEXT, parser TEXT, result TEXT NOT NULL, PRIMARY KEY(sha,parser))')
    db.execute('CREATE TABLE IF NOT EXISTS grid_rows (id TEXT PRIMARY KEY, sha TEXT NOT NULL, parser TEXT NOT NULL, payload TEXT NOT NULL)')
    db.execute('CREATE INDEX IF NOT EXISTS grid_rows_sha ON grid_rows(sha,parser)')
    db.execute('CREATE TABLE IF NOT EXISTS grid_keys (key TEXT, row_id TEXT, parser TEXT, PRIMARY KEY(key,row_id,parser))')
    db.commit()
    return db


def save_audit(db, audit):
    rows = verified_rows(audit)
    digest = audit['sha256']
    summary = {k: audit[k] for k in ('nonempty_cells','verified_cells','unsupported_pages')}
    summary.update(rows=len(rows), parser=PARSER, state='indexed')
    # One PDF is atomic. A crash leaves the previous complete version resumable.
    with db:
        db.execute('DELETE FROM grid_keys WHERE parser=? AND row_id IN (SELECT id FROM grid_rows WHERE sha=? AND parser=?)',(PARSER,digest,PARSER))
        db.execute('DELETE FROM grid_rows WHERE sha=? AND parser=?', (digest,PARSER))
        db.executemany('INSERT INTO grid_rows VALUES (?,?,?,?)',
            [(r['id'],digest,PARSER,json.dumps(r,ensure_ascii=False,sort_keys=True)) for r in rows])
        db.executemany('INSERT INTO grid_keys VALUES (?,?,?)',
            [(key.upper(),r['id'],PARSER) for r in rows for key in set(r['keys'])])
        db.execute('INSERT OR REPLACE INTO documents VALUES (?,?,?)',
                   (digest,PARSER,json.dumps(summary,ensure_ascii=False)))
    return summary


def save_disposition(db, digest, state, reason):
    if state not in ('failed','deferred'):
        raise ValueError('Invalid grid disposition')
    with db:
        db.execute('DELETE FROM grid_keys WHERE parser=? AND row_id IN (SELECT id FROM grid_rows WHERE sha=? AND parser=?)',(PARSER,digest,PARSER))
        db.execute('DELETE FROM grid_rows WHERE sha=? AND parser=?',(digest,PARSER))
        db.execute('INSERT OR REPLACE INTO documents VALUES (?,?,?)',
                   (digest,PARSER,json.dumps({'state':state,'reason':reason,'rows':0})))


def cache_path():
    from .config import DATA
    return DATA/'table-index'/'rows.sqlite3'


def open_reader(path):
    path = Path(path)
    return sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True, timeout=2)


def live_metadata(session):
    return {r.id: dict(r._mapping) for r in session.execute(select(
        Document.id,Document.sha256,Document.parent_id,Document.visibility,Document.status,
        Document.kind,Document.title,Document.source_url,Document.published_at,
        Document.version,Document.warnings))}


def exact_key(question, key):
    return bool(re.search(r'(?<![A-Za-z0-9-])'+re.escape(key)+r'(?![A-Za-z0-9-])', question, re.I))


def retrieve_tables(session, question, document_ids=None, limit=6, path=None):
    """Exact complete identifier lookup; never claim exhaustive natural language filtering."""
    path = cache_path() if path is None else Path(path)
    keys = list(dict.fromkeys(re.findall(r'(?<![A-Za-z0-9-])([A-Za-z0-9][A-Za-z0-9-]{5,39})(?![A-Za-z0-9-])',question)))[:16]
    if not path.exists() or session is None or not keys:
        return []
    from .campus_qa import requested_years
    metadata = live_metadata(session)
    from .source_versions import enrich_metadata
    from .config import DATA
    metadata = enrich_metadata(metadata, DATA/'source-versions'/'evidence.sqlite3')
    documents = {}
    for identity, doc in metadata.items():
        if document_ids is not None and identity not in document_ids:
            continue
        decision = eligibility(identity, metadata)
        years = requested_years(question)
        if (doc['kind'] not in ('knowledge','policy','notice') or not decision['eligible']
                or (years and not years.intersection(decision['effective_years']))):
            continue
        documents.setdefault(doc['sha256'],[]).append(doc)
    matches = []
    with closing(open_reader(path)) as db:
        placeholders=','.join('?' for _ in keys)
        statement=('SELECT DISTINCT r.sha,r.payload FROM grid_rows r JOIN grid_keys k ON k.row_id=r.id AND k.parser=r.parser '
                   'WHERE r.parser=? AND k.key IN ('+placeholders+') ORDER BY r.id LIMIT 256')
        # Only placeholder counts enter SQL, never question/key content.
        for digest,payload in db.execute(statement,(PARSER,*(key.upper() for key in keys))):
            row = json.loads(payload)
            if digest not in documents or not any(exact_key(question,k) for k in row['keys']):
                continue
            for doc in documents[digest]:
                matches.append({**row,'document_id':doc['id'],'title':doc['title'],
                        'id':row['id']+':'+doc['id'], 'grid_id':row['id'],
                        'url':doc['source_url'],'text':row_text(row),'context':'',
                        'location':f"PDF 第 {row['page']} 页 / 表 {row['table']} / 行 {row['row']}（按列）",
                        'published_at':doc['published_at'],'version':doc['version'],'status':doc['status'],
                        'warnings':list(doc['warnings'] or [])+[NOTICE],
                        'original_version':doc.get('original_version'), 'score':1.0,'identity_score':1.0,
                        'quote_method':'verified_pdf_table_cells','supporting_chunks':[], 'context_chunks':[]})
    # Multiple matching rows stay distinct; no inference that project ID is unique.
    matches.sort(key=lambda r:(r['document_id'],r['page'],r['table'],r['row']))
    return matches[:limit]


def revalidate_table(row, metadata, path=None):
    """After model wait, recheck fresh authority and exact cached cell record."""
    path = cache_path() if path is None else Path(path)
    doc = metadata.get(row['document_id'])
    if not doc or not eligibility(row['document_id'],metadata)['eligible']:
        return False
    if row.get('id')!=row.get('grid_id','')+':'+row['document_id']:
        return False
    if doc.get('kind') not in ('knowledge','policy','notice'):
        return False
    if any(doc.get(k)!=row.get(r) for k,r in [('sha256','sha256'),('title','title'),
            ('source_url','url'),('published_at','published_at'),('version','version')]):
        return False
    if not path.exists():
        return False
    with closing(open_reader(path)) as db:
        found = db.execute('SELECT payload FROM grid_rows WHERE id=? AND sha=? AND parser=?',
                           (row['grid_id'],row['sha256'],PARSER)).fetchone()
    if found is None:
        return False
    stored = json.loads(found[0])
    return (stored['fields']==row.get('fields') and row.get('quote')==row_text(stored)
            and row.get('text')==row_text(stored)
            and all(stored[k]==row.get(k) for k in ('page','table','row')))
