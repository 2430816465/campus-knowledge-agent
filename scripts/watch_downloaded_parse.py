"""Quiet bounded parser supervision, waiting for resources without killing tasks.

The supervisor has its own OS lock; the parser remains the final import arbiter.
Run for at most 24 hours of new-start scheduling and at most four parser runs.
An already started finite parser is allowed to finish beyond that window.
"""
import argparse
import json
import math
from contextlib import closing
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.parse_downloaded import free_memory_mib, run, stamp
from scripts.school_sync_status import probe_lock
from scripts.sync_school_archive import PipelineLock, PipelineBusyError, atomic_json

RESUMABLE = {'waiting_memory_checkpoint_retained', 'bounded_run_completed', 'downloaded_frontier_classified'}


def decision(state, expected, lock, ram_mib, pending, disk_ok=True):
    if state.get('run_id') != expected:
        return 'predecessor_changed'
    if lock.get('held') is True:
        return 'wait_existing_parser'
    if lock.get('held') is not False:
        return 'lock_unknown'
    if state.get('status') not in RESUMABLE:
        return 'predecessor_not_resumable'
    if pending == 0:
        return 'watch_downloads'
    if not disk_ok:
        return 'wait_disk'
    if type(ram_mib) not in (int, float) or not math.isfinite(ram_mib) or ram_mib < 0:
        return 'memory_unknown'
    if ram_mib < 4096:
        return 'wait_memory'
    return 'ready'


def disk_budget_bytes(frontier_bytes, rounds):
    if type(rounds) is not int or not 1 <= rounds <= 64:
        raise ValueError('Parser rounds must be an integer from 1 to 64')
    return frontier_bytes * rounds * 1.25 + 5 * 1024**3


def watch(predecessor, hours=24, max_runs=4, *, data=None, rounds_per_run=64):
    disk_budget_bytes(0, rounds_per_run)  # reject invalid budgets before any lock/write
    from app.config import DATA
    data = Path(data or DATA)
    frontier = data/'school-archive/frontier.sqlite3'
    expected = predecessor
    with PipelineLock(data/'school-archive/parse-supervisor.lock'):
        identity = stamp().replace(':', '').replace('+', '_')+'-'+uuid.uuid4().hex[:8]
        folder = data/'parse-supervisors'/identity
        folder.mkdir(parents=True, exist_ok=False)
        record = {'id': identity, 'started_at': stamp(), 'status': 'observing',
                  'predecessor': predecessor, 'hours_limit_for_new_starts': hours,
                  'max_new_runs': max_runs, 'rounds_per_run': rounds_per_run,
                  'runs': [], 'model_or_embedding_calls': 0}
        deadline = time.monotonic()+hours*3600
        def save():
            record['updated_at'] = stamp()
            atomic_json(folder/'state.json', record)
            atomic_json(ROOT/'reports/parse-supervisor-state.json', record)
        save()
        try:
            while time.monotonic() < deadline and len(record['runs']) < max_runs:
                state = json.loads((ROOT/'reports/downloaded-parse-state.json').read_text('utf-8'))
                lock = probe_lock(data/'school-archive/business-import.lock')
                with closing(sqlite3.connect(frontier.as_uri()+'?mode=ro', uri=True, timeout=30)) as db:
                    pending = db.execute("SELECT count(*) FROM urls WHERE state='fetched' AND import_state IS NULL").fetchone()[0]
                available = free_memory_mib()
                # Retain every snapshot; budget the actual finite run plus the
                # same 25% growth and 5GiB margin before each new run.
                disk_needed = disk_budget_bytes(frontier.stat().st_size, rounds_per_run)
                action = decision(state, expected, lock, available, pending,
                                  shutil.disk_usage(data).free >= disk_needed)
                record.update(status=action, expected_previous_run=expected,
                              pending_urls=pending, available_ram_mib=round(available)
                              if type(available) in (int, float) and math.isfinite(available) and available >= 0 else None)
                save()
                if action in {'wait_existing_parser', 'watch_downloads', 'wait_disk', 'wait_memory'}:
                    time.sleep(30)
                    continue
                if action != 'ready':
                    return record
                if subprocess.check_output(['git', 'status', '--porcelain', '--', 'app', 'scripts', 'tests'], cwd=ROOT, text=True).strip():
                    record['status'] = 'wait_uncommitted_code'; save(); time.sleep(30); continue
                record['status'] = 'running_owned_parser'; save()
                try:
                    result = run(rounds_per_run, 100, 600, 1024, reserve_mib=3072, expected_previous_run=expected)
                except PipelineBusyError:
                    # Another importer acquired the final lock after our probe.
                    time.sleep(30)
                    continue
                expected = result['run_id']
                record['runs'].append({'run_id': expected, 'status': result['status'],
                                       'completed_batches': len(result['batches'])})
                save()
            record['status'] = 'bounded_watch_finished'; save()
            return record
        except BaseException as exc:
            record.update(status='error_checkpoint_retained', error_type=type(exc).__name__)
            save()
            raise


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--predecessor', required=True)
    p.add_argument('--hours', type=int, default=24)
    p.add_argument('--max-runs', type=int, default=4)
    p.add_argument('--rounds-per-run', type=int, default=64,
                   help='Retained snapshot batches per finite run (1..64); default unchanged.')
    args = p.parse_args()
    if not 1 <= args.hours <= 24 or not 1 <= args.max_runs <= 4 or not 1 <= args.rounds_per_run <= 64:
        p.error('Finite budgets required: hours 1..24, new runs 1..4, rounds 1..64.')
    try:
        result = watch(args.predecessor, args.hours, args.max_runs, rounds_per_run=args.rounds_per_run)
    except PipelineBusyError:
        print(json.dumps({'status': 'supervisor_already_running'}))
        return 75
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
