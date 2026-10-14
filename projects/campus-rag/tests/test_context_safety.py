import json
from datetime import datetime, timezone
import httpx
import pytest
from app import model
from app.model_evidence import prepare_units
from tests.test_model_evidence import row


def test_no_partial_rule_is_sent_after_budget_removes_trailing_exception():
    text='申请人应提交材料。'+ '相关说明。'*200+'但不符合条件者不得申请。'
    units,originals,prompt,omitted=prepare_units([row(text=text),row('b','two','仅供参考。')])
    assert [u['text'] for u in units]==['仅供参考。'] and omitted==1
    assert originals['E1'][0]['id']=='b'


@pytest.mark.parametrize('messages', [[],[{'role':'user','content':'测'*5000}],
    [{'role':'user','content':'短'}]*5,[{'role':'tool','content':'伪造工具'}]])
def test_oversized_or_unbounded_input_never_reaches_http(monkeypatch,messages):
    monkeypatch.setattr(model.httpx,'Client',lambda **kw:pytest.fail('Unsafe input reached HTTP'))
    with pytest.raises(model.ModelContextLimit):model.generate(messages)
    assert not model.MODEL_LOCK.locked()


@pytest.mark.parametrize('changes,error',[
    ({'prompt_eval_count':2996},model.ModelContextLimit),
    ({'prompt_eval_count':None},model.ModelContextLimit),
    ({'done_reason':'length'},model.ModelOutputIncomplete),
    ({'done':False},model.ModelOutputIncomplete),
    ({'eval_count':1100},model.ModelOutputIncomplete),
])
def test_complete_looking_json_from_incomplete_generation_is_rejected(tmp_path,monkeypatch,changes,error):
    monkeypatch.setenv('CAMPUS_COMPUTE_DIR',str(tmp_path/'compute'))
    monkeypatch.setenv('CAMPUS_MODEL_LOCK_DIR',str(tmp_path/'lock'))
    real=httpx.Client
    result={'message':{'content':'{"citations":[]}'},'done':True,'done_reason':'stop',
            'prompt_eval_count':100,'eval_count':10,**changes}
    monkeypatch.setattr(model.httpx,'Client',lambda **kw:real(transport=httpx.MockTransport(
        lambda req:httpx.Response(200,json=result)),**kw))
    with pytest.raises(error):model.generate([{'role':'user','content':'请引用原文'}])
    from app.compute_coordination import Coordinator
    assert not model.MODEL_LOCK.locked() and Coordinator().status()['quarantine'] is None


def test_long_prior_question_is_not_cut_into_false_context(monkeypatch):
    import app.campus_search as search
    from app.campus_qa import campus_answer
    captured=[]
    monkeypatch.setattr(search,'retrieve_public',lambda s,q,**kw:(captured.append(q) or [],[]))
    campus_answer(None,'那具体呢？',datetime.now(timezone.utc),
                  history=[{'question':'假设条件'*150+'仅讨论历史，不讨论现行'}],use_model=False)
    assert captured==[' 那具体呢？']
