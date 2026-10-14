import threading
import time
from collections import Counter
from urllib.parse import urlsplit

import httpx
import pytest

from app import ingest
from app.school_archive import SchoolArchive


def seed(archive, urls):
    for url in urls:
        archive.enqueue(url, 'public attachment')
        origin = 'https://' + urlsplit(url).netloc
        archive.db.execute('INSERT OR IGNORE INTO robots VALUES (?,?,?,?,?)',
                           (origin, 'ok', 'User-agent: *\nAllow: /', '2099-01-01T00:00:00+00:00', None))
    archive.db.commit()


def transport(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(ingest.httpx, 'Client', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(ingest, 'validate_url', lambda url: url)


def test_four_hosts_overlap_unique_owner_writes_and_resume(tmp_path, monkeypatch):
    barrier = threading.Barrier(4)
    seen, threads = Counter(), set()
    gate = threading.Lock()
    def handler(request):
        with gate:
            seen[str(request.url)] += 1
            threads.add(threading.get_ident())
        barrier.wait(timeout=5)
        return httpx.Response(200, content=b'same original', headers={'Content-Type': 'application/pdf'})
    transport(monkeypatch, handler)
    urls = [f'https://h{n}.njxzc.edu.cn/a.pdf' for n in range(4)]
    with SchoolArchive(tmp_path) as archive:
        seed(archive, urls)
        owner = threading.get_ident()
        guard = archive.public_guard
        def verify_owner(url):
            assert threading.get_ident() == owner
            return guard(url)
        monkeypatch.setattr(archive, 'public_guard', verify_owner)
        result = archive.run(4, 0, workers=4)
        assert result['states']['fetched'] == 4
        assert result['peak_inflight_urls'] == 4
        assert result['unique_blobs'] == 1
        assert len(threads) == 4 and owner not in threads
        assert all(count == 1 for count in seen.values())
        assert archive.run(4, 0, workers=4)['requests_this_run'] == 0
        assert len(seen) == 4


def test_same_host_serial_and_post_request_delay(tmp_path, monkeypatch):
    calls = []
    def handler(request):
        calls.append((str(request.url), time.monotonic()))
        time.sleep(.025)
        return httpx.Response(200, content=b'text')
    transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        seed(archive, [f'https://h.njxzc.edu.cn/{n}.pdf' for n in range(3)])
        result = archive.run(3, .035, workers=4)
        assert result['states']['fetched'] == 3
        assert result['peak_inflight_urls'] == 1
        assert all(b[1] - a[1] >= .055 for a, b in zip(calls, calls[1:]))


def test_redirect_host_leases_and_external_denial(tmp_path, monkeypatch):
    active, peak, seen = Counter(), Counter(), []
    lock = threading.Lock()
    def handler(request):
        host = request.url.host
        with lock:
            active[host] += 1
            peak[host] = max(peak[host], active[host])
            seen.append(str(request.url))
        time.sleep(.02)
        with lock:
            active[host] -= 1
        if host == 'a.njxzc.edu.cn':
            return httpx.Response(302, headers={'Location': 'https://b.njxzc.edu.cn/shared.pdf'})
        if request.url.path == '/external.pdf':
            return httpx.Response(302, headers={'Location': 'https://example.com/private.pdf'})
        return httpx.Response(200, content=b'public')
    transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        seed(archive, ['https://a.njxzc.edu.cn/a.pdf', 'https://b.njxzc.edu.cn/b.pdf',
                       'https://c.njxzc.edu.cn/external.pdf'])
        result = archive.run(3, 0, workers=4)
        assert result['states']['fetched'] == 2 and result['states']['blocked'] == 1
        assert all(n == 1 for n in peak.values())
        assert all('example.com' not in url for url in seen)
        edge = archive.db.execute("SELECT * FROM edges WHERE relation='redirect'").fetchone()
        assert edge['parent'] == 'https://c.njxzc.edu.cn/external.pdf'


def test_redirect_cycles_release_previous_host(tmp_path, monkeypatch):
    def handler(request):
        if request.url.path == '/start.pdf':
            host = 'b' if request.url.host.startswith('a.') else 'a'
            return httpx.Response(302, headers={'Location': f'https://{host}.njxzc.edu.cn/end.pdf'})
        return httpx.Response(200, content=b'public')
    transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        seed(archive, ['https://a.njxzc.edu.cn/start.pdf', 'https://b.njxzc.edu.cn/start.pdf'])
        assert archive.run(2, 0, workers=2)['states']['fetched'] == 2


def test_failures_budget_cohort_and_existing_os_lock(tmp_path, monkeypatch):
    transport(monkeypatch, lambda request: httpx.Response(500))
    with SchoolArchive(tmp_path) as archive:
        urls = [f'https://h{n}.njxzc.edu.cn/a.pdf' for n in range(8)]
        seed(archive, urls)
        with pytest.raises(RuntimeError):
            SchoolArchive(tmp_path)
        result = archive.run(2, 0, workers=4, cohort_urls=urls[:3])
        assert result['requests_this_run'] == 2
        assert result['states']['failed'] == 2 and result['states']['pending'] == 6
        assert archive.db.execute('SELECT SUM(attempts) FROM urls').fetchone()[0] == 2


def test_robots_refresh_waits_for_content_and_denies_disallowed(tmp_path, monkeypatch):
    active = set()
    mutex = threading.Lock()
    def handler(request):
        with mutex:
            if request.url.path == '/robots.txt':
                assert not active
                return httpx.Response(200, content=b'User-agent: *\nDisallow: /')
            active.add(request.url.host)
        time.sleep(.03)
        with mutex:
            active.remove(request.url.host)
        return httpx.Response(200, content=b'public')
    transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        urls = ['https://a.njxzc.edu.cn/a.pdf', 'https://b.njxzc.edu.cn/b.pdf']
        seed(archive, urls)
        archive.db.execute("DELETE FROM robots WHERE origin='https://b.njxzc.edu.cn'")
        archive.db.commit()
        result = archive.run(2, 0, workers=2)
        assert result['states']['fetched'] == 1 and result['states']['blocked'] == 1


@pytest.mark.parametrize('workers', [0, 5, True, 1.5])
def test_invalid_worker_budget_rejected(tmp_path, workers):
    with SchoolArchive(tmp_path) as archive, pytest.raises(ValueError):
        archive.run(1, 0, workers=workers)


def test_owner_failure_drains_workers_and_retains_recoverable_claims(tmp_path, monkeypatch):
    transport(monkeypatch, lambda request: httpx.Response(200, content=b'public'))
    with SchoolArchive(tmp_path) as archive:
        seed(archive, ['https://a.njxzc.edu.cn/a.pdf', 'https://b.njxzc.edu.cn/b.pdf'])
        def fail(*args):
            raise RuntimeError('simulated owner storage interruption')
        monkeypatch.setattr(archive, '_record_download', fail)
        with pytest.raises(RuntimeError, match='storage interruption'):
            archive.run(2, 0, workers=2)
        assert archive.db.execute("SELECT COUNT(*) FROM urls WHERE state='fetching'").fetchone()[0] == 2
    with SchoolArchive(tmp_path) as recovered:
        assert recovered.summary()['states']['pending'] == 2
    assert not any(t.name.startswith('archive-http-') for t in threading.enumerate())


@pytest.mark.parametrize('value,minimum', [('3600',3600), ('bad',30), ('nan',30), ('-1',30),
    ('Sun, 11 Oct 2099 16:00:00 GMT', 3600)])
def test_backoff_honors_server_and_invalid_values(value, minimum):
    from app.archive_parallel import retry_pause
    assert retry_pause(value) >= minimum


def test_failed_worker_initialization_does_not_hang_owner(tmp_path, monkeypatch):
    from contextlib import contextmanager
    import app.archive_parallel as parallel
    @contextmanager
    def fail_pool():
        raise RuntimeError('simulated client initialization failure')
        yield
    monkeypatch.setattr(parallel, 'pooled_archive_fetches', fail_pool)
    with SchoolArchive(tmp_path) as archive:
        seed(archive, ['https://a.njxzc.edu.cn/a.pdf'])
        with pytest.raises(RuntimeError, match='Network worker terminated'):
            archive.run(1, 0, workers=2)
    assert not any(t.name.startswith('archive-http-') for t in threading.enumerate())


@pytest.mark.parametrize('workers', [1, 4])
@pytest.mark.parametrize('code', [429, 503])
def test_server_backoff_persisted_across_archive_reopen(tmp_path, monkeypatch, workers, code):
    from app.archive_parallel import load_cooldowns
    transport(monkeypatch, lambda request: httpx.Response(code, headers={'Retry-After': '3600'}))
    before = time.time()
    with SchoolArchive(tmp_path) as archive:
        seed(archive, ['https://a.njxzc.edu.cn/a.pdf'])
        assert archive.run(1, 0, workers=workers)['states']['failed'] == 1
    with SchoolArchive(tmp_path) as archive:
        until = archive.db.execute('SELECT not_before FROM host_cooldowns').fetchone()[0]
        assert until >= before + 3600
        assert load_cooldowns(archive.db, epoch=before, monotonic=50)['a.njxzc.edu.cn'] >= 3650
        assert archive.summary()['states']['failed'] == 1


@pytest.mark.parametrize('workers', [1, 4])
@pytest.mark.parametrize('redirect', [False, True])
def test_retained_backoff_applies_before_initial_or_redirect_request(tmp_path, monkeypatch, workers, redirect):
    deadline = time.time() + .18
    seen = []
    def handler(request):
        if request.url.host == 'b.njxzc.edu.cn':
            assert time.time() >= deadline
            seen.append(str(request.url))
            return httpx.Response(200, content=b'public')
        return httpx.Response(302, headers={'Location': 'https://b.njxzc.edu.cn/a.pdf'})
    transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        seed(archive, ['https://a.njxzc.edu.cn/a.pdf' if redirect else 'https://b.njxzc.edu.cn/a.pdf',
                       'https://b.njxzc.edu.cn/robots-seed.pdf'])
        archive.db.execute('INSERT INTO host_cooldowns VALUES (?,?)', ('b.njxzc.edu.cn', deadline))
        archive.db.commit()
    with SchoolArchive(tmp_path) as archive:
        result = archive.run(1, 0, workers=workers, cohort_urls=[
            'https://a.njxzc.edu.cn/a.pdf' if redirect else 'https://b.njxzc.edu.cn/a.pdf'])
        assert result['states']['fetched'] == 1
        assert len(seen) == 1


def test_shorter_response_does_not_shorten_retained_backoff(tmp_path):
    with SchoolArchive(tmp_path) as archive:
        url = 'https://a.njxzc.edu.cn/a.pdf'
        seed(archive, [url])
        deadline = time.time() + 7200
        archive.db.execute('INSERT INTO host_cooldowns VALUES (?,?)', ('a.njxzc.edu.cn', deadline))
        row = archive.db.execute('SELECT * FROM urls WHERE url=?', (url,)).fetchone()
        response = httpx.Response(503, request=httpx.Request('GET', url), headers={'Retry-After': '30'})
        error = httpx.HTTPStatusError('busy', request=response.request, response=response)
        archive._record_download(row, None, error)
        assert archive.db.execute('SELECT not_before FROM host_cooldowns').fetchone()[0] == deadline


@pytest.mark.parametrize('workers', [1, 4])
def test_corrupt_retained_backoff_fails_before_http(tmp_path, monkeypatch, workers):
    def forbidden(request):
        pytest.fail('Invalid cooldown must not send HTTP')
    transport(monkeypatch, forbidden)
    with SchoolArchive(tmp_path) as archive:
        seed(archive, ['https://a.njxzc.edu.cn/a.pdf'])
        archive.db.execute('INSERT INTO host_cooldowns VALUES (?,?)', ('a.njxzc.edu.cn', float('inf')))
        archive.db.commit()
        with pytest.raises(ValueError, match='Invalid retained'):
            archive.run(1, 0, workers=workers)
        assert archive.db.execute('SELECT attempts FROM urls').fetchone()[0] == 0


def test_wall_clock_recheck_when_monotonic_deadline_has_elapsed(tmp_path, monkeypatch):
    import app.archive_parallel as parallel
    # Simulate a clock adjustment after the epoch-to-monotonic conversion.
    monkeypatch.setattr(parallel, 'load_cooldowns', lambda db: {})
    test_retained_backoff_applies_before_initial_or_redirect_request(tmp_path, monkeypatch, 4, True)
