"""One bounded collection successor, waiting for a named normal predecessor.

No service restarts, failure requeue, model calls, or training operations.
Run hidden with stdout/stderr redirected; the receipt is not coverage proof.
"""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.school_sync_status import status
from scripts.sync_school_archive import PipelineLock, PipelineBusyError, atomic_json, now, sync_archive


def decision(snapshot, predecessor):
    if snapshot.get('errors', {}).get('read_errors'):
        return 'state_unreadable'
    pipeline = snapshot.get('pipeline', {})
    if pipeline.get('run_id') != predecessor:
        return 'predecessor_changed'
    locks = snapshot.get('locks', {})
    held = [locks.get(key, {}).get('held') for key in ('pipeline', 'crawler')]
    if any(value is not True and value is not False for value in held):
        return 'lock_state_unknown'
    if any(held):
        return 'wait'
    if pipeline.get('reported_status') not in {'completed', 'completed_with_errors'}:
        return 'predecessor_not_completed'
    return 'ready'


def continue_collection(root, predecessor, receipt, *, rounds=64, wait_seconds=7200,
                        download_only=False,
                        reader=status, runner=sync_archive, sleep=time.sleep,
                        clock=time.monotonic, code_check=None):
    if rounds < 1 or not math.isfinite(wait_seconds) or wait_seconds <= 0:
        raise ValueError('Positive finite wait and positive rounds required.')
    root, receipt = Path(root).resolve(), Path(receipt).resolve()
    data = Path(os.environ.get('CAMPUS_DATA', str(root / 'data'))).resolve()
    if not receipt.is_relative_to((root / 'reports').resolve()):
        raise ValueError('Receipt must stay under project reports.')
    if code_check is None:
        code_check = lambda: not subprocess.check_output(
            ['git', 'status', '--porcelain', '--', 'app', 'scripts', 'tests'], cwd=root, text=True).strip()
    with PipelineLock(data / 'school-archive/collection-successor.lock'):
        # Existing receipts cannot be mistaken for a newly scheduled successor.
        with receipt.open('x', encoding='utf-8') as stream:
            json.dump({'status': 'created', 'predecessor': predecessor}, stream)
        record = {'created_at': now(), 'predecessor': predecessor, 'rounds_limit': rounds,
                  'wait_seconds_limit': wait_seconds, 'status': 'waiting',
                  'model_or_embedding_calls': 0, 'full_school_coverage_proven': False}
        record['download_only'] = bool(download_only)
        atomic_json(receipt, record)
        deadline = clock() + wait_seconds
        while True:
            snapshot = reader(root)
            action = decision(snapshot, predecessor)
            record.update(checked_at=now(), observed=snapshot, decision=action)
            if action != 'wait':
                break
            if clock() >= deadline:
                record['status'] = 'wait_expired'
                atomic_json(receipt, record)
                return record
            atomic_json(receipt, record)
            sleep(min(30, max(0, deadline - clock())))
        if action != 'ready':
            record['status'] = 'refused'
            atomic_json(receipt, record)
            return record
        if not code_check():
            record.update(status='refused', decision='uncommitted_implementation')
            atomic_json(receipt, record)
            return record
        record.update(status='starting', started_at=now())
        atomic_json(receipt, record)
        try:
            # The core rechecks predecessor identity under its own OS lock.
            state = runner(root, rounds=rounds, max_requests=500, import_limit=700,
                           doc_limit=20, rediscover_archived=not download_only,
                           stop_when_exhausted=True, expected_previous_run=predecessor,
                           download_only=download_only)
        except Exception as exc:
            record.update(status='start_or_execution_failed', error_type=type(exc).__name__)
            atomic_json(receipt, record)
            raise
        record.update(status='successor_finished', finished_at=now(),
                      successor={key: state.get(key) for key in (
                          'run_id', 'status', 'rounds_completed', 'exitcode', 'stop_reason', 'logs_directory')})
        atomic_json(receipt, record)
        return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--predecessor', required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--rounds', type=int, default=64)
    parser.add_argument('--wait-seconds', type=float, default=7200)
    parser.add_argument('--download-only', action='store_true',
                        help='Continue downloads without import, conversion, or archived HTML replay.')
    args = parser.parse_args()
    try:
        record = continue_collection(ROOT, args.predecessor, args.receipt,
                                     rounds=args.rounds, wait_seconds=args.wait_seconds,
                                     download_only=args.download_only)
    except PipelineBusyError:
        print(json.dumps({'status': 'busy', 'successor_started': False}))
        return 75
    print(json.dumps({key: value for key, value in record.items() if key != 'observed'}))
    return 0 if record['status'] == 'successor_finished' else 1


if __name__ == '__main__':
    raise SystemExit(main())
