import pytest
from app.db import Chunk, Document, Candidate
from app.rag import resolve_competition, answer
from app.notice_source_group import source_group_scope
from test_rag_routing import session, add


def group(session):
    pairs = []
    for path in ('first', 'second'):
        doc, comp, chunk = add(session, '关于举办第十七届全国大学生市场调查与分析大赛校赛的通知',
                               '附件3：培训会通知.pdf', competition=True)
        doc.sha256, doc.mime = 'a'*64, '.html'
        doc.source_url = f'https://jwc.njxzc.edu.cn/{path}/page.htm'
        doc.published_at = '2026-10-08'
        doc.attachments = [{'title': '附件3：培训会通知.pdf', 'url': 'https://jwc.njxzc.edu.cn/file.pdf',
                            'status': 'not_imported' if path == 'first' else 'pending_review'}]
        pairs.append((doc, comp, chunk))
    child, _, fact = add(session, '附件3：培训会通知.pdf',
                          '第1期2026年11月7—8日，第2期2026年12月5—6日。')
    child.parent_id, child.mime, child.sha256 = pairs[1][0].id, '.pdf', 'b'*64
    child.source_url, fact.location = 'https://jwc.njxzc.edu.cn/file.pdf', '第 1 页 / 段落 14 / 字符 1'
    session.commit()
    return pairs, child, fact


def sources(pairs):
    return [{'document_id': d.id, 'url': d.source_url, 'sha256': d.sha256} for d, _, _ in pairs]


def test_full_name_routes_to_actual_attachment_without_merging_or_review_changes(session):
    pairs, child, fact = group(session)
    question = '关于举办第十七届全国大学生市场调查与分析大赛校赛的通知，培训会第1期、第2期的时间？'
    resolved = resolve_competition(session, question)
    assert resolved['status'] == 'same_original_sources'
    assert len(resolved['notice_sources']) == 2
    result = answer(session, question, use_model=False)
    assert any(s['id'] == fact.id and s['url'] == child.source_url for s in result['sources'])
    assert len(result['notice_sources']) == 2
    assert all(d.status == 'pending_review' for d, _, _ in pairs)
    assert child.status == 'pending_review' and child.parent_id == pairs[1][0].id


@pytest.mark.parametrize('change', ['hash', 'title', 'date', 'host', 'year', 'track', 'links',
                                    'private', 'withdrawn', 'review', 'fields', 'candidate'])
def test_different_originals_or_authority_are_not_treated_as_one(session, change):
    pairs, _, _ = group(session)
    doc, comp, chunk = pairs[1]
    if change == 'hash': doc.sha256 = 'c'*64
    elif change == 'title': doc.title += '更正'
    elif change == 'date': doc.published_at = '2026-10-09'
    elif change == 'host': doc.source_url = 'https://music.njxzc.edu.cn/page.htm'
    elif change == 'year': comp.year = 2025
    elif change == 'track': comp.track = '另一赛道'
    elif change == 'links': doc.attachments = []
    elif change == 'private': doc.visibility = 'private'
    elif change == 'withdrawn': doc.status = 'withdrawn'
    elif change == 'review': comp.review_status = 'reviewed'
    elif change == 'fields': comp.fields = {'deadline': '2026-11-01'}
    elif change == 'candidate': session.add(Candidate(id='reviewed', competition_id=comp.id,
                    chunk_id=chunk.id, field='deadline', value={}, quote='审核依据', status='confirmed'))
    session.commit()
    resolved = resolve_competition(session, '第十七届全国大学生市场调查与分析大赛校赛培训会时间？')
    assert resolved['status'] != 'same_original_sources'


@pytest.mark.parametrize('state', ['private', 'withdrawn', 'partial_parse'])
def test_descendant_access_and_parse_state_remain_live(session, state):
    pairs, child, fact = group(session)
    original_sources = sources(pairs)
    if state == 'private': child.visibility = state
    else: child.status = state
    session.commit()
    assert child.id not in source_group_scope(session, original_sources)
    pairs[0][0].visibility = 'private'
    session.commit()
    assert source_group_scope(session, original_sources) == []


def test_scope_includes_conversion_descendant_but_never_same_hash_orphan(session):
    pairs, child, fact = group(session)
    child.status = 'converted'
    converted, _, _ = add(session, '转换后的通知.docx', '参会对象：指导教师。')
    converted.parent_id = child.id
    orphan, _, _ = add(session, converted.title, '不相关内容。')
    orphan.sha256 = converted.sha256
    session.commit()
    scope = source_group_scope(session, sources(pairs))
    assert converted.id in scope and child.id not in scope and orphan.id not in scope


def test_empty_explicit_scope_cannot_fall_back_to_global_or_history(session):
    from datetime import datetime, timezone
    from app.campus_qa import campus_answer
    _, child, _ = group(session)
    result = campus_answer(session, '那培训会时间？', datetime.now(timezone.utc), use_model=False,
                           history=[{'question': '培训会时间？', 'document_ids': [child.id]}], document_ids=[])
    assert result['sources'] == []


def test_source_changed_after_resolution_is_not_reused(session):
    pairs, _, _ = group(session)
    original_sources = sources(pairs)
    pairs[0][0].sha256 = 'c'*64
    session.commit()
    assert source_group_scope(session, original_sources) == []


def test_scoped_pdf_keeps_heading_and_immutable_conditions(session):
    from app.campus_qa import campus_retrieve
    pairs, child, fact = group(session)
    fact.text = '各高等院校相关院系领导、骨干教师、大赛指导教师。'
    fact.location = '第 2 页 / 段落 2 / 字符 1'
    session.add(Chunk(id='pdf-heading', document_id=child.id, text='四、参会对象',
                      location='第 2 页 / 段落 1 / 字符 1'))
    session.commit()
    scope = source_group_scope(session, sources(pairs))
    rows = campus_retrieve(session, '第十七届全国大学生市场调查与分析大赛培训会参会对象包括哪些人员？', document_ids=scope)
    hit = next(r for r in rows if r['id'] == fact.id)
    assert hit['context'] == '四、参会对象' and hit['text'] == fact.text
    assert hit['location'] == fact.location
