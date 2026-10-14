"""Transactional, source-bound repair of empty-node HTML parse failures.

No HTTP/model calls or implicit commit. The caller owns the transaction and
must retain a consistent backup before applying to an authoritative database.
"""
from copy import deepcopy
import hashlib
import re

from bs4 import BeautifulSoup
from sqlalchemy import select

from .db import Document,Chunk,Audit,Competition
from .ingest import parse,uid,extract_candidates
from .school_archive import scope_reason,normalize_url
from .source_scope import eligibility

ACTION='archive_html_empty_node_repair'


def document_snapshot(doc):
    return deepcopy({column.name:getattr(doc,column.name) for column in Document.__table__.columns})


def _locked_chain(session,doc):
    metadata={};current=doc
    for _ in range(17):
        if current is None or current.id in metadata:raise ValueError('Missing or cyclic source chain')
        metadata[current.id]={key:getattr(current,key) for key in ('id','parent_id','visibility','status')}
        if current.parent_id is None:break
        current=session.scalar(select(Document).where(Document.id==current.parent_id)
            .with_for_update().execution_options(populate_existing=True))
    else:raise ValueError('Source chain exceeds repair budget')
    metadata[doc.id]['status']='pending_review'
    if not eligibility(doc.id,metadata)['eligible']:raise ValueError('Source chain is not public/allowed')


def repair_html_empty_nodes(session,document_id,expected,content):
    if not isinstance(expected,dict):raise ValueError('Expected document snapshot is required')
    if not isinstance(content,bytes) or not 0<len(content)<=20*1024*1024:
        raise ValueError('HTML repair byte budget exceeded')
    doc=session.scalar(select(Document).where(Document.id==document_id)
        .with_for_update().execution_options(populate_existing=True))
    identity=('id','sha256','source_url','raw_name','mime')
    if (doc is None or any(getattr(doc,key)!=expected.get(key) for key in identity)
            or hashlib.sha256(content).hexdigest()!=doc.sha256
            or doc.visibility!='public' or doc.mime not in ('.html','.htm')
            or doc.raw_name!=doc.sha256+doc.mime
            or not doc.source_url or normalize_url(doc.source_url,doc.source_url) is None
            or scope_reason(doc.source_url)):
        raise ValueError('HTML repair source identity or scope mismatch')
    if doc.status not in ('parse_failed','pending_review','published','partial_parse'):
        raise ValueError('HTML repair review boundary')
    _locked_chain(session,doc)
    previous=session.scalar(select(Audit).where(Audit.entity_id==doc.id,Audit.action==ACTION))
    if previous is not None:
        if previous.changes.get('source_sha256')!=doc.sha256:
            raise ValueError('Repair audit source mismatch')
        # A repeat never reparses or modifies teacher-reviewed data.
        return {'document_id':doc.id,'chunks_created':0,'already_repaired':True,'status':doc.status}
    if document_snapshot(doc)!=expected:raise ValueError('Document changed after repair snapshot')
    if doc.status!='parse_failed':raise ValueError('Repair requires an unparsed failed document')
    if session.scalar(select(Chunk.id).where(Chunk.document_id==doc.id).limit(1)):
        raise ValueError('Repair cannot overwrite existing evidence')
    if session.scalar(select(Competition.id).where(Competition.document_id==doc.id).limit(1)):
        raise ValueError('Repair cannot reinterpret existing competition records')
    soup=BeautifulSoup(content,'html.parser',from_encoding='utf-8')
    body=soup.select_one('.wp_articlecontent,.Article_Content,.article-content')
    if body is None:raise ValueError('Repair requires an explicit article container')
    for node in body.select('script,style,nav,footer'):node.decompose()
    nodes=body.find_all(['p','tr','li','h2','h3'])
    if not nodes or any(node.get_text(' ',strip=True) for node in nodes):
        raise ValueError('Failure is not the all-empty structural node defect')
    _,_,_,blocks,warnings,_=parse(content,doc.mime,doc.source_url)
    blocks=[(location,value) for location,value in blocks if value.strip()]
    # Reject labels/title-only shells; this is a recovery budget, not proof of
    # policy applicability. Original attachment processing stays independent.
    if sum(len(value) for _,value in blocks)<200 or sum(len(value)>=20 for _,value in blocks)<2:
        raise ValueError('Insufficient substantive article text for automatic repair')
    normalize=lambda value:re.sub(r'\s+','',value)
    literal=normalize(body.get_text('\n',strip=True))
    if any(normalize(value) not in literal for _,value in blocks):
        raise ValueError('Recovered text is not literal source content')
    chunks=[Chunk(id=uid(),document_id=doc.id,text=value,location=location) for location,value in blocks]
    session.add_all(chunks)
    combined=list(dict.fromkeys((doc.warnings or [])+warnings+[
        '已修复空结构节点导致的正文遗漏；原件与历史失败保留，恢复正文未经教师审核。']))
    doc.warnings=combined
    doc.status='partial_parse' if any('待 OCR' in w or '截断' in w for w in combined) else 'pending_review'
    doc.error=None
    if doc.kind=='notice':
        years=re.findall(r'(20\d{2})',doc.title)
        comp=Competition(id=uid(),name=doc.title,year=int(years[0]) if years else None,document_id=doc.id,fields={})
        session.add(comp);session.flush()
        extract_candidates(session,comp,chunks,doc)
    session.add(Audit(id=uid(),action=ACTION,entity_id=doc.id,changes={
        'source_sha256':doc.sha256,'source_url':doc.source_url,'previous_error':expected['error'],
        'previous_status':expected['status'],'chunks_created':len(chunks),
        'original_bytes_changed':False,'existing_chunks_replaced':False,
        'embedding_requested':False,'teacher_publication_performed':False}))
    session.flush()
    return {'document_id':doc.id,'chunks_created':len(chunks),'already_repaired':False,'status':doc.status}
