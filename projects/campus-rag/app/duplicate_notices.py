"""Bounded read-only equivalence of unreviewed, exact parsed notice copies."""
import hashlib
import json
from urllib.parse import urlsplit

from sqlalchemy import select
from .db import Candidate, Chunk


def exact_notice_copies(session, pairs):
    """Return provenance only; never merge records or infer policy equivalence."""
    if not 2 <= len(pairs) <= 8:
        return None
    signatures, sources = [], []
    for comp, doc in pairs:
        url = urlsplit(doc.source_url or '')
        host = url.hostname or ''
        if (url.scheme not in {'http', 'https'} or url.username or url.password
                or url.netloc != host or not host.endswith('.njxzc.edu.cn')
                or doc.visibility != 'public' or doc.status != 'pending_review'
                or comp.review_status != 'pending_review' or comp.fields
                or comp.last_verified or doc.parent_id is not None
                or doc.supersedes or doc.version != 1 or doc.attachments):
            return None
        if session.scalar(select(Candidate.id).where(
                Candidate.competition_id == comp.id, Candidate.status != 'pending').limit(1)):
            return None
        rows = session.execute(select(Chunk.location, Chunk.text).where(
            Chunk.document_id == doc.id).order_by(Chunk.location).limit(257)).all()
        if (not rows or len(rows) > 256 or len({r.location for r in rows}) != len(rows)
                or any(not r.text.strip() for r in rows)
                or sum(len(r.text) for r in rows) > 100_000):
            return None
        metadata = [host, doc.title, doc.publisher, doc.published_at, doc.mime,
                    comp.name, comp.alias, comp.year, comp.track, comp.phase, comp.school]
        body = json.dumps([list(row) for row in rows], ensure_ascii=False, separators=(',', ':'))
        signatures.append((metadata, body))
        sources.append({'competition_id': comp.id, 'document_id': doc.id,
                        'url': doc.source_url, 'sha256': doc.sha256,
                        'parsed_body_sha256': hashlib.sha256(body.encode()).hexdigest()})
    if any(signature != signatures[0] for signature in signatures[1:]):
        return None
    return sorted(sources, key=lambda item: item['document_id'])
