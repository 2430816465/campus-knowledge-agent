"""One OS mutex per Ollama endpoint, independent of the project data directory.

All cooperating inference clients must use this gate. Direct Ollama clients and
Dify do not automatically participate. A process crash releases the OS lock.
"""
import errno
import hashlib
import os
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit


class ModelBusy(TimeoutError):
    """The cooperating local model clients are busy."""

    def __init__(self, reason='model_busy'):
        self.reason = reason
        super().__init__(reason)


class FileMutex:
    def __init__(self, path, timeout=0, poll_interval=0.05):
        self.path = Path(path)
        self.timeout = timeout
        self.poll_interval = poll_interval
        self._file = None

    def acquire(self):
        if self._file is not None:
            raise RuntimeError('FileMutex is not reentrant.')
        if self.timeout < 0 or self.poll_interval <= 0:
            raise ValueError('Lock timeout must be nonnegative and poll interval positive.')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open('a+b')
        if handle.seek(0, os.SEEK_END) == 0:
            handle.write(b'\0')
            handle.flush()
        deadline = time.monotonic() + self.timeout
        try:
            while True:
                try:
                    handle.seek(0)
                    if os.name == 'nt':
                        import msvcrt
                        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self._file = handle
                    return self
                except OSError as error:
                    if error.errno not in {errno.EACCES, errno.EAGAIN, errno.EDEADLK} and getattr(error, 'winerror', None) not in {32, 33}:
                        raise
                    if time.monotonic() >= deadline:
                        raise ModelBusy('Local model/index lock is busy.') from None
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
            if os.name == 'nt':
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


def canonical_endpoint(endpoint):
    parsed = urlsplit(endpoint.rstrip('/'))
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Ollama endpoint must be an HTTP(S) URL without credentials/query.')
    host = parsed.hostname.lower()
    if host in {'localhost', '127.0.0.1', '::1'}:
        host = 'loopback'
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    return f'{parsed.scheme}://{host}:{port}{parsed.path.rstrip("/")}'


def model_gate(endpoint, timeout=2, directory=None):
    base = directory or os.getenv('CAMPUS_MODEL_LOCK_DIR')
    if not base:
        base = Path(os.getenv('LOCALAPPDATA') or tempfile.gettempdir()) / 'CampusAgent' / 'model-locks'
    digest = hashlib.sha256(canonical_endpoint(endpoint).encode('utf-8')).hexdigest()
    return FileMutex(Path(base).resolve() / (digest + '.lock'), timeout=timeout)


@contextmanager
def inference_gate(endpoint, *, workload='inference', timeout=2, directory=None):
    """Shared host compute admission, followed by the legacy endpoint mutex."""
    from .compute_coordination import Coordinator, ComputeBusy
    try:
        with Coordinator().inference(workload=workload, timeout=timeout,
                                     endpoint_mutex=model_gate(endpoint, timeout=timeout, directory=directory)) as call:
            yield call
    except ComputeBusy as error:
        raise ModelBusy(error.reason) from error


def model_deferred_notice(error):
    """Public-facing fallback reason; never exposes lease tokens or paths."""
    reason = getattr(error, 'reason', '')
    if reason == 'model_context_limit':
        return '本次模型输入超出安全上下文预算或无法核验长度；仅显示候选原文，不能视为完整答案'
    if reason == 'model_output_incomplete':
        return '本次模型回答未完整生成；已舍弃不完整结果，仅显示候选原文'
    if reason == 'training_pending_or_active':
        return '训练任务正在等待或使用本机计算资源；暂时显示公开原文，稍后可重试'
    if reason.startswith('quarantine:') or reason == 'coordination_state_unavailable':
        return '本机模型资源状态待核验；暂时显示公开原文'
    return ''
