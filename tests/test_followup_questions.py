import pytest
from app.followup_questions import suggest_questions


def response(**kwargs):
    return {'query_time': '2026-10-11T19:00:00+08:00', 'sources': [], **kwargs}


def test_mandarin_topic_generates_specific_questions_without_model_call():
    rows = suggest_questions('普通话', response())
    assert [r['question'] for r in rows] == [
        '2026年普通话报名时间是什么？', '2026年普通话考试报名有哪些要求？', '2026年普通话考试如何报名？']
    assert all(r['competition_id'] is None for r in rows)


def test_answered_intent_and_previous_questions_are_not_repeated():
    rows = suggest_questions('普通话什么时候报名？', response(), [{'question': '2026年普通话考试报名有哪些要求？'}])
    assert [r['question'] for r in rows] == ['2026年普通话考试如何报名？', '2026年普通话考试需要准备什么材料？', '2026年普通话考试在哪里参加？']


def test_explicit_historical_year_is_retained():
    assert suggest_questions('2025年普通话', response())[0]['question'].startswith('2025年')


def test_mandarin_followups_keep_known_semester_and_year_for_every_intent():
    rows = suggest_questions('普通话', response(sources=[{'title': '2026年秋季学期普通话水平测试报名通知'}]))
    assert all(row['question'].startswith('2026年普通话') for row in rows)
    historical = suggest_questions('普通话', response(sources=[{'title': '2022年秋季普通话通知'}]))
    assert all(row['question'].startswith('2026年普通话') for row in historical)
    mixed = suggest_questions('2026年普通话', response(sources=[{'title': '2026年春季普通话'}, {'title': '2026年秋季普通话'}]))
    assert all(row['question'].startswith('2026年普通话') for row in mixed)


def test_current_topic_wins_over_other_source_titles():
    rows = suggest_questions('档案需要什么材料？', response(sources=[{'title': '普通话通知'}]))
    assert all('档案' in r['question'] for r in rows)


def test_exhausted_topic_still_offers_source_clarifications():
    history = [{'question': '2026年' + text} for text in ['普通话考试如何报名？', '普通话考试报名有哪些要求？',
        '普通话考试需要准备什么材料？', '普通话考试在哪里参加？']]
    rows = suggest_questions('普通话什么时候报名？', response(), history)
    assert rows and all(r['question'].startswith('这些资料') for r in rows)


def test_elliptical_followup_uses_public_response_topic_only():
    rows = suggest_questions('需要什么材料？', response(sources=[{'title': '普通话考试通知'}]))
    assert all('普通话' in r['question'] for r in rows)


def test_event_suggestions_keep_actual_event_scope():
    rows = suggest_questions('数学建模', response(competition_id='event-1'))
    assert len(rows) == 3 and all(r['competition_id'] == 'event-1' for r in rows)
    assert all('这个赛事' in r['question'] for r in rows)


def test_other_events_and_public_topics_stay_related():
    rows = suggest_questions('ACM报名要求？', response(competition_id='event-acm'))
    assert all(r['competition_id'] == 'event-acm' for r in rows)
    rows = suggest_questions('如何请假？', response(sources=[{'title': '学生请假办法'}]))
    assert rows and all('学生请假办法' in r['question'] for r in rows)
    rows = suggest_questions('学校的校训是什么？', response())
    assert all('校训' in r['question'] for r in rows)


@pytest.mark.parametrize('question', ['你好', '未收录的事项', '<img src=x onerror=alert(1)>'])
def test_no_evidence_has_questions_not_fabricated_answer_or_unsafe_echo(question):
    rows = suggest_questions(question, response(mode='insufficient_evidence'))
    assert rows and all('<' not in r['question'] for r in rows)


def test_chat_api_adds_suggestions_without_changing_answer_or_permissions(monkeypatch):
    import app.main as main
    original = response(answer='原回答', warnings=['待审核'], document_ids=['public-1'])
    monkeypatch.setattr(main, 'answer', lambda *a, **k: dict(original))
    result = main.chat(main.Chat(question='普通话'), session=None)
    assert {k: result[k] for k in original} == original
    assert len(result['followup_questions']) == 3
    assert main.admin.__name__ == 'admin'
