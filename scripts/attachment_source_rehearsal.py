"""In-memory transaction rehearsal only; no production entry point or commits.

This validates business binding persistence, not cross-database concurrency.
An archive coordinator and PostgreSQL locking verification are still required
before a production implementation may use the evidence.
"""
from copy import deepcopy
from uuid import UUID, uuid5

from sqlalchemy import select
from app.db import Audit, Document
from scripts.attachment_source_stage import FIELDS, stage_attachment_binding

NAMESPACE = UUID('5d032df2-471e-4523-aa42-76ca9337cde6')


def rehearse_binding(session, plan, parent_bytes, child_bytes):
    """Bind an existing URL within the caller's isolated transaction.

    Refuse persistent databases deliberately. No claims about archive atomicity,
    PostgreSQL row locks, review approval, or student retrieval are made here.
    """
    bind = session.get_bind(mapper=Document)
    if session.get_bind(mapper=Audit) is not bind:
        raise ValueError('A single isolated database is required')
    url = bind.url
    if url.get_backend_name() != 'sqlite' or url.database not in (None, '', ':memory:'):
        raise ValueError('Only an isolated in-memory SQLite rehearsal is allowed')
    if not session.in_transaction():
        raise ValueError('Explicit caller transaction required')
    with session.begin_nested():
        docs = {}
        for root in (plan['expected_parent']['id'], plan['expected_child']['id']):
            current, seen = root, set()
            while current is not None:
                if current in seen or len(seen) >= 32:
                    raise ValueError('Source ancestry cycle or budget exceeded')
                seen.add(current)
                doc = session.scalar(select(Document).where(Document.id == current)
                                     .execution_options(populate_existing=True))
                if doc is None:
                    raise ValueError('Source ancestry missing')
                docs[current] = doc
                current = doc.parent_id
        parent = docs[plan['expected_parent']['id']]
        child = docs[plan['expected_child']['id']]
        for doc, expected in ((parent, plan['expected_parent']), (child, plan['expected_child'])):
            if any(getattr(doc, k) != expected[k] for k in FIELDS):
                raise ValueError('Document changed since staging')
        metadata = {key: {k: getattr(doc, k) for k in FIELDS} for key, doc in docs.items()}
        # Canonicalize against the staged old list, then compare the actual list.
        # This prevents a mutated replacement or unrelated list update from
        # being silently accepted, including after a previous successful run.
        old_parent = {**metadata[parent.id], 'attachments': deepcopy(plan['expected_parent_attachments'])}
        canonical = stage_attachment_binding(old_parent, metadata[child.id],
            plan['expected_parent_archive'], plan['expected_child_archive'],
            plan['recorded_edge'], metadata, parent_bytes, child_bytes)
        if canonical != plan:
            raise ValueError('Staging package changed')
        audit_id = str(uuid5(NAMESPACE, plan['binding_key']))
        audit = session.get(Audit, audit_id)
        changes = {'identity': canonical['identity'], 'old': canonical['expected_parent_attachments'],
                   'new': canonical['replacement_attachments'], 'publication_performed': False}
        if audit:
            recorded = audit.changes
            fresh_observation = not canonical['changes_required']
            if (audit.action != 'rehearse_attachment_binding' or audit.entity_id != parent.id
                    or not isinstance(recorded, dict) or set(recorded) != set(changes)
                    or any(recorded[k] != changes[k] for k in ('identity','new','publication_performed'))
                    or not isinstance(recorded['old'], list)
                    or (not fresh_observation and recorded['old'] != changes['old'])):
                raise ValueError('Binding audit identity collision')
        if parent.attachments == canonical['replacement_attachments'] and audit:
            return {'changed': False, 'audit_id': audit_id, 'production_applicable': False}
        if parent.attachments != canonical['expected_parent_attachments']:
            raise ValueError('Attachment list changed since staging')
        if audit:
            raise ValueError('Binding audit exists without its recorded result')
        parent.attachments = deepcopy(canonical['replacement_attachments'])
        session.add(Audit(id=audit_id, action='rehearse_attachment_binding',
                          entity_id=parent.id, changes=changes))
        session.flush()
        return {'changed': canonical['changes_required'], 'audit_id': audit_id,
                'production_applicable': False}
