"""Recovery must not detach an attachment from an unavailable notification."""
from hashlib import sha256
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db import Base, Document, Chunk, Audit
from scripts.convert_archive_doc import BusinessStore


def document(identifier, **changes):
    values=dict(id=identifier,title='notification',kind='policy',status='pending_review',
                visibility='public',sha256='a'*64,raw_name='fixture.html',mime='.html',
                source_url='https://www.njxzc.edu.cn/'+identifier+'.htm')
    values.update(changes)
    return Document(**values)


@pytest.mark.parametrize('boundary',[
    'missing','private','withdrawn','superseded','missing_ancestor','private_ancestor','cycle',
])
@pytest.mark.parametrize('existing_original',[False,True])
def test_parent_boundary_denies_before_ingest_or_reuse(boundary,existing_original):
    engine=create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        parent=document('parent')
        if boundary!='missing':session.add(parent)
        if boundary in ('private','withdrawn','superseded'):
            setattr(parent,'visibility' if boundary=='private' else 'status',boundary)
        if boundary=='missing_ancestor':parent.parent_id='absent'
        if boundary=='private_ancestor':
            parent.parent_id='ancestor';session.add(document('ancestor',visibility='private'))
        if boundary=='cycle':parent.parent_id=parent.id
        payload=b'original retained'
        row=dict(url='https://www.njxzc.edu.cn/a.doc',parent=parent.source_url,
                 sha256=sha256(payload).hexdigest())
        if existing_original:
            original=document('original',source_url=row['url'],sha256=row['sha256'],
                              mime='.doc',status='parse_failed')
            session.add(original);row['document_id']=original.id
        session.commit()
        before=[(d.id,d.status,d.parent_id,d.visibility) for d in session.scalars(select(Document))]
        store=BusinessStore(session)
        store.ingest_bytes=Mock(side_effect=AssertionError('must not write originals'))
        with pytest.raises(ValueError):store.ensure_original(row,payload)
        store.ingest_bytes.assert_not_called()
        assert before==[(d.id,d.status,d.parent_id,d.visibility) for d in session.scalars(select(Document))]
        assert not list(session.scalars(select(Chunk)))
        assert not list(session.scalars(select(Audit)))
    engine.dispose()


@pytest.mark.parametrize('state',['pending_review','published','parse_failed','partial_parse','converted'])
def test_allowed_source_shell_reuses_original_without_changing_review(state):
    engine=create_engine('sqlite://');Base.metadata.create_all(engine)
    with Session(engine) as session:
        parent=document('parent',status=state)
        payload=b'original retained'
        original=document('original',source_url='https://www.njxzc.edu.cn/a.doc',
                          mime='.doc',sha256=sha256(payload).hexdigest(),status='parse_failed',parent_id=parent.id)
        session.add_all([parent,original]);session.commit()
        store=BusinessStore(session);store.ingest_bytes=Mock(side_effect=AssertionError('must reuse'))
        row=dict(url=original.source_url,parent=parent.source_url,sha256=original.sha256,document_id=original.id)
        assert store.ensure_original(row,payload).id==original.id
        store.ingest_bytes.assert_not_called()
        assert parent.status==state and original.status=='parse_failed'
        assert not list(session.scalars(select(Audit)))
    engine.dispose()
