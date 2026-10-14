import pytest
from app.conversation import resolve_context


def history(*questions):
    return [{'question': q} for q in questions]


def test_reported_semester_preserves_topic_and_explains_ambiguity():
    c = resolve_context('2026年第一学期', history('普通话什么时候报名？'))
    assert c.inherited and '普通话' in c.question and '2026' in c.question
    assert c.clarification and '年份口径' in c.clarification
    assert not c.note


def test_clarification_then_season_keeps_registration_topic():
    a = resolve_context('2026年第一学期', history('普通话什么时候报名？'))
    b = resolve_context('秋季', history(a.question))
    assert b.question == '2026年秋季普通话什么时候报名'
    assert not b.clarification


def test_new_year_replaces_old_year_but_retains_conditions():
    c = resolve_context('2027年秋季', history('2026年春季普通话报名，毕业班能参加吗？'))
    assert '2026' not in c.question and '春季' not in c.question
    assert '毕业班' in c.question and '2027年秋季' in c.question


@pytest.mark.parametrize('question', ['档案查询如何办理？', '图书馆什么时候开放？', '四六级什么时候报名？', '学校的校训是什么？'])
def test_explicit_topic_switch_drops_previous_year_and_subject(question):
    c = resolve_context(question, history('2035年秋季普通话报名时间'))
    assert c.question == question and not c.inherited


def test_multiple_subquestions_preserve_user_conditions():
    c = resolve_context('需要什么材料？', history('2026年秋季普通话报名，毕业班可以吗？'))
    assert all(x in c.question for x in ('2026', '秋季', '普通话', '毕业班', '材料'))
    d = resolve_context('线上可以吗？', history(c.question))
    assert '材料' in d.question and '线上' in d.question


def test_no_history_does_not_invent_topic():
    assert resolve_context('2026年第一学期').question == '2026年第一学期'


def test_malformed_and_oversized_history_never_becomes_context():
    c = resolve_context('需要什么材料？', [None, {'question': 12}, {'question': '普通话' * 1000}])
    assert not c.inherited and c.question == '需要什么材料？'


def test_canonical_question_wins_over_raw_question():
    c = resolve_context('需要什么材料？', [{'question': '秋季', 'resolved_question': '2026年秋季普通话报名时间'}])
    assert '2026年秋季普通话' in c.question


def test_rag_ambiguity_never_retrieves_unrelated_notice(monkeypatch):
    import app.rag as rag
    monkeypatch.setattr(rag, '_answer', lambda *a, **k: pytest.fail('Conflicting seasons must clarify before retrieval'))
    r = rag.answer(None, '2026年第一学期春季', history=history('普通话什么时候报名？'))
    assert r['mode'] == 'clarification' and '确认' in r['answer']


def test_rag_resolves_topic_before_competition_routing(monkeypatch):
    import app.rag as rag
    seen = []
    monkeypatch.setattr(rag, '_answer', lambda s,q,*a: seen.append(q) or {'mode': 'test'})
    r = rag.answer(None, '2026年秋季', history=history('普通话什么时候报名？'))
    assert seen == ['2026年秋季普通话什么时候报名']
    assert r['resolved_question'] == seen[0]


def test_thanks_does_not_erase_topic_and_reset_does():
    assert '普通话' in resolve_context('需要什么材料？', history('普通话报名时间', '谢谢')).question
    assert not resolve_context('需要什么材料？', history('普通话报名时间', '清空上下文')).inherited


def test_relative_year_resolved_from_query_clock(monkeypatch):
    import app.rag as rag
    monkeypatch.setattr(rag, '_answer', lambda s,q,*a: {'answer': q})
    r = rag.answer(None, '今年秋季普通话报名时间', at='2026-10-11T23:00:00+08:00')
    assert r['answer'] == '2026年秋季普通话报名时间'


def test_explicit_year_correction_does_not_keep_rejected_year():
    c = resolve_context('不是2026，是2025年', history('2026年秋季普通话报名时间'))
    assert c.question == '2025年秋季普通话报名时间'


def test_return_to_named_earlier_topic_recovers_its_year():
    c = resolve_context('回到刚才的普通话，需要什么材料？', history('2026年秋季普通话什么时候报名？', '档案查询如何办理？'))
    assert c.question.rstrip('？?') == '2026年秋季普通话需要什么材料'
    assert '档案' not in c.question


def test_return_to_topic_twenty_nine_turns_ago_preserves_constraints():
    rows = history('2026年秋季普通话报名，毕业班能参加吗？', *['档案查询如何办理？'] * 29)
    c = resolve_context('回到普通话，需要什么材料？', rows)
    assert all(x in c.question for x in ('2026年秋季', '普通话', '毕业班', '材料'))
    assert '档案' not in c.question
    assert '毕业班' not in resolve_context('回到普通话，需要什么材料？', rows + history('档案查询如何办理？')).question


def test_thirty_turns_do_not_inflate_repeated_focus_or_drop_conditions():
    rows = history('2026年秋季普通话报名，毕业班能参加吗？')
    for _ in range(30):
        c = resolve_context('需要什么材料？', rows)
        assert not c.clarification and all(x in c.question for x in ('毕业班', '2026', '秋季', '普通话', '材料'))
        rows.append({'question': c.question})
    assert len(c.question) < 100


def test_reset_blocks_return_to_previous_private_conversation_scope():
    rows = history('2026年秋季普通话报名，毕业班能参加吗？', '清空上下文', '档案查询如何办理？', '清空上下文')
    c = resolve_context('回到普通话，需要什么材料？', rows)
    assert '2026' not in c.question and '毕业班' not in c.question


def test_api_accepts_thirty_bounded_rounds_and_rejects_oversized_payloads():
    from app.main import Chat
    from pydantic import ValidationError
    rows = history(*['普通话报名时间'] * 30)
    assert len(Chat(question='要求呢？', history=rows).history) == 30
    for bad in (rows + rows[:1], [{'question': 'x' * 2401}], [{'question': '材料', 'document_ids': ['x'] * 101}]):
        with pytest.raises(ValidationError):
            Chat(question='要求呢？', history=bad)


def test_applicant_circumstance_is_not_a_switch_to_graduation_topic():
    c = resolve_context('我是应届毕业生，可以报名吗？', history('2026年秋季普通话报名时间'))
    assert c.inherited and all(x in c.question for x in ('2026年秋季', '普通话', '应届毕业生'))
