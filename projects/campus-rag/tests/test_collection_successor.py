import copy
import json
from pathlib import Path

import pytest
from scripts.continue_school_collection import continue_collection, decision
from scripts.sync_school_archive import PipelineBusyError, PipelineLock


def snapshot(*, active=False, state='completed_with_errors'):
    return {'pipeline': {'run_id': 'original', 'reported_status': state},
            'locks': {'pipeline': {'held': active}, 'crawler': {'held': False}},
            'errors': {'read_errors': []}}


@pytest.mark.parametrize('mutation,expected', [
    (lambda s: s['pipeline'].update(run_id='other'), 'predecessor_changed'),
    (lambda s: s['errors'].update(read_errors=['unreadable']), 'state_unreadable'),
    (lambda s: s['locks']['crawler'].update(held=None), 'lock_state_unknown'),
    (lambda s: s['locks']['crawler'].update(held=True), 'wait'),
    (lambda s: s['pipeline'].update(reported_status='running'), 'predecessor_not_completed'),
    (lambda s: s['pipeline'].update(reported_status='failed'), 'predecessor_not_completed'),
    (lambda s: s['pipeline'].update(reported_status='interrupted'), 'predecessor_not_completed'),
])
def test_unknown_failed_changed_and_independent_worker_are_not_safe_checkpoints(mutation, expected):
    value = snapshot()
    mutation(value)
    assert decision(value, 'original') == expected


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.delenv('CAMPUS_DATA', raising=False)
    (tmp_path / 'reports').mkdir()
    return tmp_path


def test_wait_then_exactly_one_successor_and_durable_receipt(root):
    sequence = iter([snapshot(active=True, state='running'), snapshot()])
    calls, sleeps = [], []
    def runner(*args, **kwargs):
        calls.append(kwargs)
        return {'run_id': 'new', 'status': 'completed_with_errors', 'rounds_completed': 2, 'exitcode': 1}
    receipt = root / 'reports/successor.json'
    result = continue_collection(root, 'original', receipt, reader=lambda _: next(sequence),
                                 runner=runner, sleep=sleeps.append, code_check=lambda: True)
    assert sleeps == [30]
    assert len(calls) == 1
    assert calls[0]['expected_previous_run'] == 'original'
    assert calls[0]['stop_when_exhausted'] and calls[0]['rediscover_archived']
    assert calls[0]['rounds'] == 64 and calls[0]['max_requests'] == 500
    assert 'embed' not in calls[0] and 'cohort' not in calls[0]
    assert result['status'] == 'successor_finished'
    assert result['successor']['exitcode'] == 1
    assert json.loads(receipt.read_text()) == result
    assert result['full_school_coverage_proven'] is False


def test_timeout_does_not_launch_or_touch_predecessor(root):
    ticks = iter([0, 0, 0, 31])
    original = snapshot(active=True, state='running')
    before = copy.deepcopy(original)
    calls = []
    result = continue_collection(root, 'original', root / 'reports/timeout.json', wait_seconds=30,
        reader=lambda _: original, runner=lambda *a, **k: calls.append(k),
        sleep=lambda _: None, clock=lambda: next(ticks), code_check=lambda: True)
    assert result['status'] == 'wait_expired' and not calls
    assert original == before


def test_uncommitted_implementation_and_other_successor_are_refused(root):
    calls = []
    result = continue_collection(root, 'original', root / 'reports/dirty.json', reader=lambda _: snapshot(),
        runner=lambda *a, **k: calls.append(k), code_check=lambda: False)
    assert result['decision'] == 'uncommitted_implementation' and not calls
    with PipelineLock(root / 'data/school-archive/collection-successor.lock'):
        with pytest.raises(PipelineBusyError):
            continue_collection(root, 'original', root / 'reports/duplicate.json')
    assert not (root / 'reports/duplicate.json').exists()


def test_existing_receipt_cannot_relaunch_and_runner_error_is_durable(root):
    receipt = root / 'reports/existing.json'
    receipt.write_text('original receipt')
    with pytest.raises(FileExistsError):
        continue_collection(root, 'original', receipt)
    assert receipt.read_text() == 'original receipt'
    def failed(*args, **kwargs):
        raise PipelineBusyError('core lock race')
    failure = root / 'reports/race.json'
    with pytest.raises(PipelineBusyError):
        continue_collection(root, 'original', failure, reader=lambda _: snapshot(), runner=failed,
                            code_check=lambda: True)
    assert json.loads(failure.read_text())['status'] == 'start_or_execution_failed'


@pytest.mark.parametrize('download_only', [False, True])
def test_download_successor_preserves_wait_and_passes_isolated_policy(root, download_only):
    sequence = iter([snapshot(active=True, state='running'), snapshot(state='completed')])
    calls, sleeps = [], []
    def runner(*args, **kwargs):
        calls.append(kwargs)
        return {'run_id': 'next', 'status': 'completed', 'exitcode': 0}
    receipt = root / 'reports/download.json'
    result = continue_collection(root, 'original', receipt, rounds=2,
        download_only=download_only, reader=lambda _: next(sequence), runner=runner,
        sleep=sleeps.append, code_check=lambda: True)
    assert sleeps == [30] and len(calls) == 1
    assert calls[0]['download_only'] is download_only
    assert calls[0]['rediscover_archived'] is (not download_only)
    assert calls[0]['expected_previous_run'] == 'original'
    assert calls[0]['stop_when_exhausted'] and calls[0]['rounds'] == 2
    assert result['download_only'] is download_only
    assert json.loads(receipt.read_text()) == result
