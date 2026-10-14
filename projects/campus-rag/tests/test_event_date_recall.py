import pytest
from app.campus_qa import campus_retrieve
from app.event_date_recall import literal_event_matches,event_year_compatible
from tests.test_appeal_retrieval import session_factory,add


def notices(session):
    title='关于公布2025届学生毕业资格与学士学位授予资格审核工作日程的通知'
    calendar,rows=add(session,title+' / '+title+'.pdf',
        ['十八 6月20日 毕业典礼','十九 6月25日 发放毕业证书'],published_at='2025-05-21')
    for n in range(8):
        add(session,'环境科学学院2025届毕业论文设计工作通知'+str(n),
            ['毕业论文属于必修课程8学分，主要安排在第七八学期完成。','论文定稿提交截止2025年4月20日。'],published_at='2024-10-25')
    add(session,'2026届毕业典礼安排',['6月12日毕业典礼。'],published_at='2026-06-01')
    return calendar,rows


def test_body_event_date_can_recall_long_titled_schedule_instead_of_thesis():
    with session_factory()() as s:
        calendar,rows=notices(s)
        hits=campus_retrieve(s,'2025届毕业典礼安排在哪一天？',limit=4)
        assert hits and hits[0]['id']==rows[0].id
        assert hits[0]['document_id']==calendar.id and '6月20日' in hits[0]['text']


def test_explicit_document_scope_is_not_eliminated_by_other_titles():
    with session_factory()() as s:
        calendar,rows=notices(s)
        hits=campus_retrieve(s,'2025届毕业典礼安排在哪一天？',document_ids=[calendar.id])
        assert hits and hits[0]['id']==rows[0].id
        assert {h['document_id'] for h in hits}=={calendar.id}


@pytest.mark.parametrize('boundary',['private','withdrawn','private_parent','wrong_year'])
def test_event_body_recall_cannot_bypass_access_or_annual_version(boundary):
    with session_factory()() as s:
        calendar,rows=notices(s)
        if boundary=='private':calendar.visibility='private'
        if boundary=='withdrawn':calendar.status='withdrawn'
        if boundary=='private_parent':
            parent,_=add(s,'公开入口',[])
            parent.visibility='private';calendar.parent_id=parent.id
        if boundary=='wrong_year':calendar.title=calendar.title.replace('2025','2024');calendar.published_at='2024-05-21'
        s.commit()
        hits=campus_retrieve(s,'2025届毕业典礼安排在哪一天？')
        assert not any(h['document_id']==calendar.id for h in hits)


def test_explicit_scope_still_obeys_year_and_permission():
    with session_factory()() as s:
        calendar,_=notices(s)
        assert campus_retrieve(s,'2026届毕业典礼安排在哪一天？',document_ids=[calendar.id])==[]
        calendar.visibility='private';s.commit()
        assert campus_retrieve(s,'2025届毕业典礼安排在哪一天？',document_ids=[calendar.id])==[]


def test_other_event_date_is_not_inferred_from_a_matching_title():
    with session_factory()() as s:
        calendar,rows=notices(s)
        calendar_chunk=s.get(type(rows[0]),rows[0].id);calendar_chunk.text='毕业典礼待通知。'
        s.commit()
        assert literal_event_matches(s,'2025届毕业典礼安排在哪一天？',[calendar.id])==([], {})


def test_academic_year_does_not_override_explicit_event_year():
    with session_factory()() as s:
        calendar,rows=notices(s)
        wrong,_=add(s,'2025-2026学年第2学期第15周会议安排',
            ['06月12日 星期五 上午 南京晓庄学院2026年学生毕业典礼暨学位授予仪式（时间待定）'],
            published_at='2026-06-08')
        hits=campus_retrieve(s,'2025届毕业典礼安排在哪一天？')
        assert hits[0]['id']==rows[0].id
        assert wrong.id not in {h['document_id'] for h in hits}
        assert campus_retrieve(s,'2025届毕业典礼安排在哪一天？',document_ids=[wrong.id])==[]
        hits=campus_retrieve(s,'2026届毕业典礼安排在哪一天？',document_ids=[wrong.id])
        assert hits and hits[0]['document_id']==wrong.id


@pytest.mark.parametrize('body,years,expected',[
    ('2026年学生毕业典礼6月12日',{2025},False),
    ('2025届毕业典礼6月20日',{2025},True),
    ('2025级学生参加毕业典礼6月20日',{2026},True),
    ('2025-2026学年毕业典礼6月20日',{2025},True),
    ('2026/6/12毕业典礼',{2025},False),
    ('2025年和2026年毕业典礼分别举行',{2025,2026},True),
])
def test_event_body_annual_boundary(body,years,expected):
    assert event_year_compatible(body,['毕业典礼'],years) is expected


@pytest.mark.parametrize('documents,chunks',[(1,129),(33,1)])
def test_overbroad_event_recall_fails_closed(documents,chunks):
    with session_factory()() as s:
        ids=[]
        for n in range(documents):
            doc,_=add(s,'2025年日程'+str(n),['6月20日毕业典礼']*chunks)
            ids.append(doc.id)
        assert literal_event_matches(s,'2025届毕业典礼在哪一天？',ids)==([], {})


def test_negated_event_question_cannot_promote_literal_match():
    with session_factory()() as s:
        doc,_=add(s,'2025年日程',['6月20日毕业典礼'])
        assert literal_event_matches(s,'不是毕业典礼，发证在哪一天？',[doc.id])==([], {})
