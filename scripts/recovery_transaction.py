"""Caller-owned OCR recovery transaction. No CLI, commits or ledger writes.

Not wired into production: the coordinator must handle archive CAS and resource
budgets. This primitive preserves document state and all existing chunks.
"""
import hashlib
from pathlib import Path
from uuid import UUID, uuid5
from sqlalchemy import select
from app.db import Audit, Chunk, Document
from scripts.recovery_stage import stage_page
from scripts.sync_school_archive import PipelineLock

NAMESPACE = UUID('2c491762-986c-4661-9b0c-9310074b341b')


def append_ocr_page(session, stage, original, lock):
    """Append verified-source independent boxes within a caller's transaction.

The stage is evidence, not permission to publish; this never changes status.
Exceptions roll back this page's inserts via a savepoint, not prior caller work.
"""
    original = Path(original).resolve()
    expected = stage['expected_document']
    lock_path = original.parent.parent / 'business-import.lock'
    if not isinstance(lock, PipelineLock) or lock.handle is None or lock.handle.closed or lock.path.resolve() != lock_path:
        raise ValueError('Owned archive business-import lock required')
    if not session.in_transaction():
        raise ValueError('Explicit caller transaction required')
    if original.name != expected['sha256'] or original.parent.name != 'blobs':
        raise ValueError('Content-addressed original required')
    with original.open('rb') as handle:
        if hashlib.file_digest(handle, 'sha256').hexdigest() != expected['sha256']:
            raise ValueError('Original changed; no recovery performed')
    canonical = stage_page(expected, stage['evidence'])
    if canonical != stage:
        raise ValueError('Staging package changed')
    blocks = canonical['independent_ocr_blocks']
    if canonical['layout_review_required'] or not 1 <= len(blocks) <= 100:
        raise ValueError('Only bounded independent OCR boxes are supported')
    with session.begin_nested():
        doc = session.scalar(select(Document).where(Document.id == expected['id']).with_for_update().execution_options(populate_existing=True))
        if doc is None or any(getattr(doc, key) != value for key, value in expected.items()):
            raise ValueError('Document changed since staging; retain recovery evidence')
        # Key excludes observation timestamps: a fresh staging observation must
        # not create a second copy of the same source/page content.
        key = f'{doc.id}:{canonical["content_key"]}'
        audit_id = str(uuid5(NAMESPACE, 'audit:' + key))
        added = 0
        for index, block in enumerate(blocks):
            chunk_id = str(uuid5(NAMESPACE, f'chunk:{key}:{index}'))
            existing = session.get(Chunk, chunk_id)
            if existing:
                if (existing.document_id, existing.location, existing.text) != (doc.id, block['location'], block['text']):
                    raise ValueError('Recovery chunk identity collision')
                continue
            occupied = session.scalars(select(Chunk).where(Chunk.document_id == doc.id, Chunk.location == block['location'])).all()
            if occupied:
                raise ValueError('Original location already has content; do not replace it')
            session.add(Chunk(id=chunk_id, document_id=doc.id, location=block['location'], text=block['text']))
            added += 1
        audit = session.get(Audit, audit_id)
        if not audit:
            session.add(Audit(id=audit_id, action='recover_ocr_page', entity_id=doc.id, changes={
                'original_sha256': doc.sha256, 'source_url': doc.source_url, 'parent_id': doc.parent_id,
                'original_page': canonical['original_page'], 'content_key': canonical['content_key'],
                'staging_key': canonical['staging_key'], 'expected_document': expected,
                'evidence': canonical['evidence'], 'old_error': doc.error,
                'warnings': canonical['warnings'], 'parse_status_unchanged': doc.status,
                'review_required': True, 'publication_performed': False}))
        elif audit.entity_id != doc.id or audit.changes.get('content_key') != canonical['content_key']:
            raise ValueError('Recovery audit identity collision')
        session.flush()
    return {'added_chunks': added, 'audit_id': audit_id, 'document_status': doc.status,
            'archive_reconciled': False, 'publication_performed': False}
