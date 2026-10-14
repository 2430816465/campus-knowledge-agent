from hashlib import sha256
from io import BytesIO

import pytest
from sqlalchemy import select
from app.db import Chunk,Audit
from scripts.convert_archive_doc import BusinessStore
from tests.test_appeal_retrieval import session_factory,add


def fixture(session):
    from docx import Document
    package=Document();package.add_paragraph('保留正文');stream=BytesIO();package.save(stream)
    content=stream.getvalue()
    parent,_=add(session,'通知',['附件'])
    doc,rows=add(session,'派生副本',['保留正文'],parent_id=parent.id)
    doc.mime='.docx';doc.sha256=sha256(content).hexdigest();doc.raw_name=doc.sha256+'.docx'
    doc.status='partial_parse';doc.warnings=['Word 图像 教师补充：待 OCR 复核','原件来源']
    rows[0].location='Word 段落 1';rows[0].vector=[1.0];rows[0].embedding_model='existing'
    session.commit()
    return parent,doc,rows[0],content


def parsed(monkeypatch,blocks=None):
    monkeypatch.setattr('app.ingest.parse',lambda *a:(None,None,None,
        blocks if blocks is not None else [('Word 段落 1','保留正文'),('Word 图像 1 / WMF OCR 1','电子专用章')],
        ['Word 图像 1 有方向未核实框，待 OCR 复核'],[]))


def test_append_retains_ids_vectors_notes_identity_and_repeat_is_noop(monkeypatch):
    parsed(monkeypatch)
    with session_factory()() as session:
        _,doc,old,content=fixture(session);store=BusinessStore(session)
        fields=('id','sha256','raw_name','source_url','parent_id','title','version','visibility','mime')
        before={k:getattr(doc,k) for k in fields}
        old_before=(old.id,old.text,old.location,old.vector,old.embedding_model)
        store.repair_docx_images(doc,content)
        assert {k:getattr(doc,k) for k in fields}==before
        assert (old.id,old.text,old.location,old.vector,old.embedding_model)==old_before
        assert doc.status=='partial_parse' and 'Word 图像 教师补充：待 OCR 复核' in doc.warnings
        rows=list(session.scalars(select(Chunk).where(Chunk.document_id==doc.id)))
        assert len(rows)==2 and next(c for c in rows if c.id!=old.id).vector is None
        ids={c.id for c in rows};store.repair_docx_images(doc,content)
        assert ids==set(session.scalars(select(Chunk.id).where(Chunk.document_id==doc.id)))
        audits=list(session.scalars(select(Audit)))
        assert len(audits)==1 and audits[0].changes['existing_chunks_replaced'] is False


@pytest.mark.parametrize('boundary',['private_parent','withdrawn_parent','missing_parent','withdrawn',
    'changed_sha','empty_chunks','changed_body','new_body'])
def test_deny_permission_identity_and_body_changes_without_audit(monkeypatch,boundary):
    parsed(monkeypatch)
    with session_factory()() as session:
        parent,doc,old,content=fixture(session)
        if boundary=='private_parent':parent.visibility='private'
        if boundary=='withdrawn_parent':parent.status='withdrawn'
        if boundary=='missing_parent':doc.parent_id='missing'
        if boundary=='withdrawn':doc.status='withdrawn'
        if boundary=='changed_sha':doc.sha256='0'*64
        if boundary=='empty_chunks':session.delete(old)
        if boundary=='changed_body':parsed(monkeypatch,[('Word 段落 1','改写正文')])
        if boundary=='new_body':parsed(monkeypatch,[('Word 段落 1','保留正文'),('Word 段落 2','新增正文')])
        session.commit()
        with pytest.raises(ValueError):BusinessStore(session).repair_docx_images(doc,content)
        session.rollback()
        assert not list(session.scalars(select(Audit)))


def test_published_data_is_read_only(monkeypatch):
    def forbidden(*a):raise AssertionError('Reviewed document must not reparse')
    monkeypatch.setattr('app.ingest.parse',forbidden)
    with session_factory()() as session:
        _,doc,old,content=fixture(session);doc.status='published';session.commit()
        assert BusinessStore(session).repair_docx_images(doc,content).status=='published'
        assert list(session.scalars(select(Chunk.id).where(Chunk.document_id==doc.id)))==[old.id]
        assert not list(session.scalars(select(Audit)))


def test_archive_partial_repair_never_launches_word_or_reassigns_metadata(tmp_path):
    from tests.test_convert_archive_doc import module,archived,FakeStore
    from types import SimpleNamespace
    class Store(FakeStore):
        def find_conversion(self,original):
            return SimpleNamespace(id='partial',status='partial_parse',sha256='a'*64)
        def repair_conversion_images(self,derived):return derived
    def forbidden(*a):raise AssertionError('Do not repeat Word for retained partial evidence')
    store=Store()
    event=module.convert_row(archived(tmp_path),store,tmp_path/'school-archive',tmp_path/'out',
        tmp_path/'helper',converter=forbidden)
    assert event['state']=='conversion_parse_failed' and event['word_invoked'] is False
    assert event['converted_document_id']=='partial' and event['reused']
    assert [c[0] for c in store.calls]==['original']
