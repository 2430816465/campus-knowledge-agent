"""Cooperative, host-wide compute reservation. No model, DB or process control.

OS locks are authoritative. Heartbeats are observations; expiry never steals a
live lock. A dead client can leave a remote inference/child running, so an orphan
compute journal creates a persistent quarantine instead of silently resuming.
"""
from __future__ import annotations

import errno
import json
import math
import os
import tempfile
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path


class ComputeBusy(TimeoutError):
    def __init__(self, reason="compute_busy"):
        self.reason = reason
        super().__init__(reason)


class Quarantined(ComputeBusy):
    pass


class CoordinationUnavailable(ComputeBusy):
    """Heavy callers fail closed when coordination state cannot be trusted."""


class FileMutex:
    """Non-reentrant local OS mutex; never unlink a lock file to recover it."""
    def __init__(self, path, timeout=0, poll_interval=0.05):
        self.path = Path(path)
        self.timeout = timeout
        self.poll_interval = poll_interval
        self._file = None

    def acquire(self):
        if self._file is not None:
            raise RuntimeError("FileMutex is not reentrant")
        if not math.isfinite(self.timeout) or self.timeout < 0 or not math.isfinite(self.poll_interval) or self.poll_interval <= 0:
            raise ValueError("Invalid mutex timeout/poll interval")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open("a+b")
        if handle.seek(0, os.SEEK_END) == 0:
            handle.write(b"\0")
            handle.flush()
        deadline = time.monotonic() + self.timeout
        try:
            while True:
                try:
                    handle.seek(0)
                    if os.name == "nt":
                        import msvcrt
                        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self._file = handle
                    return self
                except OSError as error:
                    if error.errno not in {errno.EACCES, errno.EAGAIN, errno.EDEADLK} and getattr(error, "winerror", None) not in {32, 33}:
                        raise
                    if time.monotonic() >= deadline:
                        raise ComputeBusy("os_lock_busy") from None
                    time.sleep(min(self.poll_interval, max(0, deadline - time.monotonic())))
        except BaseException:
            handle.close()
            raise

    def release(self):
        handle, self._file = self._file, None
        if handle is None:
            return
        try:
            handle.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()

    def __enter__(self):
        return self.acquire()

    def __exit__(self, *_):
        self.release()


def coordination_directory(directory=None):
    configured = directory if directory is not None else os.getenv("CAMPUS_COMPUTE_DIR")
    if configured is None:
        # Windows package virtualization can redirect even an explicit AppData
        # path at filesystem access/resolve time. Use the user's home outside
        # AppData so packaged and ordinary workers share one physical mutex.
        if os.name == "nt" and os.getenv("USERPROFILE"):
            configured = Path(os.environ["USERPROFILE"]) / ".campus-agent" / "compute-coordination"
        else:
            base = Path(os.getenv("LOCALAPPDATA") or tempfile.gettempdir())
            configured = base / "CampusAgent" / "compute-coordination"
    base = Path(configured).expanduser()
    if not base.is_absolute():
        raise ValueError("CAMPUS_COMPUTE_DIR must be an absolute local path")
    if os.name == "nt" and str(base).startswith("\\\\"):
        raise ValueError("Network lock directories are unsupported")
    resolved = base.resolve()
    if os.name == "nt" and str(resolved).startswith("\\\\"):
        raise ValueError("Network lock directories are unsupported")
    return resolved


def _atomic_json(path, value):
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        for attempt in range(6):
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                if attempt == 5:
                    raise
                time.sleep(0.01 * (attempt + 1))
    finally:
        temporary.unlink(missing_ok=True)


class Coordinator:
    """One same-user, same-host resource shared by every cooperating worktree."""
    def __init__(self, directory=None, *, heartbeat_interval=10, stale_after=60, poll_interval=0.05):
        if any(not math.isfinite(value) or value <= 0 for value in (heartbeat_interval, stale_after, poll_interval)):
            raise ValueError("Timing values must be finite and positive")
        self.directory = coordination_directory(directory)
        self.state_path = self.directory / "state.json"
        self.heartbeat_interval = heartbeat_interval
        self.stale_after = stale_after  # observational only
        self.poll_interval = poll_interval

    def _mutex(self, name, timeout=0):
        return FileMutex(self.directory / (name + ".lock"), timeout, self.poll_interval)

    @contextmanager
    def _state(self):
        try:
            with self._mutex("state", timeout=2):
                try:
                    if self.state_path.exists():
                        with self.state_path.open(encoding="utf-8") as handle:
                            state = json.load(handle)
                        if not isinstance(state, dict) or state.get("schema") != 1 or not isinstance(state.get("revision"), int):
                            raise ValueError("Unsupported state schema")
                        for field in ("inference", "training", "quarantine"):
                            if field not in state or (state[field] is not None and not isinstance(state[field], dict)):
                                raise ValueError("Malformed coordination state")
                            record = state[field]
                            if record is not None and (not isinstance(record.get("token"), str) or not record["token"]):
                                raise ValueError("Missing owner/quarantine token")
                        for field in ("inference", "training"):
                            record = state[field]
                            if record is not None:
                                allowed = {"admitted", "inflight", "completed"} if field == "inference" else {"intent", "draining", "reserved", "ready", "running", "completed"}
                                if record.get("phase") not in allowed or not isinstance(record.get("heartbeat_at"), (int, float)) or not math.isfinite(record["heartbeat_at"]):
                                    raise ValueError("Malformed owner phase/heartbeat")
                        if state["quarantine"] is not None and not isinstance(state["quarantine"].get("reason"), str):
                            raise ValueError("Malformed quarantine reason")
                    else:
                        state = {"schema": 1, "revision": 0, "inference": None, "training": None, "quarantine": None, "last_event": None}
                except (ValueError, TypeError) as error:
                    raise CoordinationUnavailable("coordination_state_unavailable") from error
                yield state
        except ComputeBusy:
            raise
        except OSError as error:
            raise CoordinationUnavailable("coordination_state_unavailable") from error

    def _save(self, state):
        state["revision"] += 1
        try:
            _atomic_json(self.state_path, state)
        except (OSError, ValueError, TypeError) as error:
            raise CoordinationUnavailable("coordination_state_write_failed") from error

    def _held(self, name):
        try:
            with self._mutex(name):
                return False
        except ComputeBusy:
            return True

    def _quarantine(self, state, reason, owner=None):
        if state["quarantine"] is None:
            state["quarantine"] = {"token": uuid.uuid4().hex, "reason": reason, "at": time.time(), "owner": owner}

    def _reconcile(self, state, *, own_intent=False):
        """Called under state lock. Lock ownership, never TTL, determines orphans."""
        compute_held = self._held("compute")
        intent_held = False if own_intent else self._held("training-intent")
        changed = False
        if state["inference"] and not compute_held:
            if state["inference"].get("phase") == "completed":
                state["inference"] = None
            else:
                self._quarantine(state, "orphaned_inference_completion_unknown", state["inference"])
            changed = True
        training = state["training"]
        if training and not intent_held:
            if training.get("phase") in {"intent", "draining", "completed"}:
                state["last_event"] = {"event": "stale_waiting_intent_recovered", "token": training.get("token"), "at": time.time()}
                state["training"] = None
            else:
                self._quarantine(state, "orphaned_training_completion_unknown", training)
            changed = True
        if changed:
            self._save(state)
        return compute_held, intent_held

    def _after_compute_acquired(self, state, *, own_training_token=None):
        """The previous owner can die between the initial probe and acquisition.

        We now own compute, so probing it would only see our own lock. Inspect
        any remaining foreign journal directly, before granting actual work.
        """
        changed = False
        previous = state["inference"]
        if previous:
            if previous.get("phase") == "completed":
                state["inference"] = None
            else:
                self._quarantine(state, "orphaned_inference_completion_unknown", previous)
            changed = True
        training = state["training"]
        if training and training.get("token") != own_training_token:
            if training.get("phase") in {"intent", "draining", "completed"} and not self._held("training-intent"):
                state["training"] = None
            else:
                self._quarantine(state, "orphaned_training_completion_unknown", training)
            changed = True
        if changed:
            self._save(state)
        self._check_quarantine(state)

    def status(self):
        with self._state() as state:
            compute_held, intent_held = self._reconcile(state)
            result = json.loads(json.dumps(state))
            for name in ("inference", "training"):
                owner = result[name]
                if owner:
                    owner["heartbeat_stale"] = time.time() - owner.get("heartbeat_at", 0) > self.stale_after
            result.update(directory=str(self.directory), compute_locked=compute_held,
                          training_intent_locked=intent_held,
                          gpu_readiness="external_verification_required",
                          heartbeat_expiry_reclaims_locks=False)
            return result

    def _owner(self, workload, phase):
        return {"token": uuid.uuid4().hex, "pid": os.getpid(), "workload": workload,
                "phase": phase, "created_at": time.time(), "heartbeat_at": time.time(), "heartbeat_seq": 0}

    def _check_quarantine(self, state):
        if state["quarantine"]:
            raise Quarantined("quarantine:" + state["quarantine"]["token"])

    @contextmanager
    def inference(self, *, workload="inference", timeout=2, endpoint_mutex=None):
        """Acquire global compute then an optional unchanged legacy endpoint mutex.

        Successful context exit confirms completion. On an exceptional exit the
        caller must have marked a fully received response completed; otherwise
        remote execution is uncertain and future heavy work is quarantined.
        """
        if not math.isfinite(timeout) or timeout < 0:
            raise ValueError("timeout must be finite and nonnegative")
        if workload not in {"inference", "embedding", "chat", "chat_batch"}:
            raise ValueError("Only model workloads use this gate; light collection bypasses it")
        compute = self._mutex("compute")
        owner = self._owner(workload, "admitted")
        deadline = time.monotonic() + timeout
        while True:
            with self._state() as state:
                self._reconcile(state)
                self._check_quarantine(state)
                if self._held("training-intent"):
                    raise ComputeBusy("training_pending_or_active")
                try:
                    compute.acquire()
                except ComputeBusy:
                    pass
                else:
                    try:
                        # This second check closes the intent/compute admission race.
                        if self._held("training-intent"):
                            raise ComputeBusy("training_pending_or_active")
                        self._after_compute_acquired(state)
                        state["inference"] = owner
                        self._save(state)  # durable journal before any HTTP can begin
                    except BaseException:
                        compute.release()
                        raise
                    break
            if time.monotonic() >= deadline:
                raise ComputeBusy("compute_busy")
            time.sleep(min(self.poll_interval, max(0, deadline - time.monotonic())))
        lease = _Lease(self, "inference", owner, compute)
        endpoint_entered = False
        try:
            if endpoint_mutex is not None:
                endpoint_mutex.__enter__()
                endpoint_entered = True
            lease._update(phase="inflight")
            lease._start_heartbeat()
            try:
                yield lease
            except BaseException:
                if not lease.completed:
                    lease.mark_uncertain("inference_exception_completion_unknown")
                raise
            else:
                lease.mark_completed()
        finally:
            try:
                lease._finish()
            finally:
                try:
                    if endpoint_entered:
                        endpoint_mutex.__exit__(None, None, None)
                finally:
                    compute.release()

    @contextmanager
    def training(self, *, timeout=60, readiness_check=None):
        """Reserve priority, drain current call naturally, then hold compute.

        Reservation is NOT GPU readiness. An optional callback runs after drain
        and must return an external verification note before mark_started().
        """
        if not math.isfinite(timeout) or timeout < 0:
            raise ValueError("timeout must be finite and nonnegative")
        deadline = time.monotonic() + timeout
        intent = self._mutex("training-intent", timeout=timeout)
        intent.acquire()
        compute = self._mutex("compute")
        owner = self._owner("training", "intent")
        lease = _Lease(self, "training", owner, compute)
        compute_acquired = False
        published = False
        try:
            with self._state() as state:
                self._reconcile(state, own_intent=True)
                self._check_quarantine(state)
                state["training"] = owner
                self._save(state)
                published = True
            lease._start_heartbeat()
            while True:
                try:
                    compute.acquire()
                    compute_acquired = True
                    break
                except ComputeBusy:
                    if time.monotonic() >= deadline:
                        raise ComputeBusy("training_drain_timeout")
                    time.sleep(min(self.poll_interval, max(0, deadline - time.monotonic())))
            with self._state() as state:
                # The previous inference can have quarantined its failed request.
                # It can also have died without a cleanup/status observer.
                self._after_compute_acquired(state, own_training_token=lease.token)
            lease._update(phase="reserved")
            if readiness_check is not None:
                lease.confirm_readiness(readiness_check(lease))
            try:
                yield lease
            except BaseException:
                if lease.started and not lease.completed:
                    lease.mark_uncertain("training_exception_completion_unknown")
                raise
            else:
                if lease.started and not lease.completed:
                    lease.mark_uncertain("training_exit_without_completion_confirmation")
        finally:
            try:
                if published:
                    lease._finish()
            finally:
                try:
                    if compute_acquired:
                        compute.release()
                finally:
                    intent.release()

    def acknowledge_quarantine(self, token, *, evidence):
        """Explicit attestation after external idle/orphan verification, no probe."""
        evidence = _evidence(evidence)
        with self._state() as state:
            self._reconcile(state)
            if self._held("compute") or self._held("training-intent"):
                raise ComputeBusy("cannot_acknowledge_active_owner")
            current = state["quarantine"]
            if not current or current["token"] != token:
                raise ValueError("Quarantine token changed or is absent; inspect status again")
            state["last_event"] = {"event": "quarantine_acknowledged", "token": token, "evidence": evidence, "at": time.time()}
            state["quarantine"] = state["inference"] = state["training"] = None
            self._save(state)


def _evidence(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 1000:
        raise ValueError("A non-secret external verification note (1..1000 characters) is required")
    return value.strip()


class _Lease:
    def __init__(self, coordinator, role, owner, compute):
        self.coordinator = coordinator
        self.role = role
        self.owner = owner
        self.compute = compute
        self.completed = False
        self.started = False
        self.ready = False
        self.heartbeat_error = None
        self._stop = threading.Event()
        self._thread = None

    @property
    def token(self):
        return self.owner["token"]

    def _update(self, **updates):
        with self.coordinator._state() as state:
            current = state[self.role]
            if not current or current.get("token") != self.token:
                raise CoordinationUnavailable("lease_owner_changed")
            current.update(updates)
            self.coordinator._save(state)

    def _start_heartbeat(self):
        def beat():
            while not self._stop.wait(self.coordinator.heartbeat_interval):
                try:
                    self.owner["heartbeat_seq"] += 1
                    self._update(heartbeat_at=time.time(), heartbeat_seq=self.owner["heartbeat_seq"])
                except BaseException as error:
                    self.heartbeat_error = type(error).__name__
                    return  # locks stay held; heartbeat failure never enables takeover
        self._thread = threading.Thread(target=beat, name="compute-lease-heartbeat", daemon=True)
        self._thread.start()

    def mark_completed(self):
        self._update(phase="completed")
        self.completed = True

    def mark_uncertain(self, reason):
        with self.coordinator._state() as state:
            current = state[self.role]
            if not current or current.get("token") != self.token:
                raise CoordinationUnavailable("lease_owner_changed")
            self.coordinator._quarantine(state, reason, dict(current))
            self.coordinator._save(state)

    def confirm_readiness(self, evidence):
        if self.role != "training":
            raise ValueError("Readiness attestation applies only to training")
        self._update(phase="ready", readiness_evidence=_evidence(evidence))
        self.ready = True

    def mark_started(self):
        if self.role != "training" or not self.ready:
            raise ValueError("Training requires external readiness confirmation after reservation")
        if self.started or self.completed:
            raise ValueError("A training lease can start only once, before completion")
        self._update(phase="running")
        self.started = True

    def _finish(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
            if self._thread.is_alive():
                raise CoordinationUnavailable("heartbeat_cleanup_timeout")
        with self.coordinator._state() as state:
            current = state[self.role]
            if not current or current.get("token") != self.token:
                raise CoordinationUnavailable("lease_owner_changed")
            state[self.role] = None
            self.coordinator._save(state)
