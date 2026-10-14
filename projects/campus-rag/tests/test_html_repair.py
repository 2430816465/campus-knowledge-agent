from hashlib import sha256
import pytest
from sqlalchemy import select
from app.db import Document,Chunk,Audit,Competition,Candidate
from app.html_repair import document_snapshot,repair_html_empty_nodes,ACTION
from tests.test_appeal_retrieval import session_factory,add

BODY='这是直接来自公开网页正文的恢复说明，应保留完整来源和原件，不能将自动恢复等同于教师审核。'
RAW=('<div class="wp_articlecontent"><div>'+BODY*4+'</div><div>'+BODY*3+'</div><p></p></div>').encode()


def fixture(session,raw=RAW):
 doc=Document(id='source',title='2026校园通知',kind='knowledge',visibility='public',status='parse_failed',
  sha256=sha256(raw).hexdigest(),mime='.html',raw_name=sha256(raw).hexdigest()+'.html',
  source_url='https://xsc.njxzc.edu.cn/example.htm',error='历史失败不能丢失',
  warnings=['教师备注保留'],attachments=[{'url':'https://xsc.njxzc.edu.cn/test.pdf','status':'not_imported'}])
 session.add(doc);session.commit();return doc,document_snapshot(doc)


def test_real_parser_repair_preserves_identity_metadata_history_and_repeat():
 with session_factory()() as session:
  doc,before=fixture(session)
  result=repair_html_empty_nodes(session,doc.id,before,RAW);session.commit()
  assert result['chunks_created']==2 and doc.status=='pending_review' and doc.error is None
  after=document_snapshot(doc)
  assert {k:v for k,v in after.items() if k not in ('status','error','warnings')}=={
   k:v for k,v in before.items() if k not in ('status','error','warnings')}
  assert before['warnings'][0] in doc.warnings and before['attachments']==doc.attachments
  chunks=list(session.scalars(select(Chunk)));ids={c.id for c in chunks}
  assert [c.text for c in chunks]==[BODY*4,BODY*3]
  assert all(c.vector is None and c.embedding_model is None for c in chunks)
  audit=session.scalar(select(Audit).where(Audit.action==ACTION))
  assert audit.changes['previous_error']==before['error'] and not audit.changes['original_bytes_changed']
  doc.status='published';session.commit()
  result=repair_html_empty_nodes(session,doc.id,before,RAW);session.commit()
  assert result['already_repaired'] and result['chunks_created']==0 and doc.status=='published'
  assert ids==set(session.scalars(select(Chunk.id))) and len(list(session.scalars(select(Audit))))==1


@pytest.mark.parametrize('boundary',['private','withdrawn','superseded','published','partial_parse',
 'sha','url','raw_name','version','warnings','existing_chunks','existing_competition',
 'private_parent','withdrawn_parent','missing_parent','cycle','external','login'])
def test_permission_stale_snapshot_and_existing_authority_are_rejected(boundary):
 with session_factory()() as session:
  doc,before=fixture(session)
  if boundary in ('withdrawn','superseded','published','partial_parse'):doc.status=boundary
  elif boundary=='private':doc.visibility='private'
  elif boundary=='sha':doc.sha256='0'*64
  elif boundary=='url':doc.source_url='https://xsc.njxzc.edu.cn/changed.htm'
  elif boundary=='raw_name':doc.raw_name='elsewhere.html'
  elif boundary=='version':doc.version=2
  elif boundary=='warnings':doc.warnings=['教师新备注']
  elif boundary=='existing_chunks':session.add(Chunk(id='old',document_id=doc.id,text='旧证据',location='原位置',vector=[1]))
  elif boundary=='existing_competition':session.add(Competition(id='comp',name='已有台账',document_id=doc.id,fields={}))
  elif boundary=='missing_parent':doc.parent_id='missing'
  elif boundary=='cycle':doc.parent_id=doc.id
  elif boundary=='external':doc.source_url='https://example.com/news';before=document_snapshot(doc)
  elif boundary=='login':doc.source_url='https://xsc.njxzc.edu.cn/login';before=document_snapshot(doc)
  else:
   parent,_=add(session,'父来源',[]);doc.parent_id=parent.id
   if boundary=='private_parent':parent.visibility='private'
   else:parent.status='withdrawn'
   before=document_snapshot(doc)
  session.commit()
  with pytest.raises(ValueError):repair_html_empty_nodes(session,doc.id,before,RAW)
  session.rollback()
  assert not list(session.scalars(select(Audit)))


@pytest.mark.parametrize('body',[
 '<p>普通段落正文</p>', '<div>原本没有结构节点的文章</div>',
 '<div>附件名称.pdf</div><p></p>', '<p><img src="x.png"></p>',
 '<div>'+BODY*7+'</div><p>已有非空段落</p>',
])
def test_only_confirmed_empty_node_defect_with_substantive_body_is_repaired(body):
 raw=('<div class="wp_articlecontent">'+body+'</div>').encode()
 with session_factory()() as session:
  doc,before=fixture(session,raw)
  with pytest.raises(ValueError):repair_html_empty_nodes(session,doc.id,before,raw)
  session.rollback()
  assert not list(session.scalars(select(Chunk)))


def test_caller_rollback_is_atomic_and_creates_no_partial_audit_or_chunks():
 with session_factory()() as session:
  doc,before=fixture(session)
  repair_html_empty_nodes(session,doc.id,before,RAW);session.rollback()
  session.refresh(doc)
  assert document_snapshot(doc)==before and not list(session.scalars(select(Audit)))
  assert not list(session.scalars(select(Chunk)))


def test_notice_candidates_remain_unreviewed_and_tied_to_recovered_chunks():
 raw=('<div class="wp_articlecontent"><div>'+BODY*5+'</div><div>报名截止2026年10月20日之前，请提交报名表和证明材料。</div><p></p></div>').encode()
 with session_factory()() as session:
  doc,_=fixture(session,raw);doc.kind='notice';session.commit();before=document_snapshot(doc)
  repair_html_empty_nodes(session,doc.id,before,raw);session.commit()
  comp=session.scalar(select(Competition));candidates=list(session.scalars(select(Candidate)))
  assert comp.review_status=='pending_review' and comp.year==2026 and candidates
  assert all(c.status=='pending' and session.get(Chunk,c.chunk_id).document_id==doc.id for c in candidates)


@pytest.mark.parametrize('url',['ftp://xsc.njxzc.edu.cn/test.htm',
 'https://user:password@xsc.njxzc.edu.cn/test.htm','https://xsc.njxzc.edu.cn:999/test.htm',
 'https://xsc.njxzc.edu.cn/te\nst.htm'])
def test_ambiguous_source_urls_are_not_accepted_as_public_identity(url):
 with session_factory()() as session:
  doc,_=fixture(session);doc.source_url=url;session.commit();before=document_snapshot(doc)
  with pytest.raises(ValueError):repair_html_empty_nodes(session,doc.id,before,RAW)
  session.rollback()
  assert not list(session.scalars(select(Chunk)))


def test_existing_parser_warnings_are_preserved_without_claiming_fully_parsed():
 with session_factory()() as session:
  doc,_=fixture(session);doc.warnings=['教师备注待 OCR 复核'];session.commit()
  repair_html_empty_nodes(session,doc.id,document_snapshot(doc),RAW);session.commit()
  assert doc.status=='partial_parse' and '教师备注待 OCR 复核' in doc.warnings


def test_wrong_bytes_do_not_change_any_document_or_audit():
 with session_factory()() as session:
  doc,before=fixture(session)
  with pytest.raises(ValueError):repair_html_empty_nodes(session,doc.id,before,RAW+b'changed')
  session.rollback();session.refresh(doc)
  assert document_snapshot(doc)==before and not list(session.scalars(select(Audit)))
