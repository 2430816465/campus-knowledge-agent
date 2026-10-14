import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db import Candidate,Document,Chunk
from app.ingest import uid
from app.tools import search_competitions
from test_system import store,source,dates

def authenticate(client,monkeypatch,tmp_path):
    import app.main as main
    path=tmp_path/'admin.txt';path.write_text('local-test-password')
    monkeypatch.setattr(main,'password_file',path)
    assert client.post('/api/admin/login',json={'password':'local-test-password'}).status_code==200

def test_full_filter_unknown_team_not_match(store):
    with store() as s:
        source(s,fields={'team_size':{'text':'组队人数待核实'}})
        assert search_competitions(s,team_size=3)['total']==0

def test_multiple_dates_not_first_start_as_deadline(store):
    from app.ingest import extract_candidates
    with store() as s:
        d,c,ch=source(s,status='pending_review')
        ch.text='报名系统开放时间2026年4月17日09:00，校赛报名截止时间6月2 0日24:00。'
        extract_candidates(s,c,[ch],d);s.flush()
        candidate=s.scalar(select(Candidate).where(Candidate.competition_id==c.id,Candidate.field=='internal_deadline'))
        assert candidate.value['precision']=='ambiguous' and 'value' not in candidate.value

def test_split_scope_requires_literal_evidence_and_does_not_inherit_rules(store,monkeypatch,tmp_path):
    with store() as s:
        d,c,ch=source(s,status='pending_review',fields=dates())
        ch.text='就业赛道本科生组：校赛另行通知';s.commit()
    with TestClient(app) as client:
        authenticate(client,monkeypatch,tmp_path)
        endpoint='/api/admin/competitions/'+c.id+'/scopes'
        body={'track':'就业赛道','phase':'校赛','chunk_id':ch.id,'quote':ch.text,'note':'按官方分赛道规则拆分'}
        assert client.post(endpoint,json={**body,'track':'虚构赛道'}).status_code==422
        result=client.post(endpoint,json=body)
        assert result.status_code==200 and result.json()['rules_inherited'] is False
        detail=client.get('/api/competitions/'+result.json()['competition_id']).json()
        assert detail['fields']=={} and detail['review_status']=='pending_review'
        assert detail['track']=='就业赛道' and detail['phase']=='校赛'
        assert client.post(endpoint,json=body).status_code==409

def test_bad_date_filter_rejected(store):
    with TestClient(app) as client:
        assert client.get('/api/competitions?before=wrong').status_code==422
        assert client.get('/api/competitions?after=2026-10-12&before=2026-10-09').status_code==422

def test_new_candidate_requires_same_document_and_literal_quote(store,monkeypatch,tmp_path):
    with store() as s:
        d,c,ch=source(s,status='pending_review');_,_,other=source(s,status='pending_review')
    with TestClient(app) as client:
        authenticate(client,monkeypatch,tmp_path)
        body={'competition_id':c.id,'field':'education','value':{'allowed':['本科生']},'chunk_id':ch.id,'quote':'报名通知原文'}
        assert client.post('/api/admin/candidates',json={**body,'quote':'自己编写资格'}).status_code==422
        assert client.post('/api/admin/candidates',json={**body,'chunk_id':other.id}).status_code==422
        result=client.post('/api/admin/candidates',json=body)
        assert result.status_code==200 and result.json()['status']=='pending'
        assert client.get('/api/competitions/'+c.id).json()['fields']=={}

def test_superseded_document_cannot_restore_ancestor(store,monkeypatch,tmp_path):
    with store() as s:d,_,_=source(s,status='superseded')
    with TestClient(app) as client:
        authenticate(client,monkeypatch,tmp_path)
        assert client.post('/api/admin/documents/'+d.id+'/withdraw',json={}).status_code==409

def test_rag_includes_public_attachment_but_not_private(store):
    from app.rag import retrieve
    with store() as s:
        d,c,ch=source(s,name='2026竞赛')
        child=Document(id=uid(),title='附件',sha256='a'*64,raw_name='a.txt',mime='.txt',visibility='public',status='pending_review',kind='policy',parent_id=d.id)
        s.add(child);s.flush();s.add(Chunk(id=uid(),document_id=child.id,text='跨专业组队需要指导教师',location='附件第1段'));s.commit()
        hits,_=retrieve(s,'跨专业指导教师',competition_id=c.id,year=2026,semantic=False)
        assert any(h['document_id']==child.id for h in hits)
        child.visibility='private';s.commit()
        hits,_=retrieve(s,'跨专业指导教师',competition_id=c.id,semantic=False)
        assert not any(h['document_id']==child.id for h in hits)

def test_deferred_field_does_not_mark_all_verified(store,monkeypatch,tmp_path):
    with store() as s:
        d,c,ch=source(s,status='pending_review')
        s.add(Candidate(id=uid(),competition_id=c.id,field='eligibility',value={'text':'待核实'},quote=ch.text,chunk_id=ch.id,status='deferred'));s.commit()
    with TestClient(app) as client:
        authenticate(client,monkeypatch,tmp_path)
        assert client.post('/api/admin/documents/'+d.id+'/publish',json={'visibility':'public'}).status_code==200
        assert client.get('/api/competitions/'+c.id).json()['review_status']=='partially_verified'
        assert client.get('/api/competitions?verified=true').json()['total']==0

def test_skipped_revision_replaces_actual_published_version(store,monkeypatch,tmp_path):
    with store() as s:
        old,_,_=source(s,status='published',name='旧版')
        middle,_,_=source(s,status='pending_review',name='未发布中间版')
        new,_,_=source(s,status='pending_review',name='最新修订版')
        for d in (old,middle,new):d.source_url='https://jwc.njxzc.edu.cn/notice.htm'
        middle.version=2;middle.supersedes=old.id;new.version=3;new.supersedes=middle.id;s.commit()
    with TestClient(app) as client:
        authenticate(client,monkeypatch,tmp_path)
        assert client.post('/api/admin/documents/'+new.id+'/publish',json={'visibility':'public'}).status_code==200
        published=client.get('/api/competitions?verified=true').json()
        assert published['total']==1 and published['items'][0]['name']=='最新修订版'
        assert published['items'][0]['source']['supersedes']==old.id
        assert client.post('/api/admin/documents/'+new.id+'/withdraw',json={}).status_code==200
        assert client.get('/api/competitions?verified=true').json()['items'][0]['name']=='旧版'

def test_model_invented_quote_is_not_accepted(store,monkeypatch):
    import app.rag as rag
    with store() as s:
        d,c,ch=source(s,name='2026测试竞赛')
        ch.text='我校报名时间：2026年10月12日20:00截止。';s.commit()
        monkeypatch.setattr(rag,'generate',lambda _: {'message':{'content':'{"citations":[{"id":"'+ch.id+'","quote":"报名时间是2026年12月31日"}]}'}})
        result=rag.answer(s,'2026年测试竞赛报名时间',competition_id=c.id,year=2026)
        assert result['mode']=='evidence_fallback' and '12月31日' not in result['answer']
        assert result['sources'][0]['quote']==ch.text
