"""Pure, fail-closed source eligibility shared by public retrieval paths.

Callers supply freshly read metadata for every referenced ancestor. This module
does not read a database, infer permissions from an index, or inspect body text.
An eligible document is available as evidence, not certified as currently valid.
"""
import re
from collections.abc import Mapping
from datetime import datetime


CHILD_STATES = frozenset({'pending_review', 'published'})
SOURCE_STATES = CHILD_STATES | {'parse_failed', 'partial_parse', 'converted'}
# Student cohort labels are not evidence of a notice's annual version. Require
# standalone four-digit years so phone numbers/long identifiers cannot qualify.
TITLE_YEAR = re.compile(r'(?<!\d)(20\d{2})(?!\d|\s*(?:年\s*)?级)')


def title_years(title):
    return sorted(set(TITLE_YEAR.findall(title))) if isinstance(title, str) else []


def publication_year(value):
    if not isinstance(value, str) or not re.match(r'^20\d{2}-\d{2}-\d{2}(?:$|[T ])', value):
        return None
    try:
        return str(datetime.fromisoformat(value).year)
    except ValueError:
        return None


def _year_details(nodes):
    evidence, title_basis, original_basis, date_basis = [], None, None, None
    for depth, (document_id, metadata) in enumerate(nodes):
        years = title_years(metadata.get('title'))
        for year in years:
            evidence.append({'document_id': document_id, 'depth': depth, 'source': 'title',
                             'year': year, 'value': metadata['title']})
        if years and title_basis is None:
            title_basis = (years, {'document_id': document_id, 'source': 'title'})
        original = metadata.get('original_version')
        from .source_versions import valid_record
        if valid_record(original, metadata.get('sha256')):
            year = original['year']
            evidence.append({'document_id':document_id,'depth':depth,'source':'original_version',
                             'year':year,'value':original['evidence']})
            if original_basis is None:
                original_basis = ([year],{'document_id':document_id,'source':'original_version'})
        year = publication_year(metadata.get('published_at'))
        if year:
            evidence.append({'document_id': document_id, 'depth': depth, 'source': 'published_at',
                             'year': year, 'value': metadata['published_at']})
            if date_basis is None:
                date_basis = ([year], {'document_id': document_id, 'source': 'published_at'})
    chosen = title_basis or original_basis or date_basis
    return evidence, chosen[0] if chosen else [], chosen[1] if chosen else None


def eligibility(document_id, metadata_by_id, max_depth=16):
    """Return a public source-chain decision using only supplied metadata.

    ``metadata_by_id`` maps IDs to mappings containing visibility/status and
    optional id/parent_id/title/published_at. The child must be public and
    pending_review/published. Public ancestors may additionally be original
    parse_failed/partial_parse/converted source shells; their own parent links
    are still checked. A missing parent_id or None is a root, an empty/invalid
    explicit parent ID is not. ``max_depth`` counts ancestor links (root = 0).

    Annual evidence is only metadata. The nearest title with an explicit year
    takes precedence over hash-bound verified original-file years and publication
    dates; an original-file year takes precedence over a reprint date. Otherwise
    the nearest valid ISO publication date is used. All evidence is returned separately, since a
    title/publication year alone cannot establish present-day applicability.
    Denied results contain no year evidence to accidentally reuse as authority.
    """
    if not isinstance(max_depth, int) or isinstance(max_depth, bool) or max_depth < 0:
        raise ValueError('max_depth must be a nonnegative integer.')
    if not isinstance(metadata_by_id, Mapping):
        raise TypeError('metadata_by_id must be a mapping.')
    result = {'eligible': False, 'reason': None, 'ancestor_ids': [],
              'blocked_document_id': None, 'year_evidence': [], 'effective_years': [], 'year_basis': None}

    def deny(reason, blocked):
        return {**result, 'reason': reason, 'blocked_document_id': blocked}

    if not isinstance(document_id, str) or not document_id.strip():
        return deny('invalid_document_id', document_id)
    nodes, visited, current = [], set(), document_id
    while True:
        if current in visited:
            return deny('source_cycle', current)
        if nodes and len(result['ancestor_ids']) >= max_depth:
            return deny('source_depth_exceeded', current)
        is_child = not nodes
        if not is_child:
            result['ancestor_ids'].append(current)
        metadata = metadata_by_id.get(current)
        if not isinstance(metadata, Mapping):
            return deny('document_missing' if is_child else 'ancestor_missing', current)
        if metadata.get('id', current) != current:
            return deny('metadata_id_mismatch', current)
        if metadata.get('visibility') != 'public':
            return deny('document_not_public' if is_child else 'ancestor_not_public', current)
        state = metadata.get('status')
        if state not in (CHILD_STATES if is_child else SOURCE_STATES):
            return deny('document_state_not_allowed' if is_child else 'ancestor_state_not_allowed', current)
        visited.add(current)
        nodes.append((current, metadata))
        parent = metadata.get('parent_id')
        if parent is None:
            break
        if not isinstance(parent, str) or not parent.strip():
            return deny('invalid_parent_id', current)
        current = parent
    evidence, years, basis = _year_details(nodes)
    return {**result, 'eligible': True, 'reason': 'eligible',
            'year_evidence': evidence, 'effective_years': years, 'year_basis': basis}
