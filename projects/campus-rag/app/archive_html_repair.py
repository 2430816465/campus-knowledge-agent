"""Source-bound reconciliation across business transactions and archive cache.

The caller must hold the pipeline/crawler OS locks. A business commit may
survive a later cache failure; its repair audit makes retry append-free.
"""
import hashlib
import json
from pathlib import Path
import re

from sqlalchemy import select

from .db import Document,Audit
from .html_repair import document_snapshot,repair_html_empty_nodes
from .ingest import uid

INTENT='archive_html_reconcile_intent'


class ArchiveRepairError(RuntimeError):
    def __init__(self,stage,cause_type):
        self.stage,self.cause_type=stage,cause_type
        super().__init__(stage+':'+cause_type)


def load_plan(path):
    path=Path(path)
    if path.stat().st_size>256*1024:raise ValueError('Repair plan too large')
    content=path.read_bytes();plan=json.loads(content)
    if (not isinstance(plan,dict) or type(plan.get('schema_version')) is not int or plan['schema_version']!=1
            or not isinstance(plan.get('targets'),list) or not 1<=len(plan['targets'])<=25):
        raise ValueError('Repair plan must contain 1..25 explicit targets')
    urls=set()
    for target in plan['targets']:
        keys=('archive_url','document_id','sha256','source_url')
        if not isinstance(target,dict) or any(not isinstance(target.get(k),str) or not target[k] for k in keys):
            raise ValueError('Incomplete repair target')
        if not re.fullmatch(r'[0-9a-f]{64}',target['sha256']) or target['archive_url'] in urls:
            raise ValueError('Invalid hash or duplicate archive URL')
        urls.add(target['archive_url'])
    return plan,hashlib.sha256(content).hexdigest()


def archive_record(db,target):
    row=db.execute('SELECT * FROM urls WHERE url=?',(target['archive_url'],)).fetchone()
    if (row is None or row['state']!='fetched' or row['sha256']!=target['sha256']
            or row['document_id']!=target['document_id']
            or (row['final_url'] or row['url'])!=target['source_url']
            or 'html' not in (row['mime'] or '').lower()
            or row['import_state'] not in ('parse_failed','imported','partial_parse')):
        raise ValueError('Archive record no longer matches the repair target')
    return row


def source_bytes(blob_root,sha256):
    if not re.fullmatch(r'[0-9a-f]{64}',sha256):raise ValueError('Invalid blob identity')
    root=Path(blob_root).resolve();path=root/sha256
    if path.is_symlink() or not path.is_file() or path.resolve().parent!=root or path.stat().st_size>20*1024*1024:
        raise ValueError('Missing/unsafe/oversized repair blob')
    content=path.read_bytes()
    if hashlib.sha256(content).hexdigest()!=sha256:raise ValueError('Repair blob hash mismatch')
    return content


def business_record(session,target):
    doc=session.get(Document,target['document_id'])
    if doc is None or doc.sha256!=target['sha256'] or doc.source_url!=target['source_url']:
        raise ValueError('Business source no longer matches the repair target')
    return doc


def _sync_row(db,target,row,new_state):
    changed=row['import_state']!=new_state or row['import_error'] is not None
    if changed:
        cursor=db.execute('''UPDATE urls SET import_state=?,import_error=NULL
            WHERE url=? AND document_id=? AND sha256=? AND state='fetched'
            AND COALESCE(NULLIF(final_url,''),url)=? AND import_state=?
            AND import_error IS ?''',(new_state,target['archive_url'],target['document_id'],
                target['sha256'],target['source_url'],row['import_state'],row['import_error']))
        if cursor.rowcount!=1:raise ValueError('Conditional archive reconciliation did not match')
    return changed


def apply_one(db,session_factory,target,blob_root):
    if db.in_transaction:raise ValueError('Archive repair requires its own cache transaction')
    stage='archive_validation'
    with session_factory() as session:
        try:
            db.execute('BEGIN IMMEDIATE')
            row=archive_record(db,target);content=source_bytes(blob_root,target['sha256'])
            doc=business_record(session,target);expected=document_snapshot(doc)
            stage='business_repair'
            result=repair_html_empty_nodes(session,doc.id,expected,content)
            new_state='partial_parse' if result['status']=='partial_parse' else 'imported'
            intent_id=None
            if row['import_state']!=new_state or row['import_error'] is not None:
                changes={'archive_url':target['archive_url'],'source_url':target['source_url'],
                    'source_sha256':target['sha256'],'previous_import_state':row['import_state'],
                    'previous_import_error':row['import_error'],'intended_import_state':new_state}
                intent=next((a for a in session.scalars(select(Audit).where(
                    Audit.entity_id==doc.id,Audit.action==INTENT)) if a.changes==changes),None)
                if intent is None:
                    intent=Audit(id=uid(),entity_id=doc.id,action=INTENT,changes=changes);session.add(intent)
                intent_id=intent.id
            stage='business_commit_started'
            session.commit()
            # A returned commit is durable; a raised commit has unknown outcome.
            stage='business_committed_cache_pending'
            fresh=business_record(session,target)
            rechecked=repair_html_empty_nodes(session,fresh.id,document_snapshot(fresh),content)
            current_state='partial_parse' if rechecked['status']=='partial_parse' else 'imported'
            if current_state!=new_state:raise ValueError('Business state changed before cache reconciliation')
            changed=_sync_row(db,target,row,new_state)
            stage='cache_commit_started'
            db.commit()
            # The second business transaction only holds review-boundary locks.
            session.rollback()
            return {**result,'archive_url':target['archive_url'],'source_sha256':target['sha256'],
                'archive_state':new_state,'archive_changed':changed,'intent_audit_id':intent_id,
                'business_commit_completed':True,'archive_commit_completed':True}
        except Exception as exc:
            # Commit exceptions can leave an already committed/closed handle.
            # Cleanup must not replace the useful unknown-outcome stage.
            for rollback in (db.rollback,session.rollback):
                try:rollback()
                except Exception:pass
            raise ArchiveRepairError(stage,type(exc).__name__) from exc
