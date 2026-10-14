"""Bounded source-binding staging only; no I/O, database writes or publication.

The returned observation is not an apply authorization. A future coordinator
must revalidate under owned locks and compare current business/archive state.
"""
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
from app.source_scope import eligibility
from app.school_archive import linked_resources, scope_reason


FIELDS=('id','source_url','sha256','parent_id','status','visibility')
TYPES={'.pdf','.doc','.docx','.xls','.xlsx','.png','.jpg','.jpeg','.webp','.gif','.bmp','.tif','.tiff'}


def stage_attachment_binding(parent, child, parent_archive, child_archive,
                             edge, metadata, parent_bytes, child_bytes):
    """Verify an exact body edge and prepare only an existing URL's binding.

    Both the requested notification chain and the original child chain must be
    public/allowed. No inference from title, shared SHA or similar URL is made.
    Missing parent attachment entries and conflicting bindings remain gaps.
    """
    parent,child=deepcopy(parent),deepcopy(child)
    for doc,row,payload,limit in ((parent,parent_archive,parent_bytes,2*1024*1024),
                                  (child,child_archive,child_bytes,20*1024*1024)):
        if any(k not in doc for k in FIELDS) or not isinstance(payload,bytes) or len(payload)>limit:
            raise ValueError('Incomplete identity or original byte budget exceeded')
        if sha256(payload).hexdigest()!=doc['sha256']:
            raise ValueError('Original SHA mismatch')
        if (row.get('state')!='fetched' or row.get('document_id')!=doc['id']
                or row.get('sha256')!=doc['sha256']
                or doc['source_url'] not in (row.get('url'),row.get('final_url'))):
            raise ValueError('Archive source identity mismatch')
        for url in (row.get('url'),row.get('final_url'),doc['source_url']):
            if url is not None and (not isinstance(url,str) or scope_reason(url)):
                raise ValueError('Source outside public school scope')
        observed=metadata.get(doc['id'])
        if not observed or any(observed.get(k)!=doc[k] for k in FIELDS):
            raise ValueError('Business metadata observation mismatch')
    if parent['id']==child['id']:
        raise ValueError('Self association refused')
    if PurePosixPath(urlsplit(child_archive['url']).path).suffix.lower() not in TYPES:
        raise ValueError('Unsupported attachment reference')
    if not eligibility(child['id'],metadata)['eligible']:
        raise ValueError('Original child source chain denied')
    probe='attachment-stage-source-probe'
    while probe in metadata:probe+='-'
    source_metadata={**metadata,probe:{'id':probe,'parent_id':parent['id'],
                                     'visibility':'public','status':'pending_review'}}
    if not eligibility(probe,source_metadata)['eligible']:
        raise ValueError('Requested notification source chain denied')
    base=parent_archive.get('final_url') or parent_archive['url']
    if (edge.get('parent') not in (parent_archive['url'],base)
            or edge.get('child')!=child_archive['url']
            or edge.get('relation') not in ('a','img','pdfsrc','iframe','object','embed')):
        raise ValueError('Recorded source edge mismatch')
    body=BeautifulSoup(parent_bytes,'html.parser',from_encoding='utf-8').select_one(
        '.wp_articlecontent,.Article_Content,.article-content,#content')
    if body is None:raise ValueError('Explicit article body missing')
    refs=[]
    for ref in linked_resources(body,base):
        refs.append(ref)
        if len(refs)>128:raise ValueError('Body reference budget exceeded')
    if not any(r['url']==edge['child'] and r['relation']==edge['relation'] for r in refs):
        raise ValueError('Literal body source edge missing')
    attachments=parent.get('attachments')
    if not isinstance(attachments,list) or len(attachments)>128:
        raise ValueError('Attachment list missing or over budget')
    matches=[a for a in attachments if isinstance(a,dict) and a.get('url')==edge['child']]
    if not matches:raise ValueError('Existing attachment URL entry missing')
    if any(a.get('document_id') not in (None,child['id']) for a in matches):
        raise ValueError('Existing attachment document binding conflicts')
    replacement=deepcopy(attachments)
    for a in replacement:
        if isinstance(a,dict) and a.get('url')==edge['child']:a['document_id']=child['id']
    identity={'parent_id':parent['id'],'parent_sha256':parent['sha256'],
              'child_id':child['id'],'child_sha256':child['sha256'],
              'child_url':edge['child'],'relation':edge['relation']}
    return {'binding_key':sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'identity':identity,'expected_parent':{k:parent[k] for k in FIELDS},
            'expected_child':{k:child[k] for k in FIELDS},
            'expected_parent_attachments':deepcopy(attachments),'replacement_attachments':replacement,
            'expected_parent_archive':deepcopy(parent_archive),'expected_child_archive':deepcopy(child_archive),
            'recorded_edge':deepcopy(edge),'changes_required':attachments!=replacement,
            'original_parent_unchanged':True,'production_applicable':False,'publication_performed':False}
