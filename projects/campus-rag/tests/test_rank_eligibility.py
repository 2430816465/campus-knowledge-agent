import json
from datetime import datetime,timezone
import pytest
import app.campus_qa as qa

SOURCE='上一学年学习成绩或综合素质测评成绩排名虽未达前10%，但均位于前30%（含）者，若在某一方面表现非常突出，也可申请。'


@pytest.mark.parametrize('claim',[
 '未进入前10%但在其他方面表现非常突出，仍可申请国家奖学金。',
 '未进前10%但达到前30%且表现非常突出，可以申请。',
 '学习和综测排名都前30%，可以申请国家奖学金。',
 '学习或综测排名前30%且其他方面表现非常突出，可以申请。',
])
def test_source_does_not_allow_dropping_joint_rank_or_exception_condition(claim):
 row={'id':'E1','text':SOURCE}
 parsed={'citations':[{'id':'E1','quote':SOURCE}], 'explanation':[{'text':claim,'ids':['E1']}]}
 assert not qa.validate_generated_response(parsed,[row])[1]


@pytest.mark.parametrize('claim',[
 '学习和综测排名均在前30%（含），且其他方面表现非常突出，也可申请国家奖学金。',
 '学习成绩及综合素质测评成绩两项均位于前30%且表现非常突出，可申请，不代表自动获奖。',
 '德育素质分最低14分。',
 '申请时需要提交详细证明材料。',
])
def test_complete_or_unrelated_claim_is_not_forced_to_repeat_ranking(claim):
 row={'id':'E1','text':SOURCE+'德育素质分14分。申请时需要提交详细证明材料。'}
 parsed={'citations':[{'id':'E1','quote':row['text']}], 'explanation':[{'text':claim,'ids':['E1']}]}
 assert qa.validate_generated_response(parsed,[row])[1]


def test_regular_route_in_same_source_is_not_forced_to_be_exception():
 source='学习成绩和综合素质测评成绩排名均在前10%者，可申请。'+SOURCE
 assert not qa.ranking_eligibility_issues('学习和综测排名均前10%，可申请。',source)
 assert qa.ranking_eligibility_issues('学习和综测排名均未达前10%但表现非常突出，可申请。',source)


def test_limit_is_read_from_body_and_joint_marker_is_attached_to_limit():
 source=SOURCE.replace('30%','25%')
 assert not qa.ranking_eligibility_issues('学习和综测均前25%且表现特别突出，可申请。',source)
 assert qa.ranking_eligibility_issues('学习和综测均前30%且表现特别突出，可申请。',source)
 assert qa.ranking_eligibility_issues('学习和综测两项前25%且表现特别突出，可申请。',source)
 assert qa.ranking_eligibility_issues('学习和综测均前10%，其他同学前25%，表现特别突出可申请。',source)


@pytest.mark.parametrize('claim',[
 '学习和综测均前30%且表现非常突出，可申请；表现非常突出也可申请。',
 '学习和综测均前30%，无需表现非常突出也可申请。',
 '学习和综测均前30%且表现非常突出，但不受排名限制可申请。',
])
def test_each_eligible_statement_retains_conditions_without_negation(claim):
 assert qa.ranking_eligibility_issues(claim,SOURCE)


def test_unrelated_body_cannot_supply_exception_limit():
 assert not qa.ranking_eligibility_issues('有突出表现可申请。','国家奖学金申请需提交证明材料。')


def test_historical_joint_rank_wording_is_recognized():
 source='对于上一学年学业成绩及综合学业成绩排名没有进入前10%，但达到前30%的学生，如在其他方面表现非常突出，可申请国家奖学金，但需提交详细证明材料。'
 assert qa.ranking_eligibility_issues('表现非常突出可申请。',source)
 assert not qa.ranking_eligibility_issues('学业成绩及综合学业成绩排名均在前30%且表现非常突出，可申请。',source)


@pytest.mark.parametrize('corrected',[True,False])
def test_one_shared_repair_then_reject_remaining_incomplete_eligibility(monkeypatch,corrected):
 row=dict(id='raw-1',document_id='doc-1',text=SOURCE,title='国家奖学金评审实施细则',
  url='https://xsc.njxzc.edu.cn/test.htm',location='网页段落 1',warnings=[])
 monkeypatch.setattr(qa,'campus_retrieve',lambda *a,**k:[row])
 calls=[]
 bad='在其他方面表现非常突出，可以申请国家奖学金。'
 good='学习和综测两项排名均前30%（含）且其他方面表现非常突出，也可申请。'
 def generate(messages):
  calls.append(messages)
  return {'message':{'content':json.dumps({'citations':[{'id':'E1'}],
   'explanation':[{'text':good if corrected and len(calls)==2 else bad,'ids':['E1']}]})}}
 monkeypatch.setattr(qa,'generate',generate)
 answer=qa.campus_answer(None,'未进前10%但有突出表现可以申请国家奖学金吗？',datetime.now(timezone.utc))
 assert len(calls)==2 and len(calls[1])==3 and calls[0]==calls[1][:2]
 assert '排名' in calls[1][-1]['content'] and '原文' in calls[1][-1]['content']
 assert answer['model']['eligibility_repair_attempted']
 assert bool(answer['explanation'])==corrected and answer['sources'][0]['quote']==SOURCE
