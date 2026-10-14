from copy import deepcopy
from hashlib import sha256

import pytest
from scripts.attachment_source_stage import stage_attachment_binding


def inputs():
    url='https://www.njxzc.edu.cn/file.pdf'
    body=f'<div class="wp_articlecontent"><a href="{url}">附件</a></div>'.encode()
    payload=b'isolated original'
    parent=dict(id='notice',source_url='https://www.njxzc.edu.cn/notice.htm',
                sha256=sha256(body).hexdigest(),parent_id=None,status='pending_review',visibility='public',
                attachments=[{'url':url,'status':'not_imported','title':'保留原标签'},
                             {'url':'https://www.njxzc.edu.cn/other.pdf','document_id':'unrelated'}])
    primary=dict(id='primary',source_url='https://www.njxzc.edu.cn/primary.htm',
                 sha256='a'*64,parent_id=None,status='pending_review',visibility='public')
    child=dict(id='child',source_url=url,sha256=sha256(payload).hexdigest(),parent_id='primary',
               status='pending_review',visibility='public')
    def row(d):return dict(url=d['source_url'],final_url=None,sha256=d['sha256'],document_id=d['id'],state='fetched')
    return [parent,child,row(parent),row(child),dict(parent=parent['source_url'],child=url,relation='a'),
            {d['id']:deepcopy(d) for d in (parent,primary,child)},body,payload]


def test_prepare_preserves_all_sources_review_and_input_and_retry_key():
    args=inputs();before=deepcopy(args)
    plan=stage_attachment_binding(*args)
    assert args==before and plan['production_applicable'] is False
    assert plan['expected_child']['parent_id']=='primary'
    assert plan['replacement_attachments']==[
        {**args[0]['attachments'][0],'document_id':'child'},args[0]['attachments'][1]]
    assert plan['publication_performed'] is False and plan['changes_required'] is True
    args[0]['attachments']=plan['replacement_attachments']
    again=stage_attachment_binding(*args)
    assert again['binding_key']==plan['binding_key'] and again['changes_required'] is False


@pytest.mark.parametrize('boundary',[
    'parent_private','parent_withdrawn','child_private','child_withdrawn','primary_private',
    'primary_withdrawn','missing_primary','parent_cycle','child_partial','parent_sha','child_sha',
    'parent_archive_sha','child_archive_id','child_source_url','metadata_changed','wrong_edge',
    'wrong_relation','outside_scope','missing_entry','conflicting_entry','missing_body','navigation_only',
])
def test_denies_unverified_edges_and_both_source_chain_bypasses(boundary):
    a=inputs();p,c,pa,ca,edge,m,body,payload=a
    if boundary=='parent_private':p['visibility']=m[p['id']]['visibility']='private'
    if boundary=='parent_withdrawn':p['status']=m[p['id']]['status']='withdrawn'
    if boundary=='child_private':c['visibility']=m[c['id']]['visibility']='private'
    if boundary=='child_withdrawn':c['status']=m[c['id']]['status']='withdrawn'
    if boundary=='primary_private':m['primary']['visibility']='private'
    if boundary=='primary_withdrawn':m['primary']['status']='withdrawn'
    if boundary=='missing_primary':del m['primary']
    if boundary=='parent_cycle':p['parent_id']=m[p['id']]['parent_id']=p['id']
    if boundary=='child_partial':c['status']=m[c['id']]['status']='partial_parse'
    if boundary=='parent_sha':a[6]+=b'changed'
    if boundary=='child_sha':a[7]+=b'changed'
    if boundary=='parent_archive_sha':pa['sha256']='0'*64
    if boundary=='child_archive_id':ca['document_id']='other'
    if boundary=='child_source_url':c['source_url']='https://www.njxzc.edu.cn/other.pdf'
    if boundary=='metadata_changed':m[c['id']]['status']='withdrawn'
    if boundary=='wrong_edge':edge['child']='https://www.njxzc.edu.cn/other.pdf'
    if boundary=='wrong_relation':edge['relation']='img'
    if boundary=='outside_scope':pa['final_url']='https://example.org/a.htm'
    if boundary=='missing_entry':p['attachments']=[]
    if boundary=='conflicting_entry':p['attachments'][0]['document_id']='different-document'
    if boundary in ('missing_body','navigation_only'):
        a[6]=b'<nav><a href="https://www.njxzc.edu.cn/file.pdf">outside</a></nav>'
        if boundary=='navigation_only':a[6]+=b'<div class="wp_articlecontent">text</div>'
        p['sha256']=m[p['id']]['sha256']=pa['sha256']=sha256(a[6]).hexdigest()
    with pytest.raises(ValueError):stage_attachment_binding(*a)


def test_recorded_redirect_accepted_without_inventing_aliases():
    a=inputs();a[2]['url']='https://www.njxzc.edu.cn/old.htm'
    a[2]['final_url']=a[0]['source_url'];a[4]['parent']=a[2]['url']
    assert stage_attachment_binding(*a)['changes_required']


@pytest.mark.parametrize('state',['parse_failed','partial_parse','converted'])
def test_public_notification_shell_is_provenance_not_parsed_evidence(state):
    a=inputs();a[0]['status']=a[5]['notice']['status']=state
    assert stage_attachment_binding(*a)['publication_performed'] is False


def test_reference_budget_denies_without_truncating_into_success():
    a=inputs();a[6]=(b'<div class="wp_articlecontent">'+b'<a href="x.pdf">x</a>'*129+b'</div>')
    a[0]['sha256']=a[2]['sha256']=a[5]['notice']['sha256']=sha256(a[6]).hexdigest()
    with pytest.raises(ValueError,match='budget'):stage_attachment_binding(*a)
