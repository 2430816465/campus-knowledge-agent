import pytest
from app.semester import interpret_semester, semester_key
from app.conversation import resolve_context


@pytest.mark.parametrize('text,key', [
    ('南京晓庄学院2025-2026-1学期普通话水平测试报名通知', (2025, '秋季')),
    ('南京晓庄学院2025-2026-2学期普通话水平测试报名通知', (2026, '春季')),
    ('2026—2027学年第一学期普通话什么时候报名？', (2026, '秋季')),
    ('2026—2027学年第二学期普通话什么时候报名？', (2027, '春季')),
    ('2026年春季普通话报名时间', (2026, '春季')),
    ('2026学年第二学期普通话报名时间', (2027, '春季')),
    ('2026—2027学年春季普通话报名时间', (2027, '春季')),
])
def test_academic_versions_have_explicit_calendar_meaning(text, key):
    result = interpret_semester(text)
    assert semester_key(text) == key and not result.clarification
    assert f'{key[0]}年{key[1]}' in result.question


@pytest.mark.parametrize('text', [
    '2026—2028学年第一学期普通话报名时间',
    '2026年第一学期春季普通话报名时间',
    '2026年第二学期秋季普通话报名时间',
    '第一学期普通话报名时间',
])
def test_conflicting_or_missing_year_needs_clarification(text):
    assert interpret_semester(text).clarification
    assert semester_key(text) is None


def test_second_term_followup_retains_original_academic_year():
    a = resolve_context('2026—2027学年第一学期', [{'question': '普通话什么时候报名？'}])
    b = resolve_context('第二学期呢？', [{'question': a.intent_question}])
    assert b.question == '2027年春季普通话什么时候报名'
    assert '2026—2027学年第二学期' in b.intent_question
    assert not b.clarification


def test_repeated_subject_retains_year_and_applicant_conditions():
    a = resolve_context('普通话报名需要什么条件？', [{'question': '2026年秋季普通话报名，毕业班可以吗？'}])
    assert a.inherited and all(v in a.question for v in ('2026年秋季', '毕业班', '条件'))


def test_relative_year_is_resolved_before_academic_conversion():
    a = resolve_context('今年秋季普通话什么时候报名？', current_year=2026)
    assert a.question.rstrip('？?') == '2026年秋季普通话什么时候报名'
    assert '2026—2027' in a.intent_question and not a.clarification


def test_rag_keeps_academic_intent_separate_from_retrieval_query(monkeypatch):
    import app.rag as rag
    monkeypatch.setattr(rag, '_answer', lambda s,q,*a: {'answer': q})
    a = rag.answer(None, '2026—2027学年第一学期', history=[{'question': '普通话什么时候报名？'}])
    b = rag.answer(None, '第二学期呢？', history=[{'question': a['context_question']}])
    assert a['answer'] == '2026年秋季普通话什么时候报名'
    assert b['answer'] == '2027年春季普通话什么时候报名'
    assert a['context_note'] and b['context_note']


def test_same_subject_focus_keeps_academic_version_and_fast_lookup_shape():
    a = resolve_context('2026—2027学年第一学期', [{'question': '普通话什么时候报名？'}])
    b = resolve_context('普通话报名有哪些要求？', [{'question': a.intent_question}])
    assert b.question == '2026年秋季普通话报名有哪些要求'


def test_calendar_season_also_retains_academic_scope_for_next_term():
    a = resolve_context('2026年秋季普通话什么时候报名？')
    b = resolve_context('第二学期呢？', [{'question': a.intent_question}])
    assert b.question == '2027年春季普通话什么时候报名'


def test_semester_definition_question_does_not_request_an_unnecessary_year():
    a = resolve_context('第一学期是春季还是秋季？')
    assert '第一学期是秋季' in a.clarification and '请补充' not in a.clarification
