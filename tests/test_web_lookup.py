import httpx
import pytest
from bs4 import BeautifulSoup
from app import web_lookup as web

URL = 'https://www.neea.edu.cn/html1/report/2609/1-1.htm'
PAGE = '''<html><h1>2026年下半年全国大学英语四、六级考试报名工作启动</h1>
<div id="Content"><p>二、报名时间</p><p>各考点报名时间不同，请考生按所在学校规定时间登录报名网站完成资格审核、笔试报名缴费及口试报名缴费。</p><p>特殊情况请联系所在学校，不得重复缴费。</p></div></html>'''


@pytest.mark.parametrize('u', ['http://www.neea.edu.cn/a', 'https://neea.edu.cn.evil.com/a', 'https://evilneea.edu.cn/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://u:p@www.neea.edu.cn/a', 'https://www.neea.edu.cn:8008/a', 'file:///secret'])
def test_untrusted_urls_blocked(u):
    assert not web.official_url(u)


def test_redirect_to_private_host_never_requested(monkeypatch):
    requests = []
    real = httpx.Client
    def transport(req):
        requests.append(str(req.url))
        return httpx.Response(302, headers={'location': 'http://127.0.0.1:8008/api/admin/documents'})
    monkeypatch.setattr(web.httpx, 'Client', lambda **kw: real(transport=httpx.MockTransport(transport), **kw))
    with pytest.raises(ValueError):
        web.fetch_page(URL)
    assert requests == [URL]


def test_matching_original_and_following_exception_retained(monkeypatch):
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup(PAGE, 'html.parser')))
    s = web.extract_source(URL, '2026年下半年四六级什么时候报名？', '全国大学英语四、六级考试')
    assert '各考点报名时间不同' in s['excerpt']
    assert s['paragraphs'][-1].endswith('不得重复缴费。')


@pytest.mark.parametrize('q', ['2027年下半年四六级什么时候报名？', '2026年上半年四六级什么时候报名？', '普通话报名时间'])
def test_wrong_year_season_or_topic_not_answer_evidence(monkeypatch, q):
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup(PAGE, 'html.parser')))
    topic = web.public_query(q)[0]
    assert web.extract_source(URL, q, topic) is None


def test_official_academic_title_maps_second_term_to_calendar_spring(monkeypatch):
    page = '<h1>2025-2026-2学期普通话报名通知</h1><article><p>普通话考生报名时间：2026年3月31日至4月3日。</p><p>名额有限，额满即止。</p></article>'
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup(page, 'html.parser')))
    url = 'https://jwc.njxzc.edu.cn/notice.htm'
    source = web.extract_source(url, '2026年春季普通话什么时候报名？', '普通话')
    assert source and '额满即止' in '\n'.join(source['paragraphs'])
    assert web.extract_source(url, '2025年春季普通话什么时候报名？', '普通话') is None
    assert web.extract_source(url, '2026年秋季普通话什么时候报名？', '普通话') is None


def test_search_directory_or_login_page_is_not_evidence(monkeypatch):
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup('<h1>2026年四六级报名</h1><a>摘要：9月报名</a>', 'html.parser')))
    assert web.extract_source(URL, '2026年四六级报名', '全国大学英语四、六级考试') is None


def test_search_query_never_contains_personal_details():
    _, q = web.public_query('我是张三，学号202612345678，电话13812345678，普通话报名需要什么材料')
    assert all(v not in q for v in ('张三', '12345678', '138'))


def test_no_network_for_clarification_reliable_local_or_disabled(monkeypatch):
    monkeypatch.setattr(web, 'discover', lambda *a: pytest.fail('Unexpected internet call'))
    for mode in ('clarification', 'verified_source_lookup', 'grounded_explanation', 'database'):
        result = {'mode': mode, 'answer': '保留本地回答'}
        assert web.supplement(None, '普通话报名', result) is result
    r = {'mode': 'insufficient_evidence'}
    assert web.supplement(None, '普通话报名', r, enabled=False) is r


def test_official_aliases_do_not_repeat_the_same_answer(monkeypatch):
    monkeypatch.setattr(web, 'discover', lambda *a: ([URL, URL.replace('www.', 'cet.')], ''))
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup(PAGE, 'html.parser')))
    r = web.supplement(None, '2026年下半年四六级什么时候报名', {'mode': 'insufficient_evidence', 'sources': []})
    assert len(r['web_sources']) == 1
    assert r['answer'].count('各考点报名时间不同') == 1


@pytest.mark.parametrize('u', ['https://oa.njxzc.edu.cn/a', 'https://lib.njxzc.edu.cn/login', 'https://jwc.njxzc.edu.cn/a?token=secret'])
def test_account_routes_and_credentials_are_not_public_sources(u):
    assert not web.official_url(u)


def test_failed_verification_preserves_abstention_not_search_snippet(monkeypatch):
    monkeypatch.setattr(web, 'discover', lambda *a: ([URL], '服务受限'))
    monkeypatch.setattr(web, 'extract_source', lambda *a: None)
    r = web.supplement(None, '2027年普通话报名时间', {'mode': 'insufficient_evidence', 'answer': '无法核实', 'sources': []})
    assert r['answer'] == '无法核实' and not r['sources']
    assert r['web_status'] == 'no_verified_source'


def test_national_source_never_becomes_school_deadline(monkeypatch):
    monkeypatch.setattr(web, 'discover', lambda *a: ([URL], ''))
    monkeypatch.setattr(web, 'fetch_page', lambda u: (u, BeautifulSoup(PAGE, 'html.parser')))
    r = web.supplement(None, '2026年下半年四六级什么时候报名', {'mode': 'insufficient_evidence', 'answer': '无法核实', 'sources': [], 'elapsed_seconds': 1})
    assert r['mode'] == 'official_web_lookup' and '不等于晓庄' in r['answer']
    assert r['answer_view']['groups'][0]['url'] == URL
    assert not r['sources'] and not r['document_ids']


def test_known_withdrawn_source_cannot_reappear_via_search(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.db import Base, Document
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Document(id='private', title='私有', source_url=URL, visibility='private', status='withdrawn', sha256='x', raw_name='x', mime='.html'))
        session.commit()
        monkeypatch.setattr(web, 'discover', lambda *a: ([URL], ''))
        monkeypatch.setattr(web, 'extract_source', lambda *a: pytest.fail('Private original reached network fetch'))
        r = web.supplement(session, '2026年下半年四六级报名', {'mode': 'insufficient_evidence', 'answer': '无依据'})
        assert r['web_status'] == 'no_verified_source'
