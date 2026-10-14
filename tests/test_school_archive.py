import json
import hashlib
import subprocess
import sys
import httpx
import pytest
from app.school_archive import SchoolArchive, normalize_url, scope_reason


def test_normalization_and_account_scope():
    assert normalize_url(None, 'https://www.njxzc.edu.cn') is None
    assert normalize_url('../a.htm#x', 'https://www.njxzc.edu.cn/sub/') == 'https://www.njxzc.edu.cn/a.htm'
    assert normalize_url('javascript:alert(1)', 'https://www.njxzc.edu.cn') is None
    assert normalize_url('http://x:bad', 'https://www.njxzc.edu.cn') is None
    assert scope_reason('https://njxzc.edu.cn.evil.com/a.htm') == 'external_domain'
    assert scope_reason('https://ehall.njxzc.edu.cn/') == 'account_system'
    assert scope_reason('https://www.njxzc.edu.cn/search?token=secret') == 'dynamic_query_needs_adapter'
    assert scope_reason('https://www.njxzc.edu.cn/a.pdf?download=1') is None


def test_archive_resume_edges_hash_and_scope(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    page = b'<html><title>School</title><a href="/about.htm#part">About</a><a href="https://ehall.njxzc.edu.cn/">Login</a><a href="https://elsewhere.example/">External</a></html>'
    calls = []
    def fake_fetch(url, guard=None):
        if guard:
            guard(url)
        calls.append(url)
        if url.endswith('/robots.txt'):
            return b'User-agent: *\nDisallow: /private', 'text/plain', url
        return page, 'text/html', url
    monkeypatch.setattr(module, 'fetch', fake_fetch)
    archive = SchoolArchive(tmp_path)
    archive.enqueue('https://www.njxzc.edu.cn/main.htm')
    first = archive.run(1, 0)
    assert first['states'] == {'excluded': 2, 'fetched': 1, 'pending': 1}
    assert first['unique_blobs'] == 1
    archive.close()
    archive = SchoolArchive(tmp_path)
    second = archive.run(2, 0)
    assert second['states']['fetched'] == 2
    assert second['unique_blobs'] == 1
    assert second['frontier_exhausted']
    assert not second['full_school_coverage_proven']
    assert all('ehall' not in url and 'elsewhere' not in url for url in calls)
    assert archive.db.execute('select count(*) from edges').fetchone()[0] >= 3
    archive.close()


def test_robots_disallow_and_timeout_never_fetch_target(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    calls = []
    def fake_fetch(url, guard=None):
        if guard:
            guard(url)
        calls.append(url)
        if url.startswith('https://bad.'):
            raise httpx.ConnectTimeout('offline')
        return b'User-agent: *\nDisallow: /', 'text/plain', url
    monkeypatch.setattr(module, 'fetch', fake_fetch)
    archive = SchoolArchive(tmp_path)
    archive.enqueue('https://www.njxzc.edu.cn/private.htm')
    archive.enqueue('https://bad.njxzc.edu.cn/main.htm')
    result = archive.run(2, 0)
    assert result['states'] == {'blocked': 1, 'deferred': 1}
    assert all(url.endswith('/robots.txt') for url in calls)
    archive.close()


def test_interrupted_request_is_resumed(tmp_path):
    archive = SchoolArchive(tmp_path)
    archive.enqueue('https://www.njxzc.edu.cn/main.htm')
    archive.db.execute("UPDATE urls SET state='fetching'")
    archive.db.commit()
    archive.close()
    archive = SchoolArchive(tmp_path)
    assert archive.db.execute('SELECT state FROM urls').fetchone()[0] == 'pending'
    archive.close()


def test_published_pagination_data_without_executing_script(tmp_path):
    archive = SchoolArchive(tmp_path)
    html = b"<script>var wp_pagingbarJson=[{'nextURL':'/news/list2.htm','lastURL':'/news/list7.htm','prevURL':'javascript:void(0);'}];</script>"
    archive.discover(html, 'https://www.njxzc.edu.cn/news/list.htm', 2)
    rows = archive.db.execute('SELECT url,depth FROM urls ORDER BY url').fetchall()
    assert [(r['url'], r['depth']) for r in rows] == [('https://www.njxzc.edu.cn/news/list2.htm', 3), ('https://www.njxzc.edu.cn/news/list7.htm', 3)]
    assert archive.db.execute("SELECT COUNT(*) FROM edges WHERE relation='published_pagination'").fetchone()[0] == 2
    archive.close()


def test_live_owner_cannot_be_reset_by_second_process(tmp_path):
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/main.htm')
        archive.db.execute("UPDATE urls SET state='fetching'")
        archive.db.commit()
        result = subprocess.run(
            [sys.executable, '-c',
             'from app.school_archive import SchoolArchive; import sys; SchoolArchive(sys.argv[1])',
             str(tmp_path)], capture_output=True, text=True, timeout=15)
        assert result.returncode != 0
        assert 'already in use' in result.stderr
        assert archive.db.execute('SELECT state FROM urls').fetchone()[0] == 'fetching'
    with SchoolArchive(tmp_path) as resumed:
        assert resumed.db.execute('SELECT state FROM urls').fetchone()[0] == 'pending'


def test_os_releases_lock_after_unclean_process_exit(tmp_path):
    result = subprocess.run(
        [sys.executable, '-c',
         "from app.school_archive import SchoolArchive; import os,sys; "
         "a=SchoolArchive(sys.argv[1]); a.enqueue('https://www.njxzc.edu.cn/main.htm'); "
         "a.db.execute(\"UPDATE urls SET state='fetching'\"); a.db.commit(); os._exit(0)",
         str(tmp_path)], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    with SchoolArchive(tmp_path) as resumed:
        assert resumed.db.execute('SELECT state FROM urls').fetchone()[0] == 'pending'


def mock_http(monkeypatch, handler):
    import app.ingest as ingest
    original_client = httpx.Client
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(ingest, 'validate_url', lambda url: url)
    monkeypatch.setattr(ingest.httpx, 'Client', lambda **kwargs: original_client(transport=transport, **kwargs))


@pytest.mark.parametrize('destination', ['https://oa.njxzc.edu.cn/login', 'https://www.njxzc.edu.cn/login'])
def test_public_page_redirect_cannot_request_account_system(tmp_path, monkeypatch, destination):
    import app.school_archive as module
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.path == '/robots.txt':
            return httpx.Response(200, text='User-agent: *\nAllow: /')
        return httpx.Response(302, headers={'location': destination})
    mock_http(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/main.htm')
        result = archive.run(1, 0)
        assert result['states'] == {'blocked': 1}
        assert archive.db.execute('SELECT error FROM urls').fetchone()[0] == 'account_system'
    assert calls == ['https://www.njxzc.edu.cn/robots.txt', 'https://www.njxzc.edu.cn/main.htm']


@pytest.mark.parametrize(('destination_robots', 'state'), [('disallow', 'blocked'), ('timeout', 'deferred')])
def test_redirect_checks_destination_robots_before_target(tmp_path, monkeypatch, destination_robots, state):
    import app.school_archive as module
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.host == 'next.njxzc.edu.cn':
            assert request.url.path == '/robots.txt', 'destination page must never be requested'
            if destination_robots == 'timeout':
                raise httpx.ConnectTimeout('offline', request=request)
            return httpx.Response(200, text='User-agent: *\nDisallow: /')
        if request.url.path == '/robots.txt':
            return httpx.Response(404)
        return httpx.Response(302, headers={'location': 'https://next.njxzc.edu.cn/article.htm'})
    mock_http(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/main.htm')
        assert archive.run(1, 0)['states'] == {state: 1}
    assert calls == ['https://www.njxzc.edu.cn/robots.txt', 'https://www.njxzc.edu.cn/main.htm',
                     'https://next.njxzc.edu.cn/robots.txt']


def test_robots_redirect_has_scope_guard_without_robots_recursion(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    calls = []
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(302, headers={'location': 'https://my.njxzc.edu.cn/login'})
    mock_http(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/main.htm')
        assert archive.run(1, 0)['states'] == {'deferred': 1}
    assert calls == ['https://www.njxzc.edu.cn/robots.txt']


def test_fetch_without_guard_retains_existing_import_behavior(monkeypatch):
    from app.ingest import fetch
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.path == '/a.htm':
            return httpx.Response(302, headers={'location': '/b.htm'})
        return httpx.Response(200, content=b'public content', headers={'content-type': 'text/html'})
    mock_http(monkeypatch, handler)
    assert fetch('https://www.njxzc.edu.cn/a.htm') == (b'public content', 'text/html', 'https://www.njxzc.edu.cn/b.htm')
    assert calls == ['https://www.njxzc.edu.cn/a.htm', 'https://www.njxzc.edu.cn/b.htm']


def test_refresh_is_opt_in_and_requires_active_lock(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module, 'fetch', lambda *a, **k: pytest.fail('Default must not refresh fetched pages.'))
    archive = SchoolArchive(tmp_path)
    archive.enqueue('https://www.njxzc.edu.cn/a.htm')
    archive.db.execute("UPDATE urls SET state='fetched',checked_at='2000-01-01T00:00:00+00:00',document_id='published-doc',import_state='imported'")
    archive.db.commit()
    assert archive.run(1, 0)['requests_this_run'] == 0
    assert archive.prepare_run(refresh_after_hours=1) == 1
    row = archive.db.execute('SELECT * FROM urls').fetchone()
    assert row['state'] == 'pending'
    assert row['document_id'] == 'published-doc'
    assert row['import_state'] == 'imported'
    archive.close()
    with pytest.raises(RuntimeError, match='OS lock'):
        archive.prepare_run(refresh_after_hours=1)


@pytest.mark.parametrize('changed', [False, True])
def test_refresh_preserves_blobs_document_pointer_and_only_reimports_changes(tmp_path, monkeypatch, changed):
    import app.school_archive as module
    clock = {'now': '2026-10-09T08:00:00+00:00'}
    page = {'content': b'<html><title>version one</title></html>'}
    monkeypatch.setattr(module, 'timestamp', lambda: clock['now'])
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    def fake_fetch(url, guard=None):
        if guard:
            guard(url)
        return (b'User-agent: *\nAllow: /', 'text/plain', url) if url.endswith('/robots.txt') else (page['content'], 'text/html', url)
    monkeypatch.setattr(module, 'fetch', fake_fetch)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/a.htm')
        archive.run(1, 0)
        old_sha = hashlib.sha256(page['content']).hexdigest()
        archive.db.execute("UPDATE urls SET document_id='published-doc',import_state='imported',import_error='old marker'")
        archive.db.commit()
        clock['now'] = '2026-10-09T10:00:00+00:00'
        if changed:
            page['content'] = b'<html><title>version two</title></html>'
        result = archive.run(1, 0, refresh_after_hours=1)
        row = archive.db.execute('SELECT * FROM urls').fetchone()
        assert result['refresh_queued_this_run'] == 1
        assert row['document_id'] == 'published-doc'
        assert row['state'] == 'fetched'
        assert (tmp_path / 'blobs' / old_sha).read_bytes() == b'<html><title>version one</title></html>'
        if changed:
            assert row['sha256'] != old_sha
            assert row['import_state'] is None and row['import_error'] is None
            assert result['retained_unique_blobs'] == 2
        else:
            assert row['sha256'] == old_sha
            assert row['import_state'] == 'imported' and row['import_error'] == 'old marker'
            assert result['retained_unique_blobs'] == 1
        assert archive.db.execute('SELECT COUNT(*) FROM fetch_history').fetchone()[0] == (2 if changed else 1)


def test_refresh_only_requeues_due_fetched_pages(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module, 'timestamp', lambda: '2026-10-09T10:00:00+00:00')
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/old.htm')
        archive.enqueue('https://www.njxzc.edu.cn/fresh.htm')
        archive.db.execute("UPDATE urls SET state='fetched',checked_at='2026-10-09T09:30:00+00:00'")
        archive.db.execute("UPDATE urls SET checked_at='2026-10-09T08:00:00+00:00' WHERE url LIKE '%old.htm'")
        archive.db.commit()
        assert archive.prepare_run(refresh_after_hours=1) == 1
        states = {row['url']: row['state'] for row in archive.db.execute('SELECT url,state FROM urls')}
        assert states['https://www.njxzc.edu.cn/old.htm'] == 'pending'
        assert states['https://www.njxzc.edu.cn/fresh.htm'] == 'fetched'


def test_deferred_retry_is_explicit_and_rechecks_failed_robots(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    online, calls = {'value': False}, []
    def fake_fetch(url, guard=None):
        if guard:
            guard(url)
        calls.append(url)
        if url.endswith('/robots.txt'):
            if not online['value']:
                raise httpx.ConnectTimeout('offline')
            return b'User-agent: *\nAllow: /', 'text/plain', url
        return b'<html>public</html>', 'text/html', url
    monkeypatch.setattr(module, 'fetch', fake_fetch)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/a.htm')
        assert archive.run(1, 0)['states'] == {'deferred': 1}
        assert archive.run(1, 0)['requests_this_run'] == 0
        assert archive.run(1, 0, retry_failed=True)['requests_this_run'] == 0
        archive.db.execute('UPDATE urls SET attempts=3'); archive.db.commit()
        online['value'] = True
        assert archive.run(1, 0, retry_deferred=True)['states'] == {'fetched': 1}
        assert archive.db.execute('SELECT attempts FROM urls').fetchone()[0] == 4
    assert calls.count('https://www.njxzc.edu.cn/robots.txt') == 2
    assert calls.count('https://www.njxzc.edu.cn/a.htm') == 1


def test_expired_robots_allow_is_not_used_when_recheck_fails(tmp_path, monkeypatch):
    import app.school_archive as module
    clock, calls = {'now': '2026-10-09T08:00:00+00:00', 'online': True}, []
    monkeypatch.setattr(module, 'timestamp', lambda: clock['now'])
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    def fake_fetch(url, guard=None):
        if guard:
            guard(url)
        calls.append(url)
        if url.endswith('/robots.txt'):
            if not clock['online']:
                raise httpx.ConnectTimeout('offline')
            return b'User-agent: *\nAllow: /', 'text/plain', url
        return b'<html>public</html>', 'text/html', url
    monkeypatch.setattr(module, 'fetch', fake_fetch)
    with SchoolArchive(tmp_path, robots_ttl_hours=1) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/old.htm')
        archive.run(1, 0)
        clock['now'] = '2026-10-09T08:30:00+00:00'
        archive.enqueue('https://www.njxzc.edu.cn/fresh.htm')
        archive.run(1, 0)
        assert calls.count('https://www.njxzc.edu.cn/robots.txt') == 1
        clock.update(now='2026-10-09T10:00:00+00:00', online=False)
        archive.enqueue('https://www.njxzc.edu.cn/deferred.htm')
        result = archive.run(1, 0)
        assert result['states'] == {'deferred': 1, 'fetched': 2}
        assert calls.count('https://www.njxzc.edu.cn/robots.txt') == 2
        assert 'https://www.njxzc.edu.cn/deferred.htm' not in calls
        assert archive.db.execute('SELECT state FROM robots').fetchone()[0] == 'unavailable'


@pytest.mark.parametrize('invalid', [-1, float('nan'), float('inf')])
def test_refresh_and_robots_reject_invalid_ages(tmp_path, invalid):
    with pytest.raises(ValueError, match='nonnegative'):
        SchoolArchive(tmp_path, robots_ttl_hours=invalid)
    with SchoolArchive(tmp_path) as archive:
        with pytest.raises(ValueError, match='nonnegative'):
            archive.prepare_run(refresh_after_hours=invalid)


def test_explicit_embedded_documents_preserve_links_labels_and_edge_types(tmp_path):
    html = '''<div class="wp_articlecontent">
      <div pdfsrc="/_upload/bus.pdf" sudyfile-attr="{'title':'班车时刻表（2023年9月25日起试行）.pdf'}"></div>
      <object data="/object.pdf"></object><embed src="/embed.pdf"><iframe src="/frame.pdf"></iframe>
      <embed src="https://oa.njxzc.edu.cn/private.pdf">
    </div>'''.encode()
    with SchoolArchive(tmp_path) as archive:
        archive.discover(html, 'https://www.njxzc.edu.cn/a.htm', 0)
        links = {row['child']: (row['label'], row['relation']) for row in archive.db.execute('SELECT * FROM edges')}
        assert links['https://www.njxzc.edu.cn/_upload/bus.pdf'] == ('班车时刻表（2023年9月25日起试行）.pdf', 'pdfsrc')
        assert links['https://www.njxzc.edu.cn/object.pdf'][1] == 'object'
        assert links['https://www.njxzc.edu.cn/embed.pdf'][1] == 'embed'
        assert links['https://www.njxzc.edu.cn/frame.pdf'][1] == 'iframe'
        private = archive.db.execute("SELECT state,error FROM urls WHERE url='https://oa.njxzc.edu.cn/private.pdf'").fetchone()
        assert tuple(private) == ('excluded', 'account_system')


def test_legacy_frontier_backfills_history_without_changing_import_pointer(tmp_path):
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/a.htm')
        archive.db.execute("UPDATE urls SET state='fetched',sha256='old-hash',document_id='reviewed-doc',import_state='imported',checked_at='2026-10-08T00:00:00+00:00'")
        archive.db.execute('DROP TABLE fetch_history')
        archive.db.commit()
    with SchoolArchive(tmp_path) as archive:
        assert archive.db.execute('SELECT sha256 FROM fetch_history').fetchone()[0] == 'old-hash'
        row = archive.db.execute('SELECT document_id,import_state FROM urls').fetchone()
        assert tuple(row) == ('reviewed-doc', 'imported')


def test_rediscover_real_bus_pdf_is_local_idempotent_and_preserves_source(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module, 'fetch', lambda *a, **k: pytest.fail('Rediscovery must not perform HTTP, including robots.'))
    # Literal body fragment from the already archived official bus notice.
    # Page date and the filename's trial date remain separate historical facts.
    source = 'http://www.njxzc.edu.cn/e0/a0/c89a57504/page.htm'
    path = '/_upload/article/files/8d/e8/245c8c24472fb30a6a4e3da5dc5e/8772dcd6-1be5-4260-924b-79e2c14bc8f7.pdf'
    filename = '南京晓庄学院班车时刻表（2023年9月25日起试行）.pdf'
    html = ('''<html><h1 class="arti_title">南京晓庄学院班车时刻表</h1>
        发布时间：2024-08-30<div class="wp_articlecontent">
        <div class="wp_pdf_player" pdfsrc="''' + path + '''"
        sudyfile-attr="{'title':'南京晓庄学院班车时刻表（2023年9月25日起试行）.pdf'}"></div>
        </div></html>''').encode()
    digest = hashlib.sha256(html).hexdigest()
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue(source, '原通知', depth=4)
        (tmp_path / 'blobs' / digest).write_bytes(html)
        archive.db.execute("""UPDATE urls SET state='fetched',final_url=?,sha256=?,mime='text/html',bytes=?,
            checked_at='2026-10-08T00:00:00+00:00',document_id='published-bus-source',import_state='imported',
            import_error='review metadata',title='Existing title',attempts=2 WHERE url=?""", (source, digest, len(html), source))
        archive.db.commit()
        original = dict(archive.db.execute('SELECT * FROM urls WHERE url=?', (source,)).fetchone())
        assert archive.run(0, 0)['requests_this_run'] == 0
        assert archive.db.execute('SELECT COUNT(*) FROM urls').fetchone()[0] == 1
        first = archive.run(0, 0, rediscover_archived=True)
        replay = first['archived_rediscovery']
        assert replay == {'replayed_html': 1, 'new_queue_urls': 1, 'new_urls': 1,
                          'failed_html': 0, 'errors': [], 'http_requests': 0}
        child = archive.db.execute('SELECT * FROM urls WHERE url=?', ('http://www.njxzc.edu.cn' + path,)).fetchone()
        assert child['state'] == 'pending' and child['label'] == filename and child['depth'] == 5
        edge = archive.db.execute('SELECT * FROM edges WHERE child=?', (child['url'],)).fetchone()
        assert edge['parent'] == source and edge['relation'] == 'pdfsrc'
        assert dict(archive.db.execute('SELECT * FROM urls WHERE url=?', (source,)).fetchone()) == original
        assert archive.db.execute('SELECT COUNT(*) FROM robots').fetchone()[0] == 0
        second = archive.run(0, 0, rediscover_archived=True)['archived_rediscovery']
        assert second['replayed_html'] == 1 and second['new_queue_urls'] == second['new_urls'] == 0
        report = archive.report(tmp_path / 'rediscovery-report.json')
        assert report['archived_rediscovery'] == second
        assert json.loads((tmp_path / 'rediscovery-report.json').read_text(encoding='utf-8'))['archived_rediscovery'] == second


@pytest.mark.parametrize('bad_blob', ['missing', 'mismatch', 'invalid_hash'])
def test_rediscovery_rejects_bad_archived_bytes_without_changing_source(tmp_path, monkeypatch, bad_blob):
    import app.school_archive as module
    monkeypatch.setattr(module, 'fetch', lambda *a, **k: pytest.fail('Rediscovery must stay offline.'))
    html = b'<html><a href="/new.pdf">file</a></html>'
    digest = '../outside' if bad_blob == 'invalid_hash' else hashlib.sha256(html).hexdigest()
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue('https://www.njxzc.edu.cn/a.htm')
        if bad_blob == 'mismatch':
            (tmp_path / 'blobs' / digest).write_bytes(b'changed')
        archive.db.execute("UPDATE urls SET state='fetched',sha256=?,mime='text/html',document_id='reviewed-doc',import_state='imported'", (digest,))
        archive.db.commit()
        before = dict(archive.db.execute('SELECT * FROM urls').fetchone())
        report = archive.rediscover_archived()
        assert report['replayed_html'] == report['new_queue_urls'] == report['new_urls'] == 0
        assert report['failed_html'] == 1 and len(report['errors']) == 1
        assert dict(archive.db.execute('SELECT * FROM urls').fetchone()) == before
        assert archive.db.execute('SELECT COUNT(*) FROM edges').fetchone()[0] == 0


def test_rediscovery_requires_lock_and_only_replays_fetched_html(tmp_path, monkeypatch):
    import app.school_archive as module
    monkeypatch.setattr(module, 'fetch', lambda *a, **k: pytest.fail('Rediscovery must stay offline.'))
    archive = SchoolArchive(tmp_path)
    archive.enqueue('https://www.njxzc.edu.cn/not-fetched.htm')
    archive.enqueue('https://www.njxzc.edu.cn/binary.pdf')
    archive.db.execute("UPDATE urls SET state='fetched',mime='application/pdf',sha256='invalid-but-not-html' WHERE url LIKE '%.pdf'")
    archive.db.commit()
    assert archive.rediscover_archived()['replayed_html'] == 0
    assert archive.rediscover_archived()['failed_html'] == 0
    archive.close()
    with pytest.raises(RuntimeError, match='OS lock'):
        archive.rediscover_archived()
def test_nested_account_gateway_is_not_a_public_school_source():
    from app.school_archive import scope_reason
    assert scope_reason('https://client.casb.njxzc.edu.cn/https/webvpn123/article.pdf') == 'account_system'
    assert scope_reason('https://webvpn.njxzc.edu.cn/example') == 'account_system'
    assert scope_reason('https://www.njxzc.edu.cn/webvpn/login.htm') == 'account_system'
    assert scope_reason('https://lib.njxzc.edu.cn/123/list.htm') is None

