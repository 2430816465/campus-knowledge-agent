import json
from datetime import datetime,timezone
import pytest
import app.campus_qa as qa

SOURCE='申诉书，并附上学校做出的处分或处理决定（复印件）。'
BAD='需附处分或处理决定复印件。这是为了证明申诉人提出异议，从而确保申诉程序的合法性与完整性。'

@pytest.mark.parametrize('text,source,rejected',[
    (BAD,SOURCE,True),
    ('需附决定复印件，以便提高处理效率。',SOURCE,True),
    ('需附决定复印件，有助于保障学生权益。',SOURCE,True),
    ('需附决定复印件。',SOURCE,False),
    ('为了保护学生合法权益。','为规范程序，为了保护学生合法权益，制定本办法。',False),
    ('为了维护合法权益。','为了保护学生合法权益，制定本办法。',True),
    ('目的在于保障程序完整。','申请材料应完整。',True),
])
def test_purpose_requires_its_actual_cited_words(text,source,rejected):
    assert bool(qa.unsupported_rationale_clauses(text,source))==rejected


@pytest.mark.parametrize('corrected',[True,False])
def test_valid_fact_with_added_purpose_gets_one_repair_or_original_only(monkeypatch,corrected):
    row=dict(id='raw-1',document_id='doc-1',text=SOURCE,title='学生申诉工作规定',
             url='https://xsc.njxzc.edu.cn/test.htm',location='网页段落 1',warnings=[])
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:[row])
    calls=[]
    def generate(messages):
        calls.append(messages)
        claim='需附处分或处理决定复印件。' if corrected and len(calls)==2 else BAD
        return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
            'explanation':[{'text':claim,'ids':['E1']}]})}}
    monkeypatch.setattr(qa,'generate',generate)
    answer=qa.campus_answer(None,'申诉应附什么材料？',datetime.now(timezone.utc))
    assert len(calls)==2 and len(calls[1])==3
    assert calls[1][:2]==calls[0]
    assert '未能逐字对应引用正文的目的' in calls[1][-1]['content']
    assert answer['model']['rationale_repair_attempted']
    assert bool(answer['explanation'])==corrected
    assert answer['sources'][0]['quote']==SOURCE


def test_repair_budget_remains_shared_with_other_fact_errors(monkeypatch):
    row=dict(id='raw-1',document_id='doc-1',text=SOURCE,title='学生申诉工作规定',
             url='https://xsc.njxzc.edu.cn/test.htm',location='网页段落 1',warnings=[])
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:[row])
    calls=[]
    def generate(messages):
        calls.append(messages)
        return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
            'explanation':[{'text':'需交80份复印件，为了提高效率。','ids':['E1']}]})}}
    monkeypatch.setattr(qa,'generate',generate)
    answer=qa.campus_answer(None,'申诉材料是什么？',datetime.now(timezone.utc))
    assert len(calls)==2 and not answer['explanation']
    assert answer['model']['rationale_repair_attempted'] and answer['model']['numeric_repair_attempted']
