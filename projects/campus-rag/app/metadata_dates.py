"""Finite, audited missing-date repair. Does not reparse chunks or attachments."""
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
from bs4 import BeautifulSoup
from sqlalchemy import select,or_
from .db import Document,Audit
from .ingest import uid
from .html_metadata import displayed_article_date


def date_evidence(document,raw_root):
    name=document.raw_name
    root=Path(raw_root).resolve();path=(root/name).resolve()
    if path.parent!=root or path.stat().st_size>2*1024*1024:raise ValueError('raw file outside repair budget')
    payload=path.read_bytes()
    if hashlib.sha256(payload).hexdigest()!=document.sha256:raise ValueError('raw SHA changed')
    return displayed_article_date(BeautifulSoup(payload,'html.parser'))


def eligible_root(document,host):
    try:source=urlsplit(document.source_url or '')
    except ValueError:return False
    return (document.status=='pending_review' and document.visibility=='public'
        and document.parent_id is None and document.published_at is None
        and document.mime in ('.html','.htm') and source.hostname==host
        and source.scheme in ('http','https') and not source.username and not source.password)


def plan_dates(session,host,raw_root,limit=500):
    if not re.fullmatch(r'[a-z0-9-]+\.njxzc\.edu\.cn',host) or not 1<=limit<=500:
        raise ValueError('explicit school host and finite limit required')
    rows=session.scalars(select(Document).where(Document.status=='pending_review',
        Document.visibility=='public',Document.parent_id.is_(None),Document.published_at.is_(None),
        Document.mime.in_(('.html','.htm')),or_(Document.source_url.like('https://'+host+'/%'),
        Document.source_url.like('http://'+host+'/%'))).order_by(Document.id).limit(limit)).all()
    plan=[];outcomes={}
    for document in rows:
        if not eligible_root(document,host):outcomes[document.id]='scope_changed';continue
        try:day,warnings,evidence=date_evidence(document,raw_root)
        except (ValueError,OSError):outcomes[document.id]='raw_rejected';continue
        if not day:outcomes[document.id]='no_unambiguous_display_date';continue
        plan.append({'id':document.id,'sha256':document.sha256,'source_url':document.source_url,
            'raw_name':document.raw_name,'date':day,'evidence':evidence,'warnings':warnings})
        outcomes[document.id]='planned'
    return {'host':host,'limit':limit,'examined':len(rows),'records':plan,'outcomes':outcomes}


def apply_dates(session,plan,raw_root,checkpoint):
    if not 1<=plan.get('limit',0)<=500 or len(plan['records'])>plan['limit']:
        raise ValueError('finite repair plan required')
    ids=[row['id'] for row in plan['records']]
    if len(set(ids))!=len(ids):raise ValueError('duplicate repair IDs')
    documents={d.id:d for d in session.scalars(select(Document).where(Document.id.in_(ids))
        .with_for_update(skip_locked=True).execution_options(populate_existing=True))}
    changes=[];skipped={}
    for row in plan['records']:
        doc=documents.get(row['id'])
        if (doc is None or not eligible_root(doc,plan['host']) or doc.sha256!=row['sha256']
                or doc.source_url!=row['source_url'] or doc.raw_name!=row['raw_name']):
            skipped[row['id']]='current_record_changed_or_locked';continue
        try:day,warnings,evidence=date_evidence(doc,raw_root)
        except (ValueError,OSError):skipped[doc.id]='raw_rejected';continue
        if day!=row['date'] or evidence!=row['evidence']:
            skipped[doc.id]='date_evidence_changed';continue
        before={'published_at':doc.published_at,'warnings':list(doc.warnings or [])}
        after={'published_at':day,'warnings':list(dict.fromkeys(before['warnings']+warnings))}
        changes.append({'id':doc.id,'sha256':doc.sha256,'source_url':doc.source_url,
            'raw_name':doc.raw_name,'before':before,'after':after,'evidence':evidence})
    # Persist exact locked before-values before issuing any write. An existing
    # checkpoint is never overwritten; a failed DB commit leaves evidence.
    checkpoint=Path(checkpoint)
    checkpoint.parent.mkdir(parents=True,exist_ok=True)
    with checkpoint.open('x',encoding='utf-8') as stream:
        json.dump({'created_at':datetime.now(timezone.utc).isoformat(),'host':plan['host'],
            'changes':changes,'scope':'pending_review public root HTML only'},stream,ensure_ascii=False,indent=2)
        stream.flush();os.fsync(stream.fileno())
    for change in changes:
        doc=documents[change['id']]
        doc.published_at=change['after']['published_at'];doc.warnings=change['after']['warnings']
        session.add(Audit(id=uid(),action='backfill_displayed_page_date',entity_id=doc.id,
            changes={**change,'checkpoint':str(checkpoint)}))
    session.flush()
    return {'updated':len(changes),'skipped':skipped,'checkpoint':str(checkpoint)}
