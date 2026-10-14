"""CPU regressions of real imported web modules; no production DB or model."""
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
import pytest
from app import web_lookup as web
from app.qa_date_guard import exam_date_intent, answer_date_issues

NOW = datetime(2026, 10, 12, tzinfo=timezone(timedelta(hours=8)))
URL = 'https://cet.neea.edu.cn/html1/report/2609/test.htm'
PAGE = '''<h1>2026年下半年全国大学英语四、六级考试报名工作启动</h1>
<article><p>笔试考试时间为2026年12月12日。</p>
<p>口试考试时间为2026年11月21日、11月22日。</p>
<p>各考点报名时间不同，请按学校规定办理。</p></article>'''


def old_answer():
    return {'mode': 'grounded_explanation', 'answer': '2025年上半年报名后24小时内缴费。',
            'explanation': [{'text': '2025年上半年报名后24小时内缴费。', 'ids': ['E1']}],
            'sources': [{'id': 'E1', 'text': '报名后24小时内缴费。'}],
            'answer_view': {'paragraphs': ['旧缴费答案'], 'groups': []}}


def install(monkeypatch, page=PAGE):
    calls = []
    monkeypatch.setattr(web, 'discover', lambda topic, query: (calls.append(query) or [URL], ''))
    monkeypatch.setattr(web, 'fetch_page', lambda url: (url, BeautifulSoup(page, 'html.parser')))
    return calls


def test_bad_grounded_answer_replaced_through_actual_supplement(monkeypatch):
    calls = install(monkeypatch)
    result = web.supplement(None, '四六级什么时候考试？', old_answer(), now=NOW)
    assert len(calls) == 1 and '2026' in calls[0] and '日期' in calls[0]
    assert result['mode'] == 'official_web_lookup'
    assert '12月12日' in result['answer'] and '11月21日' in result['answer']
    assert '缴费' not in result['answer'] and not result['explanation']
    assert result['answer_view']['groups'][0]['url'] == URL
    assert not answer_date_issues('四六级什么时候考试？', result, NOW)


@pytest.mark.parametrize('enabled', [False, True])
def test_no_source_never_revives_old_answer(monkeypatch, enabled):
    install(monkeypatch, '<h1>2026年下半年四六级报名</h1><article><p>报名后缴费。</p></article>')
    result = web.supplement(None, '四六级什么时候考试？', old_answer(), enabled=enabled, now=NOW)
    assert result['mode'] == 'insufficient_evidence'
    assert '2025' not in result['answer'] and '旧缴费' not in str(result['answer_view'])


@pytest.mark.parametrize('q,answer', [('普通话什么时候报名？','报名时间为2026年9月1日。'), ('四六级报名有哪些条件？','报名对象为本校学生。'), ('四六级什么时候缴费？','报名后24小时内缴费。'), ('档案查询需要什么材料？','需要身份证原件和申请表。')])
def test_non_exam_date_unchanged(monkeypatch, q, answer):
    monkeypatch.setattr(web, 'discover', lambda *a: pytest.fail('unexpected search'))
    result = {'mode': 'grounded_explanation', 'answer': answer}
    assert web.supplement(None, q, result, now=NOW) is result


def test_requested_historical_year_not_silently_replaced(monkeypatch):
    calls = install(monkeypatch)
    result = web.supplement(None, '2025年下半年四六级什么时候考试？', old_answer(), now=NOW)
    assert '2025' in calls[0] and result['mode'] == 'insufficient_evidence'


def test_mixed_years_do_not_search(monkeypatch):
    monkeypatch.setattr(web, 'discover', lambda *a: pytest.fail('ambiguous query'))
    result = web.supplement(None, '2025年和2026年四六级什么时候考试？', old_answer(), now=NOW)
    assert result['mode'] == 'insufficient_evidence'


@pytest.mark.parametrize('q', ['英语四级口试什么时候考试？', '英语六级口试什么时候考试？'])
def test_level_specific_query_must_not_report_both_levels_dates(monkeypatch, q):
    install(monkeypatch)
    result = web.supplement(None, q, old_answer(), now=NOW)
    assert not ('11月21日' in result['answer'] and '11月22日' in result['answer'])


@pytest.mark.parametrize('level,day,other', [('四级', '21', '22'), ('六级', '22', '21')])
def test_independent_oral_table_rows_keep_level_relationship(monkeypatch, level, day, other):
    page = '''<h1>2026年下半年全国大学英语四、六级考试报名工作启动</h1><article>
    <table><tr><td>四级口试</td><td>11月21日</td></tr>
    <tr><td>六级口试</td><td>11月22日</td></tr></table></article>'''
    calls = install(monkeypatch, page)
    result = web.supplement(None, f'英语{level}口试什么时候考试？', old_answer(), now=NOW)
    assert result['mode'] == 'official_web_lookup'
    assert f'11月{day}日' in result['answer'] and f'11月{other}日' not in result['answer']
    assert calls[0] == f'2026年下半年全国大学英语{level}口试日期'
