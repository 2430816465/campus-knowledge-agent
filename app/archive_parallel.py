"""Bounded network concurrency; the OS-lock owner alone touches SQLite.

Workers ask the owner to authorize every HTTP hop. A host lease follows the
current hop, so cross-host redirects cannot bypass limits or deadlock cycles.
"""
import queue
import math
import threading
import time
from collections import deque
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

from .ingest import pooled_archive_fetches


def retry_pause(value):
    """Honor both Retry-After forms; never shorten a server's long pause."""
    try:
        seconds = float(value)
        if not 0 <= seconds < float('inf'):
            raise ValueError('Invalid Retry-After')
    except (ValueError, TypeError):
        try:
            date = parsedate_to_datetime(value)
            seconds = (date - datetime.now(timezone.utc)).total_seconds()
        except (ValueError, TypeError, OverflowError):
            seconds = 30
    return max(30, seconds)


def load_cooldowns(db, epoch=None, monotonic=None):
    epoch = time.time() if epoch is None else epoch
    monotonic = time.monotonic() if monotonic is None else monotonic
    result = {}
    for host, until in db.execute('SELECT host,not_before FROM host_cooldowns'):
        if not host or not isinstance(until, (int, float)) or not math.isfinite(until) or until < 0:
            raise ValueError('Invalid retained host cooldown; preserve checkpoint.')
        if until > epoch:
            result[host] = monotonic + (until - epoch)
    return result


def download_batch(archive, budget, workers, delay, restriction, fetch, record):
    from .school_archive import cache_expired
    tasks, events = queue.Queue(), queue.Queue()
    stopping = threading.Event()
    pending = deque()
    active, leases, ready = {}, {}, load_cooldowns(archive.db)
    submitted = completed = peak = 0

    def worker():
        try:
            with pooled_archive_fetches():
                while True:
                    row = tasks.get()
                    if row is None:
                        return
                    def guard(url):
                        signal, reply = threading.Event(), []
                        events.put(('guard', row['url'], url, signal, reply))
                        while not signal.wait(.1):
                            if stopping.is_set():
                                raise RuntimeError('Download coordinator stopped; retain checkpoint.')
                        if reply:
                            raise reply[0]
                    result, error = None, None
                    try:
                        if stopping.is_set():
                            return
                        result = fetch(row['url'], guard=guard)
                    except Exception as exc:
                        error = exc
                    events.put(('done', row['url'], result, error))
        except BaseException as exc:
            events.put(('fatal', type(exc).__name__))

    def release(job):
        host = active[job].pop('host', None)
        if host is not None and leases.get(host) == job:
            del leases[host]
            ready[host] = time.monotonic() + delay

    threads = [threading.Thread(target=worker, name=f'archive-http-{n}', daemon=True)
               for n in range(workers)]
    for thread in threads:
        thread.start()
    try:
        while submitted < budget or active:
            # Prefer a different initial host; never build an unbounded backlog
            # of either jobs or downloaded bytes. SQLite remains on this thread.
            while len(active) < workers and submitted < budget:
                busy = sorted({urlsplit(job).hostname or '' for job in active} | set(leases))
                sql = "SELECT * FROM urls WHERE state='pending'" + restriction
                if busy:
                    sql += ' AND host NOT IN (' + ','.join('?' for _ in busy) + ')'
                row = archive.db.execute(sql + ' ORDER BY priority DESC,depth,url LIMIT 1', busy).fetchone()
                if row is None:
                    break
                row = dict(row)
                archive.db.execute("UPDATE urls SET state='fetching',attempts=attempts+1 WHERE url=? AND state='pending'", (row['url'],))
                archive.db.commit()
                active[row['url']] = {'row': row}
                tasks.put(row)
                submitted += 1
                peak = max(peak, len(active))
            if not active:
                break
            try:
                event = events.get(timeout=.02)
            except queue.Empty:
                event = None
            if event and event[0] == 'fatal':
                raise RuntimeError('Network worker terminated: ' + event[1])
            if event and event[0] == 'guard':
                _, job, url, signal, reply = event
                # Previous response is closed before fetch asks for next hop.
                release(job)
                pending.append((job, url, signal, reply))
            elif event and event[0] == 'done':
                _, job, result, error = event
                host = active[job].get('host')
                release(job)
                # Server pressure never triggers automatic retries. Keep the
                # failed URL and cool this host before dispatching later URLs.
                response = getattr(error, 'response', None)
                if host and response is not None and response.status_code in (429, 503):
                    ready[host] = time.monotonic() + retry_pause(response.headers.get('retry-after', '30'))
                record(active[job]['row'], result, error)
                del active[job]
                completed += 1
                if completed % 10 == 0:
                    archive.report(archive.directory / 'progress.json')
            for _ in range(len(pending)):
                job, url, signal, reply = pending.popleft()
                host = urlsplit(url).hostname or ''
                if host in leases or time.monotonic() < ready.get(host, 0):
                    pending.append((job, url, signal, reply))
                    continue
                # Wall and monotonic clocks may drift or be adjusted during a
                # batch. Recheck the retained epoch before authorizing HTTP.
                retained = archive.db.execute('SELECT not_before FROM host_cooldowns WHERE host=?', (host,)).fetchone()
                remaining = retained[0] - time.time() if retained is not None else 0
                if remaining > 0:
                    ready[host] = time.monotonic() + remaining
                    pending.append((job, url, signal, reply))
                    continue
                parsed = urlsplit(url)
                origin = f'{parsed.scheme}://{parsed.netloc}'
                robots = archive.db.execute('SELECT checked_at FROM robots WHERE origin=?', (origin,)).fetchone()
                refresh = robots is None or cache_expired(robots['checked_at'], archive.robots_ttl_hours)
                # Robots is fetched by the owner using the existing guarded
                # redirect path. Drain content leases before that HTTP call,
                # including when its redirect goes to another school host.
                if refresh and leases:
                    pending.append((job, url, signal, reply))
                    continue
                leases[host] = job
                active[job]['host'] = host
                try:
                    row = active[job]['row']
                    archive._active_request = (row['url'], row['depth'])
                    archive.public_guard(url)
                except Exception as exc:
                    reply.append(exc)
                    release(job)
                finally:
                    archive._active_request = None
                    signal.set()
        return {'requests_this_run': completed, 'network_workers': workers,
                'peak_inflight_urls': peak, 'same_host_concurrency': 1}
    finally:
        # On interruption leave claimed rows as fetching; only the next real
        # crawler lock owner may recover them through existing prepare logic.
        stopping.set()
        for _ in threads:
            tasks.put(None)
        for thread in threads:
            thread.join()
