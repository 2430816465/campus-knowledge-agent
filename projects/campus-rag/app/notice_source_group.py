"""Read-only routing for multiple URLs of one archived notice original."""
import re
from urllib.parse import urlsplit

from sqlalchemy import select
from .db import Candidate, Document
from .source_scope import eligibility


def original_notice_sources(session, pairs):
    # This proves archived original identity, never current rule equivalence.
    if not 2 <= len(pairs) <= 8:
        return None
    signatures, sources = [], []
    for comp, doc in pairs:
        url = urlsplit(doc.source_url or '')
        host = url.hostname or ''
        if (url.scheme not in {'http', 'https'} or url.netloc != host
                or not host.endswith('.njxzc.edu.cn')
                or not re.fullmatch(r'[a-f0-9]{64}', doc.sha256 or '')
                or doc.mime != '.html' or doc.parent_id is not None
                or doc.supersedes or doc.version != 1
                or doc.visibility != 'public' or doc.status != 'pending_review'
                or comp.review_status != 'pending_review' or comp.fields or comp.last_verified):
            return None
        if session.scalar(select(Candidate.id).where(
                Candidate.competition_id == comp.id, Candidate.status != 'pending').limit(1)):
            return None
        attachments = doc.attachments or []
        if not isinstance(attachments, list) or any(not isinstance(a, dict)
                or not isinstance(a.get('title'), str) or not isinstance(a.get('url'), str)
                for a in attachments):
            return None
        links = sorted((a['title'], a['url']) for a in attachments)
        signatures.append((doc.sha256, host, doc.title, doc.publisher, doc.published_at,
                           comp.name, comp.alias, comp.year, comp.track, comp.phase, comp.school, links))
        sources.append({'document_id': doc.id, 'competition_id': comp.id,
                        'url': doc.source_url, 'sha256': doc.sha256})
    if any(s != signatures[0] for s in signatures[1:]):
        return None
    return sorted(sources, key=lambda s: s['document_id'])


def source_group_scope(session, sources):
    """Bounded recorded descendants only; no guessed URL/hash parent edges."""
    roots = {s['document_id'] for s in sources}
    rows = session.execute(select(Document.id, Document.parent_id, Document.status,
                                  Document.visibility, Document.sha256, Document.source_url)).all()
    metadata = {r.id: dict(r._mapping) for r in rows}
    if any(not eligibility(i, metadata)['eligible'] for i in roots):
        return []
    if any(metadata[s['document_id']]['sha256'] != s.get('sha256')
           or metadata[s['document_id']]['source_url'] != s.get('url') for s in sources):
        return []
    scope = set(roots)
    for _ in range(16):
        children = {r.id for r in rows if r.parent_id in scope} - scope
        if not children:
            return sorted(i for i in scope if eligibility(i, metadata)['eligible'])
        scope.update(children)
        if len(scope) > 128:
            return []
    return []
