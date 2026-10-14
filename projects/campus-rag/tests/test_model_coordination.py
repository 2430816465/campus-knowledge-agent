import json

import httpx
import pytest

from app import model
from app.compute_coordination import Coordinator, Quarantined
from app.model_gate import ModelBusy, model_deferred_notice


@pytest.fixture(autouse=True)
def isolate_compute(tmp_path, monkeypatch):
    monkeypatch.setenv('CAMPUS_COMPUTE_DIR', str(tmp_path / 'compute'))
    monkeypatch.setenv('CAMPUS_MODEL_LOCK_DIR', str(tmp_path / 'model'))


def mock_http(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr(model.httpx, 'Client', lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))


@pytest.mark.parametrize('action', ['chat', 'embedding'])
def test_training_reservation_defers_both_inference_paths_before_any_http(monkeypatch, action):
    mock_http(monkeypatch, lambda _: pytest.fail('Training reservation sent model HTTP'))
    with Coordinator().training(timeout=0):
        with pytest.raises(ModelBusy) as error:
            model.generate([{'role':'user','content':'测试'}]) if action == 'chat' else model.embeddings(['测试'])
        assert error.value.reason == 'training_pending_or_active'
        assert '训练任务' in model_deferred_notice(error.value)


def test_fully_received_bad_response_does_not_quarantine_finished_work(monkeypatch):
    mock_http(monkeypatch, lambda _: httpx.Response(200, text='invalid-json'))
    with pytest.raises(json.JSONDecodeError):
        model.generate([{'role':'user','content':'测试'}])
    assert Coordinator().status()['quarantine'] is None
    assert not model.MODEL_LOCK.locked()


def test_read_timeout_quarantines_unknown_remote_completion(monkeypatch):
    def handler(request):
        raise httpx.ReadTimeout('mock unread response', request=request)
    mock_http(monkeypatch, handler)
    with pytest.raises(httpx.ReadTimeout):
        model.generate([{'role':'user','content':'测试'}])
    state = Coordinator().status()
    assert state['quarantine'] and not state['compute_locked']
    with pytest.raises(Quarantined):
        with Coordinator().training(timeout=0):
            pytest.fail('Unknown completion allowed training')
    assert not model.MODEL_LOCK.locked()


def test_unconnected_request_can_retry_without_quarantine(monkeypatch):
    def handler(request):
        raise httpx.ConnectError('mock no connection', request=request)
    mock_http(monkeypatch, handler)
    with pytest.raises(httpx.ConnectError):
        model.generate([{'role':'user','content':'测试'}])
    assert Coordinator().status()['quarantine'] is None


def test_normal_chat_and_cpu_embedding_release_shared_resource(monkeypatch):
    def handler(request):
        body = json.loads(request.content)
        if request.url.path.endswith('/embed'):
            assert body['options']['num_gpu'] == 0 and body['keep_alive'] == 0
            return httpx.Response(200, json={'embeddings': [[1, 2, 3]]})
        return httpx.Response(200, json={'message': {'content': '{}'},'done':True,'done_reason':'stop','prompt_eval_count':100,'eval_count':2})
    mock_http(monkeypatch, handler)
    assert model.generate([{'role':'user','content':'测试'}])['message']['content'] == '{}'
    assert model.embeddings(['正文']) == [[1, 2, 3]]
    assert not Coordinator().status()['compute_locked']
    assert Coordinator().status()['quarantine'] is None


def test_chat_sends_explicit_schema_without_changing_default_json_mode(monkeypatch):
    from app.qa_response import RESPONSE_SCHEMA
    formats=[]
    def handler(request):
        formats.append(json.loads(request.content)['format'])
        return httpx.Response(200,json={'message':{'content':'{}'},'done':True,'done_reason':'stop','prompt_eval_count':100,'eval_count':2})
    mock_http(monkeypatch,handler)
    model.generate([{'role':'user','content':'测试'}])
    model.generate([{'role':'user','content':'测试'}],response_schema=RESPONSE_SCHEMA)
    assert formats==['json',RESPONSE_SCHEMA]
    assert Coordinator().status()['quarantine'] is None
