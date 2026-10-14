from datetime import datetime
import pytest
from app.answer_relevance import relevance_issues, reject_irrelevant_answer
from app import web_lookup as web
from bs4 import BeautifulSoup


@pytest.mark.parametrize('question,answer', [
    ('计算机等级考试什么时候考试？', '报名时间为2026年9月1日。'),
    ('转专业什么时候申请？', '审批结果在2026年10月20日公布。'),
    ('普通话报名需要什么条件？', '登录平台，填写信息，提交申请。'),
    ('奖学金申请如何办理？', '申请对象仅限全日制在校学生。'),
    ('普通话报名截止时间？', '发布时间为2026年10月1日。'),
    ('助学金现在还可以申请吗？', '2025年申请时间为9月1日至9月30日。'),
])
def test_explicit_conflicting_field_rejected(question, answer):
    r = {'mode': 'grounded_explanation', 'answer': answer, 'answer_view': {'paragraphs': [answer]}}
    issues = relevance_issues(question, r, datetime(2026, 10, 12))
    assert issues
    rejected = reject_irrelevant_answer(r, issues)
    assert rejected['mode'] == 'insufficient_evidence'
    assert answer not in str(rejected['answer_view'])


@pytest.mark.parametrize('question,answer', [
    ('计算机等级考试什么时候考试？', '笔试于2026年9月20日举行。'),
    ('转专业什么时候申请？', '申请时间为2026年10月1日至10月20日。'),
    ('普通话报名需要什么条件？', '报名对象为本校全日制在校学生。'),
    ('奖学金申请如何办理？', '登录平台，填写申请表并提交证明。'),
    ('2025年助学金什么时候申请？', '申请时间为2025年9月1日至9月30日。'),
    ('助学金现在还可以申请吗？', '只找到2025年历史通知，不能确认当前是否开放。'),
    ('普通话报名有哪些条件和流程？', '报名对象为学生，登录平台后填写申请。'),
])
def test_relevant_and_historical_or_qualified_answers_preserved(question, answer):
    assert not relevance_issues(question, {'mode': 'grounded_explanation', 'answer': answer}, datetime(2026, 10, 12))


def test_wrong_field_grounded_answer_enters_real_supplement(monkeypatch):
    calls = []
    url = 'https://jwc.njxzc.edu.cn/test.htm'
    monkeypatch.setattr(web, 'discover', lambda *a: (calls.append(a) or [url], ''))
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup('<h1>2026年转专业通知</h1><article><p>申请时间为2026年10月1日至10月20日。</p></article>', 'html.parser')))
    r = web.supplement(None, '2026年转专业什么时候申请？', {'mode': 'grounded_explanation', 'answer': '审批结果10月30日公布。'})
    assert calls and r['mode'] == 'official_web_lookup'
    assert '10月20日' in r['answer'] and '10月30日' not in r['answer']
