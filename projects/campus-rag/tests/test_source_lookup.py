from datetime import datetime, timezone
from unittest.mock import patch
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.db import Base, Document, Chunk
from app.source_lookup import lookup_topic, source_lookup


@pytest.fixture
def case():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        doc = Document(id='d', title='2026年秋季普通话水平测试报名通知',
            source_url='https://jwc.njxzc.edu.cn/test', sha256='a'*64,
            raw_name='test.html', mime='.html', visibility='public', status='pending_review',
            kind='notice', version=1, published_at='2026-10-09', warnings=[])
        texts = ['一、报名对象', '仅限在籍在校本科生，不含其他人员。', '二、报名时间',
                 '10月12日14:00至10月14日14:00；额满即止。', '三、注意事项',
                 '未缴费报名无效，缴费成功不退款。']
        session.add(doc)
        session.add_all(Chunk(id=str(i), document_id='d', text=t,
            location=f'网页段落 {i+1} / 字符 1') for i,t in enumerate(texts))
        session.commit()
        row = {'id':'0', 'document_id':'d', 'text':texts[0], 'title':doc.title,
            'url':doc.source_url, 'sha256':doc.sha256, 'version':1, 'published_at':doc.published_at,
            'status':doc.status, 'warnings':[], 'location':'网页段落 1 / 字符 1'}
        yield session, doc, row, texts


@pytest.mark.parametrize('q', ['普通话什么时候报名？', '2026年秋季普通话考试报名有哪些要求？',
    '档案查询如何办理？', '线上档案查询需要到校办理吗？', '学籍档案查询需要提交什么材料？'])
def test_closed_intents(q):
    assert lookup_topic(q)


@pytest.mark.parametrize('q', ['我大一，普通话能报名吗？', '2025和2026年普通话报名条件有什么区别？',
    '普通话现在还能报名吗？', '不是档案查询如何办理？', '档案查询如何办理并解释政策？',
    '档案派遣到哪了？', '申诉期间学校停止执行吗？', '普通话报名管理规定第十九条是什么？'])
def test_reasoning_and_other_topics_keep_model(q):
    assert lookup_topic(q) is None


def test_full_notice_unmodified_and_ordered(case):
    session, doc, row, texts = case
    result = source_lookup(session, '普通话什么时候报名？', [row])
    assert result['mode'] == 'verified_source_lookup'
    assert result['model']['generation_skipped'] is True
    assert result['explanation'] == []
    assert [r['quote'] for r in result['sources']] == texts
    assert all(t in result['answer'] for t in texts)
    assert result['document_ids'] == ['d']


def test_specific_semester_excludes_other_term_without_cutting_selected_original(case):
    session, doc, row, texts = case
    # An otherwise matching source shell for spring must not enter autumn output.
    other = {**row, 'document_id':'spring', 'title':'2025-2026-2学期普通话报名通知'}
    result = source_lookup(session, '2026年秋季普通话什么时候报名？', [row,other])
    assert result['mode'] == 'verified_source_lookup'
    assert result['document_ids'] == ['d']
    assert [s['quote'] for s in result['sources']] == texts
    assert source_lookup(session, '2026年春季普通话什么时候报名？', [row]) is None


def test_closed_explicit_version_lookup_recovers_from_body_synonym_miss(case):
    session, doc, row, texts = case
    result = source_lookup(session, '2026年秋季普通话报名有哪些要求？', [])
    assert result['mode'] == 'verified_source_lookup'
    assert [s['quote'] for s in result['sources']] == texts
    assert source_lookup(session, '普通话报名有哪些要求？', []) is None
    assert source_lookup(session, '2026年秋季普通话报名有哪些要求？', [], document_ids=[]) is None
    assert source_lookup(session, '2026年秋季普通话报名有哪些要求？', [], document_ids=['another']) is None
    doc.visibility = 'private';session.commit()
    assert source_lookup(session, '2026年秋季普通话报名有哪些要求？', []) is None


def test_title_fallback_still_revalidates_private_ancestor_and_whole_notice(case):
    session, doc, row, texts = case
    doc.parent_id='missing';session.commit()
    result = source_lookup(session, '2026年秋季普通话报名有哪些要求？', [])
    assert result['mode'] == 'insufficient_evidence' and not result['sources']


@pytest.mark.parametrize('change', ['visibility', 'status', 'parent', 'sha256', 'version', 'url', 'title'])
def test_current_access_and_source_identity_fail_closed(case, change):
    session, doc, row, _ = case
    if change == 'visibility': doc.visibility='private'
    elif change == 'status': doc.status='withdrawn'
    elif change == 'parent': doc.parent_id='missing'
    elif change == 'sha256': doc.sha256='b'*64
    elif change == 'version': doc.version=2
    elif change == 'url': doc.source_url='https://jwc.njxzc.edu.cn/replaced'
    else: doc.title='另一个普通话报名通知'
    session.commit()
    result = source_lookup(session, '普通话什么时候报名？', [row])
    assert result is None or result['sources'] == []


@pytest.mark.parametrize('problem', ['huge', 'many', 'ocr', 'duplicate_location', 'error', 'stub'])
def test_never_cut_or_infer_incomplete_sources(case, problem):
    session, doc, row, _ = case
    chunk=session.get(Chunk,'5')
    if problem == 'huge': chunk.text='限额。'*4000+'但符合特殊条件者除外。'
    elif problem == 'many':
        session.add_all(Chunk(id=f'extra{i}', document_id='d', text='末尾例外。',
            location=f'网页段落 {i+7} / 字符 1') for i in range(100))
    elif problem == 'ocr': chunk.location='Word 图像 1 / OCR 1'
    elif problem == 'duplicate_location': chunk.location='网页段落 1 / 字符 1'
    elif problem == 'error': doc.error='partial extraction'
    else: session.get(Chunk,'2').text='附件目录'
    session.commit()
    assert source_lookup(session, '普通话什么时候报名？', [row]) is None


def test_missing_second_version_never_returns_partial_notice(case):
    session, doc, row, _ = case
    other={**row, 'document_id':'other', 'title':'2025年秋季普通话报名通知'}
    assert source_lookup(session, '普通话什么时候报名？', [row, other]) is None


def test_archive_preserves_holiday_and_paper_sequence_and_separates_versions(case):
    session, doc, row, _ = case
    doc.title='关于线上办理档案查询利用业务的通告'
    texts=['业务内容：仅限中文，不含应届毕业生。', '办理指南：填写申请表及身份证正反面。',
        '日常业务受理后5个工作日；收到电子材料回复后自行下单。',
        '寒暑假每周四，仅提供电子版；收到邮件后一周内回复。']
    for chunk in session.scalars(select(Chunk)):
        session.delete(chunk)
    session.add_all(Chunk(id=str(i), document_id='d', text=t,
        location=f'网页段落 {i+1} / 字符 1') for i,t in enumerate(texts))
    other=Document(id='old',title='学籍档案查询业务办理流程',source_url='https://music.njxzc.edu.cn/test',
        sha256='b'*64,raw_name='old.html',mime='.html',visibility='public',status='pending_review',
        kind='notice',version=1,published_at='2024-12-25',warnings=[])
    session.add(other)
    session.add(Chunk(id='old-c',document_id='old',text='业务内容及办理指南：申请时注明纸质材料，快递到付。',
        location='网页段落 1 / 字符 1'))
    session.commit()
    row={**row,'title':doc.title}
    old={**row,'id':'old-c','document_id':'old','title':other.title,'url':other.source_url,
        'sha256':other.sha256,'published_at':other.published_at}
    result=source_lookup(session,'档案查询如何办理？',[row,old])
    assert all(t in result['answer'] for t in texts)
    assert '不能将不同版本的办理方式拼接使用' in result['answer']
    assert result['document_ids']==['d','old']
    assert result['sources'][-1]['quote']=='业务内容及办理指南：申请时注明纸质材料，快递到付。'


def test_integration_skips_only_generation_and_rechecks_retrieved_scope(case):
    from app.campus_qa import campus_answer
    session, _, row, _ = case
    with patch('app.campus_search.retrieve_public', return_value=([row], ['原检索提醒'])), \
         patch('app.campus_qa.generate', side_effect=AssertionError('lookup must not generate')):
        result=campus_answer(session,'普通话什么时候报名？',datetime.now(timezone.utc),document_ids=['d'])
    assert result['mode']=='verified_source_lookup'
    assert '原检索提醒' in result['warnings']


def test_withdrawal_after_read_does_not_return_partial_notice(case):
    from app.campus_qa import revalidate_sources
    session, doc, row, _=case
    def withdraw(session, selected):
        doc.visibility='private'
        session.commit()
        return revalidate_sources(session, selected)
    with patch('app.campus_qa.revalidate_sources', side_effect=withdraw):
        result=source_lookup(session,'普通话什么时候报名？',[row])
    assert result['mode']=='insufficient_evidence' and not result['sources']
