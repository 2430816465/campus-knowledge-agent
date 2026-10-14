import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

from test_school_sync_status import LockOwner


ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / 'scripts' / 'start_school_sync.ps1'
PWSH = shutil.which('pwsh.exe') or shutil.which('powershell.exe')


def fixture_project(tmp_path):
    root = tmp_path / 'fixture campus project with spaces'
    (root / 'scripts').mkdir(parents=True)
    (root / 'reports').mkdir()
    shutil.copyfile(ROOT / 'scripts' / 'school_sync_status.py', root / 'scripts' / 'school_sync_status.py')
    # This is a finite Python argv/log fixture, NOT the crawler/pipeline. It
    # neither imports application code nor performs HTTP/business DB writes.
    (root / 'scripts' / 'sync_school_archive.py').write_text('''import json,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
(root/'reports'/'fixture-argv.json').write_text(json.dumps(sys.argv[1:]))
print('fixture-output',flush=True)
print('fixture-error',file=sys.stderr,flush=True)
time.sleep(.1)
''', encoding='utf-8')
    return root


def ps_command(*arguments):
    return [PWSH, '-NoLogo', '-NoProfile', '-NonInteractive', *arguments]


@pytest.mark.parametrize('powershell', [shutil.which('pwsh.exe'), shutil.which('powershell.exe')])
def test_powershell_launcher_parses_without_executing(powershell):
    if not powershell:
        pytest.skip('PowerShell unavailable.')
    code = '''$tokens=$null; $errors=$null;
[System.Management.Automation.Language.Parser]::ParseFile($env:FIXTURE_LAUNCHER,[ref]$tokens,[ref]$errors) | Out-Null;
if($errors.Count){$errors | ForEach-Object {$_.Message};exit 1};exit 0'''
    result = subprocess.run([powershell, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', code],
                            env={**os.environ, 'FIXTURE_LAUNCHER': str(LAUNCHER)}, capture_output=True,
                            text=True, timeout=15)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.skipif(os.name != 'nt' or not PWSH, reason='Hidden Start-Process Windows integration test.')
def test_hidden_launch_uses_safe_argv_and_redirected_distinct_logs(tmp_path):
    root = fixture_project(tmp_path)
    environment = os.environ.copy()
    environment.pop('CAMPUS_DATA', None)
    environment['PYTHONUTF8'] = '1'
    result = subprocess.run(ps_command('-File', str(LAUNCHER), '-ProjectRoot', str(root),
        '-Python', sys.executable, '-Rounds', '2', '-MaxRequests', '0', '-ImportLimit', '7',
        '-DocLimit', '3', '-SkipDoc', '-RediscoverArchived', '-StopWhenExhausted', '-DownloadOnly', '-Cohort', str(root/'scripts/sync_school_archive.py')), env=environment,
        capture_output=True, text=True, encoding='utf-8', timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    receipt = json.loads(result.stdout)
    assert receipt['spawned'] and receipt['pid_is_informational_only']
    assert receipt['status'] == 'spawned_pending_core_lock'
    argv = root / 'reports' / 'fixture-argv.json'
    deadline = time.monotonic() + 5
    while not argv.exists() and time.monotonic() < deadline:
        time.sleep(.02)
    assert json.loads(argv.read_text()) == ['--rounds', '2', '--max-requests', '0', '--import-limit', '7',
                                            '--doc-limit', '3', '--skip-doc', '--cohort', str((root/'scripts/sync_school_archive.py').resolve()), '--rediscover-archived', '--stop-when-exhausted', '--download-only']
    stdout, stderr = Path(receipt['stdout_log']), Path(receipt['stderr_log'])
    while time.monotonic() < deadline and ('fixture-output' not in stdout.read_text() or 'fixture-error' not in stderr.read_text()):
        time.sleep(.02)
    assert stdout != stderr and 'fixture-output' in stdout.read_text() and 'fixture-error' in stderr.read_text()
    assert stdout.resolve().is_relative_to((root / 'data').resolve())
    assert not (root / 'data' / 'school-archive' / 'frontier.sqlite3').exists()


@pytest.mark.skipif(os.name != 'nt' or not PWSH, reason='Hidden Start-Process Windows integration test.')
@pytest.mark.parametrize('lock_name', ['pipeline', 'crawler'])
def test_launcher_refuses_real_busy_os_lock_without_receipt_or_pid(tmp_path, lock_name):
    root = fixture_project(tmp_path)
    environment = os.environ.copy()
    environment.pop('CAMPUS_DATA', None)
    with LockOwner(root / 'data' / 'school-archive' / (lock_name + '.lock')):
        result = subprocess.run(ps_command('-File', str(LAUNCHER), '-ProjectRoot', str(root),
            '-Python', sys.executable), env=environment, capture_output=True, text=True,
            encoding='utf-8', timeout=20)
    assert result.returncode == 75, result.stdout + result.stderr
    receipt = json.loads(result.stdout)
    assert not receipt['spawned'] and receipt['reason'] == 'existing_lock_held'
    assert not (root / 'reports' / 'fixture-argv.json').exists()
    assert not (root / 'data' / 'school-sync-launch-logs').exists()


def test_launcher_has_no_visible_window_or_scheduled_service_configuration():
    script = LAUNCHER.read_text(encoding='utf-8')
    assert '-WindowStyle Hidden' in script
    assert '-RedirectStandardOutput' in script and '-RedirectStandardError' in script
    assert 'Register-ScheduledTask' not in script and 'New-Service' not in script


@pytest.mark.skipif(os.name != 'nt' or not PWSH, reason='Hidden Start-Process Windows integration test.')
def test_relative_campus_data_uses_same_lock_from_outside_project(tmp_path):
    root = fixture_project(tmp_path)
    environment = {**os.environ, 'CAMPUS_DATA': 'custom data'}
    with LockOwner(root / 'custom data' / 'school-archive' / 'pipeline.lock'):
        result = subprocess.run(ps_command('-File', str(LAUNCHER), '-ProjectRoot', str(root),
            '-Python', sys.executable), cwd=tmp_path, env=environment, capture_output=True,
            text=True, encoding='utf-8', timeout=20)
    assert result.returncode == 75, result.stdout + result.stderr
    assert not json.loads(result.stdout)['spawned']
    assert not (root / 'reports' / 'fixture-argv.json').exists()
