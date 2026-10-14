"""CLI resource outcomes using real temporary DB/cache/locks, no model server."""
import json

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import config, db
from app.compute_coordination import Coordinator
from scripts import index_school_knowledge as cli


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    data.mkdir()
    (tmp_path / 'reports').mkdir()
    monkeypatch.setattr(config, 'DATA', data)
    monkeypatch.setattr(config, 'ROOT', tmp_path)
    monkeypatch.setenv('CAMPUS_COMPUTE_DIR', str(tmp_path / 'compute'))
    monkeypatch.setenv('CAMPUS_MODEL_LOCK_DIR', str(tmp_path / 'endpoint'))
    engine = create_engine('sqlite:///' + str(tmp_path / 'business.sqlite3'))
    db.Base.metadata.create_all(engine)
    monkeypatch.setattr(db, 'engine', engine)
    with Session(engine) as session:
        session.add(db.Document(id='doc', title='档案通知', sha256='a'*64,
            raw_name='sample.html', mime='.html', source_url='https://www.njxzc.edu.cn/sample.htm',
            kind='knowledge', visibility='public', status='pending_review'))
        session.add(db.Chunk(id='chunk', document_id='doc', text='通过电子邮件申请档案。', location='网页段落 1'))
        session.commit()
    real_client = httpx.Client
    calls = []
    def handler(request):
        calls.append(request.url.path)
        if request.url.path == '/api/tags':
            return httpx.Response(200, json={'models': [{'name': config.EMBED_MODEL, 'digest': 'test-immutable-digest'}]})
        assert request.url.path == '/api/embed'
        return httpx.Response(200, json={'embeddings': [[1., 0., 0.]]})
    monkeypatch.setattr(httpx, 'Client', lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    yield tmp_path, calls
    engine.dispose()


def run():
    return cli.main(['--limit', '1', '--batch-size', '1', '--dimensions', '3'])


def report(root):
    return json.loads((root / 'reports/semantic-index-state.json').read_text(encoding='utf-8'))


def test_training_deferral_is_75_and_pending_resumes_without_duplicate_embedding(runtime):
    root, calls = runtime
    with Coordinator().training(timeout=0):
        assert run() == 75
        state = report(root)
        assert state['state'] == 'deferred_model_busy'
        assert state['cache']['states'] == {'pending': 1}
        assert state['publication']['rows'] == 0
        assert '/api/embed' not in calls
    assert run() == 0
    assert report(root)['cache']['states'] == {'ready': 1}
    assert calls.count('/api/embed') == 1
    assert run() == 0
    assert report(root)['embedding'].get('attempted', 0) == 0
    assert calls.count('/api/embed') == 1
    assert Coordinator().status()['quarantine'] is None


def test_content_failure_stays_distinct_from_resource_deferral(runtime, monkeypatch):
    from app import semantic_ollama
    root, _ = runtime
    def invalid(*args, **kwargs):
        raise ValueError('invalid embedding content')
    monkeypatch.setattr(semantic_ollama.OllamaCpuEmbedder, '__call__', invalid)
    assert run() == 1
    state = report(root)
    assert state['state'] == 'completed_with_errors'
    assert state['cache']['states'] == {'failed': 1}
    assert state['business_data_modified'] is False

