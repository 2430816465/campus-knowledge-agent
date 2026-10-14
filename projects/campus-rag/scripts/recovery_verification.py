"""Read-only post-commit verification for an isolated OCR recovery.

No apply interface: failed/partial archive states are deliberately retained.
A committed audit alone is insufficient; every expected chunk must exist.
"""
import sqlite3
from contextlib import closing
from pathlib import Path
from uuid import uuid5
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from app.db import Audit, Chunk, Document
from scripts.recovery_stage import stage_page
from scripts.recovery_transaction import NAMESPACE
from scripts.recovery_source_binding import FIELDS, select_observed_binding

ARCHIVE_FIELDS = ('url', 'sha256', 'state', 'import_state', 'import_error', 'document_id')


def verify_committed_recovery(engine, archive_path, stage, expected_archive):
    """Open fresh business and read-only archive connections; never commit.

This is a point-in-time observation, not authorization for a subsequent write.
No change to the archive is needed for a page append that retains parse state.
"""
    return _verify(engine, archive_path, stage, expected_archive, ARCHIVE_FIELDS)


def verify_observed_recovery(engine, archive_path, stage, expected_archive):
    """Verify a recorded redirect without dropping its final_url precondition.

    Read-only, post-commit observation only; no production apply interface.
    The supplied row must be unambiguously bound by recorded source identity.
    Every supplied field, including final_url and the old error, is read again.
    """
    return _verify(engine, archive_path, stage, expected_archive, FIELDS)


def _verify(engine, archive_path, stage, expected_archive, fields):
    if not isinstance(engine, Engine):
        raise ValueError('Database engine required; do not reuse a caller transaction')
    expected = stage['expected_document']
    canonical = stage_page(expected, stage['evidence'])
    if canonical != stage or not canonical['independent_ocr_blocks'] or canonical['layout_review_required']:
        raise ValueError('Valid independent OCR stage required')
    if set(expected_archive) != set(fields):
        raise ValueError('Complete archive precondition required')
    if fields == FIELDS:
        binding = select_observed_binding(expected, [expected_archive])
        if binding['status'] != 'bound':
            raise ValueError('Recorded source binding required')
    elif (expected_archive['url'], expected_archive['sha256'], expected_archive['document_id']) != (expected['source_url'], expected['sha256'], expected['id']):
        raise ValueError('Archive and document identity mismatch')
    if expected_archive['state'] != 'fetched' or expected_archive['import_state'] != expected['status']:
        raise ValueError('Failed or partial fetched archive state required')
    key = f'{expected["id"]}:{canonical["content_key"]}'
    audit_id = str(uuid5(NAMESPACE, 'audit:' + key))
    result = {'status': 'unverified', 'audit_id': audit_id,
              'verified_chunks': 0, 'publication_performed': False,
              'archive_writes': 0, 'point_in_time_only': True,
              'full_document_parse_completed': False}
    uri = Path(archive_path).resolve().as_uri() + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as archive:
        archive.execute('PRAGMA query_only=ON')
        archive.row_factory = sqlite3.Row
        row = archive.execute('SELECT '+','.join(fields)+' FROM urls WHERE url=?', (expected_archive['url'],)).fetchone()
        if row is None or dict(row) != expected_archive:
            return dict(result, status='archive_changed_retain_evidence')
    # A new session avoids the caller's uncommitted identity map. The caller
    # must supply a database engine, never a Session-bound transaction.
    with Session(engine) as session:
        doc = session.get(Document, expected['id'])
        if doc is None or any(getattr(doc,k)!=v for k,v in expected.items()):
            return dict(result, status='document_changed_retain_evidence')
        audit = session.get(Audit, audit_id)
        if audit is None:
            return dict(result, status='business_recovery_not_visible')
        changes = audit.changes
        if audit.action != 'recover_ocr_page' or audit.entity_id != expected['id'] or any(changes.get(k)!=v for k,v in {
            'content_key': canonical['content_key'], 'original_sha256': expected['sha256'],
            'source_url': expected['source_url'], 'parent_id': expected['parent_id'],
            'original_page': canonical['original_page'], 'evidence': canonical['evidence'],
            'parse_status_unchanged': expected['status'], 'review_required': True,
            'publication_performed': False, 'old_error': doc.error}.items()):
            return dict(result, status='audit_conflict_retain_evidence')
        for index, block in enumerate(canonical['independent_ocr_blocks']):
            chunk = session.get(Chunk, str(uuid5(NAMESPACE, f'chunk:{key}:{index}')))
            if chunk is None or (chunk.document_id,chunk.location,chunk.text)!=(doc.id,block['location'],block['text']):
                return dict(result, status='chunk_incomplete_retain_evidence')
            result['verified_chunks'] += 1
    return dict(result, status='page_recovery_verified_parse_state_retained')
