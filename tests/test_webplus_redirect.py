"""Offline tests: only temporary archive DBs, MockTransport and fake DNS.

Load only the real ingest fetch/validate function definitions, avoiding its
configuration, credential loading and business database imports entirely.
"""
import ast
import hashlib
import importlib.util
import ipaddress
import itertools
import os
import socket
import sys
import types
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx
import pytest


ROOT = Path(__file__).parents[1]
PACKAGE = "_isolated_redirect_app"
package = types.ModuleType(PACKAGE)
package.__path__ = [str(ROOT / "app")]
sys.modules[PACKAGE] = package
db = types.ModuleType(PACKAGE + ".db")
db.timestamp = lambda: datetime.now(timezone.utc).isoformat()
sys.modules[db.__name__] = db
published = types.ModuleType(PACKAGE + ".published_links")
published.extract_published_links = lambda soup: []
sys.modules[published.__name__] = published
ingest = types.ModuleType(PACKAGE + ".ingest")
ingest_path = Path(os.environ.get("CAMPUS_TEST_INGEST_SOURCE", ROOT / "app/ingest.py"))
tree = ast.parse(ingest_path.read_text(encoding="utf-8"))
fetch_functions = {"fetch", "validate_url", "fetch_client", "pooled_archive_fetches"}
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in fetch_functions]
assert {node.name for node in functions} == fetch_functions
ingest.__dict__.update(httpx=httpx, socket=socket, ipaddress=ipaddress,
                       urlsplit=urlsplit, urljoin=urljoin, MAX_FILE=20 * 1024 * 1024,
                       contextmanager=contextmanager, _archive_client=ContextVar('test_archive_client', default=None))
exec(compile(ast.Module(body=functions, type_ignores=[]), str(ingest_path), "exec"), ingest.__dict__)
sys.modules[ingest.__name__] = ingest
spec = importlib.util.spec_from_file_location(PACKAGE + ".school_archive", ROOT / "app/school_archive.py")
archive_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = archive_module
spec.loader.exec_module(archive_module)
SchoolArchive = archive_module.SchoolArchive
BASE = "https://lib.njxzc.edu.cn/"
QUERY = "siteId=38&columnId=3783&articleId=140662"
REDIRECT = BASE + "_redirect?" + QUERY


@pytest.mark.parametrize("parts", list(itertools.permutations(QUERY.split("&"))))
def test_valid_three_numeric_parameters_are_canonicalized(parts):
    raw = BASE + "_redirect?" + "&".join(parts)
    assert archive_module.scope_reason(raw) is None
    assert archive_module.normalize_url(raw + "#fragment", BASE) == REDIRECT


@pytest.mark.parametrize("query", [
    "", "siteId=1&columnId=2", "siteId=1&columnId=2&articleId=3&extra=4",
    "siteId=1&columnId=2&siteId=3", "siteId=1&columnId=2&articleId=3&articleId=3",
    "siteId=&columnId=2&articleId=3", "siteId=-1&columnId=2&articleId=3",
    "siteId=+1&columnId=2&articleId=3", "SiteId=1&columnId=2&articleId=3",
    "%73iteId=1&columnId=2&articleId=3", "siteId=%31&columnId=2&articleId=3",
    "siteId=1%26articleId%3D9&columnId=2&articleId=3",
    "siteId=１&columnId=2&articleId=3", "siteId=1;columnId=2;articleId=3",
    "siteId=1&columnId=2&articleId=3=4", "siteId=1&columnId=2&articleId=" + "9" * 13,
    "siteId=1&columnId=2&articleId=" + "9" * 10000,
])
def test_invalid_ambiguous_encoded_and_unbounded_queries_stay_excluded(query):
    url = BASE + "_redirect" + ("?" + query if query else "")
    assert archive_module.scope_reason(url) == "dynamic_query_needs_adapter"


@pytest.mark.parametrize("path", ["/other", "/other.htm", "/_redirect/", "/x/_redirect", "/_Redirect", "/%5fredirect"])
def test_adapter_is_only_the_exact_redirect_path(path):
    assert archive_module.scope_reason(BASE.rstrip("/") + path + "?" + QUERY) == "dynamic_query_needs_adapter"


@pytest.mark.parametrize("host", ["oa", "authserver", "my", "sso", "cas", "ehall"])
def test_numeric_redirect_does_not_bypass_account_hosts(host):
    assert archive_module.scope_reason(f"https://{host}.njxzc.edu.cn/_redirect?{QUERY}") == "account_system"


def test_external_account_path_and_credentials_remain_rejected():
    assert archive_module.scope_reason("https://example.com/_redirect?" + QUERY) == "external_domain"
    assert archive_module.scope_reason(BASE + "login/_redirect?" + QUERY) == "account_system"
    assert archive_module.normalize_url("https://name:password@lib.njxzc.edu.cn/_redirect?" + QUERY, BASE) is None
    assert archive_module.scope_reason(BASE + "search?key=test") == "dynamic_query_needs_adapter"
    # Preserve the pre-existing linked attachment query exception.
    assert archive_module.scope_reason(BASE + "published.pdf?download=1") is None


@pytest.mark.parametrize("control", ["\t", "\r", "\n", "\x00", "\x7f"])
def test_parser_does_not_silently_remove_control_bytes_from_numeric_query(control):
    url = BASE + "_redirect?siteId=3" + control + "8&columnId=3783&articleId=140662"
    assert archive_module.scope_reason(url) == "dynamic_query_needs_adapter"
    assert archive_module.normalize_url(url, BASE) is None


def seed_html(archive, directory, html):
    content = html.encode()
    digest = hashlib.sha256(content).hexdigest()
    source = BASE
    archive.enqueue(source, "图书馆", depth=2)
    (directory / "blobs" / digest).write_bytes(content)
    archive.db.execute("""UPDATE urls SET state='fetched',sha256=?,mime='text/html',final_url=?,
        checked_at='2026-10-09T00:00:00+00:00',attempts=2,document_id='reviewed-source',
        import_state='imported',import_error='retain this' WHERE url=?""", (digest, source, source))
    archive.db.commit()


def seed_old_exclusion(archive, url, reason="dynamic_query_needs_adapter", state="excluded"):
    archive.enqueue(url, "既有标签")
    archive.db.execute("""UPDATE urls SET state=?,error=?,attempts=2,checked_at='2026-10-08T00:00:00+00:00',
        document_id='existing-pointer',import_state='legacy-marker' WHERE url=?""", (state, reason, url))
    archive.db.commit()


def test_only_real_verified_html_replay_requeues_newly_allowed_old_redirects(tmp_path, monkeypatch):
    monkeypatch.setattr(archive_module, "fetch", lambda *a, **k: pytest.fail("Replay must never fetch, including robots"))
    other_query = BASE + "search?key=test"
    invalid_redirect = REDIRECT + "&session=abc"
    unlinked_redirect = REDIRECT.replace("140662", "99999")
    blocked_redirect = REDIRECT.replace("140662", "88888")
    account = REDIRECT.replace("lib.", "authserver.")
    external = "https://example.com/_redirect?" + QUERY
    html = "<html>" + "".join(f'<a href="{url}">学科服务</a>' for url in (REDIRECT, other_query, invalid_redirect, blocked_redirect, account, external)) + "</html>"
    with SchoolArchive(tmp_path) as archive:
        seed_html(archive, tmp_path, html)
        for url in (REDIRECT, other_query, invalid_redirect, unlinked_redirect):
            seed_old_exclusion(archive, url)
        seed_old_exclusion(archive, blocked_redirect, "robots_disallowed", "blocked")
        seed_old_exclusion(archive, account, "account_system")
        seed_old_exclusion(archive, external, "external_domain")
        before = {row["url"]: dict(row) for row in archive.db.execute("SELECT * FROM urls")}
        # Ordinary discovery does not reactivate previously excluded rows.
        archive.discover(html.encode(), BASE, 2)
        assert archive.db.execute("SELECT state FROM urls WHERE url=?", (REDIRECT,)).fetchone()[0] == "excluded"
        first = archive.rediscover_archived()
        assert first["http_requests"] == 0 and first["replayed_html"] == 1
        assert first["new_queue_urls"] == 1 and first["new_urls"] == 0
        after = {row["url"]: dict(row) for row in archive.db.execute("SELECT * FROM urls")}
        assert after[REDIRECT] == dict(before[REDIRECT], state="pending", error=None)
        for url, row in before.items():
            if url != REDIRECT:
                assert after[url] == row
        assert archive.db.execute("SELECT COUNT(*) FROM robots").fetchone()[0] == 0
        assert not archive._rediscovering_archived
        second = archive.rediscover_archived()
        assert second["new_queue_urls"] == second["new_urls"] == 0
        assert {row["url"]: dict(row) for row in archive.db.execute("SELECT * FROM urls")} == after


def test_replay_with_changed_blob_does_not_requeue_and_clears_replay_flag(tmp_path, monkeypatch):
    monkeypatch.setattr(archive_module, "fetch", lambda *a, **k: pytest.fail("Replay must stay offline"))
    with SchoolArchive(tmp_path) as archive:
        seed_html(archive, tmp_path, f'<html><a href="{REDIRECT}">link</a></html>')
        seed_old_exclusion(archive, REDIRECT)
        digest = archive.db.execute("SELECT sha256 FROM urls WHERE url=?", (BASE,)).fetchone()[0]
        (tmp_path / "blobs" / digest).write_bytes(b"changed")
        report = archive.rediscover_archived()
        assert report["failed_html"] == 1 and report["new_queue_urls"] == 0
        assert archive.db.execute("SELECT state FROM urls WHERE url=?", (REDIRECT,)).fetchone()[0] == "excluded"
        assert not archive._rediscovering_archived


def test_failed_replay_rolls_back_reactivation_before_retry(tmp_path, monkeypatch):
    monkeypatch.setattr(archive_module, "fetch", lambda *a, **k: pytest.fail("Replay must stay offline"))
    with SchoolArchive(tmp_path) as archive:
        seed_html(archive, tmp_path, f'<html><a href="{REDIRECT}">link</a></html>')
        seed_old_exclusion(archive, REDIRECT)
        original_discover = archive.discover
        def failing_discover(*args):
            original_discover(*args)
            raise RuntimeError("simulated interruption before commit")
        monkeypatch.setattr(archive, "discover", failing_discover)
        assert archive.rediscover_archived()["failed_html"] == 1
        assert archive.db.execute("SELECT state FROM urls WHERE url=?", (REDIRECT,)).fetchone()[0] == "excluded"
        assert not archive._rediscovering_archived
        monkeypatch.setattr(archive, "discover", original_discover)
        assert archive.rediscover_archived()["new_queue_urls"] == 1


def test_direct_enqueue_and_replay_use_one_canonical_query_order(tmp_path):
    reverse = BASE + "_redirect?articleId=140662&columnId=3783&siteId=38"
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue(reverse)
        archive.enqueue(REDIRECT)
        assert archive.db.execute("SELECT COUNT(*) FROM urls").fetchone()[0] == 1
        assert archive.db.execute("SELECT url FROM urls").fetchone()[0] == REDIRECT


def mock_transport(monkeypatch, handler, *, private_hosts=()):
    original_client = httpx.Client
    monkeypatch.setattr(ingest.httpx, "Client", lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))
    dns = []
    def fake_dns(host, port, *args, **kwargs):
        dns.append(host)
        address = "127.0.0.1" if host in private_hosts else "93.184.216.34"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_dns)
    monkeypatch.setattr(archive_module.time, "sleep", lambda _: None)
    return dns


@pytest.mark.parametrize("destination", ["https://oa.njxzc.edu.cn/_redirect?" + QUERY, "https://authserver.njxzc.edu.cn/_redirect?" + QUERY, "https://lib.njxzc.edu.cn/login", "https://lib.njxzc.edu.cn/search?q=1", REDIRECT.replace("siteId=38", "siteId=%33%38")])
def test_every_redirect_hop_keeps_account_and_query_guards(tmp_path, monkeypatch, destination):
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(302, headers={"location": destination})
    dns = mock_transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue(REDIRECT)
        assert archive.run(1, 0)["states"] == {"blocked": 1}
        assert archive._active_request is None
    assert calls == [BASE + "robots.txt", REDIRECT]
    assert all(host == "lib.njxzc.edu.cn" for host in dns)


def test_external_redirect_is_recorded_and_never_dns_resolved_or_requested(tmp_path, monkeypatch):
    destination = "https://outside.example/public.htm"
    calls = []
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(404) if request.url.path == "/robots.txt" else httpx.Response(302, headers={"location": destination})
    dns = mock_transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue(REDIRECT)
        assert archive.run(1, 0)["states"] == {"blocked": 1, "excluded": 1}
        row = archive.db.execute("SELECT state,error FROM urls WHERE url=?", (destination,)).fetchone()
        assert tuple(row) == ("excluded", "external_domain")
        assert tuple(archive.db.execute("SELECT parent,child,relation FROM edges").fetchone()) == (REDIRECT, destination, "redirect")
        assert archive.run(10, 0)["requests_this_run"] == 0
    assert calls == [BASE + "robots.txt", REDIRECT]
    assert "outside.example" not in dns


@pytest.mark.parametrize(("failure", "state"), [("disallow", "blocked"), ("offline", "deferred"), ("private_dns", "deferred")])
def test_redirect_destination_robots_and_dns_guards_precede_target_request(tmp_path, monkeypatch, failure, state):
    destination = "https://next.njxzc.edu.cn/article.htm"
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.host == "next.njxzc.edu.cn":
            assert request.url.path == "/robots.txt", "Destination article must never be requested"
            if failure == "offline":
                raise httpx.ConnectTimeout("offline", request=request)
            return httpx.Response(200, text="User-agent: *\nDisallow: /")
        return httpx.Response(404) if request.url.path == "/robots.txt" else httpx.Response(302, headers={"location": destination})
    mock_transport(monkeypatch, handler, private_hosts=("next.njxzc.edu.cn",) if failure == "private_dns" else ())
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue(REDIRECT)
        assert archive.run(1, 0)["states"] == {state: 1}
    expected = [BASE + "robots.txt", REDIRECT]
    if failure != "private_dns":
        expected.append("https://next.njxzc.edu.cn/robots.txt")
    assert calls == expected


def test_valid_redirect_reaches_public_article_with_guards(tmp_path, monkeypatch):
    destination = BASE + "public/page.htm"
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.path == "/_redirect":
            return httpx.Response(302, headers={"location": destination})
        return httpx.Response(200, content=b"<html><h1>Public article</h1></html>", headers={"content-type": "text/html"})
    dns = mock_transport(monkeypatch, handler)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue(REDIRECT)
        assert archive.run(1, 0)["states"] == {"fetched": 1}
        assert archive.db.execute("SELECT final_url FROM urls").fetchone()[0] == destination
    assert calls == [BASE + "robots.txt", REDIRECT, destination]
    assert len(dns) == 3


def test_dns_is_rechecked_after_destination_robots_before_article(tmp_path, monkeypatch):
    destination = "https://next.njxzc.edu.cn/article.htm"
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        assert str(request.url) == REDIRECT, "Rebound destination must never be requested"
        return httpx.Response(302, headers={"location": destination})
    mock_transport(monkeypatch, handler)
    checks = []
    def rebinding_dns(host, port, *args, **kwargs):
        checks.append(host)
        address = "127.0.0.1" if host == "next.njxzc.edu.cn" and checks.count(host) > 1 else "93.184.216.34"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]
    monkeypatch.setattr(socket, "getaddrinfo", rebinding_dns)
    with SchoolArchive(tmp_path) as archive:
        archive.enqueue(REDIRECT)
        assert archive.run(1, 0)["states"] == {"failed": 1}
    assert checks.count("next.njxzc.edu.cn") == 2
    assert calls == [BASE + "robots.txt", REDIRECT, "https://next.njxzc.edu.cn/robots.txt"]
