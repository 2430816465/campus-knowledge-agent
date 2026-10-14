from datetime import datetime, timezone
import pytest
from app.campus_qa import requested_years, without_annual_mentions, campus_retrieve, campus_answer
from tests.test_campus_qa import factory, add


@pytest.mark.parametrize('question,expected',[
    ('2026本科招生住宿费是多少？',{'2026'}),
    ('2025与2026创新训练截止日比较',{'2025','2026'}),
    ('不是2025，我问2026科研结项',{'2026'}),
    ('2027年考试，我是2026级，学号2026123456',{'2027'}),
    ('2026 年级学生怎么办？',set()),
    ('学校标识码4132011460是什么？',set()),
    ('项目编号：2026的资料？',set()),
    ('2026-10-10之后可以报名吗？',{'2026'}),
])
def test_natural_year_references_remain_distinct_from_ids_and_cohorts(question,expected):
    assert requested_years(question)==expected


def test_year_without_suffix_does_not_return_old_or_unrelated_same_year():
    with factory()() as session:
        old,_=add(session,'招生住宿费800元。',title='2025年普通本科招生章程')
        old.sha256='b'*64
        new,_=add(session,'招生住宿费1200元。',title='2026年普通本科招生章程')
        other,_=add(session,'科研住宿费600元。',title='2026年科研交流通知')
        other.sha256='c'*64
        session.commit()
        hits=campus_retrieve(session,'2026普通本科招生章程住宿费多少？')
        assert hits and {h['document_id'] for h in hits}=={new.id}
        assert not campus_retrieve(session,'2027普通本科招生章程住宿费多少？')


def test_followup_with_abbreviated_new_year_removes_old_scope(monkeypatch):
    import app.campus_search as search
    captured=[]
    def retrieve(session,question,**kw):
        captured.append((question,kw.get('document_ids')))
        return [],[]
    monkeypatch.setattr(search,'retrieve_public',retrieve)
    campus_answer(None,'那2026呢？',datetime.now(timezone.utc),
        history=[{'question':'2025创新训练截止日期？','document_ids':['old']}],use_model=False)
    assert captured[-1][1] is None
    assert '2025' not in captured[-1][0] and '2026' in captured[-1][0]
    assert without_annual_mentions('2026级学生，项目编号2025，2024招生')=='2026级学生，项目编号2025， 招生'
