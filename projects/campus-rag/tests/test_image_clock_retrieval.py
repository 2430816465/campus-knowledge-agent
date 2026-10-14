from app.campus_qa import campus_retrieve
from app.db import Chunk
from app.ingest import uid
from test_campus_qa import factory, add


def poster(session, visibility='public', status='pending_review'):
    doc, date = add(session, '时间：2025年4月1日（周二）',
                    title='文学院举办“中国通俗文学漫谈”专题讲座',
                    visibility=visibility, status=status)
    doc.mime = '.jpg'
    date.location = 'OCR 框 3 / 置信度 0.991'
    clock = Chunk(id=uid(), document_id=doc.id, text='19:00-20:30',
                  location='OCR 框 4 / 置信度 0.982')
    session.add(clock)
    session.commit()
    return doc, date, clock


def test_standalone_clock_range_is_retrieved_without_joining_date_boxes():
    with factory()() as session:
        doc, date, clock = poster(session)
        hits = campus_retrieve(session, '文学院“中国通俗文学漫谈”讲座海报中的具体日期、开始和结束时间是什么？')
        by_id = {r['id']: r for r in hits}
        assert date.id in by_id and clock.id in by_id
        assert by_id[clock.id]['text'] == '19:00-20:30'
        assert not by_id[clock.id]['supporting_chunks']
        assert by_id[clock.id]['location'] == clock.location


def test_clock_retrieval_respects_year_access_and_question_field():
    with factory()() as session:
        doc, _, clock = poster(session)
        for question in ['2026年文学院中国通俗文学漫谈讲座时间是什么？',
                         '文学院中国通俗文学漫谈讲座主办方是谁？',
                         '另一个完全无关活动几点结束？']:
            assert clock.id not in {r['id'] for r in campus_retrieve(session, question)}
        for field, value in [('visibility', 'private'), ('status', 'withdrawn')]:
            setattr(doc, field, value)
            session.commit()
            assert not campus_retrieve(session, '文学院中国通俗文学漫谈讲座几点开始结束？')
            setattr(doc, field, 'public' if field == 'visibility' else 'pending_review')


def test_invalid_clock_and_non_image_numbers_are_not_promoted():
    with factory()() as session:
        doc, _, clock = poster(session)
        clock.text = '29:00-30:30'
        session.commit()
        question = '文学院中国通俗文学漫谈讲座几点开始结束？'
        assert clock.id not in {r['id'] for r in campus_retrieve(session, question)}
        clock.text, doc.mime = '19:00-20:30', '.html'
        session.commit()
        assert clock.id not in {r['id'] for r in campus_retrieve(session, question)}
