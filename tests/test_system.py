import json
import pytest
from sqlalchemy import create_engine,select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.db import Base,Document,Chunk,Competition,Candidate
from app.main import app,db
from app.tools import deadline_status,search_competitions,eligible
from app.ingest import ingest_bytes,uid,validate_url

@pytest.fixture
def store(tmp_path,monkeypatch):
    engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory=sessionmaker(engine,expire_on_commit=False)
    def dependency():
        with factory() as s:yield s
    app.dependency_overrides[db]=dependency
    import app.ingest as ingestion
    monkeypatch.setattr(ingestion,'DATA',tmp_path)
    (tmp_path/'raw').mkdir()
    yield factory
    app.dependency_overrides.clear()

def source(s,public=True,status='published',name='测试赛事',year=2026,fields=None):
    d=Document(id=uid(),title=name,sha256='x'*64,raw_name='test.txt',mime='.txt',visibility='public' if public else 'private',status=status,kind='notice')
    s.add(d);s.flush()
    c=Competition(id=uid(),name=name,year=year,document_id=d.id,fields=fields or {},review_status='verified')
    ch=Chunk(id=uid(),document_id=d.id,text='报名通知原文',location='第1段')
    s.add_all([c,ch]);s.commit();return d,c,ch

def dates(end='2026-10-10T20:00:00+08:00',precision='minute'):
    return {'internal_start':{'value':'2026-10-01','precision':'date','timezone':'Asia/Shanghai'},'internal_deadline':{'value':end,'precision':precision,'timezone':'Asia/Shanghai'}}

def test_equal_names_and_deadlines_have_stable_page_order(store):
    with store() as session:
        _, first, _ = source(session, name='同名赛事')
        first.id = 'z' * 36
        session.commit()
        _, second, _ = source(session, name='同名赛事')
        second.id = 'a' * 36
        session.commit()
        assert search_competitions(session, limit=1)['items'][0]['competition_id'] == 'a' * 36
        assert search_competitions(session, offset=1, limit=1)['items'][0]['competition_id'] == 'z' * 36

@pytest.mark.parametrize('at,expected',[
    ('2026-09-30T20:00:00+08:00','not_started'),
    ('2026-10-10T19:59:00+08:00','open'),
    ('2026-10-10T20:00:00+08:00','deadline_boundary_unknown'),
    ('2026-10-10T20:00:01+08:00','closed'),
])
def test_minute_deadline(at,expected):
    assert deadline_status(dates(),at)==expected

def test_date_does_not_invent_2359():
    assert deadline_status(dates('2026-10-10','date'),'2026-10-10T12:00:00+08:00')=='deadline_day_unknown'
    assert deadline_status(dates('2026-10-10','date'),'2026-10-11T00:00:00+08:00')=='closed'

def test_missing_start_not_open():
    fields=dates();fields.pop('internal_start')
    assert deadline_status(fields,'2026-10-09')=='start_unknown'

def test_internal_deadline_priority():
    fields=dates('2026-10-08T20:00:00+08:00')
    fields['organizer_deadline']={'value':'2026-10-30','precision':'date'}
    assert deadline_status(fields,'2026-10-09')=='closed'

def test_complete_list_is_not_top_k(store):
    with store() as s:
        for n in range(27):source(s,name=f'测试赛事{n}',fields=dates())
        source(s,public=False,name='内部赛事',fields=dates())
        source(s,status='withdrawn',name='撤回赛事',fields=dates())
        result=search_competitions(s,registration='open',limit=10,at='2026-10-09')
        assert result['total']==27 and len(result['items'])==10
        ids=[x['competition_id'] for x in result['items']]
        for offset in (10,20):ids.extend(x['competition_id'] for x in search_competitions(s,registration='open',limit=10,offset=offset,at='2026-10-09')['items'])
        assert len(set(ids))==27

def test_sql_injection_remains_search_string(store):
    with store() as s:
        source(s,name='正常赛事')
        assert search_competitions(s,q="' OR 1=1 --")['total']==0
        assert search_competitions(s)['total']==1

def test_unknown_eligibility_never_passes():
    assert eligible({}, {'education':'本科生','team_size':3})['status']=='need_information'
    fields={'education':{'allowed':['研究生']}}
    assert eligible(fields,{'education':'本科生'})['status']=='not_met'

def test_admin_and_private_boundaries(store):
    with store() as s:doc,comp,chunk=source(s,public=False)
    with TestClient(app) as client:
        assert client.get('/api/admin/documents').status_code==401
        assert client.get('/api/documents/'+doc.id+'/chunks').status_code==401
        assert client.get('/api/documents/'+doc.id+'/download').status_code==401
        assert client.get('/api/competitions/'+comp.id).status_code==404
        assert client.get('/api/competitions').json()['total']==0
        assert client.post('/api/admin/import-url',json={'url':'http://127.0.0.1'}).status_code==401
        assert client.post('/api/feedback',json={'message':'测试反馈'},headers={'Origin':'https://evil.example'}).status_code==403

def test_private_docs_cannot_leak_via_rag(store):
    from app.rag import retrieve
    with store() as s:
        doc,_,chunk=source(s,public=False,name='内部隐秘赛事')
        chunk.text='秘密报名时间和个人信息';s.commit()
        hits,_=retrieve(s,'秘密报名时间',semantic=False)
        assert hits==[]

def test_duplicate_import_and_paragraph_context(store):
    html='<html><h1>2026测试报名通知</h1><div class="wp_articlecontent"><p><span>我校报名时间：即日起至</span><span>2026年10月12日20:00。</span></p></div></html>'.encode()
    with store() as s:
        first,dup=ingest_bytes(s,html,'sample.html',embed=False)
        second,dup2=ingest_bytes(s,html,'sample.html',embed=False)
        assert not dup and dup2 and first.id==second.id
        candidates=s.scalars(select(Candidate)).all()
        assert any(c.field=='internal_deadline' and c.value['value']=='2026-10-12T20:00:00+08:00' for c in candidates)

def test_invalid_file_keeps_failure_record(store):
    with store() as s:
        doc,_=ingest_bytes(s,b'not a PDF','broken.pdf',embed=False)
        assert doc.status=='parse_failed' and doc.error

@pytest.mark.parametrize('url',['http://localhost','http://127.0.0.1','file:///C:/Windows','https://njxzc.edu.cn.evil.example/x','https://user:password@jwc.njxzc.edu.cn/x','https://jwc.njxzc.edu.cn:11434'])
def test_ssrf_scope(url):
    with pytest.raises(ValueError):validate_url(url)

def test_versions_review_publish_and_rollback(store,monkeypatch,tmp_path):
    import app.main as main
    password=tmp_path/'password.txt';password.write_text('test-password')
    monkeypatch.setattr(main,'password_file',password)
    with store() as s:
        old,_,_=source(s,name='2026赛事旧版')
        new,comp,chunk=source(s,status='pending_review',name='2026赛事新版')
        old.source_url=new.source_url='https://jwc.njxzc.edu.cn/test.htm'
        new.supersedes=old.id;new.version=2
        candidate=Candidate(id=uid(),competition_id=comp.id,field='internal_deadline',value={'value':'2026-10-12','precision':'date','timezone':'Asia/Shanghai'},quote=chunk.text,chunk_id=chunk.id)
        s.add(candidate);s.commit()
    with TestClient(app) as client:
        assert client.post('/api/admin/login',json={'password':'test-password'}).status_code==200
        assert client.post('/api/admin/documents/'+new.id+'/publish',json={'visibility':'public'}).status_code==409
        assert client.post('/api/admin/review/'+candidate.id,json={'status':'confirmed'}).status_code==200
        assert client.get('/api/competitions/'+comp.id).json()['fields']=={}
        assert client.post('/api/admin/documents/'+new.id+'/publish',json={'visibility':'public'}).status_code==200
        assert client.get('/api/competitions/'+comp.id).json()['fields']['internal_deadline']['value']=='2026-10-12'
        assert client.get('/api/competitions').json()['total']==1
        assert client.post('/api/admin/documents/'+new.id+'/withdraw',json={}).status_code==200
        result=client.get('/api/competitions').json()
        assert result['total']==1 and result['items'][0]['name']=='2026赛事旧版'


def test_selected_event_fee_evidence_reaches_model_window(store):
    from app.rag import retrieve
    with store() as session:
        doc, comp, _ = source(session, name='2026五一数学建模竞赛报名通知')
        for i in range(4):
            session.add(Chunk(id=uid(), document_id=doc.id, location=f'网页段落 {i+1} / 字符 1',
                              text='五一数学建模竞赛组织报名，竞赛鼓励学习数学建模，介绍竞赛的发展和竞赛报名组织。'))
        quote='每支参赛队费用100元，未获奖的队伍自行承担费用。'
        session.add(Chunk(id=uid(), document_id=doc.id, location='网页段落 8 / 字符 1', text=quote))
        session.commit()
        hits,_=retrieve(session,'五一数学建模竞赛参赛费用多少钱？',competition_id=comp.id,semantic=False)
        assert any(h['text']==quote for h in hits[:3])


def test_heading_helps_date_recall_without_altering_original_text(store):
    from app.rag import retrieve
    with store() as session:
        doc, comp, _ = source(session,name='2026五一数学建模竞赛')
        heading=Chunk(id=uid(),document_id=doc.id,location='网页段落 8 / 字符 1',text='三、竞赛时间')
        body=Chunk(id=uid(),document_id=doc.id,location='网页段落 9 / 字符 1',text='2026年5月1日10:00至5月4日12:00。')
        session.add_all([heading,body]);session.commit()
        hits,_=retrieve(session,'五一数学建模比赛的起止时间？',competition_id=comp.id,semantic=False)
        selected=next(h for h in hits[:3] if h['id']==body.id)
        assert selected['text']==body.text and '三、竞赛时间' not in selected['text']
        assert selected['location']==body.location


def test_heading_does_not_cross_document_or_unknown_coordinate(store):
    from app.rag import ranking_contexts
    from types import SimpleNamespace
    first=SimpleNamespace(id='a',parent_id=None)
    second=SimpleNamespace(id='b',parent_id=None)
    heading=SimpleNamespace(id='heading',location='网页段落 1 / 字符 1',text='三、竞赛时间')
    other=SimpleNamespace(id='other',location='网页段落 2 / 字符 1',text='另一份文档的内容')
    unknown=SimpleNamespace(id='ocr',location='第 1 页 / OCR 框 2',text='扫描阅读顺序未确认')
    distant=SimpleNamespace(id='distant',location='网页段落 9 / 字符 1',text='远处新内容')
    contexts=ranking_contexts([(heading,first),(other,second),(unknown,first),(distant,first)])
    assert contexts['other']==other.text and contexts['ocr']==unknown.text and contexts['distant']==distant.text


def test_scanned_chinese_spaces_do_not_change_citation(store):
    from app.rag import retrieve
    with store() as session:
        doc, comp, _ = source(session, name='2026创新挑战赛')
        quote='指导教 师不超过 2 人，参赛学生须按要求报名。'
        scanned=Chunk(id=uid(),document_id=doc.id,location='第 1 页 / OCR 框 2',text=quote)
        session.add(scanned);session.commit()
        hits,_=retrieve(session,'创新挑战赛指导教师限制？',competition_id=comp.id,semantic=False)
        assert any(h['id']==scanned.id and h['text']==quote and h['location']==scanned.location for h in hits[:3])


def test_attachment_track_title_distinguishes_same_section(store):
    from app.rag import retrieve
    with store() as session:
        root, comp, _ = source(session,name='2026职业规划大赛')
        for i in range(4):
            child,_,chunk=source(session,name=f'附件{i+1}成长赛道方案')
            child.parent_id=root.id;chunk.text='主题陈述（7分钟），展示职业目标。'
        child,_,chunk=source(session,name='附件就业赛道方案')
        child.parent_id=root.id;chunk.text='主题陈述（6分钟），介绍求职意向。'
        session.commit()
        hits,_=retrieve(session,'职业规划大赛就业赛道主题陈述几分钟？',competition_id=comp.id,semantic=False)
        assert any(h['id']==chunk.id and h['text']==chunk.text for h in hits[:3])


def test_teacher_people_evidence_is_not_displaced_by_short_project_count(store):
    from app.rag import retrieve
    with store() as session:
        doc,comp,chunk=source(session,name='2026全国人工智能应用场景创新挑战赛')
        chunk.text='(2) 参赛团队人数限3至15人，指导教 师不超过 2 人；须邀请至少1名在校教师担任项目指导，项目负责人及成员均须为在读学生，专业不限。'
        session.add(Chunk(id=uid(),document_id=doc.id,location='网页段落 1 / 字符 1',text='1. 高校种子组'))
        chunk.location='网页段落 2 / 字符 1'
        child,_,short=source(session,name='国赛附件')
        child.parent_id=doc.id
        short.text='高校种子组每位指导教师可指导2个不同参赛项目。'
        session.commit()
        hits,_=retrieve(session,'人工智能应用场景创新挑战赛高校种子组指导教师最多几人？',competition_id=comp.id,semantic=False)
        assert hits[0]['id']==chunk.id and hits[0]['text']==chunk.text


def test_group_question_retrieves_enumeration_not_form_field(store):
    from app.rag import retrieve
    with store() as session:
        doc,comp,chunk=source(session,name='2026全国人工智能应用场景创新挑战赛')
        chunk.text='根据参赛团队所处阶段，大赛分为高校种子组、企业初创组、个人组，并设置参赛项目类型。'
        session.add(Chunk(id=uid(),document_id=doc.id,location='附件第1页',text='参赛赛道、参赛组别、参赛场景、项目名称。'))
        session.commit()
        hits,_=retrieve(session,'人工智能应用场景创新挑战赛有哪些参赛组别？',competition_id=comp.id,semantic=False)
        assert hits[0]['id']==chunk.id


def test_automatic_event_resolution_requires_identifying_name(store):
    from app.rag import resolve_competition
    with store() as session:
        _,comp,_=source(session,name='关于2026年第二十三届五一数学建模竞赛报名的通知')
        assert resolve_competition(session,'五一数模参赛费多少？')['competition_id']==comp.id
        assert resolve_competition(session,'数学建模报名截止？')['status']=='no_match'
        assert resolve_competition(session,'全国大学生数学建模竞赛报名截止？')['status']=='no_match'


def test_exact_longer_event_name_is_not_confused_with_contained_generic_name(store):
    from app.rag import resolve_competition
    with store() as session:
        _,specific,_=source(session,name='五一数学建模竞赛')
        source(session,name='全国大学生数学建模竞赛')
        assert resolve_competition(session,'五一数学建模竞赛费用？')['competition_id']==specific.id
        assert resolve_competition(session,'数学建模和五一数学建模竞赛费用？')['status']=='ambiguous'


@pytest.mark.parametrize('question',['2027年五一数学建模竞赛报名截止？','第24届五一数学建模竞赛报名截止？'])
def test_automatic_event_resolution_rejects_wrong_year_or_edition(store,question):
    from app.rag import retrieve
    with store() as session:
        source(session,name='关于2026年第二十三届五一数学建模竞赛报名的通知')
        hits,warnings=retrieve(session,question,semantic=False)
        assert hits==[] and '年度或届次' in warnings[0]


def test_selected_event_does_not_override_explicit_wrong_edition(store):
    from app.rag import retrieve
    with store() as session:
        _,comp,_=source(session,name='2026年第二十三届五一数学建模竞赛')
        hits,warnings=retrieve(session,'第24届五一数模费用？',competition_id=comp.id,semantic=False)
        assert hits==[] and '届次' in warnings[0]


def test_student_grade_year_is_not_mistaken_for_event_year(store):
    from app.rag import answer
    with store() as session:
        _,comp,chunk=source(session,name='2026年职业规划大赛')
        chunk.text='成长赛道参赛对象为在校学生，年级须核实';session.commit()
        result=answer(session,'2024年级可以参加职业规划大赛吗？',use_model=False)
        assert result['competition_id']==comp.id and result['sources']


def test_automatic_event_resolution_asks_for_multiple_events(store):
    from app.rag import retrieve
    with store() as session:
        source(session,name='五一数学建模竞赛')
        source(session,name='职业规划大赛')
        hits,warnings=retrieve(session,'五一数学建模和职业规划大赛什么时候报名？',semantic=False)
        assert hits==[] and '多项赛事' in warnings[0]


def test_automatic_event_resolution_asks_for_duplicate_versions(store):
    from app.rag import resolve_competition
    with store() as session:
        source(session,name='2025年五一数学建模竞赛',year=2025)
        _,current,_=source(session,name='2026年五一数学建模竞赛')
        assert resolve_competition(session,'五一数学建模截止？')['status']=='ambiguous'
        assert resolve_competition(session,'2026年五一数学建模截止？')['competition_id']==current.id


def test_automatic_event_resolution_excludes_private_and_withdrawn(store):
    from app.rag import resolve_competition
    with store() as session:
        source(session,name='五一数学建模竞赛',public=False)
        source(session,name='五一数学建模竞赛',status='withdrawn')
        assert resolve_competition(session,'五一数学建模报名？')=={'status':'no_match'}


def test_explicit_new_event_overrides_conversation_event(store):
    from app.rag import answer
    with store() as session:
        _,old,_=source(session,name='五一数学建模竞赛')
        _,new,chunk=source(session,name='职业规划大赛')
        chunk.text='成长赛道报名通知原文';session.commit()
        result=answer(session,'职业规划大赛成长赛道报名？',history=[{'competition_id':old.id}],use_model=False)
        assert result['competition_id']==new.id
        assert all(s['document_id']==new.document_id for s in result['sources'])


@pytest.mark.parametrize('response', ['empty', 'fabricated', 'unavailable'])
def test_model_failure_and_fabricated_quote_are_marked_as_candidates(store,monkeypatch,response):
    import app.rag as rag
    def generate(messages):
        if response=='unavailable':raise TimeoutError('local model timeout')
        evidence=json.loads(messages[-1]['content'])['evidence']
        citations=[] if response=='empty' else [{'id':evidence[0]['id'],'quote':'报名截止为2099年12月31日'}]
        return {'message':{'content':json.dumps({'citations':citations})}}
    monkeypatch.setattr(rag,'generate',generate)
    with store() as session:
        _,comp,_=source(session)
        result=rag.answer(session,'报名通知',competition_id=comp.id)
        assert result['mode']=='evidence_fallback'
        assert '仅为检索候选原文' in result['answer']
        assert '2099' not in result['answer']
        assert result['sources'][0]['quote']=='报名通知原文'
