"""Compact read-only status/preflight for the bounded school archive pipeline.

No app imports, queue recovery, process control, credential access or HTTP. An
instant OS-lock probe never creates/replaces the existing lock file. The actual
sync pipeline remains the final lock arbiter after any successful preflight.
"""
import argparse
import errno
import json
import math
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = 1


def utc_now():
    return datetime.now(timezone.utc)


def within(path, boundary):
    path, boundary = Path(path).resolve(), Path(boundary).resolve()
    if not path.is_relative_to(boundary):
        raise ValueError('Status path escapes its configured root.')
    return path


def probe_lock(path):
    """Probe an existing file using a read-only handle; no PID assumption."""
    path = Path(path)
    try:
        handle = path.open('rb')
    except FileNotFoundError:
        return {'state': 'absent', 'held': False}
    except OSError as error:
        return {'state': 'unknown', 'held': None, 'error_type': type(error).__name__}
    try:
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno in {errno.EACCES, errno.EAGAIN, errno.EDEADLK} or getattr(error, 'winerror', None) in {32, 33}:
                return {'state': 'held', 'held': True}
            return {'state': 'unknown', 'held': None, 'error_type': type(error).__name__}
        try:
            return {'state': 'free', 'held': False}
        finally:
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    except OSError as error:
        return {'state': 'unknown', 'held': None, 'error_type': type(error).__name__}
    finally:
        handle.close()


def preflight(project_root, data_root=None):
    root = Path(project_root).resolve()
    if not root.is_dir():
        raise ValueError('Project root does not exist.')
    data = Path(data_root or os.environ.get('CAMPUS_DATA', str(root / 'data'))).resolve()
    archive = within(data / 'school-archive', data)
    locks = {name: probe_lock(within(archive / (name + '.lock'), data)) for name in ('pipeline', 'crawler')}
    held = [name for name, value in locks.items() if value['held'] is True]
    unknown = [name for name, value in locks.items() if value['held'] is None]
    allowed = not held and not unknown
    reason = 'existing_lock_held' if held else 'lock_status_unknown' if unknown else 'preflight_free'
    return {'schema_version': SCHEMA, 'checked_at': utc_now().isoformat(), 'locks': locks,
            'preflight': {'allowed': allowed, 'reason': reason,
                          'core_pipeline_lock_is_final_arbiter': True,
                          'pid_file_required': False}}


def read_json(path):
    try:
        value = json.loads(Path(path).read_text(encoding='utf-8-sig'))
        if not isinstance(value, dict):
            raise ValueError('Expected a JSON object.')
        return value, None
    except FileNotFoundError:
        return {}, 'missing'
    except (OSError, ValueError) as error:
        return {}, type(error).__name__


def freshness(value, observed_at, stale_seconds):
    try:
        instant = datetime.fromisoformat(value)
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=timezone.utc)
        age = max(0, (observed_at - instant).total_seconds())
        return {'updated_at': value, 'age_seconds': round(age, 1), 'stale': age > stale_seconds}
    except (TypeError, ValueError):
        return {'updated_at': None, 'age_seconds': None, 'stale': None}


def archive_counts(database):
    """Read one consistent committed WAL snapshot; never recover fetching."""
    if not Path(database).is_file():
        return None, 'archive_database_missing'
    try:
        with closing(sqlite3.connect(Path(database).as_uri() + '?mode=ro', uri=True, timeout=2)) as connection:
            connection.execute('PRAGMA query_only=ON')
            connection.execute('BEGIN')
            columns = {row[1] for row in connection.execute('PRAGMA table_info(urls)')}
            required = {'state', 'import_state', 'checked_at', 'sha256', 'document_id', 'host'}
            if not required.issubset(columns):
                raise ValueError('Archive urls schema is incomplete.')
            states = {row[0] or 'unknown': row[1] for row in connection.execute('SELECT state,count(*) FROM urls GROUP BY state')}
            imports = {row[0]: row[1] for row in connection.execute("SELECT coalesce(nullif(import_state,''),'pending'),count(*) FROM urls WHERE state='fetched' GROUP BY coalesce(nullif(import_state,''),'pending')")}
            unique_blobs = connection.execute('SELECT count(DISTINCT sha256) FROM urls WHERE sha256 IS NOT NULL').fetchone()[0]
            document_links = connection.execute('SELECT count(DISTINCT document_id) FROM urls WHERE document_id IS NOT NULL').fetchone()[0]
            hosts = connection.execute('SELECT count(DISTINCT host) FROM urls WHERE state<>\'excluded\'').fetchone()[0]
            latest = connection.execute('SELECT max(checked_at) FROM urls').fetchone()[0]
            connection.rollback()
        return {'url_states': states, 'import_states_for_fetched_urls': imports,
                'unique_current_blob_hashes': unique_blobs, 'distinct_business_document_links': document_links,
                'known_in_scope_hosts': hosts, 'latest_frontier_check_at': latest}, None
    except (sqlite3.Error, OSError, ValueError) as error:
        return None, 'archive_read_' + type(error).__name__


def last_results(state):
    """Only the latest verified result per step; no full logs or URL samples."""
    found = {}
    steps = state.get('steps', [])
    if not isinstance(steps, list):
        return []
    allowed = {
        'archive': {'states', 'unique_blobs', 'retained_unique_blobs', 'downloaded_bytes', 'imported',
                    'frontier_exhausted', 'full_school_coverage_proven', 'archived_rediscovery'},
        'import': {'import_attempts_this_run', 'import_states', 'embedding_requested', 'teacher_publication_performed'},
        'doc': {'attempts', 'converted', 'native_parsed', 'failed', 'embedding_requested', 'teacher_publication_performed'},
    }
    for item in reversed(steps):
        if not isinstance(item, dict) or item.get('step') not in allowed or item.get('step') in found or item.get('status') == 'running':
            continue
        report = item.get('report', {})
        if not isinstance(report, dict):
            report = {}
        counts = report.get('counts', {})
        if not isinstance(counts, dict):
            counts = {}
        kept = {key: counts[key] for key in allowed[item['step']] if key in counts}
        # Rediscovery errors may contain page URLs: retain counts only.
        if isinstance(kept.get('archived_rediscovery'), dict):
            kept['archived_rediscovery'] = {key: kept['archived_rediscovery'][key] for key in
                ('replayed_html', 'new_queue_urls', 'new_urls', 'failed_html', 'http_requests')
                if key in kept['archived_rediscovery']}
        found[item['step']] = {'round': item.get('round'), 'step': item['step'], 'status': item.get('status'),
                              'exitcode': item.get('exitcode'), 'report_fresh': report.get('fresh') is True,
                              'counts': kept if report.get('fresh') is True else {}}
    return [found[key] for key in ('archive', 'import', 'doc') if key in found]


def compare(previous, current):
    """Changes in time/age alone do not trigger a progress notification."""
    categories = []
    if not isinstance(previous, dict) or previous.get('schema_version') != SCHEMA:
        return {'previous_available': False, 'notify': False, 'categories': [], 'reason': 'baseline_only'}
    for key, category in [('errors', 'errors'), ('coverage', 'coverage_changed')]:
        if previous.get(key) != current.get(key):
            categories.append(category)
    important = ('observed_status', 'run_id', 'round', 'step', 'rounds_completed', 'exitcode', 'latest_results')
    before = previous.get('pipeline') if isinstance(previous.get('pipeline'), dict) else {}
    after = current.get('pipeline') if isinstance(current.get('pipeline'), dict) else {}
    if any(before.get(key) != after.get(key) for key in important):
        categories.append('important_results')
    return {'previous_available': True, 'notify': bool(categories), 'categories': categories}


def status(project_root, *, data_root=None, observed_at=None, stale_seconds=1800, previous=None):
    if not math.isfinite(stale_seconds) or stale_seconds < 0:
        raise ValueError('Stale threshold must be finite and nonnegative.')
    root = Path(project_root).resolve()
    if not root.is_dir():
        raise ValueError('Project root does not exist.')
    data = Path(data_root or os.environ.get('CAMPUS_DATA', str(root / 'data'))).resolve()
    archive = within(data / 'school-archive', data)
    now = observed_at or utc_now()
    result = preflight(root, data)
    result['checked_at'] = now.isoformat()
    state, state_error = read_json(within(root / 'reports' / 'school-sync-state.json', root))
    counts, database_error = archive_counts(within(archive / 'frontier.sqlite3', data))
    read_errors = [value for value in (('pipeline_state_' + state_error) if state_error else None, database_error) if value]
    reported = state.get('status')
    if result['locks']['pipeline']['held'] is True:
        observed = 'active'
    elif result['locks']['crawler']['held'] is True:
        observed = 'independent_crawler_active'
    elif any(value['held'] is None for value in result['locks'].values()):
        observed = 'lock_status_unknown'
    elif reported == 'running':
        observed = 'inactive_with_unfinished_state'
    elif reported in {'completed', 'completed_with_errors', 'failed', 'interrupted', 'crawler_busy'}:
        observed = reported
    else:
        observed = 'idle_or_never_started'
    result['pipeline'] = {'observed_status': observed, 'reported_status': reported,
        **{key: state.get(key) for key in ('run_id', 'round', 'step', 'rounds_requested', 'rounds_completed', 'exitcode')},
        'state_freshness': freshness(state.get('updated_at'), now, stale_seconds),
        'latest_results': last_results(state)}
    result['archive'] = counts
    result['errors'] = {'read_errors': read_errors}
    if counts is None:
        result['coverage'] = {'available': False, 'full_school_coverage_proven': False}
        result['frontier_freshness'] = freshness(None, now, stale_seconds)
    else:
        states, imports = counts['url_states'], counts['import_states_for_fetched_urls']
        fetched, pending = states.get('fetched', 0), states.get('pending', 0) + states.get('fetching', 0)
        total, excluded = sum(states.values()), states.get('excluded', 0)
        denominator = total - excluded
        result['coverage'] = {'available': True, 'discovered_urls': total, 'scope_excluded_urls': excluded,
            'known_in_scope_urls': denominator, 'fetched_urls': fetched, 'pending_or_fetching_urls': pending,
            'deferred_urls': states.get('deferred', 0), 'blocked_urls': states.get('blocked', 0),
            'failed_urls': states.get('failed', 0), 'imported_fetched_url_records': imports.get('imported', 0),
            'pending_import_fetched_url_records': imports.get('pending', 0),
            'not_searchable_fetched_url_records': imports.get('not_searchable', 0),
            'known_frontier_fetch_completion_ratio': round(fetched / denominator, 6) if denominator else None,
            'known_frontier_exhausted': pending == 0,
            'full_school_coverage_proven': False,
            'scope_note': 'Counts describe discovered public-link frontier, not all school website data or reviewed/current rules.'}
        result['errors'].update(fetch_failed=states.get('failed', 0), fetch_blocked=states.get('blocked', 0),
            import_failed=imports.get('failed', 0), conversion_failed=imports.get('conversion_failed', 0),
            parse_failed=imports.get('parse_failed', 0), partial_parse=imports.get('partial_parse', 0))
        result['frontier_freshness'] = freshness(counts['latest_frontier_check_at'], now, stale_seconds)
    result['freshness_note'] = 'State changes at step boundaries; age alone does not prove a stalled worker. No automatic restart is performed.'
    result['change'] = compare(previous, result)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--data-root', type=Path, help='Defaults to CAMPUS_DATA or project/data, matching the pipeline.')
    parser.add_argument('--preflight', action='store_true', help='Probe locks only; exit 75 when either is held, 1 when unknown.')
    parser.add_argument('--previous', type=Path, help='Read a previously saved compact status JSON; this tool does not write it.')
    parser.add_argument('--stale-after-minutes', type=float, default=30)
    args = parser.parse_args(argv)
    try:
        if args.preflight:
            result = preflight(args.project_root, args.data_root)
            code = 0 if result['preflight']['allowed'] else 75 if result['preflight']['reason'] == 'existing_lock_held' else 1
        else:
            previous, previous_error = read_json(args.previous) if args.previous else (None, None)
            result = status(args.project_root, data_root=args.data_root,
                            stale_seconds=args.stale_after_minutes * 60, previous=previous)
            if previous_error:
                result['change'].update(previous_error=previous_error)
            code = 0 if result['archive'] is not None else 1
    except (OSError, ValueError) as error:
        result, code = {'schema_version': SCHEMA, 'error_type': type(error).__name__, 'read_only': True}, 1
    print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
