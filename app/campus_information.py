"""Read-only student directory, using the existing public document boundary."""
import hashlib
from collections import defaultdict
from sqlalchemy import select
from .db import Document, Chunk


def list_information(session, q='', year=None, verified=False, offset=0, limit=10):
    if session.bind.dialect.name == 'postgresql':
        from .information_pages import postgres_information_page
        return postgres_information_page(session, q, year, verified, offset, limit)
    statement = select(Document).where(
        Document.visibility == 'public',
        Document.status.in_(['pending_review', 'published']),
    )
    if q:
        statement = statement.where(Document.title.contains(q, autoescape=True))
    if year is not None:
        statement = statement.where(Document.published_at.startswith(str(year) + '-'))
    if verified:
        statement = statement.where(Document.status == 'published')
    fields = ('id', 'title', 'source_url', 'publisher', 'published_at', 'status', 'kind', 'version')
    # Select metadata only, never vectors, attachments JSON or full ORM objects.
    columns = fields + ('sha256', 'parent_id')
    records = [dict(row) for row in session.execute(statement.with_only_columns(
        *(getattr(Document, key) for key in columns))).mappings()]
    by_id = {d['id']: d for d in records}
    children = defaultdict(list)
    roots = []
    for d in records:
        # Keep orphan attachments visible; only fold a child with an accessible,
        # matching parent. No title guessing and no permission expansion.
        if d['parent_id'] in by_id and d['parent_id'] != d['id'] and not by_id[d['parent_id']]['parent_id']:
            children[d['parent_id']].append(d)
        else:
            roots.append(d)
    candidates = defaultdict(list)
    for d in roots:
        candidates[(d['title'], d['published_at'] or '')].append(d)
    duplicate_ids = [d['id'] for group in candidates.values() if len(group) > 1 for d in group]
    digests = {}
    # Only compare bodies for same-title/date candidates. Stream bounded rows;
    # length-prefix each chunk to avoid joining different chunk boundaries.
    for start in range(0, len(duplicate_ids), 500):
        query = select(Chunk.document_id, Chunk.text).where(Chunk.document_id.in_(
            duplicate_ids[start:start+500])).order_by(Chunk.document_id, Chunk.location, Chunk.text)
        result = session.execute(query.execution_options(yield_per=100))
        try:
            for doc_id, text in result:
                digest = digests.setdefault(doc_id, hashlib.sha256())
                data = text.encode('utf-8')
                digest.update(len(data).to_bytes(8, 'big'))
                digest.update(data)
        finally:
            result.close()
    groups = defaultdict(list)
    for d in roots:
        body = ('text', digests[d['id']].hexdigest()) if d['id'] in digests else ('raw', d['sha256'] or d['id'])
        groups[(d['title'], d['published_at'] or '', body)].append(d)
    merged = []
    for group in groups.values():
        # Prefer an already reviewed representative without promoting siblings.
        group.sort(key=lambda d: (d['status'] != 'published', d['id']))
        item = {key: group[0][key] for key in fields}
        item['sources'] = [{key: d[key] for key in fields} for d in group]
        related_groups = defaultdict(list)
        for d in group:
            for child in children[d['id']]:
                related_groups[(child['title'], child['published_at'] or '', child['sha256'] or child['id'])].append(child)
        item['related'] = []
        for related_group in related_groups.values():
            related_group.sort(key=lambda d: (d['status'] != 'published', d['id']))
            related = {key: related_group[0][key] for key in fields}
            related['sources'] = [{key: child[key] for key in fields} for child in related_group]
            item['related'].append(related)
        item['related'].sort(key=lambda d: d['id'])
        merged.append(item)
    merged.sort(key=lambda d: d['id'])
    merged.sort(key=lambda d: d['published_at'] or '', reverse=True)
    return {'total': len(merged), 'items': merged[offset:offset+limit],
            'matched_documents': len(records), 'merged_duplicates': len(roots)-len(merged),
            'nested_documents': len(records)-len(roots),
            'order': 'published_at_desc_unknown_last'}
