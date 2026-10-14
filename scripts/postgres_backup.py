"""Local PostgreSQL snapshot backup and isolated restore drill; never replace an active DB."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.db import Base

CLI = Path('C:/Program Files/Docker/Docker/resources/bin/docker.exe')
CONTAINER = 'campus-business-business-db-1'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def tables(connection):
    result = {}
    for table in Base.metadata.sorted_tables:
        rows = [dict(row) for row in connection.execute(select(table)).mappings()]
        serialized = json.dumps(sorted(rows, key=lambda row: row['id']), ensure_ascii=False,
                                sort_keys=True, separators=(',', ':'))
        result[table.name] = {'rows': len(rows), 'sha256': hashlib.sha256(serialized.encode()).hexdigest()}
    return result


def docker(arguments, *, input_file=None, output_file=None):
    env = {**os.environ, 'PATH': str(CLI.parent) + os.pathsep + os.environ.get('PATH', '')}
    result = subprocess.run([str(CLI), 'exec', '-i', CONTAINER, *arguments], env=env,
                            stdin=input_file, stdout=output_file or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=240)
    if result.returncode:
        raise RuntimeError('PostgreSQL container operation failed; source retained (exit %s)' % result.returncode)
    return result.stdout


def runtime_url():
    return json.loads((ROOT / '.secrets/postgres-runtime.json').read_text(encoding='utf-8'))['DATABASE_URL']


def backup():
    url = runtime_url()
    parsed = make_url(url)
    assert parsed.host == '127.0.0.1' and parsed.port == 5433 and parsed.database == 'campus'
    folder = ROOT / 'data/postgres-backups' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True)
    (folder / 'raw').mkdir()
    engine = create_engine(url, isolation_level='REPEATABLE READ')
    with engine.connect() as connection, connection.begin():
        connection.execute(text('SET TRANSACTION READ ONLY'))
        snapshot = connection.scalar(text('SELECT pg_export_snapshot()'))
        with (folder / 'business.dump').open('wb') as output:
            docker(['pg_dump', '-U', parsed.username, '-d', parsed.database, '-Fc',
                    '--snapshot=' + snapshot], output_file=output)
        verified = tables(connection)
        documents = connection.execute(select(Base.metadata.tables['documents'])).mappings().all()
        raw_hashes = {}
        for document in documents:
            name = document['raw_name']
            assert name == Path(name).name, 'Unsafe raw filename'
            source = ROOT / 'data/raw' / name
            assert digest(source) == document['sha256'], 'Source original differs'
            shutil.copy2(source, folder / 'raw' / name)
            assert digest(folder / 'raw' / name) == document['sha256']
            raw_hashes[name] = document['sha256']
    engine.dispose()
    manifest = {'schema_version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
                'format': 'pg_dump custom', 'snapshot_consistent': True,
                'tables': verified, 'raw_hashes': raw_hashes,
                'dump_sha256': digest(folder / 'business.dump'), 'secrets_included': False,
                'warning': 'May contain private records; keep on approved local storage.'}
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'reports/latest-postgres-backup.json').write_text(
        json.dumps({'path': str(folder), **manifest}, ensure_ascii=False, indent=2), encoding='utf-8')
    return folder


def restore_check(folder):
    folder = Path(folder).resolve()
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    assert digest(folder / 'business.dump') == manifest['dump_sha256'], 'Dump damaged'
    dbname = 'campus_restore_' + uuid.uuid4().hex[:16]
    raw_target = ROOT / 'data/postgres-restore-checks' / dbname
    raw_target.mkdir(parents=True, exist_ok=False)
    (raw_target / 'raw').mkdir()
    for name, expected in manifest['raw_hashes'].items():
        assert name == Path(name).name and digest(folder / 'raw' / name) == expected
        shutil.copy2(folder / 'raw' / name, raw_target / 'raw' / name)
        assert digest(raw_target / 'raw' / name) == expected
    parsed = make_url(runtime_url())
    docker(['createdb', '-U', parsed.username, '--template=template0', dbname])
    with (folder / 'business.dump').open('rb') as source:
        docker(['pg_restore', '-U', parsed.username, '--exit-on-error', '--single-transaction',
                '--no-owner', '--no-acl', '-d', dbname], input_file=source)
    restored = create_engine(parsed.set(database=dbname))
    with restored.connect() as connection:
        verified = tables(connection)
        assert verified == manifest['tables'], 'Restored rows differ'
        constraints = connection.scalar(text("SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace"))
        assert constraints == 4
    from app.rag import retrieve
    with Session(restored) as session:
        hits, _ = retrieve(session, '2026五一数学建模我校报名时间', year=2026, semantic=False)
        assert any('4 月 12 日' in hit['text'] and '20:00' in hit['text'] for hit in hits)
    restored.dispose()
    report = {'checked_at': datetime.now().astimezone().isoformat(), 'passed': True,
              'backup': str(folder), 'restored_database': dbname, 'restored_files': str(raw_target),
              'verified_tables': verified, 'foreign_key_constraints': constraints,
              'raw_files_verified': len(manifest['raw_hashes']), 'real_notice_retrieval_passed': True,
              'active_database_overwritten': False, 'restore_database_retained': True}
    (ROOT / 'reports/postgres-restore-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['backup', 'restore-check', 'drill'])
    parser.add_argument('--backup')
    args = parser.parse_args()
    if args.action == 'restore-check':
        if not args.backup:
            parser.error('--backup is required')
        print(json.dumps(restore_check(args.backup), ensure_ascii=False, indent=2))
    else:
        folder = backup()
        print('PostgreSQL consistent backup created:', folder, flush=True)
        if args.action == 'drill':
            print(json.dumps(restore_check(folder), ensure_ascii=False, indent=2))
