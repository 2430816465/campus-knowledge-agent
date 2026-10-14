"""Pure observed-URL binding triage, not a recovery apply or URL normalizer.

Use current archive observations, never manufacture an HTTPS/HTTP equivalent.
The caller retains every source edge and must revalidate under the write lock
before any future recovery. This module performs no I/O or mutations.
"""
import copy
import re
from urllib.parse import urlsplit


FIELDS = ('url', 'final_url', 'sha256', 'state', 'import_state',
          'import_error', 'document_id')


def _public_reference(value):
    if not isinstance(value, str) or value != value.strip():
        return False
    try:
        parsed = urlsplit(value)
        return (parsed.scheme in ('http', 'https') and bool(parsed.hostname)
                and not parsed.username and not parsed.password and not parsed.fragment
                and not any(ord(c) < 32 for c in value))
    except ValueError:
        return False


def select_observed_binding(document, rows):
    """Return an unambiguous failed/partial binding, or explicit gaps.

    Exact source URL alone is insufficient: document ID, original SHA, fetched
    state and parse state must match. A redirect must be recorded in final_url.
    Multiple matching rows remain ambiguous instead of selecting the first.
    """
    if (not isinstance(document.get('id'), str) or not document['id']
            or not isinstance(document.get('sha256'), str)
            or not re.fullmatch('[0-9a-f]{64}', document['sha256'])
            or not _public_reference(document.get('source_url'))
            or document.get('status') not in ('partial_parse', 'parse_failed')):
        raise ValueError('Complete failed/partial source identity required')
    bindings, rejected = [], []
    for row in rows:
        reason = None
        if any(key not in row for key in FIELDS):
            reason = 'incomplete_archive_observation'
        elif not _public_reference(row['url']) or (row['final_url'] is not None and not _public_reference(row['final_url'])):
            reason = 'invalid_source_reference'
        elif document['source_url'] not in (row['url'], row['final_url']):
            reason = 'no_exact_observed_url_relation'
        elif (row['sha256'], row['document_id']) != (document['sha256'], document['id']):
            reason = 'original_or_document_identity_mismatch'
        elif row['state'] != 'fetched' or row['import_state'] != document['status']:
            reason = 'archive_state_mismatch'
        if reason:
            rejected.append({'url': row.get('url') if _public_reference(row.get('url')) else None,
                             'reason': reason})
        else:
            bindings.append({'match': 'exact' if row['url'] == document['source_url'] else 'observed_final_url',
                             'expected_archive': copy.deepcopy({k: row[k] for k in FIELDS})})
    return {'status': 'bound' if len(bindings) == 1 else 'ambiguous' if bindings else 'no_binding',
            'bindings': bindings, 'rejected': rejected,
            'point_in_time_only': True, 'production_applicable': False,
            'publication_performed': False, 'archive_writes': 0}
