import httpx
import pytest
import app.ingest as ingest


@pytest.fixture
def clients(monkeypatch):
    created, requests = [], []
    original = httpx.Client
    def handler(request):
        requests.append(request)
        return httpx.Response(200, content=b'public', headers={'Set-Cookie': 'session=not-retained'})
    def make(**kwargs):
        client = original(transport=httpx.MockTransport(handler), **kwargs)
        created.append(client)
        return client
    monkeypatch.setattr(ingest.httpx, 'Client', make)
    monkeypatch.setattr(ingest, 'validate_url', lambda url: url)
    return created, requests


def test_batch_reuses_client_but_not_cookies_and_closes_it(clients):
    created, requests = clients
    guards = []
    with ingest.pooled_archive_fetches():
        for n in range(5):
            ingest.fetch(f'https://www.njxzc.edu.cn/{n}.htm', guard=guards.append)
        assert len(created) == 1 and not created[0].is_closed
    assert created[0].is_closed and len(guards) == 5
    assert all('cookie' not in request.headers for request in requests)


def test_error_releases_pool_and_later_request_owns_new_client(clients):
    created, _ = clients
    def deny(url): raise ValueError('policy deny')
    with pytest.raises(ValueError), ingest.pooled_archive_fetches():
        ingest.fetch('https://www.njxzc.edu.cn/a.htm', guard=deny)
    assert created[0].is_closed
    ingest.fetch('https://www.njxzc.edu.cn/b.htm')
    assert len(created) == 2 and all(c.is_closed for c in created)


def test_nested_batch_does_not_close_outer_pool(clients):
    created, _ = clients
    with ingest.pooled_archive_fetches():
        with ingest.pooled_archive_fetches():
            ingest.fetch('https://www.njxzc.edu.cn/a.htm')
        assert not created[0].is_closed
    assert created[0].is_closed
