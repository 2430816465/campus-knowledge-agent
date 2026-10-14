import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import scripts.sync_school_archive as sync


CHILD = r'''
import json, os, sys
from datetime import datetime, timezone
from pathlib import Path
root = Path.cwd()
name = Path(__file__).name
step = {'archive_school.py':'archive','import_school_archive.py':'import','convert_archive_doc.py':'doc'}[name]
trace = root / 'trace.jsonl'
prior = [json.loads(line) for line in trace.read_text().splitlines()] if trace.exists() else []
number = 1 + sum(item['step'] == step for item in prior)
with trace.open('a', encoding='utf-8') as stream:
    stream.write(json.dumps({'step':step,'args':sys.argv[1:],'number':number}) + '\n')
mode = os.environ.get('SYNC_TEST_MODE', '')
if step == 'archive' and mode == 'crawler_busy':
    print('RuntimeError: School archive already in use; wait for its crawler to exit.', file=sys.stderr)
    raise SystemExit(1)
report = {'checked_at':datetime.now(timezone.utc).isoformat(), 'teacher_publication_performed':False}
if step == 'archive':
    report.update(states={'fetched':number}, unique_blobs=number, full_school_coverage_proven=False)
    data = Path(os.environ.get('CAMPUS_DATA', str(root / 'data')))
    (data / 'school-archive').mkdir(parents=True, exist_ok=True)
    (data / 'school-archive/frontier-marker').write_text(str(number))
elif step == 'import':
    report.update(import_attempts_this_run=3, import_states={'imported':number}, embedding_requested=False)
else:
    partial = mode == 'doc_partial' and number == 1
    report.update(attempts=2, converted=1 if partial else 2, failed=1 if partial else 0, embedding_requested=False)
    if mode == 'native_office':
        report.update(converted=1, native_parsed=1)
reports = root / 'reports'
reports.mkdir(exist_ok=True)
filename = {'archive':'school-archive.json','import':'school-archive-import.json','doc':'archive-doc-conversion.json'}[step]
if mode != 'no_report':
    (reports / filename).write_text(json.dumps(report), encoding='utf-8')
print('child stdout ' + step)
print('child stderr ' + step, file=sys.stderr)
summary = dict(report)
if step == 'archive':
    summary['requests_this_run'] = 5
print(json.dumps(summary))
if mode == 'import_failure' and step == 'import':
    raise SystemExit(2)
if mode == 'doc_partial' and step == 'doc' and number == 1:
    raise SystemExit(1)
'''


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.delenv('CAMPUS_DATA', raising=False)
    monkeypatch.delenv('SYNC_TEST_MODE', raising=False)
    root = tmp_path / 'project with spaces'
    scripts = root / 'scripts'
    scripts.mkdir(parents=True)
    for _, filename, _, _ in sync.STEPS:
        (scripts / filename).write_text(CHILD, encoding='utf-8')
    shutil.copyfile(sync.__file__, scripts / 'sync_school_archive.py')
    return root


def trace(root):
    return [json.loads(line) for line in (root / 'trace.jsonl').read_text().splitlines()]


def test_native_original_result_survives_child_report_pipeline_and_compact_status(project, monkeypatch):
    from scripts.school_sync_status import last_results
    monkeypatch.setenv('SYNC_TEST_MODE', 'native_office')
    state = sync.sync_archive(project)
    assert state['status'] == 'completed'
    step = next(item for item in state['steps'] if item['step'] == 'doc')
    assert step['stdout_counts']['native_parsed'] == 1
    snapshot = json.loads(Path(step['report']['snapshot_path']).read_text(encoding='utf-8'))
    counts = next(item['counts'] for item in last_results(state) if item['step'] == 'doc')
    assert snapshot['native_parsed'] == counts['native_parsed'] == 1
    assert counts['attempts'] == counts['converted'] + counts['native_parsed'] + counts['failed'] == 2
    assert not counts['embedding_requested'] and not counts['teacher_publication_performed']


def test_cohort_propagated_only_to_download_child(project):
    cohort = project/'fixed baseline.json'
    cohort.write_text('{}')
    state = sync.sync_archive(project,rounds=2,cohort=cohort,skip_doc=True)
    calls = trace(project)
    assert state['options']['cohort'] == str(cohort.resolve())
    for call in calls:
        if call['step'] == 'archive':
            assert call['args'] == ['--max-requests','500','--cohort',str(cohort.resolve())]
        else:
            assert '--cohort' not in call['args']


def test_real_subprocess_sequence_defaults_rounds_and_frozen_reports(project):
    state = sync.sync_archive(project, rounds=2, rediscover_archived=True)
    assert state['status'] == 'completed' and state['exitcode'] == 0
    assert state['rounds_completed'] == 2
    calls = trace(project)
    assert [call['step'] for call in calls] == ['archive', 'import', 'doc'] * 2
    assert calls[0]['args'] == ['--max-requests', '500', '--rediscover-archived']
    assert calls[1]['args'] == ['--limit', '300'] and calls[2]['args'] == ['--limit', '20']
    assert calls[3]['args'] == ['--max-requests', '500']
    assert all(step['command'][0] == sys.executable and step['command'][1] == '-u' for step in state['steps'])
    for item in state['steps']:
        assert Path(item['stdout_log']).read_text(encoding='utf-8').startswith('child stdout')
        assert 'child stderr' in Path(item['stderr_log']).read_text(encoding='utf-8')
        assert item['report']['fresh'] and Path(item['report']['snapshot_path']).is_file()
        assert f"round-{item['round']:03d}-{item['step']}" in Path(item['stdout_log']).name
    assert state['steps'][0]['stdout_counts']['requests_this_run'] == 5
    first = json.loads(Path(state['steps'][0]['report']['snapshot_path']).read_text())
    last = json.loads((project / 'reports/school-archive.json').read_text())
    assert first['states'] == {'fetched': 1} and last['states'] == {'fetched': 2}
    persisted = json.loads((project / 'reports/school-sync-state.json').read_text(encoding='utf-8'))
    assert persisted == state
    assert json.loads((Path(state['logs_directory']) / 'state.json').read_text(encoding='utf-8')) == state
    assert not state['teacher_publication_performed']


def test_skip_doc_and_explicit_limits(project):
    state = sync.sync_archive(project, skip_doc=True, max_requests=0, import_limit=7, doc_limit=4)
    assert state['status'] == 'completed' and state['rounds_requested'] == 1
    assert [call['step'] for call in trace(project)] == ['archive', 'import']
    assert trace(project)[0]['args'] == ['--max-requests', '0']
    assert trace(project)[1]['args'] == ['--limit', '7']


def test_cli_runs_only_requested_rounds_and_passes_budget_options(project):
    result = subprocess.run([sys.executable, str(project / 'scripts/sync_school_archive.py'),
                             '--skip-doc', '--rounds', '2', '--max-requests', '11',
                             '--import-limit', '13', '--rediscover-archived'],
                            cwd=project, capture_output=True, text=True, encoding='utf-8', timeout=15)
    assert result.returncode == 0, result.stderr
    calls = trace(project)
    assert [call['step'] for call in calls] == ['archive', 'import'] * 2
    assert calls[0]['args'] == ['--max-requests', '11', '--rediscover-archived']
    assert calls[2]['args'] == ['--max-requests', '11']
    assert calls[1]['args'] == calls[3]['args'] == ['--limit', '13']
    assert json.loads(result.stdout.splitlines()[-1])['rounds_completed'] == 2


def test_crawler_busy_stops_without_retries_or_import(project, monkeypatch):
    monkeypatch.setenv('SYNC_TEST_MODE', 'crawler_busy')
    state = sync.sync_archive(project, rounds=3)
    assert state['status'] == 'crawler_busy' and state['exitcode'] == 75
    assert state['rounds_completed'] == 0
    assert [call['step'] for call in trace(project)] == ['archive']
    assert len(state['steps']) == 1 and state['steps'][0]['exitcode'] == 1
    assert not state['steps'][0]['report']['fresh']
    assert 'already in use' in Path(state['steps'][0]['stderr_log']).read_text()


def test_recorded_office_failure_continues_later_round_and_remains_failure(project, monkeypatch):
    monkeypatch.setenv('SYNC_TEST_MODE', 'doc_partial')
    state = sync.sync_archive(project, rounds=2)
    assert state['status'] == 'completed_with_errors' and state['exitcode'] == 1
    assert state['rounds_completed'] == 2
    assert [call['step'] for call in trace(project)] == ['archive', 'import', 'doc'] * 2
    failure = state['steps'][2]
    assert failure['exitcode'] == 1 and failure['continue_after_recorded_doc_failures']
    assert failure['report']['counts']['failed'] == 1
    assert json.loads(Path(failure['report']['snapshot_path']).read_text())['failed'] == 1
    assert json.loads((project / 'reports/archive-doc-conversion.json').read_text())['failed'] == 0


def test_import_failure_stops_and_preserves_report(project, monkeypatch):
    monkeypatch.setenv('SYNC_TEST_MODE', 'import_failure')
    state = sync.sync_archive(project, rounds=2)
    assert state['status'] == 'failed' and state['exitcode'] == 2
    assert [call['step'] for call in trace(project)] == ['archive', 'import']
    assert state['steps'][-1]['report']['counts']['import_attempts_this_run'] == 3


def test_doc_setup_crash_without_recorded_batch_stops_future_rounds(project):
    (project / 'scripts/convert_archive_doc.py').write_text('raise RuntimeError("test-only setup failure")')
    state = sync.sync_archive(project, rounds=3)
    assert state['status'] == 'failed' and state['step'] == 'doc'
    assert state['rounds_completed'] == 0
    assert len(state['steps']) == 3
    assert not state['steps'][-1]['continue_after_recorded_doc_failures']
    assert 'setup failure' in Path(state['steps'][-1]['stderr_log']).read_text()


def test_stale_report_is_never_attributed_to_new_success(project, monkeypatch):
    (project / 'reports').mkdir()
    (project / 'reports/school-archive.json').write_text('{"states":{"fetched":99999}}')
    monkeypatch.setenv('SYNC_TEST_MODE', 'no_report')
    state = sync.sync_archive(project)
    assert state['status'] == 'failed' and state['steps'][0]['status'] == 'report_unverified'
    assert not state['steps'][0]['report']['fresh']
    assert 'counts' not in state['steps'][0]['report']
    assert [call['step'] for call in trace(project)] == ['archive']


def test_interruption_state_survives_and_next_invocation_uses_durable_frontier(project):
    def interrupted(command, cwd, stdout_path, stderr_path):
        if Path(command[2]).name == 'import_school_archive.py':
            stdout_path.write_text('interrupted step')
            stderr_path.write_text('')
            raise KeyboardInterrupt
        return sync.run_child(command, cwd, stdout_path, stderr_path)
    first = sync.sync_archive(project, skip_doc=True, child_runner=interrupted)
    assert first['status'] == 'interrupted' and first['exitcode'] == 130
    assert first['step'] == 'import' and first['steps'][-1]['status'] == 'interrupted'
    assert (project / 'data/school-archive/frontier-marker').read_text() == '1'
    second = sync.sync_archive(project, skip_doc=True)
    assert second['status'] == 'completed'
    assert second['run_id'] != first['run_id']
    assert second['previous_run']['run_id'] == first['run_id']
    assert second['previous_run']['status'] == 'interrupted'
    assert [call['step'] for call in trace(project)] == ['archive', 'archive', 'import']
    assert (project / 'data/school-archive/frontier-marker').read_text() == '2'
    assert json.loads((Path(first['logs_directory']) / 'state.json').read_text())['status'] == 'interrupted'


def test_os_lock_rejects_second_pipeline_without_overwriting_active_state(project):
    state_path = project / 'reports/school-sync-state.json'
    state_path.parent.mkdir()
    state_path.write_text('{"run_id":"active","status":"running"}')
    before = state_path.read_bytes()
    with sync.PipelineLock(project / 'data/school-archive/pipeline.lock'):
        result = subprocess.run([sys.executable, str(project / 'scripts/sync_school_archive.py'), '--skip-doc'],
                                cwd=project, capture_output=True, text=True, timeout=15)
    assert result.returncode == 75 and 'already in use' in result.stderr
    assert state_path.read_bytes() == before
    assert not (project / 'trace.jsonl').exists()
    assert not (project / 'data/school-sync-logs').exists()
    assert (project / 'data/school-archive/pipeline.lock').is_file()


def test_lock_is_released_after_unclean_owner_exit(project):
    lock = project / 'data/school-archive/pipeline.lock'
    result = subprocess.run([sys.executable, '-c',
                             'from scripts.sync_school_archive import PipelineLock; import os,sys; '
                             'lock=PipelineLock(sys.argv[1]); lock.__enter__(); os._exit(0)', str(lock)],
                            cwd=Path(sync.__file__).resolve().parents[1], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    with sync.PipelineLock(lock):
        assert lock.is_file()


def test_data_environment_is_shared_with_child_clis(project, monkeypatch):
    data = project / 'custom data'
    monkeypatch.setenv('CAMPUS_DATA', str(data))
    state = sync.sync_archive(project, skip_doc=True)
    assert state['status'] == 'completed' and state['data_root'] == str(data.resolve())
    assert (data / 'school-archive/pipeline.lock').is_file()
    assert (data / 'school-archive/frontier-marker').read_text() == '1'
    assert Path(state['logs_directory']).is_relative_to(data)
    assert not (project / 'data').exists()


def test_child_interruption_stops_owned_process_before_propagating(tmp_path, monkeypatch):
    class Child:
        pid = 12345
        def __init__(self):
            self.wait_calls, self.stopped = 0, False
        def wait(self, timeout=None):
            self.wait_calls += 1
            if self.wait_calls == 1:
                raise KeyboardInterrupt
            self.stopped = True
            return -15
        def poll(self):
            return None
        def send_signal(self, value):
            self.stopped = True
    child = Child()
    options = {}
    def popen(command, **kwargs):
        options.update(kwargs)
        assert isinstance(command, list)
        return child
    monkeypatch.setattr(sync.subprocess, 'Popen', popen)
    if os.name != 'nt':
        monkeypatch.setattr(sync.os, 'killpg', lambda pid, sig: setattr(child, 'stopped', True))
    with pytest.raises(KeyboardInterrupt):
        sync.run_child([sys.executable, '-c', 'pass'], tmp_path, tmp_path / 'out.log', tmp_path / 'err.log')
    assert child.stopped and child.wait_calls == 2
    assert options['stdin'] == subprocess.DEVNULL
    assert options['env']['PYTHONUTF8'] == '1'
    assert not options.get('shell', False)


@pytest.mark.skipif(os.name != 'nt', reason='Windows file sharing semantics')
def test_state_replace_retries_transient_windows_share_denial_without_unlink(tmp_path, monkeypatch):
    target = tmp_path / 'state.json'
    target.write_text('{"status":"running"}')
    original = Path.replace
    attempts = []
    def replace(path, destination):
        attempts.append(path)
        assert target.is_file()
        if len(attempts) == 1:
            raise PermissionError('temporary Windows share denial')
        return original(path, destination)
    monkeypatch.setattr(Path, 'replace', replace)
    monkeypatch.setattr(sync.time, 'sleep', lambda _: None)
    sync.atomic_json(target, {'status': 'completed'})
    assert len(attempts) == 2
    assert json.loads(target.read_text())['status'] == 'completed'


@pytest.mark.skipif(os.name != 'nt', reason='Windows file sharing semantics')
def test_persistent_state_share_denial_is_bounded_and_preserves_previous_state(tmp_path, monkeypatch):
    target = tmp_path / 'state.json'
    target.write_text('{"status":"running"}')
    attempts = []
    def denied(path, destination):
        attempts.append(path)
        raise PermissionError('persistent Windows share denial')
    monkeypatch.setattr(Path, 'replace', denied)
    monkeypatch.setattr(sync.time, 'sleep', lambda _: None)
    with pytest.raises(PermissionError):
        sync.atomic_json(target, {'status': 'completed'})
    assert len(attempts) == 5
    assert json.loads(target.read_text()) == {'status': 'running'}
    assert list(tmp_path.glob('*.tmp')) == []


@pytest.mark.parametrize('options', [{'rounds': 0}, {'max_requests': -1}, {'import_limit': 0}, {'doc_limit': 0}])
def test_invalid_budgets_do_not_start_work(project, options):
    with pytest.raises(ValueError, match='positive'):
        sync.sync_archive(project, **options)
    assert not (project / 'trace.jsonl').exists()
    assert not (project / 'data').exists()


@pytest.mark.parametrize('prior', [None, {'run_id': 'other', 'status': 'completed'},
    {'run_id': 'original', 'status': 'running'}, {'run_id': 'original', 'status': 'failed'}])
def test_successor_identity_is_rechecked_inside_core_lock_before_state_replacement(project, prior):
    state_path = project / 'reports/school-sync-state.json'
    state_path.parent.mkdir()
    if prior is not None:
        state_path.write_text(json.dumps(prior))
    before = state_path.read_bytes() if state_path.exists() else None
    with pytest.raises(ValueError, match='predecessor'):
        sync.sync_archive(project, expected_previous_run='original')
    assert not (project / 'trace.jsonl').exists()
    assert (state_path.read_bytes() if state_path.exists() else None) == before
    assert not (project / 'data/school-sync-logs').exists()


def test_stop_after_fresh_exhaustion_still_finishes_import_and_conversion(project):
    script = project / 'scripts/archive_school.py'
    script.write_text(script.read_text().replace('unique_blobs=number,', 'frontier_exhausted=True, unique_blobs=number,'))
    state = sync.sync_archive(project, rounds=5, stop_when_exhausted=True)
    assert state['rounds_completed'] == 1
    assert [item['step'] for item in trace(project)] == ['archive', 'import', 'doc']
    assert state['stop_reason'] == 'discovered_frontier_and_pending_imports_exhausted'
    assert state['full_school_coverage_proven'] is False


@pytest.mark.parametrize('exhausted,pending', [(False, 0), (True, 2), ('true', 0)])
def test_pending_downloads_imports_or_nonboolean_flag_do_not_end_pass(project, exhausted, pending):
    archive = project / 'scripts/archive_school.py'
    archive.write_text(archive.read_text().replace('unique_blobs=number,', f'frontier_exhausted={exhausted!r}, unique_blobs=number,'))
    importer = project / 'scripts/import_school_archive.py'
    importer.write_text(importer.read_text().replace("import_states={'imported':number}",
        f"import_states={{'imported':number,'pending':{pending}}}"))
    state = sync.sync_archive(project, rounds=2, skip_doc=True, stop_when_exhausted=True)
    assert state['rounds_completed'] == 2 and 'stop_reason' not in state


def test_download_only_never_invokes_import_or_conversion_even_when_their_scripts_are_missing(project):
    (project / 'scripts/import_school_archive.py').unlink()
    (project / 'scripts/convert_archive_doc.py').unlink()
    state = sync.sync_archive(project, rounds=2, download_only=True)
    assert state['status'] == 'completed' and state['rounds_completed'] == 2
    assert [item['step'] for item in trace(project)] == ['archive', 'archive']
    assert state['options']['download_only'] is True
    assert state['teacher_publication_performed'] is False


def test_download_only_exhaustion_does_not_claim_imports_completed(project):
    script = project / 'scripts/archive_school.py'
    script.write_text(script.read_text().replace('unique_blobs=number,', 'frontier_exhausted=True, unique_blobs=number,'))
    state = sync.sync_archive(project, rounds=5, download_only=True, stop_when_exhausted=True)
    assert state['rounds_completed'] == 1 and len(trace(project)) == 1
    assert state['stop_reason'] == 'discovered_download_frontier_exhausted'
    assert state['full_school_coverage_proven'] is False


def test_download_only_cli_passes_explicit_mode_and_budget(project):
    result = subprocess.run([sys.executable, str(project / 'scripts/sync_school_archive.py'),
        '--download-only', '--stop-when-exhausted', '--rounds', '2', '--max-requests', '17'],
        cwd=project, capture_output=True, text=True, encoding='utf-8', timeout=15)
    assert result.returncode == 0, result.stderr
    assert [item['step'] for item in trace(project)] == ['archive', 'archive']
    assert all(item['args'] == ['--max-requests', '17'] for item in trace(project))
