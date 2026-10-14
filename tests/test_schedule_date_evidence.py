"""Schedule rows are separate events, while their wrapped text stays intact."""
from app.evidence_windows import pdf_windows
from app.pdf_sections import pdf_sections
from tests.test_evidence_windows import row
from datetime import datetime,timezone
from app.campus_qa import campus_answer
from tests.test_appeal_retrieval import session_factory,add
from app.event_date_recall import fallback_event_candidates


def schedule():
    return [row('task','11.二级学院提交优秀毕业生名单公示结果（报学工处）'),
        row('committee','十七 6月16日 召开学生工作指导委员会会议',paragraph=2),
        row('degree','十七 6月17日 召开学位评定委员会会议',paragraph=3),
        row('ceremony','十八 6月20日 毕业典礼',paragraph=4)]


def test_adjacent_schedule_events_are_not_one_continuous_citation():
    assert pdf_windows(schedule())=={}


def test_schedule_event_does_not_inherit_previous_task_as_scope():
    contexts,references,_,_=pdf_sections(schedule(),complete_documents={'one'})
    assert 'ceremony' not in contexts and 'ceremony' not in references


def test_schedule_wrapped_description_stays_with_its_own_date():
    rows=[row('a','十七 6月16日 召开学生工作指导委员会会议，'),
        row('b','审议相关事项并形成意见。',paragraph=2),
        row('c','十八 6月20日 毕业典礼',paragraph=3)]
    windows=pdf_windows(rows)
    assert [c.id for c in windows['a']]==['a','b'] and 'c' not in windows


def test_schedule_date_at_next_page_is_a_new_event():
    rows=[row('a','本次工作由相关部门完成，具体工作日程另行公布',paragraph=25),
        row('b','十八 6月20日 毕业典礼和学位授予仪式',page=2)]
    assert pdf_windows(rows,complete_documents={'one'})=={}


def test_policy_scope_still_applies_to_ordinary_wrapped_prose():
    rows=[row('heading','1.青年项目'),row('a','项目负责人作为第一作者在 SCI',paragraph=2),
        row('b','二区及以上期刊发表1篇论文。',paragraph=3)]
    contexts,refs,_,_=pdf_sections(rows,complete_documents={'one'})
    assert contexts['b']=='1.青年项目' and refs['b'][0]['id']=='heading'
    assert [c.id for c in pdf_windows(rows)['a']]==['heading','a','b']


def test_schedule_boundary_preserves_actual_scope_and_material_requirements():
    rows=[row('scope','1.本科生'),row('rule','2.提交材料要求',paragraph=2),
        row('day','十八 6月20日 提交申请',paragraph=3)]
    contexts,refs,_,_=pdf_sections(rows,complete_documents={'one'})
    assert contexts['day']=='2.提交材料要求'
    assert refs['day'][0]['id']=='rule'


def test_task_label_is_retained_for_its_actual_continuation():
    rows=[row('a','11.提交优秀毕业生名单公示结果'),
        row('b','由学院负责并报相关部门。',paragraph=2)]
    contexts,_,_,_=pdf_sections(rows,complete_documents={'one'})
    assert contexts['b']=='11.提交优秀毕业生名单公示结果'


def test_arabic_numbered_calendar_entries_are_distinct_events():
    rows=[row('a','15 全国大学英语四、六级考试笔试 6月14日 教研办'),
        row('b','16 职业规划系列讲座（一）（二） 6月上旬 学工办',paragraph=2),
        row('c','22 学院毕业典礼暨学位授予仪式 6月20日10:30—12:00 学工办',paragraph=3)]
    assert pdf_windows(rows)=={}


def test_number_in_policy_continuation_is_not_a_calendar_row():
    rows=[row('a','第八条 考试笔试一般为'),
        row('b','120 分钟，具体安排另行通知。',paragraph=2)]
    assert [c.id for c in pdf_windows(rows)['a']]==['a','b']


def test_two_explicit_event_dates_survive_no_model_fallback_after_row_split():
    with session_factory()() as s:
        doc,parts=add(s,'2025届毕业资格审核日程',[
            '十七 6月16日 召开学生工作指导委员会会议',
            '十七 6月17日 召开学位评定委员会会议',
            '十八 6月20日 毕业典礼'],published_at='2025-05-21')
        for i,p in enumerate(parts):p.location=f'第 2 页 / 段落 {i+1} / 字符 1'
        add(s,'2025届毕业典礼暨学位授予仪式',[
            '6月20日毕业典礼隆重举行，学院学位评定委员会委员、老师和学生参加仪式。'],published_at='2025-06-21')
        s.commit()
        result=campus_answer(s,'2025届毕业资格日程，学生工作指导委员会与学位评定委员会何时召开？',
            datetime.now(timezone.utc),use_model=False)
        assert {p['id'] for p in result['sources']}=={parts[0].id,parts[1].id}
        assert result['explanation']==[] and result['mode']=='evidence_fallback'
        doc.status='withdrawn';s.commit()
        withdrawn=campus_answer(s,'2025届毕业资格日程，学生工作指导委员会与学位评定委员会何时召开？',
            datetime.now(timezone.utc),use_model=False)
        assert doc.id not in {r['document_id'] for r in withdrawn['sources']}


def test_fallback_does_not_treat_missing_or_other_year_target_as_supported():
    a={'id':'a','text':'6月16日召开学生工作指导委员会会议'}
    b={'id':'b','text':'2026年6月17日召开学位评定委员会会议'}
    q='2025届学生工作指导委员会与学位评定委员会何时召开？'
    assert fallback_event_candidates([a,b],q)==[a]
    b['text']='学位评定委员会另行通知。'
    assert fallback_event_candidates([a,b],q)==[a]


def test_single_event_fallback_and_negated_question_keep_existing_bound():
    rows=[{'id':'a','text':'6月20日毕业典礼'}, {'id':'b','text':'6月25日发放毕业证书'}]
    assert fallback_event_candidates(rows,'毕业典礼在哪一天？')==rows[:1]
    assert fallback_event_candidates(rows,'不问毕业典礼与发放毕业证书时间。')==rows[:1]


def test_committee_attendance_date_cannot_replace_committee_meeting_date():
    rows=[{'id':'a','text':'6月16日召开学生工作指导委员会会议'},
        {'id':'news','text':'6月20日毕业典礼，学位评定委员会委员、教师代表参加仪式。'},
        {'id':'b','text':'6月17日召开学位评定委员会会议'}]
    assert [r['id'] for r in fallback_event_candidates(rows,
        '学生工作指导委员会与学位评定委员会何时召开？')]==['a','b']
