from copy import deepcopy
from datetime import datetime,timezone
import pytest
from app import table_index as ti
from app.campus_qa import campus_answer,revalidate_sources
from app.model_evidence import prepare_units
from tests.test_appeal_retrieval import session_factory,add


def audit_fixture(digest):
    def row(number, values, verified=True):
        return {'row':number,'complete_verified_rectangle':verified,
            'cells':[{'column':i+1,'text':v,'bbox':[i*50,number*20,(i+1)*50,(number+1)*20],
                      'verified':verified} for i,v in enumerate(values)]}
    return {'sha256':digest,'nonempty_cells':12,'verified_cells':9,'unsupported_pages':[],
        'tables':[{'page':4,'table':1,'rows':[
            row(1,['项目编号','项目类型','评审结果']),
            row(2,['X202511460221','创新训练项目','合格']),
            row(3,['S202511460041','创业训练项目','不合格'],False),
            row(4,['X202511460222','创业实践项目','合格'])]}]}


@pytest.fixture
def corpus(tmp_path,monkeypatch):
    path=tmp_path/'rows.sqlite3'
    monkeypatch.setattr(ti,'cache_path',lambda:path)
    session=session_factory()()
    parent,_=add(session,'2026结项验收通知',['查看附件'])
    doc,_=add(session,'2026项目结果表',['项目类型 评审结果'],parent_id=parent.id)
    db=ti.open_writer(path);ti.save_audit(db,audit_fixture(doc.sha256));db.close()
    yield session,parent,doc,path
    session.close()


def test_verified_header_and_complete_row_required_without_filling_across_tables():
    value=audit_fixture('a'*64)
    rows=ti.verified_rows(value)
    assert len(rows)==2
    assert rows[0]['fields'][1]['header']=='项目类型'
    assert rows[0]['fields'][1]['text']=='创新训练项目'
    assert rows[0]['fields'][1]['bbox']!=rows[0]['fields'][1]['header_bbox']
    value['tables'][0]['rows'][0]['complete_verified_rectangle']=False
    assert ti.verified_rows(value)==[]


def test_index_is_idempotent_and_exact_identifier_not_partial_or_unverified(corpus):
    session,_,doc,path=corpus
    db=ti.open_writer(path);ti.save_audit(db,audit_fixture(doc.sha256))
    assert db.execute('SELECT COUNT(*) FROM grid_rows').fetchone()[0]==2
    assert db.execute('SELECT COUNT(*) FROM grid_keys').fetchone()[0]==2
    db.close()
    hits=ti.retrieve_tables(session,'项目编号x202511460221的类型和评审结果？',path=path)
    assert len(hits)==1 and hits[0]['fields'][1]['text']=='创新训练项目'
    assert hits[0]['quote_method']=='verified_pdf_table_cells'
    for q in ['X20251146022','X2025114602210','S202511460041','全部合格项目有哪些','2025年有哪些']:
        assert ti.retrieve_tables(session,q,path=path)==[]


def test_scope_year_and_private_ancestor_are_live_authority(corpus):
    session,parent,doc,path=corpus
    q='2026年结果表X202511460221'
    assert ti.retrieve_tables(session,q,path=path)
    assert not ti.retrieve_tables(session,'2024年结果表X202511460221',path=path)
    assert not ti.retrieve_tables(session,q,document_ids=[],path=path)
    parent.visibility='private';session.commit()
    assert not ti.retrieve_tables(session,q,path=path)


def test_after_model_wait_withdrawal_and_changed_cells_fail_closed(corpus):
    session,parent,_,path=corpus
    row=ti.retrieve_tables(session,'X202511460221',path=path)[0]
    row['quote']=row['text']
    assert revalidate_sources(session,[row])==[row]
    changed=deepcopy(row);changed['fields'][1]['text']='创业实践项目'
    assert not revalidate_sources(session,[changed])
    parent.status='withdrawn';session.commit()
    assert not revalidate_sources(session,[row])


def test_changed_raw_version_or_missing_cache_rejects_old_record(corpus):
    session,_,doc,path=corpus
    row=ti.retrieve_tables(session,'X202511460221',path=path)[0];row['quote']=row['text']
    doc.sha256='b'*64;session.commit()
    assert not revalidate_sources(session,[row])
    assert not ti.retrieve_tables(session,'X202511460221',path=path)


def test_answer_path_preserves_cell_provenance_and_does_not_call_model(corpus,monkeypatch):
    session,_,doc,_=corpus
    import app.campus_qa as qa
    def forbidden(*args,**kwargs):raise AssertionError('no model expected')
    monkeypatch.setattr(qa,'generate',forbidden)
    result=campus_answer(session,'项目编号X202511460221是什么类型、结果如何？',datetime.now(timezone.utc),use_model=False)
    assert result['mode']=='evidence_fallback'
    assert result['sources'][0]['document_id']==doc.id
    assert '【表格按列展示】' in result['answer']
    assert '项目类型：创新训练项目' in result['answer']
    assert result['sources'][0]['fields'][1]['bbox']
    units,originals,prompt,_=prepare_units(result['sources'])
    assert prompt[0]['evidence_format'].startswith('表格按列展示')
    assert originals['E1'][0]['fields']==result['sources'][0]['fields']
    assert prepare_units(result['sources'],budget=10)[0]==[]


def test_model_response_keeps_explicit_cells_and_rechecks_after_generation(corpus,monkeypatch):
    session,parent,_,_=corpus
    import app.campus_qa as qa
    def model(*args,**kwargs):
        return {'message':{'content':'{"citations":[{"id":"E1"}],"explanation":[{"text":"类型为创新训练项目，评审结果为合格。","ids":["E1"]}]}'},'model':'fixture'}
    monkeypatch.setattr(qa,'generate',model)
    answer=campus_answer(session,'项目编号X202511460221是什么类型、结果如何？',datetime.now(timezone.utc))
    assert answer['mode']=='grounded_explanation'
    assert answer['sources'][0]['quote_method']=='verified_pdf_table_cells'
    assert answer['model']['quote_method']=='server_copy_with_explicit_table_cell_evidence'
    def withdrawn(*args,**kwargs):
        parent.visibility='private';session.commit()
        return model()
    monkeypatch.setattr(qa,'generate',withdrawn)
    answer=campus_answer(session,'项目编号X202511460221是什么类型、结果如何？',datetime.now(timezone.utc))
    assert answer['mode']=='insufficient_evidence' and answer['sources']==[]


def test_builder_actual_pdf_reader_and_resume_without_business_writes(tmp_path,monkeypatch):
    from hashlib import sha256
    from tests.test_pdf_tables import table_pdf
    import scripts.index_pdf_tables as builder
    import scripts.audit_pdf_tables as auditor
    factory=session_factory()
    payload=table_pdf();raw=tmp_path/'raw';raw.mkdir();(raw/'fixture.pdf').write_bytes(payload)
    with factory() as session:
        doc,_=add(session,'公开表格',['ID Type'])
        doc.sha256=sha256(payload).hexdigest();doc.raw_name='fixture.pdf';session.commit()
    monkeypatch.setattr(builder,'Session',factory);monkeypatch.setattr(builder,'DATA',tmp_path)
    monkeypatch.setattr(builder,'ROOT',tmp_path)
    monkeypatch.setattr(auditor,'Session',factory);monkeypatch.setattr(auditor,'DATA',tmp_path)
    import sys,json
    for name in ('first','resume'):
        report=tmp_path/'reports'/f'{name}.json'
        monkeypatch.setattr(sys,'argv',['index_pdf_tables','--document-id',doc.id,'--report',str(report)])
        assert builder.main()==0
        value=json.loads(report.read_text(encoding='utf-8'))
        assert value['business_database_writes']==0 and value['cached_documents']==1
        assert (len(value['events'])==1 if name=='first' else value['events']==[])


def test_failed_disposition_is_explicit_and_never_creates_answer_rows(tmp_path):
    path=tmp_path/'rows.sqlite3';db=ti.open_writer(path)
    ti.save_audit(db,audit_fixture('a'*64))
    assert db.execute('SELECT COUNT(*) FROM grid_rows').fetchone()[0]==2
    ti.save_disposition(db,'a'*64,'deferred','document_page_budget')
    import json
    result=json.loads(db.execute('SELECT result FROM documents').fetchone()[0])
    assert result=={'state':'deferred','reason':'document_page_budget','rows':0}
    assert db.execute('SELECT COUNT(*) FROM grid_rows').fetchone()[0]==0
    assert db.execute('SELECT COUNT(*) FROM grid_keys').fetchone()[0]==0
    db.close()
