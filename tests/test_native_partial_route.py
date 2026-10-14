"""Native OOXML partial evidence must never enter legacy Word replacement."""
from copy import deepcopy
from hashlib import sha256

import pytest
from sqlalchemy import select

from app.db import Chunk,Audit
from scripts import convert_archive_doc as module
from tests.test_appeal_retrieval import session_factory
from tests.test_docx_image_repair import fixture,parsed
from tests.test_convert_archive_doc import conversion_frontier


def prepared(tmp_path,session):
    parent,doc,old,content=fixture(session)
    doc.source_url='https://jwc.njxzc.edu.cn/files/native.docx';session.commit()
    blobs=tmp_path/'archive/blobs';blobs.mkdir(parents=True);(blobs/doc.sha256).write_bytes(content)
    row={'state':'fetched','url':doc.source_url,'sha256':doc.sha256,'document_id':doc.id,'final_url':None}
    return parent,doc,old,content,row


def forbidden(*args,**kwargs):
    raise AssertionError('Native OOXML must not invoke Word/legacy conversion')


def test_actual_store_routes_partial_native_keeps_evidence_and_cache_state(tmp_path,monkeypatch):
    parsed(monkeypatch)
    with session_factory()() as session:
        parent,doc,old,content,row=prepared(tmp_path,session)
        before=(old.id,old.text,old.location,deepcopy(old.vector),old.embedding_model,doc.sha256,doc.raw_name,doc.checked_at)
        store=module.BusinessStore(session)
        event=module.convert_row(row,store,tmp_path/'archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
        assert event['state']=='partial_parse' and event['processing_method']=='native_ooxml_parse'
        assert event['word_invoked'] is False and event['original_document_id']==doc.id
        assert event['converted_document_id']==doc.id and event['converted_sha256']==sha256(content).hexdigest()
        assert (old.id,old.text,old.location,old.vector,old.embedding_model,doc.sha256,doc.raw_name,doc.checked_at)==before
        assert len(list(session.scalars(select(Chunk).where(Chunk.document_id==doc.id))))==2
        assert 'Word 图像 教师补充：待 OCR 复核' in doc.warnings and doc.status=='partial_parse'
        repeat=module.convert_row(row,store,tmp_path/'archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
        assert repeat['state']=='partial_parse'
        assert len(list(session.scalars(select(Audit))))==1
        with conversion_frontier() as frontier:
            frontier.execute('INSERT INTO urls VALUES(?,?,?,?,?,?,?,?)',(row['url'],'fetched',row['sha256'],0,1,'conversion_failed','old',doc.id))
            module.save_frontier_event(frontier,event)
            saved=frontier.execute('SELECT import_state,document_id FROM urls').fetchone()
            assert tuple(saved)==('partial_parse',doc.id)


def test_partial_native_with_no_new_image_is_read_only_not_legacy_failure(tmp_path,monkeypatch):
    parsed(monkeypatch,[('Word 段落 1','保留正文')])
    with session_factory()() as session:
        _,doc,old,_,row=prepared(tmp_path,session)
        # Make the current parser diagnostics exactly the existing ones.
        monkeypatch.setattr('app.ingest.parse',lambda *a:(None,None,None,[('Word 段落 1','保留正文')],list(doc.warnings),[]))
        event=module.convert_row(row,module.BusinessStore(session),tmp_path/'archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
        assert event['state']=='partial_parse' and event['original_document_id']==doc.id
        assert not list(session.scalars(select(Audit)))
        assert list(session.scalars(select(Chunk.id).where(Chunk.document_id==doc.id)))==[old.id]


@pytest.mark.parametrize('boundary',['private_parent','withdrawn_parent','missing_parent','withdrawn','private_original','different_sha','changed_body'])
def test_native_partial_route_preserves_review_source_and_body_guards(tmp_path,monkeypatch,boundary):
    parsed(monkeypatch)
    with session_factory()() as session:
        parent,doc,old,_,row=prepared(tmp_path,session)
        if boundary=='private_parent':parent.visibility='private'
        if boundary=='withdrawn_parent':parent.status='withdrawn'
        if boundary=='missing_parent':doc.parent_id='missing'
        if boundary=='withdrawn':doc.status='withdrawn'
        if boundary=='private_original':doc.visibility='private'
        if boundary=='different_sha':doc.sha256='0'*64
        if boundary=='changed_body':parsed(monkeypatch,[('Word 段落 1','未经许可改写正文')])
        session.commit()
        event=module.convert_row(row,module.BusinessStore(session),tmp_path/'archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
        assert event['state']=='conversion_failed'
        assert list(session.scalars(select(Chunk.id).where(Chunk.document_id==doc.id)))==[old.id]
        assert old.text=='保留正文' and old.vector==[1.0]
        assert not list(session.scalars(select(Audit).where(Audit.action=='archive_docx_image_repair')))


def test_native_published_source_bypasses_legacy_guard_without_reparse(tmp_path,monkeypatch):
    with session_factory()() as session:
        _,doc,old,_,row=prepared(tmp_path,session);doc.status='published';session.commit()
        monkeypatch.setattr('app.ingest.parse',forbidden)
        event=module.convert_row(row,module.BusinessStore(session),tmp_path/'archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
        assert event['state']=='native_parsed' and event['word_invoked'] is False
        assert doc.status=='published' and list(session.scalars(select(Chunk.id).where(Chunk.document_id==doc.id)))==[old.id]
        assert not list(session.scalars(select(Audit)))


def test_native_empty_failed_docx_can_recover_without_legacy_word(tmp_path):
    with session_factory()() as session:
        _,doc,old,_,row=prepared(tmp_path,session)
        session.delete(old);doc.status='parse_failed';doc.warnings=[];doc.error='old failure';session.commit()
        event=module.convert_row(row,module.BusinessStore(session),tmp_path/'archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
        assert event['state']=='native_parsed' and event['word_invoked'] is False
        assert doc.status=='pending_review' and doc.error is None
        assert list(session.scalars(select(Chunk.text).where(Chunk.document_id==doc.id)))==['保留正文']


def test_partial_excel_mislabeled_docx_retains_existing_rows_without_image_reparse(tmp_path,monkeypatch):
    from tests.test_native_office import workbook_bytes
    with session_factory()() as session:
        _,doc,old,_,row=prepared(tmp_path,session)
        content=workbook_bytes();doc.sha256=sha256(content).hexdigest();doc.raw_name=doc.sha256+'.docx'
        row['sha256']=doc.sha256;(tmp_path/'archive/blobs'/doc.sha256).write_bytes(content);session.commit()
        monkeypatch.setattr('app.ingest.parse',forbidden)
        event=module.convert_row(row,module.BusinessStore(session),tmp_path/'archive',tmp_path/'out',tmp_path/'helper',converter=forbidden)
        assert event['state']=='partial_parse' and event['detected_suffix']=='.xlsx'
        assert list(session.scalars(select(Chunk.id).where(Chunk.document_id==doc.id)))==[old.id]
        assert not list(session.scalars(select(Audit)))
