import pytest
from app.conversation import resolve_context
from app.time_scope import version_matches, remaining_clarification
from app.semester import interpret_semester


@pytest.mark.parametrize('topic', ['普通话报名时间', '英语六级报名时间', '第九届传智杯报名时间', '计算机等级考试报名时间'])
def test_relative_year_progress_and_correction_for_multiple_topics(topic):
    first = resolve_context('今年的', [{'question': topic}], current_year=2031)
    assert '2031' in first.question and '今年' not in first.question
    second = resolve_context('2031年', [{'question': first.question}], current_year=2031)
    assert '2031' in second.question and topic in second.question
    third = resolve_context('秋季', [{'question': second.question}], current_year=2031)
    assert '2031年秋季' in third.question
    corrected = resolve_context('不是2031，是2030年', [{'question': third.question}], current_year=2031)
    assert '2030年秋季' in corrected.question and '2031' not in corrected.question


def test_calendar_filter_uses_actual_semester_not_both_range_years():
    assert version_matches('2026年普通话报名时间', '2025-2026-2学期普通话报名通知')
    assert not version_matches('2026年普通话报名时间', '2025-2026-1学期普通话报名通知')
    assert version_matches('2026年普通话报名时间', '2026年秋季普通话报名通知')
    assert not version_matches('2026年普通话报名时间', '普通话报名通知')


def test_remaining_question_never_reasks_known_year():
    s = remaining_clarification('2031年英语六级报名时间', ['2031年春季英语六级通知', '2031年秋季英语六级通知'])
    assert '2031年春季还是秋季' in s and '补充年份' not in s


@pytest.mark.parametrize('text', ['2026年第一学期', '2026年第二学期', '2031年第一学期'])
def test_calendar_term_requires_clarification_without_season(text):
    assert interpret_semester(text).clarification


def test_academic_year_clear_and_topic_switch_discards_previous_semester():
    c = resolve_context('2026—2027学年第一学期', [{'question': '普通话报名时间'}])
    assert '2026年秋季' in c.question and not c.clarification
    switched = resolve_context('英语六级报名时间', [{'question': c.intent_question}])
    assert '普通话' not in switched.question and '2026' not in switched.question


def test_ambiguous_term_can_be_completed_without_looping():
    a = resolve_context('2026年第一学期', [{'question': '普通话报名时间'}])
    assert a.clarification and '普通话' in a.question
    b = resolve_context('春季', [{'question': a.question}])
    assert not b.clarification and '2026年春季' in b.question


def test_isolated_lookup_filters_year_then_asks_only_remaining_season():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.db import Base, Document, Chunk
    from app.source_lookup import source_lookup
    from app.answer_view import build_answer_view
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        evidence = []
        for n, title in enumerate(['2025-2026-1学期普通话报名通知', '2025-2026-2学期普通话报名通知', '2026年秋季普通话报名通知']):
            d = Document(id=str(n), title=title, source_url=f'https://jwc.njxzc.edu.cn/{n}', sha256=str(n)*64,
                raw_name='test.html', mime='.html', visibility='public', status='pending_review', kind='notice', version=1, warnings=[])
            session.add(d)
            for k, text in enumerate(['报名对象', '仅限在校生。', '报名时间', '按本通知规定时间报名。', '注意事项', '缴费成功不退款。']):
                session.add(Chunk(id=f'{n}-{k}',document_id=d.id,text=text,location=f'网页段落 {k+1} / 字符 1'))
            evidence.append({'document_id': d.id, 'title': title, 'url': d.source_url, 'sha256': d.sha256, 'version': 1, 'status':d.status, 'warnings': []})
        session.commit()
        q = resolve_context('今年的', [{'question': '普通话报名时间'}], current_year=2026).question
        r = source_lookup(session, q, evidence)
        assert r['document_ids'] == ['1', '2'] and r['model']['generation_skipped']
        view = build_answer_view(session, q, r)
        assert '2026年春季还是秋季' in view['paragraphs'][0]
        assert all('2025-2026-1' not in g['title'] for g in view['groups'])
        selected = source_lookup(session, '2026年秋季普通话报名时间', evidence)
        assert selected['document_ids'] == ['2'] and not selected['lookup_needs_version']
        assert all(d.status == 'pending_review' for d in session.query(Document).all())
