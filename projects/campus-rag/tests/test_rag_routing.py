from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, Document, Chunk, Competition
import app.rag as rag


@pytest.fixture
def session():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with sessionmaker(engine, expire_on_commit=False)() as store:
        yield store
    engine.dispose()


def add(session, title, text, *, year=None, competition=False, visibility='public', status='pending_review'):
    doc = Document(id=str(uuid4()), title=title, sha256=uuid4().hex * 2,
                   raw_name='fixture.txt', mime='.txt', kind='notice' if competition else 'knowledge',
                   visibility=visibility, status=status, source_url='https://www.njxzc.edu.cn/fixture.htm')
    session.add(doc)
    session.flush()
    chunk = Chunk(id=str(uuid4()), document_id=doc.id, text=text, location='网页段落 1 / 字符 1')
    session.add(chunk)
    comp = None
    if competition:
        comp = Competition(id=str(uuid4()), name=title, document_id=doc.id, year=year, fields={})
        session.add(comp)
    session.commit()
    return doc, comp, chunk


@pytest.mark.parametrize('question', ['数学建模什么时候截止？', '2026年数学建模什么时候截止？', '可以跨专业组队吗？'])
def test_unnamed_event_questions_request_scope_before_retrieving_a_rule(session, monkeypatch, question):
    add(session, '2026年五一数学建模竞赛', '截止时间4月12日20:00，允许跨专业组队。', year=2026, competition=True)
    add(session, '2026年全国大学生数学建模竞赛', '截止时间8月1日，组队要求另见通知。', year=2026, competition=True)
    def forbidden(*args, **kwargs):
        raise AssertionError('An unnamed event must not silently select a deadline or eligibility rule')
    import app.campus_qa as campus
    monkeypatch.setattr(campus, 'campus_answer', forbidden)
    result = rag.answer(session, question, use_model=False)
    assert result['mode'] == 'clarification' and result['sources'] == []
    assert '限定赛事' in result['answer'] and '年度' in result['answer']
    assert '4月12日' not in result['answer'] and '允许跨专业' not in result['answer']


def test_selected_event_still_answers_unnamed_team_question(session):
    doc, comp, rule = add(session, '2026年五一数学建模竞赛', '竞赛允许跨专业组队，每队不超过3人。', year=2026, competition=True)
    result = rag.answer(session, '可以跨专业组队吗？', competition_id=comp.id, use_model=False)
    assert result['competition_id'] == comp.id
    assert result['sources'] and all(s['document_id'] == doc.id for s in result['sources'])


@pytest.mark.parametrize('with_document_scope', [False, True])
def test_real_new_campus_service_drops_old_competition_question_and_scope(session, monkeypatch, with_document_scope):
    old_doc, old, _ = add(session, '2024年五一数学建模竞赛', '报名提交参赛论文材料。', year=2024, competition=True)
    new_doc, _, _ = add(session, '2026年关于线上办理档案查询利用业务的通告', '线上档案查询可通过电子邮件申请。')
    history = [{'question': '2024年五一数学建模竞赛需要什么材料？', 'competition_id': old.id}]
    if with_document_scope:
        history[0]['document_ids'] = [old_doc.id]
    import app.campus_qa as campus
    original = campus.campus_answer
    received = []

    def capture(*args, **kwargs):
        received.append(kwargs.get('history'))
        return original(*args, **kwargs)

    monkeypatch.setattr(campus, 'campus_answer', capture)
    result = rag.answer(session, '那2026年线上档案查询怎么申请？', history=history, use_model=False)
    assert received == [None]
    assert result.get('competition_id') is None
    assert result['sources'] and all(s['document_id'] == new_doc.id for s in result['sources'])
    assert history[0]['competition_id'] == old.id  # Caller history is unchanged.


@pytest.mark.parametrize('question', ['那需要什么材料？', '那2026年需要什么材料？'])
def test_vague_followup_keeps_existing_competition_scope(session, question):
    doc, comp, _ = add(session, '2026年五一数学建模竞赛', '报名需要提交参赛论文材料。', year=2026, competition=True)
    add(session, '线上档案查询办理通告', '申请材料包括身份证复印件。')
    result = rag.answer(session, question, history=[{'question': '2026年五一数学建模报名？',
                                                  'competition_id': comp.id}], use_model=False)
    assert result['competition_id'] == comp.id
    assert result['sources'] and all(s['document_id'] == doc.id for s in result['sources'])


def test_explicit_new_competition_after_followup_prefix_still_wins(session):
    _, old, _ = add(session, '五一数学建模竞赛', '报名材料为参赛论文。', year=2026, competition=True)
    doc, new, _ = add(session, '职业规划大赛', '成长赛道报名材料为生涯发展报告。', year=2026, competition=True)
    result = rag.answer(session, '那职业规划大赛成长赛道需要什么材料？',
                        history=[{'question': '五一数学建模竞赛材料？', 'competition_id': old.id}], use_model=False)
    assert result['competition_id'] == new.id
    assert result['sources'] and all(s['document_id'] == doc.id for s in result['sources'])


@pytest.mark.parametrize('visibility,status', [('private', 'pending_review'), ('public', 'withdrawn'), ('public', 'superseded')])
def test_hidden_or_retired_titles_do_not_create_public_topic_switch(session, visibility, status):
    _, old, _ = add(session, '五一数学建模竞赛', '报名需要材料。', year=2026, competition=True)
    hidden, _, _ = add(session, '线上档案查询通告', '档案查询的秘密材料。', visibility=visibility, status=status)
    result = rag.answer(session, '那线上档案查询需要什么材料？',
                        history=[{'question': '五一数学建模竞赛材料？', 'competition_id': old.id}], use_model=False)
    assert result['competition_id'] == old.id
    assert all(s['document_id'] != hidden.id for s in result['sources'])


@pytest.mark.parametrize('question', ['不是2026年，我问2024年职业规划大赛报名材料？',
                                      '不用2026年，2024年职业规划大赛报名材料？',
                                      '2024年职业规划大赛报名材料，我问2024年，不是2026年。'])
def test_negated_year_is_not_selected_and_repeated_positive_year_is_one_version(session, question):
    _, correct, _ = add(session, '2024年职业规划大赛', '2024年度报名材料为生涯发展报告。', year=2024, competition=True)
    add(session, '2026年职业规划大赛', '2026年度报名材料为求职简历。', year=2026, competition=True)
    resolved = rag.resolve_competition(session, question)
    assert resolved['status'] == 'matched' and resolved['competition_id'] == correct.id
    result = rag.answer(session, question, use_model=False)
    assert result['competition_id'] == correct.id
    assert result['sources'] and all(s['document_id'] == correct.document_id for s in result['sources'])


@pytest.mark.parametrize('cohort', ['2024级', '2024年级'])
def test_student_cohort_is_not_an_annual_version(session, cohort):
    _, comp, _ = add(session, '2026年职业规划大赛', '报名材料须核实，参赛对象为在校学生。', year=2026, competition=True)
    question = f'{cohort}职业规划大赛报名需要什么材料？'
    assert rag.resolve_competition(session, question)['competition_id'] == comp.id
    assert rag.answer(session, question, use_model=False)['competition_id'] == comp.id


@pytest.mark.parametrize('selected_year', [None, 2026])
def test_multiple_positive_years_do_not_pick_first_or_supplied_filter(session, selected_year):
    add(session, '2024年职业规划大赛', '报名材料为报告。', year=2024, competition=True)
    add(session, '2026年职业规划大赛', '报名材料为简历。', year=2026, competition=True)
    result = rag.resolve_competition(session, '2024年和2026年职业规划大赛报名材料？', year=selected_year)
    assert result['status'] == 'ambiguous' and '多个年度' in result['message']


@pytest.mark.parametrize('mode', ['automatic', 'selected', 'history', 'database-list'])
def test_answer_rejects_multiple_years_before_any_single_version_search(session, monkeypatch, mode):
    _, comp, _ = add(session, '2026年职业规划大赛', '报名材料为报告。', year=2026, competition=True)

    def forbidden(*args, **kwargs):
        raise AssertionError('Must not query one annual version for a multi-year request')

    monkeypatch.setattr(rag, 'retrieve', forbidden)
    monkeypatch.setattr(rag, 'search_competitions', forbidden)
    kwargs = {'use_model': False}
    question = '2024年和2026年职业规划大赛报名材料？'
    if mode == 'selected':
        kwargs['competition_id'] = comp.id
    elif mode == 'history':
        kwargs['history'] = [{'question': '职业规划大赛报名？', 'competition_id': comp.id}]
        question = '那2024年和2026年需要什么材料？'
    elif mode == 'database-list':
        question = '2024年和2026年所有竞赛有哪些？'
    result = rag.answer(session, question, **kwargs)
    assert result['mode'] == 'insufficient_evidence' and result['sources'] == []
    assert '多个年度' in result['answer']


def test_explicit_year_filter_conflict_does_not_override_question(session):
    _, comp, _ = add(session, '2026年职业规划大赛', '报名材料为简历。', year=2026, competition=True)
    question = '2024年职业规划大赛报名材料？'
    assert rag.resolve_competition(session, question, year=2026)['status'] == 'unavailable'
    result = rag.answer(session, question, competition_id=comp.id, year=2026, use_model=False)
    assert result['mode'] == 'insufficient_evidence' and not result['sources']
    assert '年度不一致' in result['answer']


def test_changed_followup_year_cannot_reuse_wrong_year_competition(session):
    _, comp, _ = add(session, '2026年职业规划大赛', '报名材料为简历。', year=2026, competition=True)
    result = rag.answer(session, '那2027年需要什么材料？',
                        history=[{'question': '2026年职业规划大赛报名？', 'competition_id': comp.id}], use_model=False)
    assert result['mode'] == 'insufficient_evidence' and not result['sources']


def test_multiple_event_names_stay_ambiguous_after_year_filter(session):
    add(session, '2026年五一数学建模竞赛', '报名材料为参赛论文。', year=2026, competition=True)
    add(session, '2025年职业规划大赛', '报名材料为简历。', year=2025, competition=True)
    result = rag.resolve_competition(session, '2026年五一数学建模和职业规划大赛报名材料？')
    assert result['status'] == 'ambiguous' and '多项赛事' in result['message']
