import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest

from app.model_gate import FileMutex, ModelBusy, canonical_endpoint, model_gate
from app.semantic_ollama import ModelVersionChanged, OllamaCpuEmbedder


ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def isolated_compute_directory(tmp_path, monkeypatch):
    monkeypatch.setenv('CAMPUS_COMPUTE_DIR', str(tmp_path / 'compute'))


def test_loopback_spellings_and_data_directories_share_one_model_gate(tmp_path, monkeypatch):
    monkeypatch.setenv('CAMPUS_MODEL_LOCK_DIR', str(tmp_path))
    monkeypatch.setenv('CAMPUS_DATA', str(tmp_path / 'first'))
    first = model_gate('http://localhost:11434/')
    monkeypatch.setenv('CAMPUS_DATA', str(tmp_path / 'second'))
    second = model_gate('http://127.0.0.1:11434')
    assert first.path == second.path == model_gate('http://[::1]:11434').path
    assert first.path != model_gate('http://127.0.0.1:11435').path


@pytest.mark.parametrize('url', ['file:///tmp/model', 'http://user:password@localhost:11434', 'http://localhost?token=1'])
def test_invalid_endpoint_cannot_create_credential_named_lock(url):
    with pytest.raises(ValueError):
        canonical_endpoint(url)


def test_lock_released_on_exception_and_not_reentrant(tmp_path):
    mutex = FileMutex(tmp_path / 'model.lock')
    with pytest.raises(RuntimeError, match='test'):
        with mutex:
            with pytest.raises(RuntimeError, match='reentrant'):
                mutex.acquire()
            raise RuntimeError('test')
    with FileMutex(tmp_path / 'model.lock'):
        pass


def test_os_mutex_is_enforced_between_real_processes(tmp_path):
    path = tmp_path / 'model.lock'
    script = "import sys; from app.model_gate import FileMutex,ModelBusy\ntry:\n with FileMutex(sys.argv[1],timeout=0): pass\nexcept ModelBusy: sys.exit(75)\n"
    environment = {**os.environ, 'PYTHONPATH': str(ROOT)}
    with FileMutex(path):
        result = subprocess.run([sys.executable, '-c', script, str(path)], env=environment,
                                cwd=ROOT, capture_output=True, timeout=10)
        assert result.returncode == 75, result.stderr.decode()
    result = subprocess.run([sys.executable, '-c', script, str(path)], env=environment,
                            cwd=ROOT, capture_output=True, timeout=10)
    assert result.returncode == 0, result.stderr.decode()


def test_os_lock_is_released_by_process_exit_without_cleanup(tmp_path):
    path = tmp_path / 'model.lock'
    script = "import os,sys; from app.model_gate import FileMutex\nlock=FileMutex(sys.argv[1]); lock.acquire(); os._exit(0)"
    result = subprocess.run([sys.executable, '-c', script, str(path)], cwd=ROOT,
                            env={**os.environ, 'PYTHONPATH': str(ROOT)}, capture_output=True, timeout=10)
    assert result.returncode == 0
    with FileMutex(path):
        pass


def mock_http(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr('app.semantic_ollama.httpx.Client', lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))


def test_cpu_adapter_checks_digest_around_inference_and_requests_no_gpu(tmp_path, monkeypatch):
    import json
    calls = []
    def handler(request):
        calls.append(request)
        if request.url.path == '/api/tags':
            return httpx.Response(200, json={'models': [{'name': 'embed:local', 'digest': 'actual-digest'}]})
        body = json.loads(request.content)
        assert body['model'] == 'embed:local' and body['input'] == ['正文']
        assert body['options']['num_gpu'] == 0 and body['truncate'] is False and body['keep_alive'] == 0
        return httpx.Response(200, json={'embeddings': [[1, 0, 0]]})
    mock_http(monkeypatch, handler)
    embedder = OllamaCpuEmbedder('http://127.0.0.1:11434', 'embed:local', 'actual-digest', lock_directory=tmp_path)
    assert embedder(['正文']) == [[1, 0, 0]]
    assert [request.url.path for request in calls] == ['/api/tags', '/api/embed', '/api/tags']


@pytest.mark.parametrize('changes_during', [False, True])
def test_changed_digest_is_never_accepted_as_expected_vectors(tmp_path, monkeypatch, changes_during):
    calls = []
    def handler(request):
        calls.append(request)
        if request.url.path == '/api/tags':
            digest = 'expected' if changes_during and len(calls) == 1 else 'different'
            return httpx.Response(200, json={'models': [{'name': 'embed:local', 'digest': digest}]})
        return httpx.Response(200, json={'embeddings': [[1, 0, 0]]})
    mock_http(monkeypatch, handler)
    with pytest.raises(ModelVersionChanged):
        OllamaCpuEmbedder('http://localhost:11434', 'embed:local', 'expected', lock_directory=tmp_path)(['正文'])
    assert len(calls) == (3 if changes_during else 1)


def test_busy_model_adapter_does_not_send_http(tmp_path, monkeypatch):
    mock_http(monkeypatch, lambda _: pytest.fail('Busy adapter sent HTTP.'))
    with model_gate('http://localhost:11434', directory=tmp_path, timeout=0):
        with pytest.raises(ModelBusy):
            OllamaCpuEmbedder('http://127.0.0.1:11434', 'embed:local', 'expected',
                              lock_directory=tmp_path, timeout=0)(['正文'])


def test_cli_help_does_not_import_production_db_or_start_embedding():
    result = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'index_school_knowledge.py'), '--help'],
                            cwd=ROOT, capture_output=True, timeout=10)
    assert result.returncode == 0 and b'--retry-failed' in result.stdout
