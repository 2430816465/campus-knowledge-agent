from unittest.mock import patch
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db import Base, Document
from app.answer_view import build_answer_view, public_url


@pytest.fixture
def case():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        def doc(identity, **kw):
            item = Document(id=identity, title=identity, source_url='https://jwc.njxzc.edu.cn/'+identity,
                sha256='a'*64, raw_name='x', mime='.html', visibility='public', status='pending_review', **kw)
            session.add(item)
            return item
        root = doc('notice', attachments=[{'title':'申请表','url':'https://jwc.njxzc.edu.cn/form.docx'}])
        child = doc('attachment', parent_id='notice')
        session.commit()
        sources = [{'id':'c1','document_id':'notice','quote':'受理后办理；寒暑假另行安排，不含应届毕业生。','status':'pending_review','version':1},
                   {'id':'c2','document_id':'attachment','quote':'附件原文；特殊条件除外。','status':'pending_review','version':1}]
        result = {'answer':'原始兼容接口不变','mode':'grounded_explanation','sources':sources,
                  'explanation':[{'text':'必要条件与例外同时保留。','ids':['c1','c2']}]}
        with patch('app.campus_qa.revalidate_sources',side_effect=lambda s, rows: rows):
            yield session, root, child, result


def test_claims_and_originals_keep_distinct_and_complete(case):
    session, root, child, result = case
    view = build_answer_view(session, '如何办理？', result)
    assert view['paragraphs'] == ['必要条件与例外同时保留。 [1][2]']
    assert result['answer'] == '原始兼容接口不变'
    assert len(view['groups']) == 1
    assert [q['text'] for q in view['groups'][0]['quotes']] == [s['quote'] for s in result['sources']]
    assert len(view['groups'][0]['attachments']) == 2


@pytest.mark.parametrize('field,value',[('visibility','private'),('status','withdrawn'),('parent_id','missing')])
def test_changed_parent_fail_closed(case,field,value):
    session, root, child, result = case
    setattr(root,field,value);session.commit()
    view = build_answer_view(session,'问题',result)
    assert not view['groups'] and result['sources'] == []
    assert '不再公开' in result['answer']


def test_private_attachment_not_reintroduced_by_declared_link(case):
    session, root, child, result = case
    child.visibility = 'private'
    root.attachments = [{'title':'隐藏附件','url':child.source_url}]
    session.commit()
    result['sources'] = result['sources'][:1]
    view = build_answer_view(session,'问题',result)
    assert view['groups'][0]['attachments'] == []


def test_ambiguous_year_requires_clarification_not_historical_date(case):
    session, root, child, result = case
    result.update(mode='verified_source_lookup',lookup_needs_version=True,explanation=[])
    view = build_answer_view(session,'普通话什么时候报名？',result)
    assert '补充年份' in view['paragraphs'][0]
    assert len(view['groups'][0]['quotes']) == 2


def test_lookup_is_labeled_literal_extract_with_whole_exceptions(case):
    session, root, child, result = case
    result.update(mode='verified_source_lookup',explanation=[])
    view = build_answer_view(session,'档案查询如何办理？',result)
    assert '未生成模型解释' in view['label']
    assert any(result['sources'][0]['quote'] in p for p in view['paragraphs'])
    assert '完整条件' in view['paragraphs'][-1]


def test_explicit_calendar_year_and_term_select_exact_named_notice_without_reasking(case):
    session, root, child, result = case
    root.title = '南京晓庄学院2026年秋季学期普通话水平测试报名通知'
    session.commit()
    result.update(mode='verified_source_lookup',lookup_needs_version=True,explanation=[])
    result['sources'][0]['quote'] = '考生报名时间：2026年10月12日至10月14日；额满即止。'
    view = build_answer_view(session,'2026年秋季普通话什么时候报名？',result)
    assert not any('补充年份' in p for p in view['paragraphs'])
    assert any(result['sources'][0]['quote'] in p for p in view['paragraphs'])


def test_registration_time_preview_prioritizes_date_and_capacity_not_fees(case):
    session, root, child, result = case
    texts = ['请在支付时限内完成缴费，否则报名无效。','四、报名时间',
             '考生报名时间：2026年10月12日14:00至10月14日14:00。',
             '测试时间以报名系统和准考证显示为准。','测试均有名额限制，额满即止。']
    result.update(mode='verified_source_lookup',explanation=[],sources=[
        {'id':str(i),'document_id':'notice','quote':t,'status':'pending_review','version':1}
        for i,t in enumerate(texts)])
    view = build_answer_view(session,'普通话什么时候报名？',result)
    assert any(texts[2] in p for p in view['paragraphs'])
    assert any(texts[4] in p for p in view['paragraphs'])
    assert not any(texts[0] in p for p in view['paragraphs'])


def test_academic_second_term_title_matches_calendar_spring_without_wrong_version(case):
    session, root, child, result = case
    root.title = '南京晓庄学院2025-2026-2学期普通话水平测试报名通知'
    session.commit()
    result.update(mode='verified_source_lookup',lookup_needs_version=True,explanation=[])
    result['sources'][0]['quote'] = '报名时间：2026年3月31日中午12:00至4月3日中午12:00；额满即止。'
    view = build_answer_view(session,'2026年春季普通话什么时候报名？',result)
    assert result['sources'][0]['quote'] in view['paragraphs'][0]
    assert not any('补充年份' in p for p in view['paragraphs'])


def test_absent_evidence_does_not_manufacture_answer(case):
    session, _, _, _ = case
    result = {'answer':'未收录相应年度的报名通知，请核对官网。','mode':'insufficient_evidence','sources':[]}
    view = build_answer_view(session,'2035年报名时间？',result)
    assert view['paragraphs'] == [result['answer']] and view['groups'] == []


@pytest.mark.parametrize('url',['javascript:alert(1)','data:text/html,x','https://user:pass@example.com','//example.com','https://[invalid'])
def test_resource_url_rejects_unsafe_values(url):
    assert public_url(url) is None


def test_legacy_competition_retrieval_has_hash_for_live_view_revalidation():
    from app.db import Chunk
    from app.rag import retrieve
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        doc = Document(id='d',title='项目报名通知',source_url='https://jwc.njxzc.edu.cn/a',
            sha256='a'*64,raw_name='a',mime='.html',visibility='public',status='pending_review',kind='notice')
        session.add(doc)
        session.add(Chunk(id='c',document_id='d',text='项目报名仅限本科生，不含研究生。',location='网页段落 1 / 字符 1'))
        session.commit()
        rows, _ = retrieve(session,'项目报名条件',semantic=False)
        assert rows[0]['sha256'] == doc.sha256
        result = {'answer':'旧版摘录','mode':'evidence_fallback','sources':[{**rows[0],'quote':rows[0]['text']}]}
        view = build_answer_view(session,'项目报名条件',result)
        assert view['groups'][0]['quotes'][0]['text'] == rows[0]['text']
        assert '可靠结论' in view['paragraphs'][0]
        doc.sha256 = 'b'*64;session.commit()
        assert build_answer_view(session,'项目报名条件',result)['groups'] == []
