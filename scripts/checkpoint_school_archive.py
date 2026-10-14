"""Consistent SQLite archive checkpoint while its crawler keeps running.

Only sqlite3.backup copies the database. Blobs stay in their original directory;
the manifest records every current/historical reference and its availability.
"""
import argparse
import hashlib
import json
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def within(path, root, label):
    resolved, boundary = Path(path).resolve(), Path(root).resolve()
    if not resolved.is_relative_to(boundary):
        raise ValueError(f'{label} must stay within {boundary}.')
    return resolved


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def blob_manifest(snapshot, archive_root, data_root, verify_blobs):
    references = {}
    tables = {row[0] for row in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for table in ('urls', 'fetch_history'):
        if table not in tables:
            continue
        columns = {row[1] for row in snapshot.execute(f'PRAGMA table_info({table})')}
        sizes = 'bytes' if 'bytes' in columns else 'NULL'
        for digest, recorded_bytes in snapshot.execute(f'SELECT sha256,{sizes} FROM {table} WHERE sha256 IS NOT NULL'):
            reference = references.setdefault(digest, {'recorded_bytes': set(), 'references': {}})
            reference['references'][table] = reference['references'].get(table, 0) + 1
            if recorded_bytes is not None:
                reference['recorded_bytes'].add(recorded_bytes)
    blobs, invalid = [], []
    blob_root = within(archive_root / 'blobs', archive_root, 'Archive blob root')
    for digest, reference in sorted(references.items(), key=lambda item: str(item[0])):
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            invalid.append({'sha256': digest, 'error': 'Invalid content hash; no filesystem access attempted.'})
            continue
        record = {'sha256': digest, 'recorded_bytes': sorted(reference['recorded_bytes']),
                  'references': reference['references'], 'exists': False, 'actual_bytes': None,
                  'size_matches_recorded': None, 'hash_verification': 'not_requested'}
        try:
            path = within(blob_root / digest, blob_root, 'Referenced blob')
            within(path, data_root, 'Referenced blob')
            record['path_relative_to_data'] = path.relative_to(data_root).as_posix()
            if path.is_file():
                record['exists'] = True
                record['actual_bytes'] = path.stat().st_size
                sizes = reference['recorded_bytes']
                record['size_matches_recorded'] = all(size == record['actual_bytes'] for size in sizes) if sizes else None
                if verify_blobs:
                    record['actual_sha256'] = sha256_file(path)
                    record['hash_verification'] = 'matched' if record['actual_sha256'] == digest else 'mismatch'
            elif verify_blobs:
                record['hash_verification'] = 'unavailable'
        except (OSError, ValueError) as exc:
            record['error'] = f'{type(exc).__name__}: {str(exc)[:300]}'
            if verify_blobs:
                record['hash_verification'] = 'unavailable'
        blobs.append(record)
    return blobs, invalid


def checkpoint_archive(project_root, archive_dir=None, verify_blobs=False):
    project_root = Path(project_root).resolve()
    data_root = (project_root / 'data').resolve()
    within(data_root, project_root, 'Project data root')
    archive_root = within(archive_dir or data_root / 'school-archive', data_root, 'Archive root')
    source_path = within(archive_root / 'frontier.sqlite3', archive_root, 'Source database')
    within(source_path, data_root, 'Source database')
    within(archive_root / 'blobs', archive_root, 'Archive blob root')
    checkpoint_root = within(data_root / 'archive-checkpoints', data_root, 'Checkpoint root')
    report_path = within(project_root / 'reports/school-archive-checkpoint.json', project_root, 'Checkpoint report')
    if not source_path.is_file():
        raise FileNotFoundError(f'Archive database not found: {source_path}')
    started = utc_now()
    checkpoint_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + str(uuid.uuid4())
    destination_dir = within(checkpoint_root / checkpoint_id, checkpoint_root, 'Checkpoint destination')
    within(destination_dir, data_root, 'Checkpoint destination')
    checkpoint_root.mkdir(parents=True, exist_ok=True)
    destination_dir.mkdir(exist_ok=False)
    destination_path = within(destination_dir / 'frontier.sqlite3', destination_dir, 'Snapshot database')
    manifest_path = destination_dir / 'manifest.json'
    manifest = {'schema_version': 1, 'checkpoint_id': checkpoint_id, 'started_at': started,
                'status': 'incomplete', 'source_database': str(source_path),
                'snapshot_database': str(destination_path), 'snapshot_method': 'sqlite3.backup',
                'blobs_copied': False, 'verify_blobs_requested': bool(verify_blobs),
                'business_postgres_backup_included': False, 'cross_database_atomic_snapshot': False,
                'recovery_note': '本快照仅恢复官网归档断点。须配合独立的已验证PostgreSQL业务备份及manifest引用的原blob文件恢复；两个备份时间独立，并非跨库原子快照，恢复时需核对document_id与业务版本对应关系。'}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    try:
        # mode=ro still reads committed WAL pages through SQLite. Never copy the
        # main database alone or use immutable=1, which would ignore live WAL.
        source_uri = 'file:' + quote(source_path.as_posix(), safe='/:') + '?mode=ro'
        with closing(sqlite3.connect(source_uri, uri=True, timeout=30)) as source:
            with closing(sqlite3.connect(destination_path, timeout=30)) as snapshot:
                source.backup(snapshot, pages=256, sleep=.05)
                # Make the finished snapshot a standalone file with no WAL
                # dependency before computing its hash or handing it off.
                snapshot.execute('PRAGMA journal_mode=DELETE').fetchone()
                integrity = [row[0] for row in snapshot.execute('PRAGMA integrity_check')]
                if integrity != ['ok']:
                    raise RuntimeError('Snapshot integrity_check failed: ' + '; '.join(integrity[:5]))
                manifest['url_states'] = {row[0]: row[1] for row in snapshot.execute("SELECT COALESCE(state,'unknown'),COUNT(*) FROM urls GROUP BY state")}
                manifest['url_import_states'] = {row[0]: row[1] for row in snapshot.execute("SELECT COALESCE(import_state,'pending'),COUNT(*) FROM urls GROUP BY import_state")}
                blobs, invalid = blob_manifest(snapshot, archive_root, data_root, verify_blobs)
                manifest['blobs'], manifest['invalid_blob_references'] = blobs, invalid
        manifest['snapshot_sha256'] = sha256_file(destination_path)
        manifest['snapshot_bytes'] = destination_path.stat().st_size
        manifest['integrity_check'] = 'ok'
        manifest['consistent_frontier_snapshot'] = True
        manifest['referenced_blob_count'] = len(blobs) + len(invalid)
        manifest['missing_blob_count'] = sum(not item['exists'] for item in blobs)
        manifest['blob_size_mismatch_count'] = sum(item['size_matches_recorded'] is False for item in blobs)
        manifest['blob_hash_mismatch_count'] = sum(item['hash_verification'] == 'mismatch' for item in blobs)
        manifest['blob_access_error_count'] = sum('error' in item for item in blobs)
        manifest['blob_hash_unavailable_count'] = sum(item['hash_verification'] == 'unavailable' for item in blobs)
        complete = not (invalid or manifest['missing_blob_count'] or manifest['blob_size_mismatch_count']
                        or manifest['blob_hash_mismatch_count'] or manifest['blob_access_error_count']
                        or manifest['blob_hash_unavailable_count'])
        manifest['blob_availability_complete'] = complete
        manifest['status'] = 'complete' if complete else 'complete_with_blob_gaps'
        manifest['completed_at'] = utc_now()
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        summary = {key: value for key, value in manifest.items() if key not in ('blobs', 'invalid_blob_references')}
        summary['manifest'] = str(manifest_path)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_report = report_path.with_name(report_path.name + '.' + uuid.uuid4().hex + '.tmp')
        temporary_report.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary_report.replace(report_path)
        return summary
    except Exception as exc:
        manifest['status'], manifest['error'] = 'incomplete', f'{type(exc).__name__}: {str(exc)[:500]}'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify-blobs', action='store_true', help='Hash every referenced blob; default checks only existence and recorded lengths.')
    parser.add_argument('--archive-dir', type=Path, help='Archive directory inside this project data root.')
    args = parser.parse_args()
    summary = checkpoint_archive(Path(__file__).resolve().parents[1], args.archive_dir, args.verify_blobs)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
