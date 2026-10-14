import copy
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'school_sync_status.py'
spec = importlib.util.spec_from_file_location('school_sync_status', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def project(tmp_path):
    root = tmp_path / 'isolated project with spaces'
    (root / 'data' / 'school-archive').mkdir(parents=True)
    (root / 'reports').mkdir()
    database = root / 'data' / 'school-archive' / 'frontier.sqlite3'
    connection = sqlite3.connect(database)
    connection.execute('PRAGMA journal_mode=WAL')
    connection.execute('''CREATE TABLE urls(url TEXT PRIMARY KEY,host TEXT,state TEXT,
        import_state TEXT,sha256 TEXT,document_id TEXT,checked_at TEXT)''')
    connection.executemany('INSERT INTO urls VALUES(?,?,?,?,?,?,?)', [
        ('notice', 'www.njxzc.edu.cn', 'fetched', 'imported', 'a' * 64, 'doc', '2026-10-09T12:00:00+00:00'),
        ('new-notice', 'www.njxzc.edu.cn', 'pending', None, None, None, None),
        ('inflight', 'jw.njxzc.edu.cn', 'fetching', None, None, None, None),
        ('login', 'sso.njxzc.edu.cn', 'excluded', None, None, None, None),
        ('broken', 'jw.njxzc.edu.cn', 'failed', None, None, None, '2026-10-09T11:59:00+00:00'),
        ('image', 'www.njxzc.edu.cn', 'fetched', 'parse_failed', 'b' * 64, 'source', '2026-10-09T12:00:30+00:00'),
    ])
    connection.commit()
    return root, database, connection


def write_state(root, **updates):
    state = {'status': 'running', 'run_id': 'test-run', 'round': 2, 'step': 'archive',
             'rounds_completed': 1, 'rounds_requested': 3, 'exitcode': None,
             'updated_at': '2026-10-09T11:00:00+00:00', 'steps': []}
    state.update(updates)
    (root / 'reports' / 'school-sync-state.json').write_text(json.dumps(state), encoding='utf-8')
    return state


class LockOwner:
    """A real separate OS process, fixture-only; never loads the crawler."""
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        code = """import os,sys
path=sys.argv[1]
handle=open(path,'a+b')
if os.fstat(handle.fileno()).st_size == 0:
 handle.write(b'1'); handle.flush()
handle.seek(0)
if os.name == 'nt':
 import msvcrt; msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
else:
 import fcntl; fcntl.flock(handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
print('locked',flush=True)
sys.stdin.read()
"""
        self.process = subprocess.Popen([sys.executable, '-c', code, str(self.path)], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        assert self.process.stdout.readline().strip() == 'locked'
        return self

    def __exit__(self, *_):
        self.process.communicate('', timeout=10)
        assert self.process.returncode == 0


def test_absent_and_free_lock_probe_creates_or_changes_no_files(tmp_path):
    path = tmp_path / 'absent-dir' / 'pipeline.lock'
    assert module.probe_lock(path) == {'state': 'absent', 'held': False}
    assert not path.parent.exists()
    path.parent.mkdir()
    path.write_bytes(b'unchanged-lock-content')
    before = (path.read_bytes(), path.stat().st_mtime_ns)
    assert module.probe_lock(path) == {'state': 'free', 'held': False}
    assert before == (path.read_bytes(), path.stat().st_mtime_ns)


@pytest.mark.parametrize('lock_name', ['pipeline', 'crawler'])
def test_preflight_refuses_real_os_owner_without_pid_file(tmp_path, lock_name):
    root, database, connection = project(tmp_path)
    try:
        with LockOwner(database.parent / (lock_name + '.lock')):
            assert not (root / 'reports' / 'school-sync-launch.json').exists()
            result = subprocess.run([sys.executable, str(SCRIPT), '--project-root', str(root), '--preflight'],
                                    capture_output=True, text=True, encoding='utf-8', timeout=10)
            assert result.returncode == 75, result.stderr
            value = json.loads(result.stdout)
            assert value['locks'][lock_name] == {'state': 'held', 'held': True}
            assert not value['preflight']['allowed'] and not value['preflight']['pid_file_required']
        assert module.preflight(root)['preflight']['allowed']
    finally:
        connection.close()


def test_unknown_lock_permissions_fail_closed(tmp_path, monkeypatch):
    root, database, connection = project(tmp_path)
    try:
        original = Path.open
        def denied(path, *args, **kwargs):
            if path.name == 'pipeline.lock':
                raise PermissionError('not readable')
            return original(path, *args, **kwargs)
        monkeypatch.setattr(Path, 'open', denied)
        value = module.preflight(root)
        assert not value['preflight']['allowed'] and value['preflight']['reason'] == 'lock_status_unknown'
    finally:
        connection.close()


def test_readonly_live_wal_status_excludes_uncommitted_rows_and_never_recovers_fetching(tmp_path):
    root, database, connection = project(tmp_path)
    try:
        write_state(root)
        connection.execute("INSERT INTO urls VALUES('uncommitted','www.njxzc.edu.cn','fetched','imported',NULL,NULL,NULL)")
        before = database.read_bytes()
        value = module.status(root, observed_at=datetime(2026, 10, 9, 12, 1, tzinfo=timezone.utc))
        assert value['coverage']['discovered_urls'] == 6
        assert value['coverage']['fetched_urls'] == 2 and value['coverage']['pending_or_fetching_urls'] == 2
        assert value['archive']['url_states']['fetching'] == 1
        assert value['coverage']['known_in_scope_urls'] == 5
        assert value['coverage']['known_frontier_fetch_completion_ratio'] == 0.4
        assert value['coverage']['full_school_coverage_proven'] is False
        assert value['errors']['parse_failed'] == 1
        assert value['pipeline']['state_freshness']['stale'] is True
        assert value['frontier_freshness']['stale'] is False
        assert value['pipeline']['observed_status'] == 'inactive_with_unfinished_state'
        assert connection.in_transaction and database.read_bytes() == before
        assert connection.execute("SELECT state FROM urls WHERE url='inflight'").fetchone()[0] == 'fetching'
    finally:
        connection.rollback()
        connection.close()


def test_active_os_lock_overrides_stale_state_without_restarting_anything(tmp_path):
    root, database, connection = project(tmp_path)
    try:
        write_state(root)
        with LockOwner(database.parent / 'pipeline.lock'):
            value = module.status(root, observed_at=datetime(2026, 10, 9, 15, 0, tzinfo=timezone.utc))
        assert value['pipeline']['observed_status'] == 'active'
        assert value['pipeline']['state_freshness']['stale'] and value['frontier_freshness']['stale']
    finally:
        connection.close()


def test_missing_database_is_unknown_not_zero_coverage_and_not_created(tmp_path):
    root = tmp_path / 'empty'
    root.mkdir()
    value = module.status(root)
    assert value['archive'] is None and value['coverage']['available'] is False
    assert 'archive_database_missing' in value['errors']['read_errors']
    assert not (root / 'data').exists()


def test_compact_previous_comparison_ignores_age_and_per_url_timestamps(tmp_path):
    root, database, connection = project(tmp_path)
    try:
        write_state(root, status='completed', step='complete', exitcode=0)
        before = module.status(root, observed_at=datetime(2026, 10, 9, 12, 1, tzinfo=timezone.utc))
        after = module.status(root, observed_at=datetime(2026, 10, 9, 12, 2, tzinfo=timezone.utc), previous=before)
        assert after['change']['categories'] == [] and not after['change']['notify']
        connection.execute("UPDATE urls SET state='fetched',import_state='imported' WHERE url='new-notice'")
        connection.commit()
        changed = module.status(root, previous=after)
        assert changed['change']['categories'] == ['coverage_changed']
        connection.execute("UPDATE urls SET state='failed' WHERE url='inflight'")
        connection.commit()
        errors = module.status(root, previous=changed)
        assert set(errors['change']['categories']) == {'errors', 'coverage_changed'}
        write_state(root, status='completed', round=3, rounds_completed=3)
        important = module.status(root, previous=errors)
        assert important['change']['categories'] == ['important_results']
    finally:
        connection.close()


def test_only_fresh_compact_last_results_never_logs_or_report_urls(tmp_path):
    root, database, connection = project(tmp_path)
    try:
        write_state(root, steps=[
            {'round': 1, 'step': 'archive', 'status': 'completed', 'exitcode': 0,
             'command': ['private-command'], 'stderr_log': 'secret-log',
             'report': {'fresh': True, 'counts': {'unique_blobs': 2,
                'archived_rediscovery': {'replayed_html': 3, 'failed_html': 1,
                   'errors': [{'url': 'https://private.invalid/secret'}]}}}},
            {'round': 1, 'step': 'import', 'status': 'completed', 'exitcode': 0,
             'report': {'fresh': False, 'counts': {'import_attempts_this_run': 800}}},
        ])
        value = module.status(root)
        text = json.dumps(value)
        assert 'private-command' not in text and 'secret-log' not in text and 'private.invalid' not in text
        assert value['pipeline']['latest_results'][0]['counts']['unique_blobs'] == 2
        assert value['pipeline']['latest_results'][1]['counts'] == {}
    finally:
        connection.close()


def test_cli_previous_snapshot_outputs_single_compact_json(tmp_path):
    root, database, connection = project(tmp_path)
    try:
        previous = tmp_path / 'previous.json'
        previous.write_text(json.dumps(module.status(root)), encoding='utf-8')
        result = subprocess.run([sys.executable, str(SCRIPT), '--project-root', str(root), '--previous', str(previous)],
                                capture_output=True, text=True, encoding='utf-8', timeout=10)
        assert result.returncode == 0 and len(result.stdout.strip().splitlines()) == 1 and not result.stderr
        assert json.loads(result.stdout)['change']['notify'] is False
    finally:
        connection.close()


def test_custom_campus_data_matches_pipeline_without_reading_default(tmp_path, monkeypatch):
    root, database, connection = project(tmp_path)
    try:
        monkeypatch.setenv('CAMPUS_DATA', str(root / 'data'))
        assert module.status(root)['coverage']['discovered_urls'] == 6
        monkeypatch.setenv('CAMPUS_DATA', str(tmp_path / 'other-data'))
        assert module.status(root)['coverage']['available'] is False
    finally:
        connection.close()


@pytest.mark.parametrize('threshold', [-1, float('nan'), float('inf')])
def test_invalid_freshness_threshold_fails_explicitly(tmp_path, threshold):
    with pytest.raises(ValueError):
        module.status(tmp_path, stale_seconds=threshold)


def test_bad_previous_pipeline_shape_is_handled_as_unavailable_fields(tmp_path):
    root, database, connection = project(tmp_path)
    try:
        assert module.status(root, previous={'schema_version': 1, 'pipeline': None})['change']['previous_available']
    finally:
        connection.close()
