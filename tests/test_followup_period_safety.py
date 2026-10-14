import pytest

from app.followup_questions import suggest_questions
from app.conversation import resolve_context


@pytest.mark.parametrize('question', ['2026年普通话报名时间', '2026年第一学期普通话报名时间'])
def test_unconfirmed_season_is_not_inferred_from_one_source(question):
    result = {'query_time': '2026-10-12T11:00:00+08:00',
              'sources': [{'title': '2026年秋季普通话报名通知'},
                          {'title': '2025-2026-2学期普通话报名通知'}]}
    rows = suggest_questions(question, result)
    assert rows
    assert all('春季' not in row['question'] and '秋季' not in row['question'] for row in rows)


def test_relative_year_recommendations_do_not_choose_latest_source_season():
    context = resolve_context('今年的', [{'question': '普通话什么时候报名？'}], current_year=2031)
    rows = suggest_questions(context.question, {
        'query_time': '2031-01-01T00:00:00+08:00',
        'sources': [{'title': '2031年秋季普通话报名通知'}]})
    assert all(row['question'].startswith('2031年普通话') for row in rows)


@pytest.mark.parametrize('season', ['春季', '秋季'])
def test_confirmed_season_survives_conflicting_source_titles(season):
    rows = suggest_questions(f'2026年{season}普通话报名时间', {
        'sources': [{'title': '2025年秋季普通话通知'}]})
    assert rows and all(row['question'].startswith(f'2026年{season}普通话') for row in rows)


def test_new_topic_suggestions_do_not_inherit_source_semester():
    rows = suggest_questions('档案查询如何办理？', {
        'sources': [{'title': '2026年秋季普通话通知'}]})
    assert rows and all('普通话' not in row['question'] and '秋季' not in row['question'] for row in rows)
