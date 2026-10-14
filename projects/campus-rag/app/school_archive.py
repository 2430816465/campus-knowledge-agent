"""Persistent, bounded-per-run traversal of links actually published by the school.

The archive is independent of the reviewed business database. A successful HTTP
fetch is not a reviewed rule, a searchable document, or evidence of full coverage.
"""
import hashlib
import json
import math
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

from .db import timestamp
from .ingest import fetch
from .published_links import extract_published_links

AGENT = 'CampusAgent'
PRIVATE_HOSTS = {'ehall', 'xzoa', 'oa', 'my', 'mail', 'xk', 'cwcx', 'ykt', 'vpn', 'webvpn', 'sso', 'auth', 'authserver', 'cas', 'casb'}
FILES = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mp3', '.js', '.css', '.svg', '.ico'}


def webplus_redirect_query(path, query):
    """Allow one published WebPlus route, without decoding ambiguous inputs."""
    if path != '/_redirect' or not query or len(query) > 128:
        return None
    parts = query.split('&')
    if len(parts) != 3:
        return None
    values = {}
    for part in parts:
        match = re.fullmatch(r'(siteId|columnId|articleId)=([0-9]{1,12})', part)
        if not match or match[1] in values:
            return None
        values[match[1]] = match[2]
    if set(values) != {'siteId', 'columnId', 'articleId'}:
        return None
    return '&'.join(key + '=' + values[key] for key in ('siteId', 'columnId', 'articleId'))


def normalize_url(href, base):
    if not isinstance(href, str) or not href.strip():
        return None
    # urlsplit silently drops embedded CR/LF/TAB. Do not turn an ambiguous
    # published query into a different apparently valid numeric redirect.
    if re.search(r'[\x00-\x1f\x7f]', href.strip()):
        return None
    try:
        p = urlsplit(urljoin(base, href.strip()))
        if p.scheme not in ('http', 'https') or p.username or p.password or p.port not in (None, 80, 443):
            return None
        query = webplus_redirect_query(p.path, p.query) or p.query
        return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path or '/', query, ''))
    except ValueError:
        return None


def scope_reason(url):
    p = urlsplit(url)
    host = p.hostname or ''
    if host != 'njxzc.edu.cn' and not host.endswith('.njxzc.edu.cn'):
        return 'external_domain'
    school_labels = host[:-len('.njxzc.edu.cn')].split('.') if host.endswith('.njxzc.edu.cn') else []
    if any(label in PRIVATE_HOSTS for label in school_labels) or re.search(r'/(?:login|logout|auth|admin|oauth|cas|webvpn)(?:/|\.|$)', p.path, re.I):
        return 'account_system'
    if p.path == '/_redirect':
        raw_query = url.partition('?')[2].partition('#')[0]
        if re.search(r'[\x00-\x20\x7f]', raw_query):
            return 'dynamic_query_needs_adapter'
        return None if webplus_redirect_query(p.path, p.query) else 'dynamic_query_needs_adapter'
    if p.query:
        # Never traverse arbitrary search/session/calendar parameters. Ordinary
        # linked attachment query strings remain allowed and are recorded intact.
        if Path(p.path).suffix.lower() not in FILES:
            return 'dynamic_query_needs_adapter'
    suffix = Path(p.path).suffix.lower()
    if suffix and suffix not in FILES | {'.htm', '.html', '.psp', '.xml'}:
        return 'unsupported_route'
    return None


def priority(url, label):
    path = urlsplit(url).path
    if path in ('/', '/main.htm', '/main.psp', '/index.htm', '/index.html'):
        return 100
    if re.search('机构|部门|学院|学校简介|章程|办事|校历|班车', label):
        return 90
    if re.search('竞赛|大赛|报名|奖学金|资助|学籍|毕业|选课', label):
        return 80
    if re.search('通知|公告|规章|制度|服务', label):
        return 65
    if re.search(r'/list\d*\.(?:htm|psp)$', path):
        return 55
    return 40 if Path(path).suffix.lower() in FILES else 45


def linked_resources(container, base):
    """Read literal published URL attributes; do not infer viewer filenames."""
    for node in container.select('a[href],iframe[src],img[src],video[src],audio[src],source[src],link[href],script[src],object[data],embed[src],[pdfsrc]'):
        attr = next((key for key in ('pdfsrc', 'href', 'src', 'data') if node.get(key)), None)
        child = normalize_url(node.get(attr) if attr else None, base)
        if child:
            label = node.get_text(' ', strip=True) or node.get('title') or node.get('alt') or ''
            if not label and node.get('sudyfile-attr'):
                match = re.search(r"['\"]title['\"]\s*:\s*['\"]([^'\"]+)['\"]", node['sudyfile-attr'][:5000])
                label = match[1] if match else ''
            yield {'url': child, 'label': label[:500], 'relation': 'pdfsrc' if attr == 'pdfsrc' else node.name}


def cache_expired(checked_at, hours):
    try:
        checked = datetime.fromisoformat(checked_at)
        if checked.tzinfo is None:
            checked = checked.replace(tzinfo=timezone.utc)
        now = datetime.fromisoformat(timestamp())
        return (now - checked).total_seconds() >= hours * 3600
    except (TypeError, ValueError):
        return True


def validate_hours(value, label):
    if not math.isfinite(value) or value < 0:
        raise ValueError(f'{label} must be a finite nonnegative number.')


def is_html_content(content, mime):
    return 'html' in (mime or '').lower() or content.lstrip()[:20].lower().startswith((b'<!doctype html', b'<html'))


class SchoolArchive:
    def __init__(self, directory, robots_ttl_hours=24):
        validate_hours(robots_ttl_hours, 'robots_ttl_hours')
        self.robots_ttl_hours = robots_ttl_hours
        self.db = None
        self._lock = None
        self._rediscovery_report = None
        self._rediscovering_archived = False
        self._active_request = None
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._acquire_lock()
        try:
            self._open_database()
        except BaseException:
            self.close()
            raise

    def _acquire_lock(self):
        # The OS releases this lock even after an unclean process exit. Never
        # remove the lock file: replacing its inode can permit two owners.
        lock = (self.directory / 'crawler.lock').open('a+b')
        try:
            if os.fstat(lock.fileno()).st_size == 0:
                lock.write(b'1')
                lock.flush()
            lock.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            lock.close()
            raise RuntimeError('School archive already in use; wait for its crawler to exit.') from exc
        self._lock = lock

    def _open_database(self):
        (self.directory / 'blobs').mkdir(exist_ok=True)
        self.db = sqlite3.connect(self.directory / 'frontier.sqlite3')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          PRAGMA journal_mode=WAL;
          CREATE TABLE IF NOT EXISTS urls (
            url TEXT PRIMARY KEY, host TEXT, label TEXT, parent TEXT, depth INTEGER,
            priority INTEGER, state TEXT, attempts INTEGER DEFAULT 0, checked_at TEXT,
            final_url TEXT, sha256 TEXT, mime TEXT, bytes INTEGER, title TEXT,
            error TEXT, document_id TEXT, import_state TEXT, import_error TEXT);
          CREATE INDEX IF NOT EXISTS frontier_state ON urls(state,priority,depth);
          CREATE TABLE IF NOT EXISTS edges (parent TEXT, child TEXT, label TEXT,
            relation TEXT, PRIMARY KEY(parent,child,relation));
          CREATE TABLE IF NOT EXISTS robots (origin TEXT PRIMARY KEY, state TEXT,
            content TEXT, checked_at TEXT, error TEXT);
          CREATE TABLE IF NOT EXISTS host_cooldowns (
            host TEXT PRIMARY KEY, not_before REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS fetch_history (
            url TEXT, sha256 TEXT, first_seen TEXT, last_seen TEXT, final_url TEXT,
            mime TEXT, bytes INTEGER, PRIMARY KEY(url,sha256));
          INSERT OR IGNORE INTO fetch_history
            SELECT url,sha256,checked_at,checked_at,final_url,mime,bytes
            FROM urls WHERE sha256 IS NOT NULL;
        ''')
        # Only the exclusive lock owner can recover an interrupted request.
        self.db.execute("UPDATE urls SET state='pending' WHERE state='fetching'")
        self.db.commit()

    def close(self):
        try:
            if self.db is not None:
                self.db.close()
                self.db = None
        finally:
            if self._lock is not None:
                lock, self._lock = self._lock, None
                try:
                    lock.seek(0)
                    if os.name == 'nt':
                        import msvcrt
                        msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
                finally:
                    lock.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    @staticmethod
    def scope_guard(url):
        reason = scope_reason(url)
        if reason:
            raise TraversalDenied(reason)

    def public_guard(self, url):
        reason = scope_reason(url)
        if reason:
            # A redirect outside school scope is evidence of a link, never a
            # new request. Preserve that destination before denying traversal.
            if reason == 'external_domain' and self._active_request is not None:
                source, depth = self._active_request
                child = normalize_url(url, source)
                if child:
                    self.enqueue(child, '外域重定向目标', source, depth + 1, 'redirect')
            raise TraversalDenied(reason)
        allowed, reason = self.robots_allowed(url)
        if not allowed:
            raise TraversalDenied(reason)

    def enqueue(self, url, label='', parent=None, depth=0, relation='link'):
        parsed = urlsplit(url)
        if webplus_redirect_query(parsed.path, parsed.query):
            url = normalize_url(url, url) or url
        reason = scope_reason(url)
        self.db.execute('INSERT OR IGNORE INTO urls(url,host,label,parent,depth,priority,state,error) VALUES(?,?,?,?,?,?,?,?)',
                        (url, urlsplit(url).hostname, label[:500], parent, depth, priority(url, label), 'excluded' if reason else 'pending', reason))
        # Only a verified local HTML replay can reactivate the newly supported
        # route. Do not unexclude unrelated queries or blocked/failed resources.
        if self._rediscovering_archived and reason is None and webplus_redirect_query(parsed.path, parsed.query):
            self.db.execute("""UPDATE urls SET state='pending',error=NULL WHERE url=?
                AND state='excluded' AND error='dynamic_query_needs_adapter'""", (url,))
        if parent:
            self.db.execute('INSERT OR IGNORE INTO edges VALUES(?,?,?,?)', (parent, url, label[:500], relation))

    def robots_allowed(self, url):
        p = urlsplit(url)
        origin = f'{p.scheme}://{p.netloc}'
        row = self.db.execute('SELECT * FROM robots WHERE origin=?', (origin,)).fetchone()
        if row is None or cache_expired(row['checked_at'], self.robots_ttl_hours):
            state, content, error = 'ok', '', None
            try:
                # Scope-check redirects too; checking robots recursively here
                # would require robots before robots can be downloaded.
                raw, _, _ = fetch(origin + '/robots.txt', guard=self.scope_guard)
                content = raw.decode('utf-8-sig', errors='replace')
                if '<html' in content.lower():
                    state, error = 'unavailable', 'robots returned HTML; no implicit allow'
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (404, 410):
                    state = 'not_found'
                else:
                    state, error = 'unavailable', f'HTTP {exc.response.status_code}'
            except Exception as exc:
                state, error = 'unavailable', type(exc).__name__
            self.db.execute('''INSERT INTO robots VALUES(?,?,?,?,?) ON CONFLICT(origin)
                DO UPDATE SET state=excluded.state,content=excluded.content,
                checked_at=excluded.checked_at,error=excluded.error''', (origin, state, content, timestamp(), error))
            self.db.commit()
            row = self.db.execute('SELECT * FROM robots WHERE origin=?', (origin,)).fetchone()
        if row['state'] == 'unavailable':
            return False, 'robots_unavailable: ' + (row['error'] or '')
        parser = RobotFileParser()
        parser.parse(row['content'].splitlines())
        return parser.can_fetch(AGENT, url), 'robots_disallowed'

    def discover(self, content, final, depth):
        soup = BeautifulSoup(content, 'html.parser')
        title = soup.select_one('.arti_title,.Article_Title,.article-title,h1,title')
        title = title.get_text(' ', strip=True) if title else ''
        for resource in linked_resources(soup, final):
            self.enqueue(resource['url'], resource['label'], final, depth + 1, resource['relation'])
        for raw_url, label, relation in extract_published_links(soup):
            child = normalize_url(raw_url, final)
            if child:
                self.enqueue(child, label, final, depth + 1, relation)
        # WebPlus publishes real next/last URLs in data even when the anchor is
        # javascript:void(0). Parse literals only; never execute site scripts or
        # invent page-number URL variants.
        for script in soup.select('script:not([src])'):
            data = script.string or script.get_text()
            if 'wp_pagingbarJson' in data:
                for match in re.finditer(r"['\"](nextURL|lastURL|firstURL|prevURL)['\"]\s*:\s*['\"]([^'\"]+)['\"]", data):
                    child = normalize_url(match[2], final)
                    if child:
                        self.enqueue(child, '列表分页 ' + match[1], final, depth + 1, 'published_pagination')
        return title

    def prepare_run(self, refresh_after_hours=None, retry_failed=False, retry_deferred=False):
        if self._lock is None:
            raise RuntimeError('An active archive OS lock is required before changing the queue.')
        refreshed = 0
        if refresh_after_hours is not None:
            validate_hours(refresh_after_hours, 'refresh_after_hours')
            due = [row['url'] for row in self.db.execute("SELECT url,checked_at FROM urls WHERE state='fetched'")
                   if cache_expired(row['checked_at'], refresh_after_hours)]
            self.db.executemany("UPDATE urls SET state='pending',error=NULL WHERE url=?", [(url,) for url in due])
            refreshed = len(due)
        if retry_failed:
            self.db.execute("UPDATE urls SET state='pending' WHERE state='failed' AND attempts<3")
        if retry_deferred:
            # A deliberate retry is allowed after a long outage regardless of
            # prior counts. Requeue only once per run, never loop on failures.
            self.db.execute("UPDATE urls SET state='pending' WHERE state='deferred'")
            self.db.execute("UPDATE robots SET checked_at=NULL WHERE state='unavailable'")
        self.db.commit()
        return refreshed

    def rediscover_archived(self):
        """Replay verified local HTML and restore newly supported redirects.

        This deliberately never calls fetch or robots_allowed. Newly queued
        URLs still pass the normal scope/robots guards when downloaded later.
        Repeating after interruption is safe because enqueue uses unique keys.
        """
        if self._lock is None:
            raise RuntimeError('An active archive OS lock is required before rediscovery.')
        self.db.commit()
        report = {'replayed_html': 0, 'new_queue_urls': 0, 'new_urls': 0,
                  'failed_html': 0, 'errors': [], 'http_requests': 0}
        self._rediscovery_report = report
        before = self.db.execute("SELECT COUNT(*),SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) FROM urls").fetchone()
        blob_root = (self.directory / 'blobs').resolve()
        if not blob_root.is_relative_to(self.directory.resolve()):
            raise ValueError('Archive blob root must stay within the archive directory.')
        rows = self.db.execute("SELECT url,final_url,depth,mime,sha256 FROM urls WHERE state='fetched' ORDER BY url").fetchall()
        for row in rows:
            final = row['final_url'] or row['url']
            suffix = Path(urlsplit(final).path).suffix.lower()
            # Avoid reading archived PDFs/videos solely to identify HTML. MIME
            # and literal HTML/extensionless routes cover existing page fetches.
            if 'html' not in (row['mime'] or '').lower() and suffix not in ('', '.htm', '.html', '.psp'):
                continue
            try:
                self.scope_guard(final)
                digest = row['sha256']
                if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
                    raise ValueError('Invalid archived content hash.')
                path = (blob_root / digest).resolve()
                if not path.is_relative_to(blob_root):
                    raise ValueError('Archived blob must stay within the blob directory.')
                content = path.read_bytes()
                if hashlib.sha256(content).hexdigest() != digest:
                    raise ValueError('Archived blob SHA256 mismatch.')
                if not is_html_content(content, row['mime']):
                    continue
                self._rediscovering_archived = True
                try:
                    self.discover(content, final, row['depth'])
                finally:
                    self._rediscovering_archived = False
                self.db.commit()
                report['replayed_html'] += 1
            except Exception as exc:
                self.db.rollback()
                report['failed_html'] += 1
                if len(report['errors']) < 100:
                    report['errors'].append({'url': row['url'], 'error': f'{type(exc).__name__}: {str(exc)[:300]}'})
        after = self.db.execute("SELECT COUNT(*),SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) FROM urls").fetchone()
        report['new_urls'] = after[0] - before[0]
        report['new_queue_urls'] = (after[1] or 0) - (before[1] or 0)
        return report

    def run(self, max_requests=200, delay=1.0, retry_failed=False, *, refresh_after_hours=None, retry_deferred=False, rediscover_archived=False, cohort_urls=None, workers=1):
        if isinstance(workers, bool) or not isinstance(workers, int) or not 1 <= workers <= 4:
            raise ValueError("workers must be an integer from 1 to 4")
        if not math.isfinite(delay) or delay < 0:
            raise ValueError("delay must be finite and nonnegative")
        # Keep queue mutation/guards on the single lock-owning thread. Pooling
        # removes repeated TCP/TLS setup without weakening per-request policy.
        from .ingest import pooled_archive_fetches
        with pooled_archive_fetches():
            return self._run(max_requests, delay, retry_failed,
                refresh_after_hours=refresh_after_hours, retry_deferred=retry_deferred,
                rediscover_archived=rediscover_archived, cohort_urls=cohort_urls, workers=workers)

    def _run(self, max_requests=200, delay=1.0, retry_failed=False, *, refresh_after_hours=None, retry_deferred=False, rediscover_archived=False, cohort_urls=None, workers=1):
        if cohort_urls is not None and (refresh_after_hours is not None or retry_failed or retry_deferred):
            raise ValueError('Cohort pass cannot refresh or retry unrelated frontier states.')
        self.db.execute('DROP TABLE IF EXISTS temp.active_cohort')
        if cohort_urls is not None:
            self.db.execute('CREATE TEMP TABLE active_cohort (url TEXT PRIMARY KEY)')
            self.db.executemany('INSERT OR IGNORE INTO active_cohort VALUES (?)', ((url,) for url in cohort_urls))
        self._rediscovery_report = None
        if rediscover_archived:
            self.rediscover_archived()
        refreshed = self.prepare_run(refresh_after_hours, retry_failed, retry_deferred)
        if workers > 1:
            from .archive_parallel import download_batch
            restriction = ' AND url IN (SELECT url FROM temp.active_cohort)' if cohort_urls is not None else ''
            result = download_batch(self, max_requests, workers, delay, restriction, fetch, self._record_download)
            return {**result, 'refresh_queued_this_run': refreshed, **self.summary()}
        completed = 0
        while completed < max_requests:
            restriction = ' AND url IN (SELECT url FROM temp.active_cohort)' if cohort_urls is not None else ''
            row = self.db.execute("SELECT * FROM urls WHERE state='pending'" + restriction + " ORDER BY priority DESC,depth,url LIMIT 1").fetchone()
            if row is None:
                break
            url = row['url']
            cooldown = self.db.execute('SELECT not_before FROM host_cooldowns WHERE host=?', (row['host'],)).fetchone()
            if cooldown is not None:
                if not isinstance(cooldown[0], (int, float)) or not math.isfinite(cooldown[0]) or cooldown[0] < 0:
                    raise ValueError('Invalid retained host cooldown; preserve checkpoint.')
                remaining = cooldown[0] - time.time()
                if remaining > 0:
                    time.sleep(min(1, remaining))
                    continue
            self.db.execute("UPDATE urls SET state='fetching',attempts=attempts+1 WHERE url=?", (url,))
            self.db.commit()
            try:
                self._active_request = (url, row['depth'])
                def retained_guard(hop):
                    while True:
                        retained = self.db.execute('SELECT not_before FROM host_cooldowns WHERE host=?', (urlsplit(hop).hostname,)).fetchone()
                        if retained is None:
                            break
                        if not isinstance(retained[0], (int, float)) or not math.isfinite(retained[0]) or retained[0] < 0:
                            raise ValueError('Invalid retained host cooldown; preserve checkpoint.')
                        remaining = retained[0] - time.time()
                        if remaining <= 0:
                            break
                        time.sleep(min(1, remaining))
                    return self.public_guard(hop)
                content, mime, final = fetch(url, guard=retained_guard)
                self._record_download(row, (content, mime, final), None)
            except Exception as exc:
                self._record_download(row, None, exc)
            finally:
                self._active_request = None
            self.db.commit()
            completed += 1
            if completed % 10 == 0:
                self.report(self.directory / 'progress.json')
                print(json.dumps({'requests_this_run': completed, **self.summary()}, ensure_ascii=False), flush=True)
            time.sleep(delay)
        return {'requests_this_run': completed, 'refresh_queued_this_run': refreshed, **self.summary()}

    def _record_download(self, row, result, error):
        url = row['url']
        try:
            if error is not None:
                raise error
            content, mime, final = result
            sha = hashlib.sha256(content).hexdigest()
            (self.directory / 'blobs' / sha).write_bytes(content)
            title = self.discover(content, final, row['depth']) if is_html_content(content, mime) else row['label']
            checked = timestamp()
            self.db.execute("UPDATE urls SET state='fetched',checked_at=?,final_url=?,sha256=?,mime=?,bytes=?,title=?,error=NULL WHERE url=?",
                            (checked, final, sha, mime, len(content), title, url))
            self.db.execute('''INSERT INTO fetch_history VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(url,sha256) DO UPDATE SET last_seen=excluded.last_seen''',
                            (url, sha, checked, checked, final, mime, len(content)))
            if row['sha256'] != sha:
                # The business document pointer stays intact for revision
                # comparison. Only the archive import queue is reset.
                self.db.execute('UPDATE urls SET import_state=NULL,import_error=NULL WHERE url=?', (url,))
        except TraversalDenied as exc:
            state = 'deferred' if str(exc).startswith('robots_unavailable') else 'blocked'
            self.db.execute('UPDATE urls SET state=?,checked_at=?,error=? WHERE url=?', (state, timestamp(), str(exc), url))
        except Exception as exc:
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (429, 503):
                from .archive_parallel import retry_pause
                host = urlsplit(str(exc.response.request.url)).hostname
                until = time.time() + retry_pause(exc.response.headers.get('retry-after', '30'))
                self.db.execute('''INSERT INTO host_cooldowns VALUES (?,?) ON CONFLICT(host)
                    DO UPDATE SET not_before=MAX(host_cooldowns.not_before,excluded.not_before)''', (host, until))
            self.db.execute("UPDATE urls SET state='failed',checked_at=?,error=? WHERE url=?", (timestamp(), f'{type(exc).__name__}: {str(exc)[:300]}', url))
        self.db.commit()

    def summary(self):
        states = {r[0]: r[1] for r in self.db.execute('SELECT state,COUNT(*) FROM urls GROUP BY state')}
        result = {'checked_at': timestamp(), 'states': states,
                'discovered_school_hosts': self.db.execute("SELECT COUNT(DISTINCT host) FROM urls WHERE error IS NULL OR error!='external_domain'").fetchone()[0],
                'unique_blobs': self.db.execute('SELECT COUNT(DISTINCT sha256) FROM urls').fetchone()[0],
                'retained_unique_blobs': self.db.execute('SELECT COUNT(DISTINCT sha256) FROM fetch_history').fetchone()[0],
                'downloaded_bytes': self.db.execute('SELECT COALESCE(SUM(bytes),0) FROM urls').fetchone()[0],
                'imported': self.db.execute("SELECT COUNT(*) FROM urls WHERE import_state='imported'").fetchone()[0],
                'frontier_exhausted': not states.get('pending', 0),
                'full_school_coverage_proven': False}
        if self._rediscovery_report is not None:
            result['archived_rediscovery'] = self._rediscovery_report
        return result

    def report(self, path):
        report = self.summary()
        report['hosts'] = [dict(r) for r in self.db.execute('SELECT host,state,COUNT(*) AS urls FROM urls GROUP BY host,state ORDER BY host,state')]
        report['blocked_failed_deferred'] = [dict(r) for r in self.db.execute("SELECT url,state,error FROM urls WHERE state IN ('blocked','failed','deferred')")]
        report['boundaries'] = ['Only actual linked public school URLs; no login or arbitrary URL enumeration.',
                                'Per-run request budget is resumable, not a coverage claim.',
                                'External services and dynamic query routes are recorded but not traversed.',
                                'Images/scripts are archived; binary download is limited to 20MiB per resource.',
                                'Archive fetch success does not mean parsed, indexed, reviewed or current.']
        Path(path).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report


class TraversalDenied(ValueError):
    """A public traversal policy rejected a URL before its HTTP request."""
