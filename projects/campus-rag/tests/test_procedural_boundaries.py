import json
from datetime import datetime, timezone
import pytest
import app.campus_qa as qa

ADMISSION='第十三条 受理小组对书面申诉是否受理进行表决，自接到书面申诉之日起3日内作出处理。'
EXECUTION='第十七条 申诉期间原处理决定不停止执行。申诉委员会认为必要的，可以建议学校暂缓执行有关决定。'

@pytest.mark.parametrize('source,bad,good',[
    (ADMISSION,'申诉委员会在3日内决定是否受理。','受理小组自接到书面申诉之日起3日内决定是否受理。'),
    (EXECUTION,'申诉期间原处分不会自动暂停执行。','申诉期间原决定不停止执行；申诉委员会认为必要时，可建议学校暂缓执行。'),
    (EXECUTION,'申诉期间原决定不停止执行，但可暂缓执行。','申诉期间原决定不停止执行；委员会认为必要时可建议学校暂缓执行。'),
])
@pytest.mark.parametrize('corrected',[True,False])
def test_one_shared_repair_then_reject_persistent_actor_or_exception_error(monkeypatch,source,bad,good,corrected):
    row=dict(id='raw-1',document_id='doc-1',text=source,title='学生申诉工作规定',
             url='https://xsc.njxzc.edu.cn/test.htm',location='网页段落 1',warnings=[])
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:[row])
    calls=[]
    def generate(messages):
        calls.append(messages)
        explanation=good if corrected and len(calls)==2 else bad
        return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
            'explanation':[{'text':explanation,'ids':['E1']}]})}}
    monkeypatch.setattr(qa,'generate',generate)
    answer=qa.campus_answer(None,'学生申诉规则是什么？',datetime.now(timezone.utc))
    assert len(calls)==2 and len(calls[1])==3
    assert calls[1][:2]==calls[0]
    assert '办理主体或执行例外' in calls[1][-1]['content']
    assert answer['model']['procedural_repair_attempted']
    assert bool(answer['explanation'])==corrected
    assert answer['sources'][0]['quote']==source
    assert answer['mode']==('grounded_explanation' if corrected else 'local_model_evidence')


def test_guard_does_not_invent_exception_or_replace_correct_group():
    assert not qa.procedural_boundary_issues('申诉期间不停止执行。','申诉期间不停止执行。')
    assert not qa.procedural_boundary_issues('委员会下设的受理小组在3日内决定是否受理。',ADMISSION)
    assert not qa.procedural_boundary_issues('申诉委员会在3日内决定是否受理。','申诉委员会决定是否受理。')


def test_procedural_issue_shares_existing_numeric_retry(monkeypatch):
    row=dict(id='raw-1',document_id='doc-1',text=ADMISSION,title='学生申诉工作规定',
             url='https://xsc.njxzc.edu.cn/test.htm',location='网页段落 1',warnings=[])
    monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:[row])
    calls=[]
    def generate(messages):
        calls.append(messages)
        return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
            'explanation':[{'text':'申诉委员会在80日内决定是否受理。','ids':['E1']}]})}}
    monkeypatch.setattr(qa,'generate',generate)
    answer=qa.campus_answer(None,'多久受理？',datetime.now(timezone.utc))
    assert len(calls)==2 and not answer['explanation']
    assert answer['model']['procedural_repair_attempted'] and answer['model']['numeric_repair_attempted']
