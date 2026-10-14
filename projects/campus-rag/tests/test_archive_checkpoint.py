import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
import scripts.checkpoint_school_archive as checkpoint


@pytest.fixture
def live_archive(tmp_path):
    root = tmp_path / 'project'
    archive = root / 'data/school-archive'
    (archive / 'blobs').mkdir(parents=True)
    writer = sqlite3.connect(archive / 'frontier.sqlite3')
    assert writer.execute('PRAGMA journal_mode=WAL').fetchone()[0] == 'wal'
    writer.execute('PRAGMA wal_autocheckpoint=0')
    writer.executescript('''
        CREATE TABLE urls(url TEXT PRIMARY KEY,state TEXT,import_state TEXT,sha256 TEXT,bytes INTEGER,document_id TEXT);
        CREATE TABLE fetch_history(url TEXT,sha256 TEXT,bytes INTEGER);
    ''')
    def blob(content, write=True):
        digest = hashlib.sha256(content).hexdigest()
        if write:
            (archive / 'blobs' / digest).write_bytes(content)
        return digest
    def url(name, digest=None, size=None, state='fetched', imported='imported'):
        writer.execute('INSERT INTO urls VALUES(?,?,?,?,?,?)', (name, state, imported, digest, size, 'business-document'))
        writer.commit()
    try:
        yield root, archive, writer, blob, url
    finally:
        writer.close()


def read_manifest(summary):
    return json.loads(Path(summary['manifest']).read_text(encoding='utf-8'))


def test_live_wal_backup_is_consistent_deduplicated_and_standalone(live_archive, monkeypatch):
    root, archive, writer, blob, url = live_archive
    current, historical = blob(b'current'), blob(b'historical')
    url('one', current, len(b'current'))
    url('alias', current, len(b'current'))
    writer.execute('INSERT INTO fetch_history VALUES(?,?,?)', ('one', historical, len(b'historical')))
    writer.commit()
    assert Path(str(archive / 'frontier.sqlite3') + '-wal').stat().st_size > 0
    # The live writer is left active, including an uncommitted row. A raw main
    # file copy would miss WAL commits; this snapshot must include only commits.
    writer.execute("INSERT INTO urls VALUES('uncommitted','pending',NULL,NULL,NULL,NULL)")
    original_hash = checkpoint.sha256_file
    hashed = []
    def track_hash(path):
        hashed.append(Path(path))
        return original_hash(path)
    monkeypatch.setattr(checkpoint, 'sha256_file', track_hash)
    summary = checkpoint.checkpoint_archive(root)
    manifest = read_manifest(summary)
    assert summary['status'] == 'complete'
    assert summary['url_states'] == {'fetched': 2}
    assert summary['url_import_states'] == {'imported': 2}
    assert {item['sha256'] for item in manifest['blobs']} == {current, historical}
    assert len(manifest['blobs']) == 2
    assert all(item['exists'] and item['size_matches_recorded'] for item in manifest['blobs'])
    assert len(hashed) == 1 and hashed[0].name == 'frontier.sqlite3'
    snapshot = Path(summary['snapshot_database'])
    assert snapshot.resolve().is_relative_to((root / 'data/archive-checkpoints').resolve())
    assert not Path(str(snapshot) + '-wal').exists()
    with closing(sqlite3.connect(snapshot)) as restored:
        assert restored.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert restored.execute('SELECT COUNT(*) FROM urls').fetchone()[0] == 2
    writer.commit()
    assert writer.execute('SELECT COUNT(*) FROM urls').fetchone()[0] == 3
    assert original_hash(snapshot) == summary['snapshot_sha256']
    assert summary['blobs_copied'] is False
    assert summary['business_postgres_backup_included'] is False
    assert summary['cross_database_atomic_snapshot'] is False
    assert (root / 'reports/school-archive-checkpoint.json').is_file()


def test_missing_historical_and_corrupt_blobs_are_reported_without_omissions(live_archive):
    root, archive, writer, blob, url = live_archive
    good = blob(b'good')
    missing = blob(b'missing', write=False)
    corrupt = blob(b'right')
    (archive / 'blobs' / corrupt).write_bytes(b'wrong')  # Same length; only hash verification catches this.
    url('good', good, 4)
    url('corrupt', corrupt, 5)
    writer.execute('INSERT INTO fetch_history VALUES(?,?,?)', ('old-only', missing, 7)); writer.commit()
    summary = checkpoint.checkpoint_archive(root, verify_blobs=True)
    manifest = read_manifest(summary)
    assert summary['consistent_frontier_snapshot'] is True
    assert summary['status'] == 'complete_with_blob_gaps'
    assert summary['missing_blob_count'] == 1
    assert summary['blob_hash_mismatch_count'] == 1
    assert summary['blob_size_mismatch_count'] == 0
    assert summary['referenced_blob_count'] == 3
    assert {item['sha256'] for item in manifest['blobs']} == {good, missing, corrupt}
    by_hash = {item['sha256']: item for item in manifest['blobs']}
    assert by_hash[missing]['hash_verification'] == 'unavailable'
    assert by_hash[corrupt]['hash_verification'] == 'mismatch'


def test_invalid_hash_cannot_escape_blob_root(live_archive):
    root, archive, writer, blob, url = live_archive
    url('invalid', '../../outside-file', 10)
    summary = checkpoint.checkpoint_archive(root)
    manifest = read_manifest(summary)
    assert summary['status'] == 'complete_with_blob_gaps'
    assert not manifest['blobs']
    assert manifest['invalid_blob_references'][0]['sha256'] == '../../outside-file'
    assert summary['referenced_blob_count'] == 1


def test_source_outside_project_data_is_rejected_without_checkpoint(live_archive, tmp_path):
    root, archive, writer, blob, url = live_archive
    with pytest.raises(ValueError, match='Archive root must stay within'):
        checkpoint.checkpoint_archive(root, tmp_path / 'outside')
    assert not (root / 'data/archive-checkpoints').exists()


def test_recorded_size_mismatch_is_checked_without_content_hashing(live_archive):
    root, archive, writer, blob, url = live_archive
    digest = blob(b'bytes')
    url('bad-length', digest, 999)
    summary = checkpoint.checkpoint_archive(root)
    manifest = read_manifest(summary)
    assert summary['blob_size_mismatch_count'] == 1
    assert manifest['blobs'][0]['actual_bytes'] == 5
    assert manifest['blobs'][0]['hash_verification'] == 'not_requested'


def test_legacy_archive_without_history_table_is_supported(live_archive):
    root, archive, writer, blob, url = live_archive
    digest = blob(b'legacy')
    url('legacy', digest, 6)
    writer.execute('DROP TABLE fetch_history'); writer.commit()
    summary = checkpoint.checkpoint_archive(root, verify_blobs=True)
    assert summary['status'] == 'complete'
    assert read_manifest(summary)['blobs'][0]['hash_verification'] == 'matched'
