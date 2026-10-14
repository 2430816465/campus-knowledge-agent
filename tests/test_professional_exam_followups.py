import pytest

from app.exam_identity import professional_exam
from app.followup_questions import suggest_questions


@pytest.mark.parametrize('name', ['英语专业四级', '专业英语四级', '专四', 'TEM4', 'tem-4'])
def test_professional_four_does_not_recommend_cet(name):
    rows = suggest_questions(f'2026年{name}考试8:28还允许进入吗？', {
        'sources': [{'title': '全国大学英语四六级报名通知'}]})
    assert rows
    assert all('英语专业四级考试' in r['question'] and '四六级' not in r['question'] for r in rows)
    assert all(r['question'].startswith('2026年') for r in rows)


@pytest.mark.parametrize('name', ['英语专业八级', '专业英语八级', '专八', 'TEM8'])
def test_professional_eight_keeps_identity(name):
    rows = suggest_questions(f'2025年{name}报名条件', {})
    assert rows and all('2025年英语专业八级考试' in r['question'] for r in rows)


def test_two_professional_levels_are_not_silently_reduced():
    assert professional_exam('专四和专八') == '英语专业四级和八级考试'


@pytest.mark.parametrize('question', ['2026年大学英语四级报名', '四六级考试', 'TEM40', 'ATEM4'])
def test_other_or_invalid_exam_names_do_not_claim_professional_exam(question):
    assert professional_exam(question) is None


def test_explicit_new_topic_beats_professional_exam_context():
    rows = suggest_questions('2026年英语专业四级；追问：档案查询如何办理？', {})
    assert rows and all('专业四级' not in r['question'] for r in rows)
