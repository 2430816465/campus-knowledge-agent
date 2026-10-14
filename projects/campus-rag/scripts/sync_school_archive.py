"""Run bounded archive, import and optional local DOC conversion in sequence.

Each invocation resumes through the existing durable frontier, not through an
in-memory cursor. No database, service, review field or credential is opened by
this coordinator. Child CLI reports and logs supply the observed results.
"""
import argparse
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


class PipelineBusyError(RuntimeError):
    pass


class ChildInterrupted(KeyboardInterrupt):
    def __init__(self, child_exitcode):
        super().__init__('Owned child interrupted.')
        self.child_exitcode = child_exitcode


class PipelineLock:
    """Nonblocking OS lock; keep its file in place even after unlocking."""
    def __init__(self, path):
        self.path, self.handle = Path(path), None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open('a+b')
        try:
            if os.fstat(handle.fileno()).st_size == 0:
                handle.write(b'1')
                handle.flush()
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            handle.close()
            raise PipelineBusyError('School sync pipeline already in use; no second pipeline was started.') from exc
        self.handle = handle
        return self

    def __exit__(self, *_):
        if self.handle is None:
            return
        handle, self.handle = self.handle, None
        try:
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
        # Windows file indexers/readers can briefly hold a destination without
        # delete sharing. Keep the previous state intact and retry the atomic
        # replacement a bounded number of times; never unlink the live state.
        for attempt in range(5):
            try:
                temporary.replace(path)
                break
            except PermissionError:
                if os.name != 'nt' or attempt == 4:
                    raise
                time.sleep(.025 * (2 ** attempt))
    finally:
        if temporary.exists():
            temporary.unlink()


def previous_run(path):
    if not path.is_file():
        return None
    try:
        state = json.loads(path.read_text(encoding='utf-8'))
        return {key: state.get(key) for key in ('run_id', 'status', 'round', 'step', 'exitcode', 'updated_at')}
    except (OSError, ValueError, TypeError) as exc:
        return {'read_error': type(exc).__name__}


def report_bytes(path):
    try:
        content = path.read_bytes()
        stat = path.stat()
        identity = (stat.st_mtime_ns, len(content), hashlib.sha256(content).hexdigest())
        return content, identity
    except OSError:
        return None, None


def capture_report(source, before_identity, target, keys):
    content, identity = report_bytes(source)
    record = {'source_path': str(source), 'fresh': content is not None and identity != before_identity}
    if content is None:
        record['error'] = 'Expected child report is unavailable.'
        return record
    record.update(sha256=identity[2], bytes=identity[1])
    if not record['fresh']:
        record['error'] = 'Report was not updated by this child; previous counts are not attributed to this step.'
        return record
    try:
        report = json.loads(content)
        if not isinstance(report, dict):
            raise ValueError('Expected a report object.')
    except (ValueError, TypeError) as exc:
        record['error'] = f'Child report is invalid JSON: {type(exc).__name__}'
        return record
    target.write_bytes(content)
    record.update(snapshot_path=str(target), checked_at=report.get('checked_at'),
                  counts={key: report[key] for key in keys if key in report})
    return record


def log_tail(path, size=2 * 1024 * 1024):
    try:
        with path.open('rb') as stream:
            stream.seek(0, os.SEEK_END)
            stream.seek(max(0, stream.tell() - size))
            return stream.read().decode('utf-8', errors='replace')
    except OSError:
        return ''


def last_json_summary(path):
    for line in reversed(log_tail(path).splitlines()):
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                return value
        except ValueError:
            pass
    return {}


def stop_owned_child(process):
    """Stop only the child/group created here; never stop a shared service."""
    if process.poll() is not None:
        return
    try:
        if os.name == 'nt':
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
        return
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def run_child(command, cwd, stdout_path, stderr_path):
    environment = os.environ.copy()
    environment['PYTHONUTF8'] = '1'
    options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    with stdout_path.open('wb') as output, stderr_path.open('wb') as errors:
        process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL,
                                   stdout=output, stderr=errors, env=environment, **options)
        try:
            return process.wait()
        except KeyboardInterrupt as exc:
            stop_owned_child(process)
            raise ChildInterrupted(getattr(process, 'returncode', None)) from exc
        except BaseException:
            stop_owned_child(process)
            raise


STEPS = (
    ('archive', 'archive_school.py', 'school-archive.json',
     ('states', 'unique_blobs', 'retained_unique_blobs', 'downloaded_bytes', 'imported',
      'frontier_exhausted', 'full_school_coverage_proven', 'archived_rediscovery')),
    ('import', 'import_school_archive.py', 'school-archive-import.json',
     ('import_attempts_this_run', 'import_states', 'embedding_requested', 'retry_states', 'teacher_publication_performed')),
    ('doc', 'convert_archive_doc.py', 'archive-doc-conversion.json',
     ('attempts', 'converted', 'native_parsed', 'failed', 'embedding_requested', 'teacher_publication_performed')),
)


def sync_archive(project_root, *, rounds=1, max_requests=500, import_limit=300,
                 doc_limit=20, skip_doc=False, rediscover_archived=False, cohort=None,
                 stop_when_exhausted=False, expected_previous_run=None, download_only=False,
                 child_runner=run_child, on_progress=lambda _: None):
    if rounds < 1 or max_requests < 0 or import_limit < 1 or doc_limit < 1:
        raise ValueError('rounds/import-limit/doc-limit must be positive; max-requests must be nonnegative.')
    root = Path(project_root).resolve()
    cohort = str(Path(cohort).resolve(strict=True)) if cohort is not None else None
    data = Path(os.environ.get('CAMPUS_DATA', str(root / 'data'))).resolve()
    state_path = root / 'reports/school-sync-state.json'
    # Acquire before reading/updating state, so a rejected concurrent invocation
    # cannot overwrite the active run's progress or create a second log tree.
    with PipelineLock(data / 'school-archive/pipeline.lock'):
        prior = previous_run(state_path)
        if expected_previous_run is not None and (not prior or
                prior.get('run_id') != expected_previous_run or
                prior.get('status') not in {'completed', 'completed_with_errors'}):
            raise ValueError('Expected predecessor did not finish normally; no successor started.')
        run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + str(uuid.uuid4())
        logs = data / 'school-sync-logs' / run_id
        logs.mkdir(parents=True, exist_ok=False)
        state = {'schema_version': 1, 'run_id': run_id, 'started_at': now(),
                 'status': 'running', 'round': 0, 'step': 'starting', 'exitcode': None,
                 'rounds_requested': rounds, 'rounds_completed': 0, 'steps': [],
                 'project_root': str(root), 'data_root': str(data), 'logs_directory': str(logs),
                 'previous_run': prior,
                 'options': {'max_requests': max_requests, 'import_limit': import_limit,
                             'doc_limit': doc_limit, 'skip_doc': skip_doc,
                             'rediscover_archived_first_round_only': rediscover_archived, 'cohort': cohort,
                             'stop_when_exhausted': stop_when_exhausted, 'download_only': download_only},
                 'resume_note': 'Each invocation runs a bounded number of new rounds; existing CLI frontier/import/conversion records resume completed work. An interrupted child is retried through that durable frontier, never by blindly skipping a previously running step.',
                 'teacher_publication_performed': False}

        def save():
            state['updated_at'] = now()
            atomic_json(logs / 'state.json', state)
            atomic_json(state_path, state)

        active = None
        partial_errors = False
        save()
        try:
            for number in range(1, rounds + 1):
                state['round'] = number
                for step, script, report_name, keys in STEPS:
                    if download_only and step != 'archive':
                        continue
                    if step == 'doc' and skip_doc:
                        continue
                    state['step'], state['exitcode'] = step, None
                    prefix = f'round-{number:03d}-{step}'
                    stdout_path, stderr_path = logs / (prefix + '.stdout.log'), logs / (prefix + '.stderr.log')
                    command = [sys.executable, '-u', str(root / 'scripts' / script)]
                    if step == 'archive':
                        command += ['--max-requests', str(max_requests)]
                        if cohort is not None:
                            command += ['--cohort', cohort]
                        if number == 1 and rediscover_archived:
                            command += ['--rediscover-archived']
                    else:
                        command += ['--limit', str(import_limit if step == 'import' else doc_limit)]
                    source_report = root / 'reports' / report_name
                    _, before_identity = report_bytes(source_report)
                    active = {'round': number, 'step': step, 'status': 'running', 'started_at': now(),
                              'exitcode': None, 'command': command,
                              'stdout_log': str(stdout_path), 'stderr_log': str(stderr_path)}
                    state['steps'].append(active)
                    save()
                    on_progress({'run_id': run_id, 'round': number, 'step': step, 'status': 'running'})
                    code = child_runner(command, root, stdout_path, stderr_path)
                    active.update(ended_at=now(), exitcode=code, status='completed' if code == 0 else 'failed')
                    active['report'] = capture_report(source_report, before_identity,
                                                      logs / (prefix + '.report.json'), keys)
                    summary = last_json_summary(stdout_path)
                    active['stdout_counts'] = {key: summary[key] for key in (*keys, 'requests_this_run', 'refresh_queued_this_run') if key in summary}
                    busy = step == 'archive' and code != 0 and 'School archive already in use' in (log_tail(stderr_path) + log_tail(stdout_path))
                    counts = active['report'].get('counts', {})
                    # Only a completed conversion batch with recorded failures
                    # is a tolerable Office error. Missing CLI/configuration or
                    # broken reports stop instead of repeatedly retrying setup.
                    tolerable = (step == 'doc' and code == 1 and active['report']['fresh']
                                 and isinstance(counts.get('failed'), int) and counts['failed'] > 0)
                    active['continue_after_recorded_doc_failures'] = bool(tolerable)
                    if busy:
                        active['status'] = 'crawler_busy'
                        state.update(status='crawler_busy', exitcode=75)
                    elif code != 0 and not tolerable:
                        state.update(status='failed', exitcode=code)
                    elif 'error' in active['report']:
                        active['status'] = 'report_unverified'
                        state.update(status='failed', exitcode=1)
                    else:
                        partial_errors = partial_errors or tolerable
                        state['exitcode'] = code
                    save()
                    on_progress({'run_id': run_id, 'round': number, 'step': step,
                                 'status': active['status'], 'exitcode': code,
                                 'report': active['report']})
                    if state['status'] != 'running':
                        return state
                    active = None
                state['rounds_completed'] = number
                save()
                if stop_when_exhausted:
                    current = {item['step']: item['report']['counts'] for item in state['steps']
                               if item['round'] == number and item['report'].get('fresh') is True}
                    imports = current.get('import', {}).get('import_states')
                    if (current.get('archive', {}).get('frontier_exhausted') is True
                            and (download_only or isinstance(imports, dict) and imports.get('pending', 0) == 0)):
                        state['stop_reason'] = ('discovered_download_frontier_exhausted' if download_only
                                                else 'discovered_frontier_and_pending_imports_exhausted')
                        state['full_school_coverage_proven'] = False
                        break
            state.update(status='completed_with_errors' if partial_errors else 'completed',
                         step='complete', exitcode=1 if partial_errors else 0, completed_at=now())
            save()
            return state
        except KeyboardInterrupt as exc:
            if active is not None and active['status'] == 'running':
                # 130 is the coordinator's interruption code. The child may
                # have exited via Ctrl+Break/termination with a different code.
                active.update(status='interrupted', ended_at=now(), exitcode=getattr(exc, 'child_exitcode', None))
            state.update(status='interrupted', exitcode=130, interrupted_at=now())
            save()
            return state
        except Exception as exc:
            if active is not None and active['status'] == 'running':
                active.update(status='failed', ended_at=now())
            state.update(status='failed', exitcode=1, error=f'{type(exc).__name__}: {str(exc)[:300]}')
            save()
            return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rounds', type=int, default=1, help='Finite round count; default 1, never loops indefinitely.')
    parser.add_argument('--max-requests', type=int, default=500)
    parser.add_argument('--cohort', type=Path, help='Fixed download cohort; later discoveries remain queued.')
    parser.add_argument('--import-limit', type=int, default=300)
    parser.add_argument('--doc-limit', type=int, default=20)
    parser.add_argument('--skip-doc', action='store_true', help='Skip local Word conversion.')
    parser.add_argument('--rediscover-archived', action='store_true', help='Replay local HTML only before the first round crawler step.')
    parser.add_argument('--stop-when-exhausted', action='store_true', help='Stop after a full round with no discovered pending downloads or imports; failures remain explicit.')
    parser.add_argument('--expected-previous-run', help='Refuse under the core lock if this predecessor has not completed normally.')
    parser.add_argument('--download-only', action='store_true', help='Only discover and archive public bytes; no business import or DOC conversion.')
    args = parser.parse_args()
    if args.rounds < 1 or args.max_requests < 0 or args.import_limit < 1 or args.doc_limit < 1:
        parser.error('rounds/import-limit/doc-limit must be positive; max-requests must be nonnegative')
    try:
        state = sync_archive(Path(__file__).resolve().parents[1], rounds=args.rounds,
                             max_requests=args.max_requests, import_limit=args.import_limit,
                             doc_limit=args.doc_limit, skip_doc=args.skip_doc,
                             rediscover_archived=args.rediscover_archived, cohort=args.cohort,
                             stop_when_exhausted=args.stop_when_exhausted,
                             expected_previous_run=args.expected_previous_run,
                             download_only=args.download_only,
                             on_progress=lambda event: print(json.dumps(event, ensure_ascii=False), flush=True))
    except PipelineBusyError as exc:
        print(str(exc), file=sys.stderr, flush=True)
        return 75
    print(json.dumps({key: value for key, value in state.items() if key != 'steps'}, ensure_ascii=False), flush=True)
    return state['exitcode']


if __name__ == '__main__':
    raise SystemExit(main())
