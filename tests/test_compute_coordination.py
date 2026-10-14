import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from app.compute_coordination import (Coordinator, ComputeBusy, CoordinationUnavailable,
                                  FileMutex, Quarantined, coordination_directory)


ROOT = Path(__file__).resolve().parents[1]
SEMANTIC_GATE = ROOT / "app" / "model_gate.py"


def wait_until(predicate, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    assert predicate(), "Dummy helper did not reach expected state"


HELPER = r'''
import json, os, sys, threading, time
from pathlib import Path
from app.compute_coordination import Coordinator, ComputeBusy, Quarantined
c = Coordinator(heartbeat_interval=0.03)
mode, ready, release = sys.argv[1:]
ready, release = Path(ready), Path(release)
def hold():
    ready.write_text('ready')
    deadline=time.monotonic()+8
    while not release.exists() and time.monotonic()<deadline: time.sleep(.02)
if mode == 'probe':
    try:
        with c.inference(timeout=0): pass
    except ComputeBusy: sys.exit(75)
elif mode == 'training':
    with c.training(timeout=6): hold()
elif mode == 'inference-crash':
    with c.inference(timeout=0): os._exit(0)
elif mode == 'completed-inference-crash':
    with c.inference(timeout=0) as call:
        call.mark_completed()
        os._exit(0)
elif mode == 'inference-crash-after-release':
    with c.inference(timeout=0):
        hold()
        os._exit(0)
elif mode == 'training-must-refuse':
    try:
        with c.training(timeout=6): sys.exit(99)
    except Quarantined: sys.exit(75)
elif mode == 'training-crash':
    with c.training(timeout=0): os._exit(0)
elif mode == 'waiting-intent-crash':
    def crash_after_intent():
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            try:
                s=c.status()
                if s['training'] and s['training']['phase']=='intent': os._exit(0)
            except Exception: pass
            time.sleep(.01)
    threading.Thread(target=crash_after_intent, daemon=True).start()
    with c.training(timeout=6): pass
'''


def helper(tmp_path, mode, *, cwd=None):
    environment = dict(os.environ, PYTHONPATH=str(ROOT), CAMPUS_COMPUTE_DIR=str(tmp_path / "shared"))
    return subprocess.Popen([sys.executable, "-c", HELPER, mode,
                             str(tmp_path / "ready"), str(tmp_path / "release")],
                            cwd=cwd or ROOT, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def ended(child, expected=0):
    wait_until(lambda: child.poll() is not None, timeout=10)
    stdout, stderr = child.communicate()
    assert child.returncode == expected, (stdout.decode(), stderr.decode())


def test_default_and_explicit_path_are_independent_of_worktree_and_data(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "user"))
    monkeypatch.delenv("CAMPUS_COMPUTE_DIR", raising=False)
    expected = (tmp_path / "user" / ".campus-agent" / "compute-coordination" if os.name == "nt"
                else tmp_path / "CampusAgent" / "compute-coordination")
    first = tmp_path / "worktree-a"
    second = tmp_path / "worktree-b"
    first.mkdir(); second.mkdir()
    monkeypatch.chdir(first)
    monkeypatch.setenv("CAMPUS_DATA", "data-a")
    assert coordination_directory() == expected.resolve()
    monkeypatch.chdir(second)
    monkeypatch.setenv("CAMPUS_DATA", "data-b")
    assert coordination_directory() == expected.resolve()
    if os.name == "nt":
        monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "redirected-codex-local"))
        assert coordination_directory() == expected.resolve()
    monkeypatch.setenv("CAMPUS_COMPUTE_DIR", "relative/unsafe")
    with pytest.raises(ValueError, match="absolute"):
        coordination_directory()


def test_real_process_training_intent_prevents_new_inference_while_current_finishes(tmp_path):
    c = Coordinator(tmp_path / "shared", heartbeat_interval=.03)
    other_worktree = tmp_path / "other-worktree"
    other_worktree.mkdir()
    with c.inference() as current:
        trainer = helper(tmp_path, "training", cwd=other_worktree)
        wait_until(lambda: c.status()["training"] is not None)
        assert c.status()["training_intent_locked"]
        assert not (tmp_path / "ready").exists()  # trainer has not preempted current
        ended(helper(tmp_path, "probe"), expected=75)
        assert c.status()["inference"]["token"] == current.token
    wait_until(lambda: (tmp_path / "ready").exists())
    assert c.status()["training"]["phase"] == "reserved"
    ended(helper(tmp_path, "probe"), expected=75)
    (tmp_path / "release").touch()
    ended(trainer)
    with c.inference(timeout=0):
        pass


def test_training_drain_timeout_releases_intent_and_does_not_stop_existing_call(tmp_path):
    c = Coordinator(tmp_path, heartbeat_interval=.02)
    with c.inference() as call:
        with pytest.raises(ComputeBusy, match="training_drain_timeout"):
            with c.training(timeout=.06):
                pytest.fail("Current call was preempted")
        status = c.status()
        assert status["inference"]["token"] == call.token
        assert status["training"] is None and not status["training_intent_locked"]
        assert status["quarantine"] is None
    with c.inference(timeout=0):
        pass


def test_crashed_client_releases_os_lock_but_orphan_inference_quarantines(tmp_path):
    ended(helper(tmp_path, "inference-crash"))
    c = Coordinator(tmp_path / "shared")
    status = c.status()
    assert not status["compute_locked"]
    assert status["quarantine"]["reason"] == "orphaned_inference_completion_unknown"
    assert status["inference"] is not None  # orphan journal retained for inspection
    with pytest.raises(Quarantined):
        with c.training(timeout=0):
            pytest.fail("TTL/OS release cannot prove remote server idle")
    with pytest.raises(Quarantined):
        with c.inference(timeout=0):
            pass


def test_crashed_reserved_training_is_stale_and_not_automatically_gpu_ready(tmp_path):
    ended(helper(tmp_path, "training-crash"))
    status = Coordinator(tmp_path / "shared").status()
    assert not status["compute_locked"] and not status["training_intent_locked"]
    assert status["quarantine"]["reason"] == "orphaned_training_completion_unknown"


def test_training_directly_acquiring_crashed_inference_lock_checks_foreign_journal_without_status(tmp_path):
    inference = helper(tmp_path, "inference-crash-after-release")
    wait_until(lambda: (tmp_path / "ready").exists())
    trainer = helper(tmp_path, "training-must-refuse")
    c = Coordinator(tmp_path / "shared")
    # Observe ONLY the OS intent lock; no status/reconcile can mask the race.
    wait_until(lambda: c._held("training-intent"))
    (tmp_path / "release").touch()
    ended(inference)
    ended(trainer, expected=75)
    assert c.status()["quarantine"]["reason"] == "orphaned_inference_completion_unknown"


def test_durably_completed_response_survives_client_crash_without_false_quarantine(tmp_path):
    ended(helper(tmp_path, "completed-inference-crash"))
    c = Coordinator(tmp_path / "shared")
    with c.training(timeout=0):
        pass
    assert c.status()["quarantine"] is None and c.status()["inference"] is None


def test_crashed_waiting_intent_can_recover_without_touching_live_inference(tmp_path):
    c = Coordinator(tmp_path / "shared")
    with c.inference() as current:
        ended(helper(tmp_path, "waiting-intent-crash"))
        status = c.status()
        assert status["training"] is None and status["quarantine"] is None
        assert status["inference"]["token"] == current.token
        assert status["last_event"]["event"] == "stale_waiting_intent_recovered"
    with c.inference(timeout=0):
        pass


def test_stale_heartbeat_never_steals_a_live_training_lock(tmp_path):
    c = Coordinator(tmp_path, heartbeat_interval=10, stale_after=.01)
    with c.training(timeout=0):
        time.sleep(.02)
        assert c.status()["training"]["heartbeat_stale"]
        with pytest.raises(ComputeBusy, match="training_pending_or_active"):
            with c.inference(timeout=0):
                pass


def test_heartbeat_updates_only_observation_and_locks_survive_thread_error(tmp_path, monkeypatch):
    c = Coordinator(tmp_path, heartbeat_interval=.02)
    with c.training(timeout=0) as lease:
        wait_until(lambda: c.status()["training"]["heartbeat_seq"] > 0)
        monkeypatch.setattr(lease, "_update", lambda **_: (_ for _ in ()).throw(OSError("dummy write failure")))
        wait_until(lambda: lease.heartbeat_error is not None)
        assert c.status()["compute_locked"] and c.status()["training_intent_locked"]
        with pytest.raises(ComputeBusy):
            with c.inference(timeout=0):
                pass


def test_unexpected_inference_exception_quarantines_until_explicit_current_token_ack(tmp_path):
    c = Coordinator(tmp_path)
    with pytest.raises(TimeoutError, match="dummy HTTP timeout"):
        with c.inference():
            raise TimeoutError("dummy HTTP timeout")
    token = c.status()["quarantine"]["token"]
    with pytest.raises(ValueError, match="token"):
        c.acknowledge_quarantine("wrong", evidence="Externally checked dummy worker ended")
    with pytest.raises(ValueError, match="note"):
        c.acknowledge_quarantine(token, evidence="")
    c.acknowledge_quarantine(token, evidence="Test has no remote worker; dummy operation ended")
    assert c.status()["quarantine"] is None
    with c.inference(timeout=0):
        pass


def test_full_response_marked_completed_does_not_quarantine_later_parse_failure(tmp_path):
    c = Coordinator(tmp_path)
    with pytest.raises(ValueError, match="dummy JSON validation"):
        with c.inference() as call:
            call.mark_completed()  # a complete remote response is already received
            raise ValueError("dummy JSON validation")
    assert c.status()["quarantine"] is None


def test_ack_cannot_clear_uncertainty_while_active_call_still_holds_compute(tmp_path):
    c = Coordinator(tmp_path)
    with c.inference() as call:
        call.mark_uncertain("dummy asynchronous request")
        token = c.status()["quarantine"]["token"]
        with pytest.raises(ComputeBusy, match="active_owner"):
            c.acknowledge_quarantine(token, evidence="Cannot bypass held mutex")
    assert c.status()["quarantine"] is not None


def test_training_reservation_requires_external_readiness_and_completion(tmp_path):
    c = Coordinator(tmp_path)
    with c.training(timeout=0) as lease:
        with pytest.raises(ValueError, match="readiness"):
            lease.mark_started()
        lease.confirm_readiness("Dummy command only; no models or GPU")
        lease.mark_started()
        lease.mark_completed()
    assert c.status()["quarantine"] is None
    with c.training(timeout=0, readiness_check=lambda _: "Dummy worker externally verified") as lease:
        lease.mark_started()
        # Returning without confirming completion is not silently accepted.
    assert c.status()["quarantine"]["reason"] == "training_exit_without_completion_confirmation"


def test_training_lease_cannot_restart_and_bypass_uncertainty_after_completion(tmp_path):
    c = Coordinator(tmp_path)
    with c.training(timeout=0) as lease:
        lease.confirm_readiness("Dummy worker verified")
        lease.mark_started()
        with pytest.raises(ValueError, match="only once"):
            lease.mark_started()
        lease.mark_completed()
        with pytest.raises(ValueError, match="only once"):
            lease.mark_started()
    assert c.status()["quarantine"] is None


@pytest.mark.parametrize("field", ["heartbeat_interval", "stale_after", "poll_interval"])
@pytest.mark.parametrize("value", [float("nan"), float("inf"), 0])
def test_invalid_timing_cannot_create_busy_spin_or_false_expiry(tmp_path, field, value):
    with pytest.raises(ValueError, match="finite"):
        Coordinator(tmp_path, **{field: value})


def test_malformed_valid_json_state_fails_closed(tmp_path):
    c = Coordinator(tmp_path)
    with c.inference():
        pass
    state = json.loads(c.state_path.read_text())
    state["quarantine"] = {"reason": "missing_token"}
    c.state_path.write_text(json.dumps(state))
    with pytest.raises(CoordinationUnavailable):
        c.status()


def test_corrupt_state_fails_closed_but_light_collection_does_not_use_gate(tmp_path):
    c = Coordinator(tmp_path / "shared")
    c.directory.mkdir()
    c.state_path.write_text("{broken-json", encoding="utf-8")
    with pytest.raises(CoordinationUnavailable):
        with c.inference():
            pass
    with pytest.raises(CoordinationUnavailable):
        with c.training(timeout=0):
            pass
    # Ordinary official-page materialization deliberately has no Coordinator call.
    collected = tmp_path / "collected-page.html"
    collected.write_text("<p>dummy public source</p>", encoding="utf-8")
    assert collected.read_text() == "<p>dummy public source</p>"


def test_owner_token_fences_cleanup_and_does_not_clear_replacement(tmp_path):
    c = Coordinator(tmp_path)
    with pytest.raises(CoordinationUnavailable, match="owner_changed"):
        with c.inference() as call:
            with c._state() as state:
                replacement = dict(state["inference"], token="replacement")
                state["inference"] = replacement
                c._save(state)
            call.mark_completed()
    assert c.status()["inference"]["token"] == "replacement"
    assert c.status()["quarantine"] is not None


def test_file_mutex_is_nonreentrant_and_releases_on_exception(tmp_path):
    lock = FileMutex(tmp_path / "plain.lock")
    with pytest.raises(RuntimeError, match="dummy"):
        with lock:
            with pytest.raises(RuntimeError, match="reentrant"):
                lock.acquire()
            raise RuntimeError("dummy")
    with FileMutex(tmp_path / "plain.lock"):
        pass


def test_legacy_endpoint_mutex_is_unchanged_and_composes_after_global(tmp_path):
    spec = importlib.util.spec_from_file_location("legacy_gate_readonly", SEMANTIC_GATE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # this standalone gate imports no app config
    c = Coordinator(tmp_path / "shared")
    first = module.model_gate("http://localhost:11434/", directory=tmp_path / "legacy", timeout=0)
    same = module.model_gate("http://127.0.0.1:11434", directory=tmp_path / "legacy", timeout=0)
    assert first.path == same.path
    with first:
        with pytest.raises(module.ModelBusy):
            with c.inference(endpoint_mutex=same):
                pytest.fail("Endpoint lock must still serialize legacy clients")
    assert c.status()["quarantine"] is None
    with c.inference(endpoint_mutex=same):
        # A different endpoint would still share this host-wide compute mutex.
        with pytest.raises(ComputeBusy, match="compute_busy"):
            with Coordinator(tmp_path / "shared").inference(timeout=0):
                pass


def cli(tmp_path, *args):
    environment = dict(os.environ, PYTHONPATH=str(ROOT), CAMPUS_COMPUTE_DIR=str(tmp_path / "cli-shared"))
    return subprocess.run([sys.executable, str(ROOT / "scripts" / "compute_cli.py"), *args], env=environment,
                          capture_output=True, timeout=10)


def test_cli_status_and_missing_readiness_never_launch_command(tmp_path):
    result = cli(tmp_path, "status")
    assert result.returncode == 0
    assert json.loads(result.stdout)["gpu_readiness"] == "external_verification_required"
    marker = tmp_path / "should-not-start"
    result = cli(tmp_path, "hold", "--role", "training", "--timeout", "0", "--",
                 sys.executable, "-c", "from pathlib import Path; import sys; Path(sys.argv[1]).touch()", str(marker))
    assert result.returncode == 2 and not marker.exists()


def test_cli_hold_wraps_only_a_new_dummy_process_and_returns_its_exit_status(tmp_path):
    result = cli(tmp_path, "hold", "--role", "training", "--timeout", "0", "--readiness-ack",
                 "Dummy no-GPU child, externally verified for this test", "--", sys.executable,
                 "-c", "import os,sys; assert os.environ['CAMPUS_COMPUTE_RESERVATION_TOKEN']; sys.exit(7)")
    assert result.returncode == 7, result.stderr.decode()
    assert Coordinator(tmp_path / "cli-shared").status()["quarantine"] is None
