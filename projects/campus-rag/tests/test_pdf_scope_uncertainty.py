import json
from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from app.db import Chunk
from app.ingest import uid
from app.pdf_sections import pdf_sections, SCOPE_UNCERTAIN
from app.campus_qa import campus_retrieve, campus_answer, validate_generated_response
from app.model_evidence import prepare_units
from tests.test_campus_qa import factory
from tests.test_pdf_sections import fixture


def tail_fixture(session):
    doc, _ = fixture(session)
    extra=[]
    for n,text in enumerate(['项目成果在发表时标注项目名称及编号，',
                             '成果第一署名单位为“南京晓庄学院”。', '三、材料提交'],4):
        c=Chunk(id=uid(),document_id=doc.id,text=text,location=f'第 2 页 / 段落 {n} / 字符 1')
        extra.append(c);session.add(c)
    session.commit()
    return doc, extra


def test_unnumbered_tail_is_retrievable_without_asserting_common_or_exclusive_scope():
    with factory()() as s:
        doc,extra=tail_fixture(s)
        for subject in ('高层次', '青年'):
            rows=campus_retrieve(s,f'2026科研结项通知，{subject}项目成果署名和标注要求？')
            tail=next(r for r in rows if r['id'] in {c.id for c in extra[:2]})
            assert tail['scope_uncertain'] and SCOPE_UNCERTAIN in tail['warnings']
            assert extra[-1].id in {c['id'] for c in tail['context_chunks']}
            units,_,prompt,_=prepare_units([tail])
            assert units[0]['scope_uncertain'] and prompt[0]['scope_uncertain']
            assert '不证明各类别通用' in prompt[0]['scope_note']


@pytest.mark.parametrize('change', ['incomplete','no_end','not_generic','far_heading','subheading'])
def test_other_layouts_do_not_guess_a_result_scope_boundary(change):
    texts=['1.高层次项目。', '2.青年专项。', '项目负责人获得专利。',
           '项目成果发表时标注名称编号。','三、材料提交']
    if change=='no_end': texts[2]='项目负责人获得专利，'
    elif change=='not_generic':texts[3]='青年专项成果必须标注编号。'
    elif change=='far_heading':texts[4:4]=['续文']*4
    elif change=='subheading':texts[-1]='3.其他项目。'
    doc=SimpleNamespace(id='d')
    rows=[(SimpleNamespace(id=str(i),text=t,location=f'第 1 页 / 段落 {i} / 字符 1'),doc)
          for i,t in enumerate(texts,1)]
    contexts,_,_,_=pdf_sections(rows,complete_documents=() if change=='incomplete' else {'d'})
    assert all(SCOPE_UNCERTAIN not in value for value in contexts.values())


@pytest.mark.parametrize('claim,allowed', [
    ('高层次项目成果第一署名须为南京晓庄学院。',False),
    ('所有项目均须以南京晓庄学院作为成果第一署名。',False),
    ('仅青年项目需要以南京晓庄学院作为成果第一署名。',False),
    ('成果第一署名单位为南京晓庄学院；此条款适用范围未确认。',True)])
def test_scope_uncertainty_survives_claim_validation(claim,allowed):
    row={'id':'E1','text':'成果第一署名单位为南京晓庄学院。','scope_uncertain':True}
    parsed={'citations':[{'id':'E1','quote':row['text']}],
            'explanation':[{'text':claim,'ids':['E1']}]}
    assert bool(validate_generated_response(parsed,[row])[1]) == allowed


def test_boundary_change_invalidates_model_answer(monkeypatch):
    import app.campus_qa as qa
    with factory()() as s:
        _,extra=tail_fixture(s)
        def generate(messages):
            evidence=json.loads(messages[1]['content'])['evidence']
            unit=next(r for r in evidence if r.get('scope_uncertain'))
            extra[-1].text='3.青年专项补充要求。';s.commit()
            return {'message':{'content':json.dumps({'citations':[{'id':unit['id']}],
                'explanation':[{'text':'原文要求标注名称编号；此条款适用范围未确认。','ids':[unit['id']]}]})}}
        monkeypatch.setattr(qa,'generate',generate)
        answer=campus_answer(s,'2026科研结项通知，高层次项目成果署名和标注要求？',datetime.now(timezone.utc))
        assert answer['mode']=='insufficient_evidence' and not answer['sources']


@pytest.mark.parametrize('corrected', [True,False])
def test_scope_repair_shares_one_retry_and_never_authorizes_missing_uncertainty(monkeypatch,corrected):
    import app.campus_qa as qa
    row=dict(id='raw-one',document_id='doc',text='成果第一署名单位为南京晓庄学院。',
             title='公开通知',url='https://kyc.njxzc.edu.cn/one.htm',
             location='第 2 页 / 段落 19 / 字符 1',warnings=[],scope_uncertain=True)
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**kw:[row])
    calls=[]
    def generate(messages):
        calls.append(messages)
        claim='成果第一署名单位为南京晓庄学院。'
        if corrected and len(calls)==2:claim+='此条款适用范围未确认。'
        return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
            'explanation':[{'text':claim,'ids':['E1']}]})}}
    monkeypatch.setattr(qa,'generate',generate)
    result=qa.campus_answer(None,'项目成果的署名要求？',datetime.now(timezone.utc))
    assert len(calls)==2 and calls[1][:2]==calls[0] and len(calls[1])==3
    assert 'scope_uncertain=true' in calls[1][-1]['content']
    assert result['model']['scope_repair_attempted']
    assert bool(result['explanation'])==corrected
