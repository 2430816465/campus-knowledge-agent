"""Offline verifier boundaries, using real temporary compute leases and mock HTTP.

No production config, secrets, database, Docker, Ollama, or host-wide locks are
opened. The standalone staging copy can use the sibling coordinator source;
after deployment the project's app/compute_coordination.py is used instead.
"""
import importlib.util
import io
import json
import subprocess
import sys
import types
import urllib.request
from contextlib import contextmanager, redirect_stdout
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

PROJECT = Path(__file__).resolve().parents[1]


def coordinator_module():
    candidates = [PROJECT / 'app/compute_coordination.py',
                  PROJECT.parent / 'resource-work/compute_coordination.py']
    source = next((path for path in candidates if path.exists()), None)
    if source is None:
        raise RuntimeError('Deploy app/compute_coordination.py before running these tests')
    spec = importlib.util.spec_from_file_location('_verifier_test_compute', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


COORD = coordinator_module()


@pytest.fixture
def verifiers(monkeypatch, tmp_path):
    """Import only the scripts, with any import-time external action forbidden."""
    config = types.ModuleType('app.config')
    config.ROOT = tmp_path
    config.DATA = tmp_path / 'data'
    config.OLLAMA = 'http://127.0.0.1:11434'
    (tmp_path / 'reports').mkdir()
    db = types.ModuleType('app.db')
    db.Session = db.Document = db.Chunk = object
    gate_module = types.ModuleType('app.model_gate')
    sync = types.ModuleType('scripts.sync_dify')
    sqlalchemy = types.ModuleType('sqlalchemy')

    def forbidden(*args, **kwargs):
        raise AssertionError('External action during verifier import')

    gate_module.inference_gate = forbidden
    sqlalchemy.select = forbidden
    sync.KnowledgeClient = forbidden
    sync.save_state = forbidden
    loaded = {}
    with monkeypatch.context() as context:
        context.setitem(sys.modules, 'app.config', config)
        context.setitem(sys.modules, 'app.db', db)
        context.setitem(sys.modules, 'app.model_gate', gate_module)
        context.setitem(sys.modules, 'scripts.sync_dify', sync)
        context.setitem(sys.modules, 'sqlalchemy', sqlalchemy)
        context.setattr(httpx, 'Client', forbidden)
        context.setattr(httpx, 'get', forbidden)
        context.setattr(subprocess, 'run', forbidden)
        original_path = list(sys.path)
        try:
            for name in ('verify_live', 'verify_dify_runtime', 'verify_dify_retrieval'):
                spec = importlib.util.spec_from_file_location('_test_' + name, PROJECT / 'scripts' / (name + '.py'))
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                loaded[name] = module
        finally:
            sys.path[:] = original_path
    return SimpleNamespace(live=loaded['verify_live'], runtime=loaded['verify_dify_runtime'],
                           retrieval=loaded['verify_dify_retrieval'])


@pytest.fixture
def admitted(verifiers, monkeypatch, tmp_path):
    coordinator = COORD.Coordinator(tmp_path / 'compute', heartbeat_interval=0.1)
    entries = []
    completions = []

    @contextmanager
    def gate(endpoint, *, workload='inference', timeout=2, directory=None):
        with coordinator.inference(workload=workload, timeout=0) as lease:
            entries.append({'endpoint': endpoint, 'workload': workload, 'token': lease.token})

            def completed():
                completions.append(lease.token)
                lease.mark_completed()

            yield SimpleNamespace(mark_completed=completed)

    for module in (verifiers.live, verifiers.runtime, verifiers.retrieval):
        monkeypatch.setattr(module, 'inference_gate', gate)
    return SimpleNamespace(coordinator=coordinator, entries=entries, completions=completions)


def assert_inflight(admitted, workload):
    state = admitted.coordinator.status()
    assert state['compute_locked']
    assert state['inference']['phase'] == 'inflight'
    assert state['inference']['workload'] == workload


def assert_released(admitted):
    state = admitted.coordinator.status()
    assert state['quarantine'] is None
    assert state['inference'] is None
    assert not state['compute_locked']


class Chunks(httpx.SyncByteStream):
    def __init__(self, parts, error=None):
        self.parts = parts
        self.error = error

    def __iter__(self):
        yield from self.parts
        if self.error:
            raise self.error


def trial_api(module, client):
    def forbidden(*args, **kwargs):
        raise AssertionError('Sync retrieval must mark completion before KnowledgeClient JSON parsing')
    return SimpleNamespace(http=client, dataset=module.DATASET, request=forbidden)


def test_unload_full_http_error_releases_without_quarantine(verifiers, admitted):
    def respond(request):
        assert_inflight(admitted, 'inference')
        assert request.url.path == '/api/generate'
        assert json.loads(request.content)['keep_alive'] == 0
        return httpx.Response(503, content=b'finished HTTP error')
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            verifiers.live.unload_model(client)
    assert admitted.completions == [admitted.entries[0]['token']]
    assert_released(admitted)


def test_unload_unknown_timeout_quarantines_and_no_automatic_retry(verifiers, admitted):
    requests = []

    def respond(request):
        requests.append(request)
        assert_inflight(admitted, 'inference')
        raise httpx.ReadTimeout('completion unknown')

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(httpx.ReadTimeout):
            verifiers.live.unload_model(client)
        with pytest.raises(COORD.Quarantined):
            verifiers.live.unload_model(client)
    assert len(requests) == 1
    assert not admitted.completions
    assert admitted.coordinator.status()['quarantine']


def test_stream_keeps_arrival_times_parses_after_full_body(verifiers, admitted, monkeypatch):
    ticks = iter([10.0, 10.2, 10.8, 11.0])
    monkeypatch.setattr(verifiers.live, 'time', SimpleNamespace(perf_counter=lambda: next(ticks)))

    def respond(request):
        assert_inflight(admitted, 'chat')
        return httpx.Response(200, stream=Chunks([
            b'{"message":{"content":"hello"},"done":false}\n',
            b'{"message":{"content":""},"done":true,"load_duration":500000000,"eval_count":2}\n',
        ]))

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        timing = verifiers.live.stream_model_timing(client, 'cold')
    assert timing == {'run': 'cold', 'first_content_seconds': 0.2, 'total_seconds': 1.0,
                      'load_seconds': 0.5, 'output_tokens': 2}
    assert admitted.completions == [admitted.entries[0]['token']]
    assert_released(admitted)


@pytest.mark.parametrize('status,body,error_type', [
    (200, b'not json\n', json.JSONDecodeError),
    (503, b'finished error\n', httpx.HTTPStatusError),
    (200, b'{"message":{"content":"x"},"done":false}\n', AssertionError),
])
def test_stream_full_body_parse_status_or_assert_failure_is_completed(verifiers, admitted, status, body, error_type):
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(status, stream=Chunks([body])))) as client:
        with pytest.raises(error_type):
            verifiers.live.stream_model_timing(client, 'warm')
    assert admitted.completions == [admitted.entries[0]['token']]
    assert_released(admitted)


def test_incomplete_stream_quarantines_even_with_a_content_chunk(verifiers, admitted):
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=Chunks(
        [b'{"message":{"content":"partial"},"done":false}\n'], httpx.ReadError('broken body'))))) as client:
        with pytest.raises(httpx.ReadError):
            verifiers.live.stream_model_timing(client, 'cold')
    assert not admitted.completions
    assert admitted.coordinator.status()['quarantine']


def test_each_dify_query_has_its_own_lease_and_preserves_scope(verifiers, admitted, monkeypatch):
    module = verifiers.retrieval
    monkeypatch.setattr(module, 'CASES', [('development', 'one', 'quote'), ('held_out', 'two', 'quote')])
    observed = []

    def respond(request):
        assert_inflight(admitted, 'embedding')
        assert request.method == 'POST'
        assert request.url.path == '/v1/datasets/' + module.DATASET + '/retrieve'
        observed.append(json.loads(request.content))
        return httpx.Response(200, json={'records': [{
            'segment': {'document_id': module.REMOTE, 'id': 's1', 'position': 1, 'content': 'quote'},
            'score': 0.9,
        }]})

    with httpx.Client(base_url='http://localhost:8080/v1/', transport=httpx.MockTransport(respond)) as client:
        result = module.measure(trial_api(module, client), {'top_k': 10})
    assert result['recall_at_returned_k'] == 2
    assert observed == [{'query': 'one', 'retrieval_model': {'top_k': 10}},
                        {'query': 'two', 'retrieval_model': {'top_k': 10}}]
    assert len({entry['token'] for entry in admitted.entries}) == 2
    assert admitted.completions == [entry['token'] for entry in admitted.entries]
    assert_released(admitted)


@pytest.mark.parametrize('status,body,error_type', [
    (200, b'not json', json.JSONDecodeError),
    (502, b'private error body', RuntimeError),
])
def test_dify_complete_http_response_marked_before_local_failure(verifiers, admitted, status, body, error_type):
    with httpx.Client(base_url='http://localhost:8080/v1/', transport=httpx.MockTransport(
        lambda request: httpx.Response(status, content=body))) as client:
        with pytest.raises(error_type) as error:
            verifiers.retrieval.retrieve(trial_api(verifiers.retrieval, client), {'query': 'test'})
    assert 'private error body' not in str(error.value)
    assert admitted.completions == [admitted.entries[0]['token']]
    assert_released(admitted)


def test_dify_incomplete_response_keeps_quarantine(verifiers, admitted):
    with httpx.Client(base_url='http://localhost:8080/v1/', transport=httpx.MockTransport(
        lambda request: httpx.Response(200, stream=Chunks([b'{"records":'], httpx.ReadTimeout('still running'))))) as client:
        with pytest.raises(httpx.ReadTimeout):
            verifiers.retrieval.retrieve(trial_api(verifiers.retrieval, client), {'query': 'test'})
    assert not admitted.completions
    assert admitted.coordinator.status()['quarantine']


def test_plugin_combination_executes_two_model_calls_under_one_lease(verifiers, admitted, monkeypatch):
    seen = []

    class Opener:
        def open(self, request, timeout):
            assert_inflight(admitted, 'chat_batch')
            seen.append((request.full_url, json.loads(request.data)))
            response = ({'embeddings': [[0.0] * 1024]} if request.full_url.endswith('/api/embed')
                        else {'message': {'content': 'local connection'}})
            return io.BytesIO(json.dumps(response).encode())

    monkeypatch.setattr(urllib.request, 'build_opener', lambda *_: Opener())

    def runner(arguments, input):
        assert arguments == ['exec', '-i', 'docker-plugin_daemon-1', 'python3', '-']
        output = io.StringIO()
        with redirect_stdout(output):
            exec(input, {'__name__': '__main__'})
        return output.getvalue()

    result = verifiers.runtime.verify_model_transport(runner)
    assert result['embedding_dimension'] == 1024
    assert result['chat_response'] == 'local connection'
    assert [url.rsplit('/', 1)[-1] for url, _ in seen] == ['embed', 'chat']
    assert seen[0][1]['options']['num_gpu'] == 0
    assert len(admitted.entries) == 1
    assert admitted.completions == [admitted.entries[0]['token']]
    assert_released(admitted)


def test_plugin_successful_child_invalid_stdout_does_not_quarantine(verifiers, admitted):
    with pytest.raises(json.JSONDecodeError):
        verifiers.runtime.verify_model_transport(lambda *args, **kwargs: 'malformed stdout')
    assert admitted.completions == [admitted.entries[0]['token']]
    assert_released(admitted)


@pytest.mark.parametrize('failure', [RuntimeError('child parse/assert or nonzero exit'),
                                    subprocess.TimeoutExpired('mock docker', 1)])
def test_plugin_child_failure_conservatively_quarantines(verifiers, admitted, failure):
    def runner(*args, **kwargs):
        assert_inflight(admitted, 'chat_batch')
        raise failure
    with pytest.raises(type(failure)):
        verifiers.runtime.verify_model_transport(runner)
    assert not admitted.completions
    assert admitted.coordinator.status()['quarantine']


@pytest.mark.parametrize('boundary', ['unload', 'stream', 'retrieve', 'plugin'])
def test_training_reservation_refuses_every_boundary_before_dispatch(verifiers, admitted, boundary):
    requests = []
    def respond(request):
        requests.append(request)
        raise AssertionError('Training reservation must prevent dispatch')
    def runner(*args, **kwargs):
        raise AssertionError('Training reservation must prevent subprocess launch')
    with httpx.Client(base_url='http://localhost:8080/v1/', transport=httpx.MockTransport(respond)) as client:
        calls = {
            'unload': lambda: verifiers.live.unload_model(client),
            'stream': lambda: verifiers.live.stream_model_timing(client, 'cold'),
            'retrieve': lambda: verifiers.retrieval.retrieve(trial_api(verifiers.retrieval, client), {'query': 'test'}),
            'plugin': lambda: verifiers.runtime.verify_model_transport(runner),
        }
        with admitted.coordinator.training(timeout=0):
            with pytest.raises(COORD.ComputeBusy, match='training_pending_or_active'):
                calls[boundary]()
    assert not requests and not admitted.entries and not admitted.completions
    assert_released(admitted)


def test_live_suite_does_not_gate_backend_requests_or_metadata(verifiers, admitted, monkeypatch, tmp_path):
    original_client = httpx.Client
    observed = []

    def respond(request):
        path = request.url.path
        state = admitted.coordinator.status()
        observed.append(path)
        if path in ('/api/generate', '/api/chat') and request.url.port == 11434:
            assert state['compute_locked']
            if path == '/api/generate':
                return httpx.Response(200, json={'done': True})
            return httpx.Response(200, content=b'{"message":{"content":"x"},"done":true}\n')
        assert not state['compute_locked'], 'Backend must acquire its own model gate; metadata is light'
        if path == '/api/coverage':
            return httpx.Response(200, json={'competitions': 1, 'sources': []})
        if path == '/api/competitions':
            return httpx.Response(200, json={'items': [{'competition_id': 'one'}], 'total': 1})
        if path == '/api/ps':
            return httpx.Response(200, json={'models': []})
        if path == '/api/chat':
            return httpx.Response(200, json={'mode': 'local_model_evidence', 'answer': '4 月 12 日 20:00', 'sources': []})
        raise AssertionError('Unexpected mock path: ' + path)

    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original_client(transport=httpx.MockTransport(respond)))
    monkeypatch.setattr(httpx, 'get', lambda *args, **kwargs: httpx.Response(200, json={'ok': True}))
    verifiers.live.main()
    assert observed.count('/api/chat') == 5  # cold/warm direct + three backend requests
    assert [entry['workload'] for entry in admitted.entries] == ['inference', 'chat', 'chat']
    report = json.loads((tmp_path / 'reports/live-verification.json').read_text(encoding='utf-8'))
    assert report['pagination']['passed']
    assert len(report['two_simultaneous_requests']) == 2
    assert_released(admitted)
