import pytest
from app.topic_guard import named_subjects, filter_evidence
from app.answer_relevance import relevance_issues, reject_irrelevant_answer
from app.conversation import resolve_context
from app import web_lookup as web
from bs4 import BeautifulSoup


def bad_result(title='关于做好2026年下半年全国大学英语四、六级考试报名工作的通知'):
    return {'mode': 'grounded_explanation',
        'answer': '传智杯报名时间最新为2026年4月17日12:00至4月19日16:00。',
        'explanation': [{'text': '传智杯报名时间未在提供文本中明确说明。', 'ids': ['x']}],
        'sources': [{'id': 'x', 'title': title, 'text': '报名时间为4月17日至4月19日。'}],
        'answer_view': {'paragraphs': ['错误答案'], 'groups': []}}


@pytest.mark.parametrize('q,title', [
    ('传智杯报名时间最新', '四六级考试报名通知'),
    ('2026年毕业生什么时候答辩', '2026届毕业生微专业报名通知'),
    ('蓝桥杯报名截止时间', '传智杯报名通知'),
    ('第九届“传智杯”报名时间', '普通话测试报名通知'),
])
def test_actual_topic_mismatch_never_published(q, title):
    r = bad_result(title)
    issues = relevance_issues(q, r)
    assert 'named_subject_missing_from_cited_evidence' in issues
    rejected = reject_irrelevant_answer(r, issues)
    assert not rejected['sources'] and not rejected['explanation']
    assert not rejected['answer_view']['groups']


def test_each_cited_source_checked_not_answer_keyword():
    r = bad_result('传智杯报名通知')
    assert not relevance_issues('传智杯报名时间', r)
    r['sources'].append({'title': '四六级报名通知', 'text': '报名时间9月1日'})
    assert relevance_issues('传智杯报名时间', r)


def test_real_parent_can_identify_generic_attachment():
    r = bad_result('附件.pdf')
    r['answer_view']['groups'] = [{'title': '第九届传智杯通知', 'quotes': [{'ref': 1, 'text': '报名时间9月1日'}]}]
    assert not relevance_issues('传智杯报名时间', r)


def test_unverified_link_cannot_identify_local_evidence():
    r = bad_result()
    r['answer_view']['groups'] = [{'title': '传智杯通知', 'source_type': 'unverified', 'quotes': [{'ref': 1}]}]
    assert relevance_issues('传智杯报名时间', r)


@pytest.mark.parametrize('q', ['2026年毕业生什么时候答辩', '第九届传智杯报名时间', '蓝桥杯报名时间'])
def test_new_explicit_subject_does_not_inherit_previous_question(q):
    c = resolve_context(q, [{'question': '传智杯报名时间最新'}], current_year=2026)
    assert c.question == q and not c.inherited


def test_elliptical_question_still_inherits():
    c = resolve_context('那条件呢', [{'question': '传智杯报名时间最新'}])
    assert '传智杯' in c.question and c.inherited


def test_retrieval_filter_runs_on_original_not_question_or_response():
    rows = [{'title': '四六级通知', 'text': '报名时间9月1日'},
            {'title': '第九届“传智杯”报名通知', 'text': '报名时间9月1日'}]
    assert filter_evidence(None, '传智杯报名时间最新', rows) == rows[1:]
    assert filter_evidence(None, '什么时候报名', rows) == rows


def test_rejected_grounded_answer_enters_web_fallback(monkeypatch):
    calls = []
    url = 'https://jwc.njxzc.edu.cn/match.htm'
    monkeypatch.setattr(web, 'discover', lambda *args: (calls.append(args) or [url], ''))
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup('<h1>第九届传智杯报名通知</h1><article><p>报名时间为2026年7月至11月，请核对具体赛道。</p></article>', 'html.parser')))
    r = web.supplement(None, '传智杯报名时间最新', bad_result())
    assert calls and r['mode'] == 'official_web_lookup'
    assert '四六级' not in str(r['answer_view'])


def test_disabled_web_still_rejects_wrong_topic(monkeypatch):
    monkeypatch.setattr(web, 'discover', lambda *a: pytest.fail('disabled'))
    assert web.supplement(None, '传智杯报名时间最新', bad_result(), enabled=False)['mode'] == 'insufficient_evidence'


def test_defense_is_not_registration_date():
    assert relevance_issues('毕业生什么时候答辩', {'mode': 'grounded_explanation',
        'answer': '报名时间为4月17日。', 'sources': [{'title': '毕业答辩通知'}]})


def test_defense_keyword_in_title_does_not_validate_invented_date():
    r = {'mode': 'grounded_explanation', 'answer': '答辩时间为4月17日。',
         'sources': [{'title': '毕业答辩通知', 'text': '报名时间为4月17日。'}]}
    assert 'defense_date_missing_from_cited_original' in relevance_issues('毕业生什么时候答辩', r)
    r['sources'][0]['text'] = '答辩安排：5月20日进行。'
    assert not relevance_issues('毕业生什么时候答辩', r)


@pytest.mark.parametrize('original', ['提交答辩稿截止日期为4月5日。', '学院组织开题答辩日期：11月4日。'])
def test_submission_or_proposal_date_is_not_final_defense(original):
    r = {'mode': 'grounded_explanation', 'answer': '答辩时间为4月5日。',
         'sources': [{'title': '2026届毕业论文工作细则', 'text': original}]}
    assert relevance_issues('2026年毕业生什么时候答辩', r)


def test_latest_named_event_searches_even_with_existing_explanation(monkeypatch):
    calls = []
    monkeypatch.setattr(web, 'discover', lambda *a: (calls.append(a) or [], ''))
    r = web.supplement(None, '传智杯报名时间最新', bad_result('传智杯报名通知'))
    assert calls and r['lookup_trace']['discovery_requested']
    assert '最新' in calls[0][1]


def test_organizer_timeline_month_precision_not_invented_deadline(monkeypatch):
    url = 'https://www.boxuegu.com/match/'
    soup = BeautifulSoup('<title>传智杯官网</title><h1>申请预约说明</h1><div class="box6"><div class="text"><span><b>2026.7-11 报名期</b><p>可选择赛道进行报名</p></span><span>针对第九届传智杯大赛</span></div></div>', 'html.parser')
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, soup))
    source = web.extract_source(url, '传智杯报名时间最新', '传智杯')
    assert source and '2026.7-11' in source['excerpt']
    assert source['title'] == '传智杯官网'
    assert '18日' not in source['excerpt']
    assert web.extract_source(url, '第八届传智杯报名时间', '传智杯') is None
    assert web.extract_source(url, '2025年传智杯报名时间', '传智杯') is None
    assert not web.official_url('https://www.boxuegu.com/account/')


def test_original_body_identifies_event_with_generic_site_heading(monkeypatch):
    url = 'https://www.lzjtu.edu.cn/info/1062/15912.htm'
    soup = BeautifulSoup('<h1>学校官网</h1><article><p>关于举办第九届传智杯的通知</p><p>报名时间为2026年9月1日至11月18日。</p></article>', 'html.parser')
    monkeypatch.setattr(web, 'discover', lambda *a: ([url], ''))
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, soup))
    r = web.supplement(None, '传智杯报名时间最新', {'mode': 'insufficient_evidence'})
    assert r['mode'] == 'official_web_lookup'
    assert '第九届传智杯' in r['web_sources'][0]['context']
    assert '11月18日' in r['answer']


def test_defense_lookup_defaults_to_our_school_not_other_university(monkeypatch):
    q = '2026年毕业生什么时候答辩'
    assert '南京晓庄学院' in web.public_query(q)[1]
    soup = BeautifulSoup('<h1>2026年毕业答辩安排</h1><article><p>答辩时间为2026年5月1日。</p></article>', 'html.parser')
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, soup))
    assert web.extract_source('https://www.lzjtu.edu.cn/info/1.htm', q, '答辩') is None


def test_defense_date_below_long_introduction_is_not_omitted(monkeypatch):
    soup = BeautifulSoup('<h1>美术学院2026届毕业论文工作细则</h1><article><p>' + '指导思想。'*120 + '</p><p>论文答辩时间：拟定2026年5月12日。</p></article>', 'html.parser')
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, soup))
    source = web.extract_source('https://art.njxzc.edu.cn/1.htm', '2026年毕业生什么时候答辩', '答辩')
    assert source and '拟定2026年5月12日' in source['excerpt']


def test_latest_does_not_mix_older_edition(monkeypatch):
    urls = ['https://www.boxuegu.com/match/', 'https://www.lzjtu.edu.cn/info/1.htm']
    monkeypatch.setattr(web, 'discover', lambda *a: (urls, ''))
    def source(u, *a):
        edition = '九' if 'boxuegu' in u else '八'
        return {'title': '第'+edition+'届传智杯', 'url': u, 'paragraphs': ['报名时间2026年7月'],
                'excerpt': '报名时间2026年7月', 'checked_at': 'now', 'cached': False, 'national': True}
    monkeypatch.setattr(web, 'extract_source', source)
    r = web.supplement(None, '传智杯报名时间最新', {'mode': 'insufficient_evidence'})
    assert len(r['web_sources']) == 1 and '九' in r['web_sources'][0]['title']
    assert r['lookup_trace']['superseded_sources'][0]['edition'] == 8


def test_real_student_page_social_practice_defense_is_not_graduation(monkeypatch):
    q = '2026年毕业生什么时候答辩'
    assert '毕业论文' in web.public_query(q)[1]
    assert '南京晓庄学院 美术学院' in web.public_query('美术学院2026届毕业论文什么时候答辩')[1]
    title = '我校成功举办2026年暑期社会实践十佳团队答辩交流会'
    text = '9月15日下午，南京晓庄学院2026年暑期社会实践十佳团队答辩交流会举行。'
    soup = BeautifulSoup(f'<h1>{title}</h1><article><p>{text}</p></article>', 'html.parser')
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, soup))
    assert web.extract_source('https://tw.njxzc.edu.cn/3e/73/c9284a147059/page.htm', q, '答辩') is None
    assert filter_evidence(None, q, [{'document_id': 'x', 'title': title, 'text': text}]) == []
    r = {'mode': 'official_web_lookup', 'answer': text,
         'web_sources': [{'title': title, 'paragraphs': [text]}]}
    assert 'graduate_defense_scope_missing_from_cited_evidence' in relevance_issues(q, r)
