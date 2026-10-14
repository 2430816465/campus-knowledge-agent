import json
from copy import deepcopy
from datetime import datetime, timezone

import pytest
from app import image_row_index as ir
from app.campus_qa import campus_answer, revalidate_sources
from app.model_evidence import prepare_units
from tests.test_appeal_retrieval import session_factory, add


@pytest.fixture
def corpus(tmp_path, monkeypatch):
    path = tmp_path/'verified.json'
    monkeypatch.setattr(ir, 'cache_path', lambda:path)
    s = session_factory()()
    parent,_ = add(s,'2027年全国硕士研究生招生网上报名公告',['报名通知'])
    doc,_ = add(s,'2027年全国硕士研究生招生网上报名公告 / 联系方式.png',['教师教育学院报名咨询联系电话','025-86178210'],parent_id=parent.id)
    row = {'sha256':doc.sha256,'source_url':doc.source_url,'row':1,
        'width':582,'height':311,'verification':'original_visual_same_row',
        'cells':[{'header':'学院','text':'教师教育学院','bbox':[13,44,265,81],'header_bbox':[13,5,265,43]},
                 {'header':'联系电话','text':'025-86178210','bbox':[392,44,581,81],'header_bbox':[392,5,581,43]}]}
    path.write_text(json.dumps([row]),'utf-8')
    lexical = [{'document_id':doc.id}]
    yield s,parent,doc,path,row,lexical
    s.close()


def test_same_row_retrieval_and_revalidation_fail_closed(corpus):
    s,parent,doc,path,row,lexical = corpus
    q='2027年招生报名公告中教师教育学院联系电话是什么？'
    hit = ir.retrieve_image_rows(s,q,lexical)[0]
    hit['quote'] = hit['text']
    assert revalidate_sources(s,[hit]) == [hit]
    assert '025-86178210' in hit['text']
    assert not ir.retrieve_image_rows(s,q,[],None)
    assert not ir.retrieve_image_rows(s,q,lexical,[])
    assert not ir.retrieve_image_rows(s,q.replace('2027','2026'),lexical)
    assert not ir.retrieve_image_rows(s,q.replace('教师教育学院','文学院'),lexical)
    changed=deepcopy(hit);changed['image_row']['cells'][1]['text']='999'
    assert not revalidate_sources(s,[changed])
    parent.status='withdrawn';s.commit()
    assert not ir.retrieve_image_rows(s,q,lexical)
    assert not revalidate_sources(s,[hit])


def test_corrupt_coordinates_and_missing_cache_not_answerable(corpus):
    s,_,_,path,row,lexical=corpus
    hit=ir.retrieve_image_rows(s,'教师教育学院联系电话是什么？',lexical)[0]
    hit['quote']=hit['text']
    path.unlink()
    assert not revalidate_sources(s,[hit])
    row['cells'][1]['bbox']=[392,90,581,120]
    path.write_text(json.dumps([row]),'utf-8')
    with pytest.raises(ValueError):ir.records()


def test_changed_original_and_header_alignment_reject_old_cells(corpus):
    s,_,doc,path,row,lexical=corpus
    hit=ir.retrieve_image_rows(s,'教师教育学院联系电话是什么？',lexical)[0]
    hit['quote']=hit['text']
    doc.sha256='b'*64;s.commit()
    assert not revalidate_sources(s,[hit])
    assert not ir.retrieve_image_rows(s,'教师教育学院联系电话是什么？',lexical)
    row['cells'][1]['header_bbox']=[1,5,200,43]
    path.write_text(json.dumps([row]),'utf-8')
    with pytest.raises(ValueError):ir.records()


def test_answer_path_preserves_original_cells_and_no_model(corpus,monkeypatch):
    s,_,doc,_,row,_=corpus
    import app.campus_qa as qa
    def forbidden(*a,**kw):raise AssertionError('No inference expected')
    monkeypatch.setattr(qa,'generate',forbidden)
    answer=campus_answer(s,'2027年全国硕士研究生招生网上报名公告中教师教育学院联系电话是什么？',datetime.now(timezone.utc),use_model=False)
    assert answer['sources'][0]['quote_method']==ir.METHOD
    assert answer['sources'][0]['document_id']==doc.id
    assert '025-86178210' in answer['answer']
    assert answer['mode']=='verified_field_answer'
    assert answer['explanation'][0]['text']=='教师教育学院，联系电话：025-86178210。'
    assert answer['sources'][0]['image_row']==row
    _,_,prompt,_=prepare_units(answer['sources'])
    assert '同行关系已对照' in prompt[0]['evidence_format']
    assert prepare_units(answer['sources'],budget=10)[0]==[]
    answer=campus_answer(s,'2027年全国硕士研究生招生网上报名公告中教师教育学院联系电话是什么？',datetime.now(timezone.utc),use_model=True)
    assert answer['mode']=='verified_field_answer'


def test_direct_contact_never_resolves_ambiguity_or_hypothetical(corpus):
    s,_,_,_,_,lexical=corpus
    q='教师教育学院联系电话是什么？'
    row=ir.retrieve_image_rows(s,q,lexical)[0]
    assert ir.direct_contact(q,[row])
    assert ir.direct_contact(q,[row,row]) is None
    assert ir.direct_contact('如果教师教育学院联系电话是什么？',[row]) is None
    assert ir.direct_contact('教师教育学院为什么使用该联系电话？',[row]) is None
    assert ir.direct_contact('教师教育学院联系电话是多少，报名时间是什么？',[row]) is None
    assert ir.direct_contact('教师教育学院联系电话是多少，报名条件有哪些？',[row]) is None
