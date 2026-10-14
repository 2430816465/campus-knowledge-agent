from copy import deepcopy

import pytest
from sqlalchemy import create_engine, event, func, select, update
from sqlalchemy.orm import Session
from app.db import Audit, Base, Chunk, Document
from scripts.attachment_source_rehearsal import rehearse_binding
from scripts.attachment_source_stage import stage_attachment_binding
from test_attachment_source_stage import inputs


@pytest.fixture
def fixture():
    engine = create_engine('sqlite://')
    # Physical BEGIN makes outer rollback cover released SAVEPOINTs on SQLite.
    @event.listens_for(engine, 'connect')
    def connect(dbapi, _): dbapi.isolation_level = None
    @event.listens_for(engine, 'begin')
    def begin(connection): connection.exec_driver_sql('BEGIN')
    Base.metadata.create_all(engine)
    args = inputs()
    with Session(engine) as s:
        for data in args[5].values():
            s.add(Document(**deepcopy(data), title='保留标题', raw_name='original',
                           mime='application/pdf', warnings=['保留警告'], error='保留错误'))
        s.add(Chunk(id='chunk', document_id='child', text='独立原文', location='第2页'))
        s.commit()
        yield s, stage_attachment_binding(*args), args[6], args[7]
    engine.dispose()


def apply(f): return rehearse_binding(*f)


def test_commit_reopen_and_repeat_preserve_content_review_and_sources(fixture):
    s, plan, body, payload = fixture
    with s.begin():
        before = {d.id: {k: deepcopy(getattr(d, k)) for k in Document.__table__.columns.keys()}
                  for d in s.scalars(select(Document))}
        first = apply(fixture)
        assert first['changed'] and not apply(fixture)['changed']
    with Session(s.get_bind()) as fresh:
        for d in fresh.scalars(select(Document)):
            expected = before[d.id]
            if d.id == 'notice': expected['attachments'] = plan['replacement_attachments']
            assert {k: getattr(d, k) for k in expected} == expected
        assert fresh.get(Chunk, 'chunk').text == '独立原文'
        assert fresh.scalar(select(func.count()).select_from(Audit)) == 1
        assert fresh.get(Audit, first['audit_id']).changes['new'] == plan['replacement_attachments']
    with s.begin(): assert not apply(fixture)['changed']


@pytest.mark.parametrize('target,field,value', [
    ('notice','visibility','private'), ('notice','status','withdrawn'),
    ('child','status','partial_parse'), ('child','parent_id',None),
    ('child','sha256','b'*64), ('child','source_url','https://www.njxzc.edu.cn/other.pdf'),
    ('primary','visibility','private'), ('primary','status','withdrawn'),
    ('primary','parent_id','missing'), ('primary','parent_id','primary'),
])
def test_fresh_database_state_denies_stale_or_hidden_sources(fixture,target,field,value):
    s, plan, body, payload = fixture
    with s.begin():
        cached = s.get(Document, target)
        s.execute(update(Document).where(Document.id == target).values(**{field:value})
                  .execution_options(synchronize_session=False))
        with pytest.raises(ValueError): apply(fixture)
        assert s.get(Document,'notice').attachments == plan['expected_parent_attachments']
        assert s.scalar(select(func.count()).select_from(Audit)) == 0


def test_unrelated_attachment_edit_is_not_overwritten(fixture):
    s, plan, body, payload = fixture
    with s.begin():
        changed = deepcopy(plan['expected_parent_attachments']); changed[1]['title']='新标签'
        s.get(Document,'notice').attachments = changed; s.flush()
        with pytest.raises(ValueError, match='Attachment list changed'): apply(fixture)
        assert s.get(Document,'notice').attachments == changed


def test_outer_failure_rolls_back_binding_and_audit(fixture):
    s, plan, body, payload = fixture
    with pytest.raises(RuntimeError):
        with s.begin():
            apply(fixture)
            raise RuntimeError('caller aborted')
    with s.begin():
        assert s.get(Document,'notice').attachments == plan['expected_parent_attachments']
        assert s.scalar(select(func.count()).select_from(Audit)) == 0


@pytest.mark.parametrize('mutation',['replacement','bytes','archive','edge'])
def test_tampering_is_rejected_without_writes(fixture,mutation):
    s, original, body, payload = fixture
    plan=deepcopy(original)
    if mutation=='replacement': plan['replacement_attachments'][0]['title']='伪造'
    if mutation=='bytes': body += b'changed'
    if mutation=='archive': plan['expected_child_archive']['document_id']='other'
    if mutation=='edge': plan['recorded_edge']['relation']='img'
    with s.begin():
        with pytest.raises(ValueError): rehearse_binding(s,plan,body,payload)
        assert s.get(Document,'notice').attachments == original['expected_parent_attachments']
        assert s.scalar(select(func.count()).select_from(Audit)) == 0


def test_audit_collision_rolls_back_binding(fixture):
    s, plan, body, payload = fixture
    with s.begin(): result=apply(fixture)
    with s.begin():
        s.get(Audit,result['audit_id']).changes={'conflict':True};s.flush()
        with pytest.raises(ValueError,match='audit identity collision'): apply(fixture)
        assert s.get(Document,'notice').attachments == plan['replacement_attachments']


def test_explicit_transaction_required(fixture):
    with pytest.raises(ValueError,match='transaction required'): apply(fixture)


def test_fresh_staging_after_commit_keeps_original_audit(fixture):
    s, plan, body, payload = fixture
    with s.begin(): result=apply(fixture)
    args=inputs()
    args[0]['attachments']=deepcopy(plan['replacement_attachments'])
    fresh_plan=stage_attachment_binding(*args)
    assert not fresh_plan['changes_required']
    with s.begin():
        retry=rehearse_binding(s,fresh_plan,body,payload)
        assert not retry['changed'] and retry['audit_id']==result['audit_id']
        assert s.get(Audit,result['audit_id']).changes['old']==plan['expected_parent_attachments']


def test_persistent_database_refused(tmp_path):
    engine=create_engine('sqlite:///'+str(tmp_path/'isolated.db'))
    with Session(engine) as s, s.begin():
        with pytest.raises(ValueError,match='in-memory'):rehearse_binding(s,{},b'',b'')
    engine.dispose()
