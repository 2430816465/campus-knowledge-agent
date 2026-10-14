import hashlib
import json
import pytest
from sqlalchemy import select,func
from app.db import Document,Audit,Chunk
from app.metadata_dates import plan_dates,apply_dates
from app.ingest import uid
from tests.test_campus_qa import factory

HOST='music.njxzc.edu.cn'


def document(session,root,**values):
    payload=b'<span class="arti_update">2026/01/20 01:42</span><div class="wp_articlecontent"><p>original</p></div>'
    sha=hashlib.sha256(payload).hexdigest();(root/(sha+'.html')).write_bytes(payload)
    row=Document(id=uid(),title='原通知',source_url='https://'+HOST+'/a.htm',sha256=sha,raw_name=sha+'.html',
        mime='.html',status='pending_review',visibility='public',warnings=['原有提示'])
    for name,value in values.items():setattr(row,name,value)
    session.add(row);session.flush()
    session.add(Chunk(id=uid(),document_id=row.id,text='原正文',location='网页段落 1'))
    session.commit();return row


def test_date_only_repair_records_before_values_and_audit_without_rebuilding_chunks(tmp_path):
    with factory()() as session:
        row=document(session,tmp_path)
        before_chunk=session.scalar(select(Chunk)).id
        plan=plan_dates(session,HOST,tmp_path)
        result=apply_dates(session,plan,tmp_path,tmp_path/'checkpoint.json');session.commit()
        saved=json.loads((tmp_path/'checkpoint.json').read_text(encoding='utf-8'))['changes'][0]
        assert saved['before']=={'published_at':None,'warnings':['原有提示']}
        assert row.published_at=='2026-01-20' and row.status=='pending_review' and row.visibility=='public'
        assert '原有提示' in row.warnings and len(row.warnings)==2
        assert session.scalar(select(Chunk)).id==before_chunk
        audit=session.scalar(select(Audit))
        assert audit.action=='backfill_displayed_page_date' and audit.changes['evidence'][0]['role']=='unlabelled_page_timestamp'
        assert result['updated']==1
        assert not plan_dates(session,HOST,tmp_path)['records']


@pytest.mark.parametrize('changed',[
    {'status':'published'},{'status':'withdrawn'},{'visibility':'private'},
    {'published_at':'2025-01-01'},{'source_url':'https://other.njxzc.edu.cn/a.htm'},
])
def test_record_changes_after_plan_are_not_overwritten(tmp_path,changed):
    with factory()() as session:
        row=document(session,tmp_path);plan=plan_dates(session,HOST,tmp_path)
        for name,value in changed.items():setattr(row,name,value)
        session.commit()
        result=apply_dates(session,plan,tmp_path,tmp_path/'checkpoint.json');session.commit()
        assert result['updated']==0 and result['skipped']
        assert session.scalar(select(func.count()).select_from(Audit))==0
        for name,value in changed.items():assert getattr(row,name)==value


def test_corrupt_original_or_changed_plan_evidence_is_rejected(tmp_path):
    with factory()() as session:
        row=document(session,tmp_path);plan=plan_dates(session,HOST,tmp_path)
        plan['records'][0]['date']='2026-02-20'
        assert apply_dates(session,plan,tmp_path,tmp_path/'one.json')['updated']==0
        session.rollback();plan=plan_dates(session,HOST,tmp_path)
        (tmp_path/row.raw_name).write_text('changed',encoding='utf-8')
        assert apply_dates(session,plan,tmp_path,tmp_path/'two.json')['updated']==0
        session.rollback();assert row.published_at is None


def test_checkpoint_write_failure_prevents_any_date_update(tmp_path):
    with factory()() as session:
        row=document(session,tmp_path);plan=plan_dates(session,HOST,tmp_path)
        checkpoint=tmp_path/'before.json';checkpoint.write_text('do not overwrite',encoding='utf-8')
        with pytest.raises(FileExistsError):apply_dates(session,plan,tmp_path,checkpoint)
        assert row.published_at is None and checkpoint.read_text()=='do not overwrite'
        assert session.scalar(select(func.count()).select_from(Audit))==0


def test_plan_excludes_nonpublic_reviewed_dated_children_and_other_hosts(tmp_path):
    with factory()() as session:
        parent=document(session,tmp_path,status='published')
        document(session,tmp_path,parent_id=parent.id)
        document(session,tmp_path,visibility='private')
        document(session,tmp_path,published_at='2025-01-01')
        document(session,tmp_path,source_url='https://other.njxzc.edu.cn/a.htm')
        target=document(session,tmp_path)
        assert [r['id'] for r in plan_dates(session,HOST,tmp_path)['records']]==[target.id]
        with pytest.raises(ValueError):plan_dates(session,'evil.test',tmp_path)
        with pytest.raises(ValueError):plan_dates(session,HOST,tmp_path,501)
