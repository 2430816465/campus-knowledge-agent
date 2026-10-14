import copy
import pytest
from scripts.recovery_source_binding import select_observed_binding


def observations():
    doc = dict(id='doc', source_url='https://jwc.njxzc.edu.cn/a.docx', sha256='a'*64, status='partial_parse')
    row = dict(url='http://jwc.njxzc.edu.cn/a.docx',final_url=doc['source_url'],
               sha256=doc['sha256'],document_id='doc',state='fetched',
               import_state='partial_parse',import_error='image omitted')
    return doc,row


def test_observed_redirect_selected_without_promoting_pending_alias():
    doc,row=observations()
    pending=dict(row,url=doc['source_url'],document_id=None,import_state=None)
    before=copy.deepcopy([doc,row,pending])
    result=select_observed_binding(doc,[pending,row])
    assert result['status']=='bound'
    assert result['bindings'][0]['match']=='observed_final_url'
    assert result['bindings'][0]['expected_archive']==row
    assert result['rejected']==[dict(url=pending['url'],reason='original_or_document_identity_mismatch')]
    result['bindings'][0]['expected_archive']['import_error']='changed'
    assert [doc,row,pending]==before
    assert result['archive_writes']==0 and not result['production_applicable']


def test_no_inferred_https_equivalence():
    doc,row=observations(); row['final_url']=None
    assert select_observed_binding(doc,[row])['status']=='no_binding'


@pytest.mark.parametrize('field,value',[
    ('sha256','b'*64),('document_id','other'),('state','pending'),
    ('import_state','imported'),('final_url','https://other.njxzc.edu.cn/a.docx')])
def test_identity_and_state_required_even_for_observed_redirect(field,value):
    doc,row=observations();row[field]=value
    assert select_observed_binding(doc,[row])['status']=='no_binding'


def test_exact_match_and_multiple_matches_are_not_arbitrarily_chosen():
    doc,row=observations();exact=dict(row,url=doc['source_url'])
    assert select_observed_binding(doc,[exact])['bindings'][0]['match']=='exact'
    for rows in ([exact,row],[row,exact]):
        assert select_observed_binding(doc,rows)['status']=='ambiguous'
        assert len(select_observed_binding(doc,rows)['bindings'])==2


@pytest.mark.parametrize('url',['https://user:secret@jwc.njxzc.edu.cn/a.docx',
                              'https://jwc.njxzc.edu.cn/a.docx#fragment',
                              ' https://jwc.njxzc.edu.cn/a.docx','file:///a.docx'])
def test_invalid_source_not_accepted(url):
    doc,row=observations();row['url']=url
    assert select_observed_binding(doc,[row])['status']=='no_binding'


def test_incomplete_observation_and_reviewed_document_rejected():
    doc,row=observations();del row['import_error']
    assert select_observed_binding(doc,[row])['rejected'][0]['reason']=='incomplete_archive_observation'
    doc['status']='published'
    with pytest.raises(ValueError):select_observed_binding(doc,[])
