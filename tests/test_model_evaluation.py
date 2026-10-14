import json
from app.model_gate import ModelBusy
from app.qa_response import RESPONSE_SCHEMA
from scripts.evaluate_model_answers import evaluate_case
from tests.test_campus_qa import factory, add


def case(doc):
    return {'id':'one','question':'补考合格成绩如何登记？','tags':['single_fact'],
            'expectation':'answerable','facts':[{'source_id':doc.id,'anchor':'合格以60分'}]}


def test_evaluation_uses_formal_schema_and_records_answer_without_accuracy_inference():
    with factory()() as s:
        doc,_=add(s,'补考合格以60分计。',title='课程补考登记办法')
        def generate(messages,**kwargs):
            assert kwargs['response_schema']==RESPONSE_SCHEMA
            return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
                'explanation':[{'text':'补考合格以60分计。','ids':['E1']}]})}}
        result=evaluate_case(s,case(doc),model_generate=generate)
        assert result['answer']['mode']=='grounded_explanation'
        assert result['calls'][0]['schema_used'] and not result['deferred']
        assert result['semantic_correct'] is None and result['manual_review_required']


def test_evaluation_retains_busy_attempt_for_resume_without_marking_completed():
    with factory()() as s:
        doc,_=add(s,'补考合格以60分计。',title='课程补考登记办法')
        def generate(*args,**kwargs):raise ModelBusy('training_priority')
        result=evaluate_case(s,case(doc),model_generate=generate)
        assert result['deferred'] and result['calls'][0]['error_type']=='ModelBusy'
        assert result['semantic_correct'] is None
