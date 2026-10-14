import json
import pytest
from pydantic import ValidationError
from app.qa_response import PublicAnswer,RESPONSE_SCHEMA,parse_response
from app.campus_qa import validate_generated_response


def payload():
    return {'citations':[{'id':'E1'}],'explanation':[{'text':'需要原文规定的材料。','ids':['E1']}]}


@pytest.mark.parametrize('value',[
    {}, {'citations':[]}, {'citations':None,'explanation':[]},
    {'citations':[],'explanation':[{'text':'缺引用'}]},
    {'citations':[],'explanation':[{'text':'缺引用','ids':[]}]},
    {'citations':[{'id':'E99'}],'explanation':[]},
    {'citations':[],'explanation':[{'text':7,'ids':['E1']}]},
    {'citations':[],'explanation':[{'text':'文字','ids':'E1'}]},
    {'citations':[],'explanation':[{'text':'x'*601,'ids':['E1']}]},
    {'citations':[],'explanation':[],'unexpected':'不能猜字段'},
])
def test_malformed_response_never_gets_inferred_reference_ids(value):
    with pytest.raises(ValidationError):parse_response(json.dumps(value))


def test_schema_requires_ids_and_still_allows_explicit_insufficient_evidence():
    assert 'ids' in RESPONSE_SCHEMA['$defs']['Explanation']['required']
    assert parse_response('{"citations":[],"explanation":[]}')=={'citations':[],'explanation':[]}
    assert parse_response(json.dumps(payload()))==payload()


def test_legacy_quote_is_discarded_and_schema_success_does_not_allow_invented_numbers():
    value=payload();value['citations'][0]['quote']='伪造引文'
    value['explanation'][0]['text']='需要交999元。'
    parsed=parse_response(json.dumps(value))
    assert 'quote' not in parsed['citations'][0]
    parsed['citations'][0]['quote']='需提交申请材料。'
    selected,claims=validate_generated_response(parsed,[{'id':'E1','text':'需提交申请材料。'}])
    assert selected and not claims


def test_schema_success_does_not_authorize_a_missing_evidence_id():
    value=payload();value['explanation'][0]['ids']=['E2']
    parsed=parse_response(json.dumps(value));parsed['citations'][0]['quote']='需提交申请材料。'
    assert not validate_generated_response(parsed,[{'id':'E1','text':'需提交申请材料。'}])[1]


def test_structured_wrapper_preserves_generic_model_api(monkeypatch):
    import app.campus_qa as qa
    captured=[]
    def generate(messages,**kwargs):
        captured.append((messages,kwargs));return {'message':{'content':'{}'}}
    monkeypatch.setattr(qa,'model_generate',generate)
    qa.generate([{'role':'user','content':'测试'}])
    assert captured[0][1]['response_schema']==RESPONSE_SCHEMA


def test_response_size_budget_rejects_before_parsing():
    with pytest.raises(ValueError):parse_response(' '*25601)


@pytest.mark.parametrize('corrected',[True,False])
def test_missing_selected_citation_gets_one_explicit_repair_never_automatic_authorization(monkeypatch,corrected):
    from datetime import datetime,timezone
    import app.campus_qa as qa
    rows=[dict(id=f'raw-{i}',document_id=f'doc-{i}',text=text,title=f'{year}年材料提交',
               url='https://jwc.njxzc.edu.cn/a.htm',location='网页段落 1',warnings=[])
          for i,year,text in [(1,'2025','各学院2025年5月20日前提交。'),(2,'2026','各学院2026年5月22日前提交。')]]
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:rows)
    calls=[]
    def generate(messages):
        calls.append(messages)
        citations=[{'id':'E1'}]
        if corrected and len(calls)==2:citations.append({'id':'E2'})
        return {'message':{'content':json.dumps({'citations':citations,'explanation':[
            {'text':'各学院2025年5月20日前提交。','ids':['E1']},
            {'text':'各学院2026年5月22日前提交。','ids':['E2']} ]})}}
    monkeypatch.setattr(qa,'generate',generate)
    answer=qa.campus_answer(None,'2025和2026年材料提交截止时间分别是什么？',datetime.now(timezone.utc))
    assert len(calls)==2 and len(calls[1])==3
    assert all(m['role']!='assistant' for m in calls[1])
    assert '未在citations中选择的ID：E2' in calls[1][-1]['content']
    assert len(answer['explanation'])==(2 if corrected else 1)
    assert {r['id'] for r in answer['sources']}==({'raw-1','raw-2'} if corrected else {'raw-1'})
    assert answer['model']['citation_repair_attempted'] is True


@pytest.mark.parametrize('corrected',[True,False])
@pytest.mark.parametrize('bad_text',['补考合格以80分计。','根据2026校级通知，补考合格以60分计。'])
def test_unsupported_numeric_claim_gets_one_repair_with_original_boundary(monkeypatch,corrected,bad_text):
    from datetime import datetime,timezone
    import app.campus_qa as qa
    row=dict(id='raw-1',document_id='doc-1',text='补考合格以60分计。',title='2026校级通知',
             url='https://jwc.njxzc.edu.cn/a.htm',location='网页段落 1',warnings=[])
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:[row])
    calls=[]
    def generate(messages):
        calls.append(messages)
        text='补考合格以60分计。' if corrected and len(calls)==2 else bad_text
        return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
            'explanation':[{'text':text,'ids':['E1']}]})}}
    monkeypatch.setattr(qa,'generate',generate)
    answer=qa.campus_answer(None,'补考合格是不是80分？',datetime.now(timezone.utc))
    assert len(calls)==2
    assert calls[1][:2]==calls[0]
    assert len(calls[1])==3
    assert '引用正文未支持的数字' in calls[1][-1]['content']
    assert 'unsupported_literal_numbers' in calls[1][-1]['content']
    assert ('"80"' if '80' in bad_text else '"2026"') in calls[1][-1]['content']
    assert '即使在否定句中也不要复述' in calls[1][-1]['content']
    assert answer['model']['numeric_repair_attempted'] is True
    assert bool(answer['explanation'])==corrected
    assert answer['sources'][0]['quote']=='补考合格以60分计。'


@pytest.mark.parametrize('claim,source,rejected',[
    ('2026年5月22日提交。','2026 年 5 月 22 日前完成推荐。',True),
    ('5月22日前提交。','2026年5月22日前完成推荐。',False),
    ('5月22日之前提交。','2026年5月22日前完成推荐。',False),
    ('2026年5月22日举行。','2026年5月22日举行。',False),
    ('2025年5月22日举行。','2026年5月22日前提交。',False),
    ('5月22日以前提交。','2026年5月22日前完成推荐。',False),
])
def test_deadline_qualifier_guard_distinguishes_dates_and_bounds(claim,source,rejected):
    from app.campus_qa import missing_date_qualifiers
    assert bool(missing_date_qualifiers(claim,source))==rejected


@pytest.mark.parametrize('claim,source,rejected',[
    ('2025年5月22日。','2026年5月22日。',True),
    ('5月22日。','2026年05月22日。',False),
    ('2026年5月22日。','5月22日。',True),
    ('5月22日。','5月20日，6月22日。',True),
])
def test_event_date_must_not_borrow_title_year_or_recombine_components(claim,source,rejected):
    from app.campus_qa import unsupported_calendar_dates
    assert bool(unsupported_calendar_dates(claim,source))==rejected
    if rejected:
        parsed={'citations':[{'id':'E1','quote':source}],'explanation':[{'text':claim,'ids':['E1']}]}
        evidence=[{'id':'E1','text':source,'title':'2025年2026年通知'}]
        assert not validate_generated_response(parsed,evidence)[1]


@pytest.mark.parametrize('corrected',[True,False])
def test_deadline_repair_preserves_before_qualifier_or_falls_back(monkeypatch,corrected):
    from datetime import datetime,timezone
    import app.campus_qa as qa
    row=dict(id='raw-1',document_id='doc-1',text='各学院于2026年5月22日前完成推荐。',title='2026年项目通知',
             url='https://jwc.njxzc.edu.cn/a.htm',location='网页段落 1',warnings=[])
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:[row])
    calls=[]
    def generate(messages):
        calls.append(messages)
        text='各学院于2026年5月22日前完成推荐。' if corrected and len(calls)==2 else '各学院推荐截止日期为2026年5月22日。'
        return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
            'explanation':[{'text':text,'ids':['E1']}]})}}
    monkeypatch.setattr(qa,'generate',generate)
    answer=qa.campus_answer(None,'2026年学院推荐截止日期是什么？',datetime.now(timezone.utc))
    assert len(calls)==2 and answer['model']['deadline_repair_attempted'] is True
    assert bool(answer['explanation'])==corrected
    assert answer['sources'][0]['quote']==row['text']


@pytest.mark.parametrize('claim,source,rejected',[
    ('5月11日16时提交。','5月11日16时之前报送。',True),
    ('5月11日前提交。','5月11日16时之前报送。',True),
    ('5月11日16时以前提交。','5月11日16时之前报送。',False),
    ('5月11日16:00前提交。','5月11日16时之前报送。',False),
    ('5月11日16时前提交。','5月11日16时30分前报送。',True),
    ('5月11日16时30分之前提交。','5月11日16时30分前报送。',False),
    ('5月11日16时举行。','5月11日16时举行。',False),
    ('5月11日前提交。','5月11日16时之前报送，另可在5月11日前网上提交。',False),
])
def test_clock_deadline_retains_qualifier_and_precision(claim,source,rejected):
    from app.campus_qa import missing_date_qualifiers
    assert bool(missing_date_qualifiers(claim,source))==rejected


@pytest.mark.parametrize('claim,source',[
    ('5月11日17时前提交。','5月11日16时之前报送。共17人。'),
    ('5月11日16时30分前提交。','5月11日16时之前报送。30人参加。'),
    ('5月11日16时前提交。','5月11日之前报送。工作16小时。'),
])
def test_clock_cannot_be_borrowed_from_other_numbers(claim,source):
    from app.campus_qa import unsupported_calendar_dates
    assert unsupported_calendar_dates(claim,source)


def test_clock_deadline_full_response_validation_rejects_lost_precision():
    source='科研秘书5月11日16时之前报送。'
    evidence=[{'id':'E1','text':source}]
    for text in ['5月11日16时报送。','5月11日前报送。','5月11日16时之前报送。']:
        parsed={'citations':[{'id':'E1','quote':source}],'explanation':[{'text':text,'ids':['E1']}]}
        assert bool(validate_generated_response(parsed,evidence)[1])==('16时之前' in text)
