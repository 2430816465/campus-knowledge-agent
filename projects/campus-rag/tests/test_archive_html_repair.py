import json
import sqlite3
from sqlalchemy import select,event
import pytest
from app.db import Audit,Chunk,Document
import app.archive_html_repair as repair
from app.html_repair import ACTION
from tests.test_html_repair import fixture,RAW
from tests.test_appeal_retrieval import session_factory


def setup(tmp_path):
 factory=session_factory()
 with factory() as session:
  doc,_=fixture(session)
  target={'archive_url':doc.source_url,'source_url':doc.source_url,'document_id':doc.id,'sha256':doc.sha256}
 blobs=tmp_path/'blobs';blobs.mkdir();(blobs/target['sha256']).write_bytes(RAW)
 db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
 db.execute('''CREATE TABLE urls(url TEXT PRIMARY KEY,final_url TEXT,state TEXT,document_id TEXT,
   sha256 TEXT,mime TEXT,import_state TEXT,import_error TEXT,attempts INTEGER,error TEXT)''')
 db.execute('INSERT INTO urls VALUES(?,?,?,?,?,?,?,?,?,?)',(target['archive_url'],None,'fetched',
  target['document_id'],target['sha256'],'text/html','parse_failed','保留归档原失败',3,'历史抓取信息'))
 db.commit();return factory,target,blobs,db


def test_append_once_and_reconcile_exact_url_without_touching_other_same_sha(tmp_path):
 factory,target,blobs,db=setup(tmp_path)
 db.execute('INSERT INTO urls SELECT url||"other",NULL,state,"other-document",sha256,mime,import_state,import_error,attempts,error FROM urls')
 db.commit();other=dict(db.execute('SELECT * FROM urls WHERE document_id="other-document"').fetchone())
 before=dict(db.execute('SELECT * FROM urls WHERE document_id=?',(target['document_id'],)).fetchone())
 result=repair.apply_one(db,factory,target,blobs)
 assert result['chunks_created']==2 and result['archive_changed'] and result['archive_state']=='imported'
 row=dict(db.execute('SELECT * FROM urls WHERE url=?',(target['archive_url'],)).fetchone())
 assert {k:v for k,v in row.items() if k not in ('import_state','import_error')}=={
  k:v for k,v in before.items() if k not in ('import_state','import_error')}
 assert dict(db.execute('SELECT * FROM urls WHERE document_id="other-document"').fetchone())==other
 result=repair.apply_one(db,factory,target,blobs)
 assert result['chunks_created']==0 and result['already_repaired'] and not result['archive_changed']
 with factory() as session:
  assert len(list(session.scalars(select(Chunk))))==2
  assert len(list(session.scalars(select(Audit).where(Audit.action==ACTION))))==1
  intents=list(session.scalars(select(Audit).where(Audit.action==repair.INTENT)))
  assert len(intents)==1 and intents[0].changes['previous_import_error']=='保留归档原失败'


def test_failure_after_business_commit_resumes_cache_without_duplicate_chunks(tmp_path,monkeypatch):
 factory,target,blobs,db=setup(tmp_path)
 original=repair._sync_row
 def fail(*args):raise RuntimeError('simulated cache failure')
 monkeypatch.setattr(repair,'_sync_row',fail)
 with pytest.raises(repair.ArchiveRepairError) as caught:repair.apply_one(db,factory,target,blobs)
 assert caught.value.stage=='business_committed_cache_pending'
 assert db.execute('SELECT import_state FROM urls').fetchone()[0]=='parse_failed'
 with factory() as session:assert len(list(session.scalars(select(Chunk))))==2
 monkeypatch.setattr(repair,'_sync_row',original)
 resumed=repair.apply_one(db,factory,target,blobs)
 assert resumed['chunks_created']==0 and resumed['archive_changed']
 with factory() as session:
  assert len(list(session.scalars(select(Chunk))))==2
  assert len(list(session.scalars(select(Audit).where(Audit.action==repair.INTENT))))==1


def test_raised_business_commit_is_unknown_and_durable_audit_prevents_duplicate(tmp_path):
 factory,target,blobs,db=setup(tmp_path)
 def uncertain():
  session=factory()
  def fail_after_commit(*args):raise RuntimeError('response lost after commit')
  event.listen(session,'after_commit',fail_after_commit,once=True)
  return session
 with pytest.raises(repair.ArchiveRepairError) as caught:repair.apply_one(db,uncertain,target,blobs)
 assert caught.value.stage=='business_commit_started'
 assert db.execute('SELECT import_state FROM urls').fetchone()[0]=='parse_failed'
 resumed=repair.apply_one(db,factory,target,blobs)
 assert resumed['chunks_created']==0 and resumed['archive_changed']


def test_cache_commit_unknown_is_resolved_by_reading_current_state(tmp_path):
 factory,target,blobs,db=setup(tmp_path)
 class UnknownCommit:
  def __getattr__(self,name):return getattr(db,name)
  def commit(self):db.commit();raise RuntimeError('cache commit response lost')
 with pytest.raises(repair.ArchiveRepairError) as caught:repair.apply_one(UnknownCommit(),factory,target,blobs)
 assert caught.value.stage=='cache_commit_started'
 assert db.execute('SELECT import_state FROM urls').fetchone()[0]=='imported'
 resumed=repair.apply_one(db,factory,target,blobs)
 assert resumed['chunks_created']==0 and not resumed['archive_changed']


def test_review_withdrawal_between_commits_prevents_cache_success(tmp_path):
 factory,target,blobs,db=setup(tmp_path)
 def withdraw_factory():
  session=factory()
  def withdraw(*args):
   with factory() as reviewer:
    reviewer.get(Document,target['document_id']).status='withdrawn';reviewer.commit()
  event.listen(session,'after_commit',withdraw,once=True);return session
 with pytest.raises(repair.ArchiveRepairError) as caught:repair.apply_one(db,withdraw_factory,target,blobs)
 assert caught.value.stage=='business_committed_cache_pending'
 assert db.execute('SELECT import_state FROM urls').fetchone()[0]=='parse_failed'
 with factory() as session:assert session.get(Document,target['document_id']).status=='withdrawn'


@pytest.mark.parametrize('column,value',[
 ('state','blocked'),('sha256','0'*64),('document_id','another-id'),('final_url','https://xsc.njxzc.edu.cn/different.htm'),
 ('import_state','failed'),('mime','application/pdf'),
])
def test_stale_archive_bindings_do_not_mutate_business_or_cache(tmp_path,column,value):
 factory,target,blobs,db=setup(tmp_path)
 db.execute(f'UPDATE urls SET {column}=?',(value,));db.commit()
 before=dict(db.execute('SELECT * FROM urls').fetchone())
 with pytest.raises(repair.ArchiveRepairError):repair.apply_one(db,factory,target,blobs)
 assert dict(db.execute('SELECT * FROM urls').fetchone())==before
 with factory() as session:
  assert not list(session.scalars(select(Chunk))) and not list(session.scalars(select(Audit)))


def test_wrong_blob_never_creates_business_rows(tmp_path):
 factory,target,blobs,db=setup(tmp_path);(blobs/target['sha256']).write_bytes(b'wrong')
 with pytest.raises(repair.ArchiveRepairError):repair.apply_one(db,factory,target,blobs)
 with factory() as session:assert not list(session.scalars(select(Chunk)))


def test_partial_warning_is_not_relabelled_fully_imported(tmp_path):
 factory,target,blobs,db=setup(tmp_path)
 with factory() as session:
  session.get(Document,target['document_id']).warnings=['待 OCR 复核'];session.commit()
 result=repair.apply_one(db,factory,target,blobs)
 assert result['status']=='partial_parse' and result['archive_state']=='partial_parse'


@pytest.mark.parametrize('value',[[],{}, {'schema_version':True,'targets':[{}]},
 {'schema_version':1,'targets':[]},{'schema_version':1,'targets':[{}]}])
def test_invalid_plan_is_rejected_before_execution(tmp_path,value):
 path=tmp_path/'plan.json';path.write_text(json.dumps(value),encoding='utf-8')
 with pytest.raises(ValueError):repair.load_plan(path)


def test_preview_is_read_only_and_apply_yields_to_existing_pipeline(tmp_path,monkeypatch,capsys):
 from scripts import repair_archive_html as cli
 from scripts.sync_school_archive import PipelineLock
 factory,target,blobs,db=setup(tmp_path)
 archive=tmp_path/'school-archive';archive.mkdir()
 frontier=sqlite3.connect(archive/'frontier.sqlite3');db.backup(frontier);frontier.close()
 blobs.rename(archive/'blobs')
 plan=tmp_path/'plan.json';plan.write_text(json.dumps({'schema_version':1,'targets':[target]}),encoding='utf-8')
 monkeypatch.setattr(cli,'DATA',tmp_path);monkeypatch.setattr(cli,'Session',factory)
 assert cli.main(['--plan',str(plan)])==0
 with factory() as session:assert not list(session.scalars(select(Audit)))
 def forbidden():raise AssertionError('busy preflight must not open business DB')
 monkeypatch.setattr(cli,'Session',forbidden)
 with PipelineLock(archive/'pipeline.lock'):
  assert cli.main(['--plan',str(plan),'--apply'])==75
 assert '"backup_started": false' in capsys.readouterr().out
