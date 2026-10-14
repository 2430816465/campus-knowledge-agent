import pytest
from scripts.watch_downloaded_parse import decision
from scripts.parse_downloaded import run
from scripts.sync_school_archive import PipelineLock, PipelineBusyError


@pytest.mark.parametrize('status,held,ram,pending,disk,expected', [
    ('running', True, 6000, 50, True, 'wait_existing_parser'),
    ('waiting_memory_checkpoint_retained', False, 2000, 50, True, 'wait_memory'),
    ('bounded_run_completed', False, 4096, 50, True, 'ready'),
    ('downloaded_frontier_classified', False, 6000, 0, True, 'watch_downloads'),
    ('failed_child_checkpoint_retained', False, 6000, 50, True, 'predecessor_not_resumable'),
    ('no_progress_checkpoint_retained', False, 6000, 50, True, 'predecessor_not_resumable'),
    ('running', False, 6000, 50, True, 'predecessor_not_resumable'),
    ('bounded_run_completed', None, 6000, 50, True, 'lock_unknown'),
    ('bounded_run_completed', False, 6000, 50, False, 'wait_disk'),
])
def test_finite_supervisor_decisions(status, held, ram, pending, disk, expected):
    assert decision({'run_id':'r','status':status}, 'r', {'held':held}, ram, pending, disk) == expected


def test_changed_run_is_never_adopted():
    assert decision({'run_id':'other','status':'bounded_run_completed'}, 'r', {'held':False}, 6000, 50) == 'predecessor_changed'


@pytest.mark.parametrize('ram',[None, True, '6000', float('nan'), float('inf'), -1])
def test_unknown_memory_is_not_ready(ram):
    assert decision({'run_id':'r','status':'bounded_run_completed'},'r',{'held':False},ram,50)=='memory_unknown'


def test_supervisor_lock_does_not_compete_with_parser_but_rejects_duplicate(tmp_path):
    with PipelineLock(tmp_path/'parse-supervisor.lock'):
        with pytest.raises(PipelineBusyError):
            with PipelineLock(tmp_path/'parse-supervisor.lock'):
                pass
        with PipelineLock(tmp_path/'business-import.lock'):
            pass


def test_parser_rechecks_predecessor_under_actual_lock_before_creating_run(tmp_path, monkeypatch):
    import app.config
    import scripts.parse_downloaded as parser
    archive = tmp_path/'school-archive'; archive.mkdir()
    (archive/'frontier.sqlite3').touch()
    reports = tmp_path/'reports'; reports.mkdir()
    state = reports/'downloaded-parse-state.json'
    state.write_text('{"run_id":"changed","status":"bounded_run_completed"}', encoding='utf-8')
    monkeypatch.setattr(app.config, 'DATA', tmp_path)
    monkeypatch.setattr(parser, 'ROOT', tmp_path)
    with pytest.raises(ValueError, match='predecessor changed'):
        run(1, 1, 600, 1024, expected_previous_run='old')
    assert not (tmp_path/'parse-runs').exists()
    assert 'changed' in state.read_text('utf-8')


@pytest.mark.parametrize('rounds', [8,64])
@pytest.mark.parametrize('held,ram,starts', [(False, 6000, 1), (False, 2000, 0), (True, 6000, 0), (False,float('nan'),0), (False,None,0)])
def test_watch_lifecycle_is_bounded_and_never_starts_when_busy_or_low_memory(tmp_path, monkeypatch, held, ram, starts, rounds):
    import json
    import sqlite3
    from contextlib import nullcontext
    import scripts.watch_downloaded_parse as supervisor
    archive = tmp_path/'school-archive'; archive.mkdir()
    with sqlite3.connect(archive/'frontier.sqlite3') as db:
        db.execute('CREATE TABLE urls(state TEXT,import_state TEXT)')
        db.execute("INSERT INTO urls VALUES('fetched',NULL)")
    reports = tmp_path/'reports'; reports.mkdir()
    state = reports/'downloaded-parse-state.json'
    state.write_text(json.dumps({'run_id':'old','status':'bounded_run_completed'}), encoding='utf-8')
    monkeypatch.setattr(supervisor, 'ROOT', tmp_path)
    monkeypatch.setattr(supervisor, 'free_memory_mib', lambda: ram)
    monkeypatch.setattr(supervisor.subprocess, 'check_output', lambda *a, **kw: '')
    elapsed = [0]
    monkeypatch.setattr(supervisor.time, 'monotonic', lambda: elapsed[0])
    monkeypatch.setattr(supervisor.time, 'sleep', lambda seconds: elapsed.__setitem__(0, elapsed[0]+3600))
    calls = []
    def fake_run(*args, **kwargs):
        assert args == (rounds,100,600,1024)
        calls.append(kwargs)
        return {'run_id':'new','status':'bounded_run_completed','batches':[]}
    monkeypatch.setattr(supervisor, 'run', fake_run)
    opened=[]
    real_connect=sqlite3.connect
    def tracking_connect(*args,**kwargs):
        conn=real_connect(*args,**kwargs);opened.append(conn);return conn
    monkeypatch.setattr(supervisor.sqlite3,'connect',tracking_connect)
    with PipelineLock(archive/'business-import.lock') if held else nullcontext():
        result = supervisor.watch('old', hours=1, max_runs=1, data=tmp_path, rounds_per_run=rounds)
    assert result['status'] == ('memory_unknown' if ram is None or ram != ram else 'bounded_watch_finished')
    assert len(calls) == starts
    assert opened
    for conn in opened:
        with pytest.raises(sqlite3.ProgrammingError,match='closed'):conn.execute('SELECT 1')
    if calls:
        assert calls[0]['expected_previous_run'] == 'old'
        assert calls[0]['reserve_mib'] == 3072


@pytest.mark.parametrize('rounds',[0,65,-1,True,8.5,'8'])
def test_invalid_rounds_do_not_create_state_or_lock(tmp_path,rounds):
    from scripts.watch_downloaded_parse import watch
    with pytest.raises(ValueError,match='Parser rounds'):
        watch('old',data=tmp_path,rounds_per_run=rounds)
    assert list(tmp_path.iterdir()) == []


def test_short_run_fits_without_weakening_disk_growth_or_reserve():
    from scripts.watch_downloaded_parse import disk_budget_bytes, decision
    size=1285206016
    available=99_000_000_000
    assert disk_budget_bytes(size,8)==size*8*1.25+5*1024**3
    assert disk_budget_bytes(size,8)<available<disk_budget_bytes(size,64)
    assert decision({'run_id':'old','status':'bounded_run_completed'},'old',
        {'held':False},6000,100,available>=disk_budget_bytes(size,8))=='ready'
