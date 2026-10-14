"""Immutable acceptance frontier; read-only observations, no queue recovery."""
import hashlib
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


def digest(rows):
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


def read_frontier(path):
    connection = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        return [dict(row) for row in connection.execute(
            'SELECT url,state,attempts,checked_at,sha256,import_state,error FROM urls ORDER BY url')]
    finally:
        connection.close()


def freeze(frontier, target):
    """Exclusive creation; never replace an existing acceptance baseline."""
    target, frontier = Path(target).resolve(), Path(frontier).resolve()
    if target.is_relative_to(frontier.parent):
        raise ValueError('Cohort must be outside the archive.')
    rows = read_frontier(frontier)
    result = {'schema_version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
              'frontier': str(frontier), 'rows': rows, 'rows_sha256': digest(rows),
              'selection': 'initial_pending_or_fetching',
              'target_count': sum(row['state'] in ('pending', 'fetching') for row in rows)}
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    return result


def load(path):
    result = json.loads(Path(path).read_text(encoding='utf-8'))
    rows = result['rows']
    if (result.get('schema_version') != 1 or result.get('selection') != 'initial_pending_or_fetching'
            or not isinstance(rows, list) or digest(rows) != result.get('rows_sha256')):
        raise ValueError('Invalid cohort identity.')
    urls = [row['url'] for row in rows]
    if len(set(urls)) != len(urls) or any(not isinstance(url, str) for url in urls):
        raise ValueError('Invalid cohort URLs.')
    if result.get('target_count') != len(target_urls(result)):
        raise ValueError('Invalid cohort target count.')
    return result


def target_urls(cohort):
    return [row['url'] for row in cohort['rows'] if row['state'] in ('pending', 'fetching')]


def observe(frontier, cohort):
    current = {row['url']: row for row in read_frontier(frontier)}
    original = {row['url'] for row in cohort['rows']}
    initial_attempts = {row['url']: row['attempts'] for row in cohort['rows']}
    counts, reasons, hosts, imports = Counter(), Counter(), {}, Counter()
    changed, details, fetched_hashes = 0, [], Counter()
    terminal = {'fetched', 'failed', 'blocked', 'excluded', 'deferred'}
    for url in target_urls(cohort):
        row = current.get(url)
        state = row['state'] if row else 'missing_record'
        counts[state] += 1
        host = urlsplit(url).hostname or '(invalid)'
        hosts.setdefault(host, Counter())[state] += 1
        if row:
            changed += row['attempts'] > initial_attempts[url]
            if state == 'fetched':
                imports[row['import_state'] or 'pending_import'] += 1
                if row['sha256']:
                    fetched_hashes[row['sha256']] += 1
        if state in ('failed', 'blocked', 'excluded', 'deferred', 'missing_record'):
            reason = (row['error'] if row else 'baseline_url_missing') or 'reason_not_recorded'
            reasons[reason] += 1
            details.append({'url': url, 'state': state, 'reason': reason})
    remaining = sum(value for state, value in counts.items() if state not in terminal)
    return {'checked_at': datetime.now(timezone.utc).isoformat(), 'read_only': True,
            'cohort_sha256': cohort['rows_sha256'], 'target_count': cohort['target_count'],
            'target_states': dict(counts), 'target_import_states': dict(imports),
            'fetched_unique_blob_hashes': len(fetched_hashes),
            'duplicate_fetched_url_records_within_cohort': sum(n-1 for n in fetched_hashes.values()),
            'attempted_since_baseline': changed, 'unresolved_count': remaining,
            'bounded_pass_classified': remaining == 0,
            'new_urls_since_baseline': len(set(current) - original),
            'hosts': {host: dict(values) for host, values in sorted(hosts.items())},
            'failure_reasons': dict(reasons), 'non_success_details': details,
            'full_school_coverage_proven': False,
            'note': 'A bounded download pass is not parsing, reviewed knowledge or whole-school coverage. Failed/deferred/blocked outcomes remain explicit; new links are a separate backlog.'}
