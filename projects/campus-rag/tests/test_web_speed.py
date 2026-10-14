from concurrent.futures import ThreadPoolExecutor
from threading import Event
from bs4 import BeautifulSoup
import pytest
from app import web_lookup as web
from app import web_cache
from tests.test_web_lookup import PAGE, URL


@pytest.fixture(autouse=True)
def isolated_cache():
    web_cache.clear()
    yield
    web_cache.clear()


def test_search_is_global_but_nonofficial_urls_cannot_be_answer_evidence(monkeypatch):
    monkeypatch.setattr(web, 'discover', lambda *a: (['https://example.com/advice'], ''))
    monkeypatch.setattr(web, 'fetch_page', lambda *a: pytest.fail('Third party must not be fetched as policy proof'))
    r = web.supplement(None, '2026年普通话报名时间', {'mode': 'insufficient_evidence', 'answer': '未核实'})
    assert r['answer'] == '未核实' and r['web_status'] == 'no_verified_source'
    assert r['web_links'][0]['source_type'] == 'unverified'
    assert r['answer_view']['groups'][0]['url'] == 'https://example.com/advice'


def test_official_coverage_expanded_beyond_original_five_domains():
    assert web.official_url('https://www.moe.gov.cn/notice.htm')
    assert web.official_url('https://jwc.pku.edu.cn/notice.htm')
    assert not web.official_url('https://jwc.pku.edu.cn.evil.com/notice.htm')


def test_new_public_topics_and_generic_questions_have_search_queries():
    assert '助学贷款' in web.public_query('2026年助学贷款申请有哪些条件？')[1]
    assert web.public_query('南京大学奖学金申请有哪些条件？')[1].startswith('南京大学')
    assert web.public_query('公共教育服务如何办理？')[0] == '公共教育服务'
    assert web.public_query('我的手机号13812345678帮我查询张三的证件') is None
    query = web.public_query('我是张三在南京大学，学号202612345678，普通话报名条件')[1]
    assert '张三' not in query and '学号' not in query and '我是' not in query


def test_short_cache_preserves_source_text_and_read_time(monkeypatch):
    calls = []
    monkeypatch.setattr(web, '_fetch_page', lambda u: calls.append(u) or (u, PAGE, '2026-10-12T00:00:00+00:00'))
    a = web.extract_source(URL, '2026年下半年四六级什么时候报名？', '全国大学英语四、六级考试')
    b = web.extract_source(URL, '2026年下半年四六级什么时候报名？', '全国大学英语四、六级考试')
    assert len(calls) == 1 and not a['cached'] and b['cached']
    assert a['paragraphs'] == b['paragraphs'] and a['excerpt'] == b['excerpt']
    assert a['checked_at'] == b['checked_at']
    assert '不得重复缴费' in b['paragraphs'][-1]


def test_expired_source_cache_fetches_changed_original(monkeypatch):
    now = [0]
    monkeypatch.setattr(web_cache.time, 'monotonic', lambda: now[0])
    version = [PAGE]
    monkeypatch.setattr(web, '_fetch_page', lambda u: (u, version[0], str(now[0])))
    web.fetch_page(URL)
    now[0] = 61
    version[0] = PAGE.replace('不得重复缴费', '以新的考点通知为准')
    _, soup = web.fetch_page(URL)
    assert '以新的考点通知为准' in soup.get_text() and not soup.__dict__['_campus_cached']


def test_same_key_concurrent_requests_share_one_fetch():
    started, release = Event(), Event()
    calls = []
    def load():
        calls.append(1); started.set(); assert release.wait(2)
        return {'text': '完整条件与例外'}
    with ThreadPoolExecutor(max_workers=3) as pool:
        a = pool.submit(web_cache.cached, 'test', 'url', 60, load)
        assert started.wait(2)
        b = pool.submit(web_cache.cached, 'test', 'url', 60, load)
        release.set()
        first, second = a.result(), b.result()
    assert len(calls) == 1 and first[0] == second[0]
    first[0]['text'] = 'caller changed'
    assert web_cache.cached('test', 'url', 60, load)[0]['text'] == '完整条件与例外'


def test_cached_page_still_obeys_current_teacher_withdrawal(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.db import Base, Document
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    monkeypatch.setattr(web, 'discover', lambda *a: ([URL], ''))
    monkeypatch.setattr(web, '_fetch_page', lambda u: (u, PAGE, '2026-10-12T00:00:00+00:00'))
    with Session(engine) as session:
        assert web.supplement(session, '2026年下半年四六级什么时候报名？', {'mode': 'insufficient_evidence'})['web_sources']
        session.add(Document(id='withdrawn', title='撤回', source_url=URL, visibility='private', status='withdrawn', sha256='x', raw_name='x', mime='.html'))
        session.commit()
        r = web.supplement(session, '2026年下半年四六级什么时候报名？', {'mode': 'insufficient_evidence', 'answer': '无依据'})
        assert r['web_status'] == 'no_verified_source' and 'web_sources' not in r
