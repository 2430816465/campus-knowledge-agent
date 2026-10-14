import hmac
import json
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
import httpx
from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Form, Response, Depends, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from .conversation import MAX_HISTORY, MAX_CONTEXT_CHARS
from sqlalchemy import select, func
from .config import ROOT, DATA, OLLAMA, CHAT_MODEL, EMBED_MODEL, MAX_FILE
from .db import init_db, Session, Document, Chunk, Competition, Candidate, Audit, Feedback, timestamp
from .ingest import ingest_url, ingest_bytes, uid
from .tools import search_competitions, get_competition_rules, get_school_policy, doc_dict, eligible, LABELS
from .rag import answer
from .model import embeddings
from .campus_information import list_information

sessions = {}
login_attempts = {}
rate_counters = {}
password_file = ROOT / '.secrets' / 'admin-password.txt'
if not password_file.exists():
    password_file.write_text(secrets.token_urlsafe(24),encoding='utf-8')

@asynccontextmanager
async def lifespan(app):
    init_db()
    yield

app = FastAPI(title='南京晓庄学院校园助手',version='0.2.0',lifespan=lifespan)

@app.middleware('http')
async def local_boundary(request, call_next):
    host = request.headers.get('host','').split(':')[0]
    if host not in ('127.0.0.1','localhost','host.docker.internal','testserver'):
        return Response('本地试用仅允许本机访问',status_code=403)
    origin = request.headers.get('origin')
    if request.method not in ('GET','HEAD','OPTIONS') and origin and origin not in ('http://127.0.0.1:8008','http://localhost:8008'):
        return Response('跨站写入被拒绝',status_code=403)
    if request.method == 'POST' and int(request.headers.get('content-length','0')) > MAX_FILE + 65536:
        return Response('请求超过20MB',status_code=413)
    if request.url.path in ('/api/chat','/api/feedback'):
        key = (request.client.host if request.client else 'local', request.url.path)
        ticks = [t for t in rate_counters.get(key,[]) if time.time()-t < 60]
        if len(ticks) >= (10 if request.url.path.endswith('chat') else 5):
            return Response('请求过于频繁，请一分钟后重试',status_code=429)
        rate_counters[key] = ticks + [time.time()]
    response = await call_next(request)
    # Windows PowerShell 5.1 依赖显式字符集正确读取中文 JSON。
    if response.headers.get('content-type')=='application/json':
        response.headers['Content-Type']='application/json; charset=utf-8'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return response

def admin(request:Request):
    token = request.cookies.get('campus_admin','')
    if sessions.get(token,0) < time.time():
        raise HTTPException(401,'请先登录管理员')
    return True

def db():
    with Session() as session:
        yield session

class Login(BaseModel):
    password: str = Field(max_length=200)

@app.post('/api/admin/login')
def login(body:Login,request:Request,response:Response):
    key = request.client.host if request.client else 'local'
    tries = [t for t in login_attempts.get(key,[]) if time.time()-t < 300]
    if len(tries) >= 8:
        raise HTTPException(429,'登录失败次数过多，请5分钟后重试')
    if not hmac.compare_digest(body.password,password_file.read_text(encoding='utf-8').strip()):
        login_attempts[key] = tries + [time.time()]
        raise HTTPException(401,'管理员密码错误')
    token = secrets.token_urlsafe(32)
    sessions[token] = time.time()+28800
    response.set_cookie('campus_admin',token,httponly=True,samesite='strict',max_age=28800,path='/')
    return {'ok':True}

@app.post('/api/admin/logout')
def logout(request:Request,response:Response):
    sessions.pop(request.cookies.get('campus_admin',''),None)
    response.delete_cookie('campus_admin')
    return {'ok':True}

@app.get('/api/admin/session',dependencies=[Depends(admin)])
def session_state():
    return {'ok':True}

@app.get('/api/health')
def health(session=Depends(db)):
    models, error = [], None
    try:
        with httpx.Client(timeout=3,trust_env=False) as client:
            r = client.get(OLLAMA+'/api/tags')
            r.raise_for_status()
            models = [m['name'] for m in r.json()['models']]
    except Exception as exc:
        error = type(exc).__name__
    return {'status':'ok','school':'南京晓庄学院','database':session.bind.dialect.name,'models':models,'chat_ready':CHAT_MODEL in models,'embedding_ready':EMBED_MODEL in models,'ollama_error':error,'deployment':'本机限定试用；学校认证和服务器未接入'}

@app.get('/api/campus-information')
def campus_information(q:str=Query('',max_length=100),year:int|None=Query(None,ge=2000,le=2100),verified:bool=False,offset:int=Query(0,ge=0),limit:int=Query(10,ge=1,le=100),session=Depends(db)):
    return list_information(session,q,year,verified,offset,limit)

@app.get('/api/competitions')
def competitions(q:str=Query('',max_length=100),year:int|None=None,track:str|None=None,phase:str|None=None,school:str|None=None,college:str|None=None,major:str|None=None,education:str|None=None,grade:str|None=None,team_size:int|None=Query(None,ge=1,le=100),recognition:str|None=None,registration:Literal['open','closed','unknown','start_unknown','not_started','deadline_day_unknown']|None=None,before:str|None=None,after:str|None=None,verified:bool=False,offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),at:str|None=None,session=Depends(db)):
    try:
        return search_competitions(session,**{k:v for k,v in locals().copy().items() if k not in ('session',)})
    except ValueError:
        raise HTTPException(422,'日期或查询时间格式不正确')

@app.get('/api/competitions/{competition_id}')
def rules(competition_id:str,year:int|None=None,track:str|None=None,phase:str|None=None,at:str|None=None,session=Depends(db)):
    result = get_competition_rules(session,competition_id,year,track,phase,at)
    if result is None:
        raise HTTPException(404,'未收录、无权限或资料已撤回')
    return result

class Student(BaseModel):
    college: str|None = Field(None,max_length=100)
    major: str|None = Field(None,max_length=100)
    education: str|None = Field(None,max_length=100)
    grade: str|None = Field(None,max_length=100)
    team_size: int|None = Field(None,ge=1,le=100)

@app.post('/api/competitions/{competition_id}/eligibility')
def eligibility(competition_id:str,body:Student,session=Depends(db)):
    result = get_competition_rules(session,competition_id)
    if result is None:
        raise HTTPException(404,'未收录或无权限')
    return eligible(result['fields'],body.model_dump())

@app.get('/api/policies')
def policies(topic:str=Query('',max_length=100),year:int|None=None,session=Depends(db)):
    return get_school_policy(session,topic,year)

class Chat(BaseModel):
    question:str=Field(min_length=1,max_length=1000)
    competition_id:str|None=None
    year:int|None=None
    history:list[dict]=Field(default_factory=list,max_length=MAX_HISTORY)
    web_search:bool=True
    at:str|None=None

    @field_validator('history')
    @classmethod
    def bounded_history(cls, rows):
        clean = []
        for row in rows:
            value = row.get('resolved_question') or row.get('question', '')
            if not isinstance(value, str) or len(value) > MAX_CONTEXT_CHARS:
                raise ValueError('历史问题超出语境长度限制')
            ids = row.get('document_ids') or []
            if not isinstance(ids, list) or len(ids) > 100 or any(not isinstance(v, str) or len(v) > 100 for v in ids):
                raise ValueError('历史来源标识不正确')
            competition = row.get('competition_id')
            if competition is not None and (not isinstance(competition, str) or len(competition) > 100):
                raise ValueError('历史赛事标识不正确')
            clean.append({'question': value, 'document_ids': ids, 'competition_id': competition})
        return clean

@app.post('/api/chat')
def chat(body:Chat,session=Depends(db)):
    from .answer_view import build_answer_view
    from .followup_questions import suggest_questions
    import os
    from .web_lookup import supplement
    result = answer(session,**body.model_dump(exclude={'web_search'}))
    effective = result.get('resolved_question') or body.question
    result['answer_view'] = build_answer_view(session, effective, result)
    result = supplement(session, effective, result, enabled=body.web_search and os.environ.get('CAMPUS_WEB_SEARCH', '1') == '1')
    if result.get('context_note'):
        result['answer_view']['context_note'] = result['context_note']
    result['followup_questions'] = suggest_questions(effective, result, body.history)
    result['context_window'] = MAX_HISTORY
    return result

@app.get('/api/coverage')
def coverage(session=Depends(db)):
    counts = dict(session.execute(select(Document.status,func.count()).where(Document.visibility=='public').group_by(Document.status)).all())
    total = sum(counts.values())
    docs = session.scalars(select(Document).where(Document.visibility=='public').order_by(Document.imported_at.desc()).limit(20)).all()
    progress = DATA / 'school-archive/progress.json'
    archive = None
    if progress.exists():
        try:
            state = json.loads(progress.read_text(encoding='utf-8'))
            archive = {k:state.get(k) for k in ('checked_at','states','unique_blobs','discovered_school_hosts','frontier_exhausted','full_school_coverage_proven')}
        except (OSError, ValueError):
            pass
    return {'documents':total,'searchable':counts.get('pending_review',0)+counts.get('published',0),
            'published':counts.get('published',0),'pending':counts.get('pending_review',0),
            'failed':counts.get('parse_failed',0)+counts.get('partial_parse',0),
            'competitions':session.scalar(select(func.count(Competition.id)).join(Document).where(Document.visibility=='public',Document.kind.in_(['notice','catalog']),Document.status.in_(['pending_review','published']))),
            'scope':'正在扩展官网公开资料；归档、可检索和教师审核分别统计，尚未证明全站覆盖',
            'catalog_review':'目录行自动抽取候选，不能作为教师确认的完整覆盖分母',
            'archive':archive,'sources':[doc_dict(d) for d in docs],'sources_truncated':total>20}

@app.get('/api/documents/{document_id}/chunks')
def chunks(document_id:str,request:Request,session=Depends(db)):
    doc = session.get(Document,document_id)
    if doc is None:
        raise HTTPException(404,'无此资料')
    if doc.visibility!='public' or doc.status not in ('pending_review','published'):
        admin(request)
    return {'document':doc_dict(doc),'chunks':[{'id':c.id,'text':c.text,'location':c.location,'indexed':bool(c.vector)} for c in session.scalars(select(Chunk).where(Chunk.document_id==doc.id))]}

@app.get('/api/documents/{document_id}/download')
def download(document_id:str,request:Request,session=Depends(db)):
    doc = session.get(Document,document_id)
    if doc is None:
        raise HTTPException(404,'无此资料')
    if doc.visibility!='public' or doc.status not in ('pending_review','published'):
        admin(request)
    return FileResponse(DATA/'raw'/doc.raw_name,filename=doc.raw_name,media_type='application/octet-stream')

class FeedbackBody(BaseModel):
    message:str=Field(min_length=3,max_length=1000)

@app.post('/api/feedback')
def feedback(body:FeedbackBody,session=Depends(db)):
    item = Feedback(id=uid(),message=body.message)
    session.add(item)
    session.commit()
    return {'id':item.id,'status':'saved'}

@app.get('/api/admin/documents',dependencies=[Depends(admin)])
def admin_documents(q:str=Query('',max_length=100),parent_id:str|None=Query(None,max_length=200),offset:int=Query(0,ge=0),limit:int=Query(50,ge=1,le=100),session=Depends(db)):
    conditions = []
    if q.strip():
        conditions.append(Document.title.icontains(q.strip(),autoescape=True))
    if parent_id is not None:
        conditions.append(Document.parent_id==parent_id)
    total = session.scalar(select(func.count(Document.id)).where(*conditions))
    rows = session.scalars(select(Document).where(*conditions).order_by(Document.imported_at.desc(),Document.id).offset(offset).limit(limit))
    return {'items':[doc_dict(d) for d in rows],'total':total,'offset':offset,'limit':limit}

@app.get('/api/admin/competitions',dependencies=[Depends(admin)])
def admin_competitions(session=Depends(db)):
    return [{'id':c.id,'name':c.name,'document_id':d.id,'status':d.status} for c,d in session.execute(select(Competition,Document).join(Document).where(Document.kind.in_(['notice','catalog'])))]

class URLBody(BaseModel):
    url:str=Field(max_length=2000)
    kind:Literal['notice','policy','catalog']='notice'
    parent_id:str|None=None

@app.post('/api/admin/import-url',dependencies=[Depends(admin)])
def import_url(body:URLBody,session=Depends(db)):
    try:
        doc,duplicate = ingest_url(session,body.url,body.kind,parent_id=body.parent_id)
        return {'document':doc_dict(doc),'duplicate':duplicate}
    except Exception as exc:
        raise HTTPException(422,f'导入失败：{type(exc).__name__}: {str(exc)[:160]}')

@app.post('/api/admin/upload',dependencies=[Depends(admin)])
def upload(file:UploadFile=File(...),kind:str=Form('notice'),visibility:Literal['private','public']=Form('private'),session=Depends(db)):
    content = file.file.read(MAX_FILE+1)
    if len(content)>MAX_FILE:
        raise HTTPException(413,'文件超过20MB')
    if kind not in ('notice','policy','catalog'):
        raise HTTPException(422,'资料类型不正确')
    # 默认私有，本地OCR/embedding；不进入匿名学生检索。
    doc,duplicate = ingest_bytes(session,content,Path(file.filename or 'file.txt').name,visibility=visibility,kind=kind)
    return {'document':doc_dict(doc),'duplicate':duplicate}

@app.get('/api/admin/review',dependencies=[Depends(admin)])
def review_queue(session=Depends(db)):
    result = []
    rows = session.execute(select(Candidate,Competition,Document,Chunk)
        .join(Competition,Candidate.competition_id==Competition.id)
        .join(Document,Competition.document_id==Document.id)
        .join(Chunk,Candidate.chunk_id==Chunk.id))
    for c,comp,doc,chunk in rows:
        result.append({'id':c.id,'competition_id':comp.id,'name':comp.name,'field':c.field,'label':LABELS.get(c.field,c.field),'value':c.value,'quote':c.quote,'status':c.status,'note':c.note,'location':chunk.location,'source':doc_dict(doc)})
    return result

class Review(BaseModel):
    status:Literal['confirmed','deferred','rejected']
    value:dict|None=None
    note:str=Field('',max_length=1000)

def validate_field(field,value):
    if field in ('name','alias','track','phase') and (not isinstance(value.get('value'),str) or not value['value'].strip()):
        raise ValueError('名称与赛道等元数据须提供非空 value 字符串')
    if field=='year' and (type(value.get('value')) is not int or not 2000<=value['value']<=2100):
        raise ValueError('年度 value 须为 2000 至 2100 的整数，无法确定时保持未知')
    if field=='recognition' and 'category' in value and value['category'] not in ('一类A','一类B','二类A','二类B','三类'):
        raise ValueError('认定类别不正确')
    if field in ('internal_deadline','organizer_deadline','internal_start','organizer_start') and 'value' in value:
        from datetime import datetime,date
        if value.get('timezone')!='Asia/Shanghai' or value.get('precision') not in ('date','minute'):
            raise ValueError('日期必须声明 date/minute 精度和 Asia/Shanghai 时区')
        date.fromisoformat(value['value']) if value['precision']=='date' else datetime.fromisoformat(value['value'])
        if value['precision']=='minute' and not value['value'].endswith('+08:00'):
            raise ValueError('精确时间必须带 +08:00')
    if field == 'team_size' and ('min' in value or 'max' in value):
        values = [value[k] for k in ('min','max') if k in value]
        if any(type(v) is not int or v<1 or v>100 for v in values) or (value.get('min',1)>value.get('max',100)):
            raise ValueError('团队人数范围不正确')
    if field in ('college','major','education','grade') and 'allowed' in value:
        if not isinstance(value['allowed'],list) or any(not isinstance(v,str) for v in value['allowed']):
            raise ValueError('资格 allowed 须为字符串数组')

@app.post('/api/admin/review/{candidate_id}',dependencies=[Depends(admin)])
def review(candidate_id:str,body:Review,session=Depends(db)):
    c = session.get(Candidate,candidate_id)
    if c is None:
        raise HTTPException(404,'无此候选')
    comp = session.get(Competition,c.competition_id)
    doc = session.get(Document,comp.document_id)
    if doc.status in ('published','superseded'):
        raise HTTPException(409,'已发布资料请先撤回或导入新版本')
    value = body.value if body.value is not None else c.value
    try:
        validate_field(c.field,value)
    except (ValueError,TypeError) as exc:
        raise HTTPException(422,str(exc))
    if body.value is not None and body.value != c.value and not body.note.strip():
        raise HTTPException(422,'修改候选值时必须填写依据说明')
    if body.status=='confirmed':
        alternatives = session.scalars(select(Candidate).where(Candidate.competition_id==comp.id,Candidate.field==c.field,Candidate.id!=c.id,Candidate.status=='confirmed')).all()
        if any(other.value!=value for other in alternatives):
            raise HTTPException(409,'同字段存在不同已确认值，请先将另一项改为待核实')
    old = {'status':c.status,'value':c.value}
    c.status,c.value,c.note = body.status,value,body.note
    # 候选审核不立即污染已发布台账；发布时原子更新。
    session.add(Audit(id=uid(),action='review',entity_id=c.id,changes={'before':old,'after':{'status':c.status,'value':c.value},'note':body.note}))
    session.commit()
    return {'ok':True}

class Publish(BaseModel):
    visibility:Literal['private','public']='private'
    note:str=Field('',max_length=1000)

@app.post('/api/admin/documents/{document_id}/publish',dependencies=[Depends(admin)])
def publish(document_id:str,body:Publish,session=Depends(db)):
    doc = session.get(Document,document_id)
    if doc is None:
        raise HTTPException(404,'无此资料')
    if doc.status not in ('pending_review','withdrawn'):
        raise HTTPException(409,'该状态不能发布；请处理解析错误或新版本')
    comps = session.scalars(select(Competition).where(Competition.document_id==doc.id)).all()
    for comp in comps:
        candidates = session.scalars(select(Candidate).where(Candidate.competition_id==comp.id)).all()
        if any(c.status=='pending' for c in candidates):
            raise HTTPException(409,'仍有未处理关键候选；确认、修改或标为待核实后再发布')
        if body.visibility=='public':
            for c in candidates:
                evidence=session.get(Document,session.get(Chunk,c.chunk_id).document_id)
                if c.status=='confirmed' and evidence.id!=doc.id and evidence.visibility!='public':
                    raise HTTPException(409,'已确认字段引用私有附件，不能通过公开主通知泄露；请先核实公开范围')
        comp.fields = {c.field:{**c.value,'evidence':{'chunk_id':c.chunk_id,'quote':c.quote,'document_id':doc.id}} for c in candidates if c.status=='confirmed' and c.field in LABELS}
        for c in candidates:
            if c.status=='confirmed' and c.field in ('name','alias','year','track','phase'):
                setattr(comp,c.field,c.value['value'])
        comp.review_status = 'partially_verified' if any(c.status=='deferred' for c in candidates) else 'verified'
        comp.last_verified = timestamp()
    if doc.warnings and not body.note.strip():
        raise HTTPException(409,'资料有冲突或提示，请填写核实说明后发布')
    if doc.supersedes:
        old = session.get(Document,doc.supersedes)
        if old and (old.source_url!=doc.source_url or old.kind!=doc.kind):
            raise HTTPException(409,'替代关系范围不一致')
    # 中间修订可能未发布；应替代当前有效版本，不能只替代上一个导入文件。
    if doc.source_url:
        active=session.scalars(select(Document).where(Document.source_url==doc.source_url,Document.kind==doc.kind,Document.visibility==body.visibility,Document.status=='published',Document.id!=doc.id).order_by(Document.version.desc())).all()
        for old in active:
            old_comps=session.scalars(select(Competition).where(Competition.document_id==old.id)).all()
            if len(comps)==len(old_comps)==1:
                if any(getattr(comps[0],key) is not None and getattr(old_comps[0],key) is not None and getattr(comps[0],key)!=getattr(old_comps[0],key) for key in ('year','track','phase')):
                    raise HTTPException(409,'同URL资料的年度、赛道或阶段不同，不能自动替代；须按范围另行建档')
            old.status='superseded'
        doc.supersedes=active[0].id if active else None
    doc.status,doc.visibility,doc.checked_at = 'published',body.visibility,timestamp()
    session.add(Audit(id=uid(),action='publish',entity_id=doc.id,changes={'visibility':doc.visibility,'note':body.note}))
    session.commit()
    return {'ok':True,'document':doc_dict(doc)}

@app.post('/api/admin/documents/{document_id}/withdraw',dependencies=[Depends(admin)])
def withdraw(document_id:str,session=Depends(db)):
    doc = session.get(Document,document_id)
    if not doc:
        raise HTTPException(404,'无此资料')
    if doc.status!='published':
        raise HTTPException(409,'只能撤回当前已发布版本，不能撤回已被替代版本')
    doc.status='withdrawn'
    if doc.supersedes:
        old = session.get(Document,doc.supersedes)
        if old and old.status=='superseded':
            old.status='published'
    session.add(Audit(id=uid(),action='withdraw',entity_id=doc.id,changes={'restored':doc.supersedes}))
    session.commit()
    return {'ok':True}


class NewCandidate(BaseModel):
    competition_id:str
    field:Literal['name','alias','year','track','phase','internal_deadline','organizer_deadline','internal_start','organizer_start','eligibility','team_size','fee','materials','registration','recognition','college','major','education','grade']
    value:dict
    chunk_id:str
    quote:str=Field(min_length=2,max_length=1000)
    note:str=Field('',max_length=1000)

class NewScope(BaseModel):
    track:str=Field(min_length=1,max_length=100)
    phase:str|None=Field(None,max_length=100)
    chunk_id:str
    quote:str=Field(min_length=2,max_length=1000)
    note:str=Field(min_length=1,max_length=1000)

@app.post('/api/admin/competitions/{competition_id}/scopes',dependencies=[Depends(admin)])
def add_scope(competition_id:str,body:NewScope,session=Depends(db)):
    base=session.get(Competition,competition_id);chunk=session.get(Chunk,body.chunk_id)
    if base is None or chunk is None:raise HTTPException(404,'赛事或证据不存在')
    doc=session.get(Document,base.document_id);evidence=session.get(Document,chunk.document_id)
    if doc.status not in ('pending_review','withdrawn'):raise HTTPException(409,'先撤回或导入新版本，再拆分赛道')
    if evidence.id!=doc.id and evidence.parent_id!=doc.id:raise HTTPException(422,'赛道证据必须来自该通知或直接附件')
    if body.quote not in chunk.text or body.track.strip() not in body.quote:raise HTTPException(422,'原文须逐字包含赛道名称')
    if body.phase and body.phase.strip() not in body.quote:raise HTTPException(422,'原文须逐字包含阶段名称')
    track=body.track.strip();phase=body.phase.strip() if body.phase else None
    if session.scalar(select(Competition).where(Competition.document_id==doc.id,Competition.track==track,Competition.phase==phase)):
        raise HTTPException(409,'该赛道和阶段已建档')
    comp=Competition(id=uid(),name=base.name,alias=base.alias,year=base.year,school=base.school,track=track,phase=phase,document_id=doc.id,fields={},review_status='pending_review')
    session.add(comp);session.flush()
    for field,value in [('track',track),('phase',phase)]:
        if value:session.add(Candidate(id=uid(),competition_id=comp.id,field=field,value={'value':value},quote=body.quote,chunk_id=chunk.id,note=body.note))
    session.add(Audit(id=uid(),action='split_scope',entity_id=comp.id,changes={'from':base.id,'track':track,'phase':phase,'note':body.note}));session.commit()
    return {'competition_id':comp.id,'status':'pending_review','rules_inherited':False}

@app.post('/api/admin/candidates',dependencies=[Depends(admin)])
def add_candidate(body:NewCandidate,session=Depends(db)):
    comp=session.get(Competition,body.competition_id)
    chunk=session.get(Chunk,body.chunk_id)
    if comp is None or chunk is None:
        raise HTTPException(404,'赛事或证据片段不存在')
    doc=session.get(Document,comp.document_id)
    evidence_doc=session.get(Document,chunk.document_id)
    if doc.status not in ('pending_review','withdrawn'):
        raise HTTPException(409,'只能向未发布或已撤回的资料添加候选')
    if evidence_doc.id!=doc.id and evidence_doc.parent_id!=doc.id:
        raise HTTPException(422,'证据必须来自该资料或其直接附件')
    if body.quote not in chunk.text:
        raise HTTPException(422,'支持原文必须逐字存在于所选片段，不能填自拟结论')
    if len(json.dumps(body.value,ensure_ascii=False))>4000:
        raise HTTPException(422,'候选值过长')
    try:validate_field(body.field,body.value)
    except (ValueError,TypeError):raise HTTPException(422,'字段结构不正确，请查看管理说明')
    candidate=Candidate(id=uid(),competition_id=comp.id,field=body.field,value=body.value,quote=body.quote,chunk_id=chunk.id,note=body.note)
    session.add(candidate);session.add(Audit(id=uid(),action='add_candidate',entity_id=candidate.id,changes={'competition_id':comp.id,'field':body.field}));session.commit()
    return {'id':candidate.id,'status':candidate.status}

@app.post('/api/admin/documents/{document_id}/reindex',dependencies=[Depends(admin)])
def reindex(document_id:str,session=Depends(db)):
    doc=session.get(Document,document_id)
    if not doc:
        raise HTTPException(404,'无此资料')
    chunks=session.scalars(select(Chunk).where(Chunk.document_id==doc.id)).all()
    try:
        for i in range(0,len(chunks),12):
            batch=chunks[i:i+12]
            vectors=embeddings([doc.title+'\n'+c.text for c in batch])
            for c,v in zip(batch,vectors):
                c.vector,c.embedding_model=v,EMBED_MODEL
        session.commit()
    except Exception as exc:
        session.rollback()
        raise HTTPException(503,f'索引失败：{type(exc).__name__}')
    return {'indexed':len(chunks),'model':EMBED_MODEL}

@app.get('/api/admin/reports',dependencies=[Depends(admin)])
def admin_reports(session=Depends(db)):
    return {'feedback':[{'id':f.id,'at':f.at,'message':f.message} for f in session.scalars(select(Feedback))],'audit':[{'at':a.at,'action':a.action,'entity_id':a.entity_id,'changes':a.changes} for a in session.scalars(select(Audit).order_by(Audit.at.desc()).limit(100))]}

app.mount('/static',StaticFiles(directory=ROOT/'app'/'static'),name='static')

@app.get('/')
def index():
    return FileResponse(ROOT/'app'/'static'/'index.html')

@app.get('/admin')
def admin_page():
    return FileResponse(ROOT/'app'/'static'/'admin.html')
