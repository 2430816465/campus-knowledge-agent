"""Partial-index integration: real DB/index, deterministic fake query vectors."""
import hashlib
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import campus_qa, campus_search, config
from app.db import Base, Document, Chunk
from app.semantic_index import SemanticIndexBuilder, SemanticIndexReader
from app.semantic_sources import document_metadata, source_chunks
from app.compute_coordination import Coordinator
from app.model_gate import inference_gate


@pytest.fixture
def corpus(tmp_path, monkeypatch):
    monkeypatch.setenv('CAMPUS_COMPUTE_DIR', str(tmp_path / 'compute'))
    monkeypatch.setenv('CAMPUS_MODEL_LOCK_DIR', str(tmp_path / 'endpoint'))
    engine = create_engine('sqlite:///' + str(tmp_path / 'business.db'))
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        for ident, title, body in [('one','2026档案通知','日常提供纸制材料。'),
                ('two','2026档案通知附件','寒暑假仅提供电子材料。'),
                ('sem','2023学生服务通知','学生可通过电子邮件申请历史材料。')]:
            s.add(Document(id=ident,title=title,sha256=hashlib.sha256(ident.encode()).hexdigest(),raw_name='x.html',mime='.html',
                source_url='https://www.njxzc.edu.cn/'+ident+'.htm',kind='knowledge',
                visibility='public',status='pending_review',published_at='2026-01-01'))
            s.add(Chunk(id='c-'+ident,document_id=ident,text=body,location='网页段落 1 / 字符 0'))
        s.commit()
        with SemanticIndexBuilder(tmp_path / 'index','digest',3) as b:
            b.sync_inventory(source_chunks(s.connection()),document_metadata(s))
            b.build_pending(lambda texts:[[1.,0.,0.] for _ in texts])
            b.publish()
        reader = SemanticIndexReader(tmp_path / 'index')
        lexical = []
        for ident in ('one','two'):
            doc=s.get(Document,ident); chunk=s.get(Chunk,'c-'+ident)
            lexical.append(dict(id=chunk.id, document_id=ident,text=chunk.text,context='',location=chunk.location,
                score=.9,title=doc.title,url=doc.source_url,published_at=doc.published_at,version=doc.version,
                status=doc.status,warnings=[],sha256=doc.sha256,identity_score=1.))
        monkeypatch.setattr(campus_qa,'campus_retrieve',lambda *a,**kw:list(lexical))
        calls=[]
        def embed(texts):
            calls.extend(texts)
            return [[1.,0.,0.]]
        def query(question='如何申请材料？', **kwargs):
            return campus_search.retrieve_public(s,question,enabled=True,reader=reader,
                embedder=kwargs.pop('embedder',embed),digest_provider=kwargs.pop('digest_provider',lambda:'digest'),**kwargs)
        yield s,reader,lexical,calls,query
        reader.close()
    engine.dispose()


def test_feature_default_off_does_not_call_reader_or_model(corpus,monkeypatch):
    s,reader,lexical,calls,_=corpus
    monkeypatch.setattr(config,'SEMANTIC_SEARCH_ENABLED',False)
    monkeypatch.setattr(reader,'describe',lambda:pytest.fail('pilot touched reader'))
    rows,warnings=campus_search.retrieve_public(s,'申请材料',reader=reader)
    assert rows==lexical and not warnings and not calls


def test_partial_semantic_union_keeps_balanced_lexical_first_and_deduplicates(corpus):
    _,reader,lexical,calls,query=corpus
    rows,warnings=query()
    assert [r['id'] for r in rows[:2]]==['c-one','c-two']
    assert [r['id'] for r in rows].count('c-one')==1
    assert any(r['id']=='c-sem' and r['retrieval_method']=='semantic_pilot' for r in rows)
    assert warnings and '部分' in warnings[0] and len(calls)==1
    assert reader.describe()['rows']==3


def test_no_model_mode_never_calls_semantic_embedder(corpus):
    _,_,lexical,calls,query=corpus
    rows,warnings=query(allow_inference=False)
    assert rows==lexical and warnings==[] and calls==[]


def test_changed_model_digest_falls_back_before_embedding(corpus):
    _,_,lexical,calls,query=corpus
    rows,warnings=query(digest_provider=lambda:'other-digest')
    assert rows==lexical and calls==[] and '模型版本' in warnings[-1]


@pytest.mark.parametrize('change',['withdrawn','private','title','text','sha','missing_parent'])
def test_stale_or_inaccessible_semantic_chunk_never_enters_evidence(corpus,change):
    s,_,_,_,query=corpus
    doc=s.get(Document,'sem')
    if change=='withdrawn':doc.status='withdrawn'
    elif change=='private':doc.visibility='private'
    elif change=='title':doc.title='修改标题'
    elif change=='text':s.get(Chunk,'c-sem').text='改变后的正文'
    elif change=='sha':doc.sha256='b'*64
    else:doc.parent_id='absent'
    s.commit()
    rows,_=query()
    assert 'c-sem' not in {r['id'] for r in rows}


def test_annual_scope_does_not_use_republication_date_over_title(corpus):
    *_,query=corpus
    rows,_=query('2026年如何申请材料？')
    assert 'c-sem' not in {r['id'] for r in rows}


def test_explicit_document_scope_restricts_semantic_candidates(corpus):
    *_,query=corpus
    rows,_=query(document_ids=['one','two'])
    assert 'c-sem' not in {r['id'] for r in rows}
    assert query(document_ids=[])==([],[])


def test_training_gate_defers_semantic_and_preserves_lexical(corpus):
    _,_,lexical,calls,query=corpus
    def embed(texts):
        with inference_gate('http://127.0.0.1:11434',timeout=0):
            pytest.fail('Training reservation admitted model request')
    with Coordinator().training(timeout=0):
        rows,warnings=query(embedder=embed)
    assert rows==lexical and calls==[] and '训练任务' in warnings[-1]
    assert Coordinator().status()['quarantine'] is None


def test_withdrawal_after_vector_lookup_is_rechecked(corpus,monkeypatch):
    s,reader,_,_,query=corpus
    real_search=reader.search
    def withdraw(*a,**kw):
        result=real_search(*a,**kw)
        s.get(Document,'sem').status='withdrawn';s.commit()
        return result
    monkeypatch.setattr(reader,'search',withdraw)
    rows,_=query()
    assert 'c-sem' not in {r['id'] for r in rows}


def test_subject_specific_query_rejects_unknown_or_opposite_subject(corpus):
    *_,query=corpus
    rows,_=query('教师如何申请材料？')
    assert 'c-sem' not in {r['id'] for r in rows}
    rows,_=query('学生如何申请材料？')
    assert any(r['id']=='c-sem' for r in rows)


def test_broken_index_retains_keyword_search(corpus,monkeypatch):
    _,reader,lexical,_,query=corpus
    monkeypatch.setattr(reader,'describe',lambda:(_ for _ in ()).throw(ValueError('broken manifest')))
    rows,warnings=query()
    assert rows==lexical and '关键词' in warnings[-1]




def wire_pilot(corpus,monkeypatch):
    _,reader,_,_,_=corpus
    monkeypatch.setattr(config,'SEMANTIC_SEARCH_ENABLED',True)
    monkeypatch.setattr(campus_search,'index_reader',lambda _:reader)
    monkeypatch.setattr(campus_search,'model_digest',lambda *args:'digest')
    monkeypatch.setattr(campus_search,'OllamaCpuEmbedder',lambda *args:lambda texts:[[1.,0.,0.]])


def test_campus_answer_consumes_opt_in_semantic_evidence_and_keeps_source_contract(corpus,monkeypatch):
    import json
    from datetime import datetime,timezone
    wire_pilot(corpus,monkeypatch)
    def generate(messages):
        inputs=json.loads(messages[-1]['content'])['evidence']
        selected=next(row for row in inputs if '学生可通过' in row['text'])
        return {'message':{'content':json.dumps({'citations':[{'id':selected['id']}],
            'explanation':[{'text':'学生可通过电子邮件申请历史材料。','ids':[selected['id']]}]},ensure_ascii=False)}}
    monkeypatch.setattr(campus_qa,'generate',generate)
    s,*_=corpus
    result=campus_qa.campus_answer(s,'如何申请材料？',datetime.now(timezone.utc))
    assert result['mode']=='grounded_explanation'
    assert result['sources'][0]['id']=='c-sem'
    assert result['sources'][0]['url']=='https://www.njxzc.edu.cn/sem.htm'
    assert result['sources'][0]['quote']=='学生可通过电子邮件申请历史材料。'


def test_partial_coverage_warning_does_not_turn_model_refusal_into_supported_answer(corpus,monkeypatch):
    from datetime import datetime,timezone
    wire_pilot(corpus,monkeypatch)
    monkeypatch.setattr(campus_qa,'generate',lambda _: {'message':{'content':'{"citations":[],"explanation":[]}'}})
    s,*_=corpus
    result=campus_qa.campus_answer(s,'如何申请材料？',datetime.now(timezone.utc))
    assert result['mode']=='insufficient_evidence' and not result['sources']
    assert result['warnings']
