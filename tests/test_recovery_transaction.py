import hashlib
import pytest
from sqlalchemy import create_engine, select, func, update
from sqlalchemy.orm import Session
from app.db import Base, Document, Chunk, Audit
from scripts.recovery_stage import stage_page
from scripts.recovery_transaction import append_ocr_page
from scripts.sync_school_archive import PipelineLock


@pytest.fixture
def fixture(tmp_path):
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    original = tmp_path/'archive'/'blobs'/hashlib.sha256(b'isolated original').hexdigest()
    original.parent.mkdir(parents=True); original.write_bytes(b'isolated original')
    with Session(engine, expire_on_commit=False) as session:
        doc = Document(id='test', title='test', sha256=original.name, source_url='https://www.njxzc.edu.cn/a.pdf', raw_name='raw.pdf', mime='.pdf', status='partial_parse', visibility='private', version=1, checked_at='old', error='old OCR warning', warnings=['retain'])
        session.add(doc); session.flush()
        session.add(Chunk(id='old', document_id=doc.id, text='prior page', location='第 1 页'))
        session.commit()
        expected = {k:getattr(doc,k) for k in ('id','sha256','source_url','parent_id','version','checked_at','status','visibility')}
        evidence = dict(original_sha256=original.name, original_page=21, coordinate_system='render pixels, origin top-left', render_scale=1.5, boxes=[dict(box=[[1,1],[2,1],[2,2],[1,2]],text='日期：',confidence=.9),dict(box=[[3,1],[4,1],[4,2],[3,2]],text='S',confidence=.7)])
        stage = stage_page(expected,evidence)
        with PipelineLock(original.parent.parent/'business-import.lock') as lock:
            yield session, original, lock, stage
    engine.dispose()


def counts(s):
    return s.scalar(select(func.count()).select_from(Chunk)), s.scalar(select(func.count()).select_from(Audit))


def test_append_repeat_and_preserve_state(fixture):
    s, original, lock, stage = fixture
    with s.begin():
        first = append_ocr_page(s,stage,original,lock)
        second = append_ocr_page(s,stage,original,lock)
        assert first['added_chunks']==2 and second['added_chunks']==0
        assert first['audit_id']==second['audit_id']
        assert counts(s)==(3,1)
        doc=s.get(Document,'test')
        assert (doc.status,doc.visibility,doc.error,doc.warnings)==('partial_parse','private','old OCR warning',['retain'])
        assert s.get(Chunk,'old').text=='prior page'
        assert s.get(Audit,first['audit_id']).changes['evidence']['boxes'][1]['text']=='S'


@pytest.mark.parametrize('field,value',[('version',2),('status','published'),('sha256','b'*64),('source_url','https://www.njxzc.edu.cn/b.pdf'),('visibility','public'),('checked_at','new'),('parent_id','changed')])
def test_changed_document_rejects_without_insert(fixture,field,value):
    s, original, lock, stage = fixture
    with s.begin():
        setattr(s.get(Document,'test'),field,value);s.flush()
        with pytest.raises(ValueError,match='Document changed'): append_ocr_page(s,stage,original,lock)
        assert counts(s)==(1,0)


def test_mid_page_conflict_rolls_back_new_chunks(fixture):
    s, original, lock, stage = fixture
    with s.begin():
        s.add(Chunk(id='occupied',document_id='test',text='different',location='第 21 页 / OCR 框 2'));s.flush()
        with pytest.raises(ValueError,match='location already'): append_ocr_page(s,stage,original,lock)
        assert counts(s)==(2,0)


def test_cached_document_cannot_hide_database_change(fixture):
    s, original, lock, stage = fixture
    with s.begin():
        cached = s.get(Document, 'test')
        s.execute(update(Document).where(Document.id=='test').values(version=2).execution_options(synchronize_session=False))
        assert cached.version == 1
        with pytest.raises(ValueError,match='Document changed'):
            append_ocr_page(s,stage,original,lock)
        assert counts(s)==(1,0)


def test_fresh_observation_does_not_duplicate_content(fixture):
    s, original, lock, stage = fixture
    with s.begin():
        first = append_ocr_page(s,stage,original,lock)
        s.get(Document,'test').checked_at='new observation';s.flush()
        expected = dict(stage['expected_document'], checked_at='new observation')
        refreshed = stage_page(expected, stage['evidence'])
        assert refreshed['staging_key'] != stage['staging_key']
        second = append_ocr_page(s,refreshed,original,lock)
        assert second['added_chunks']==0 and second['audit_id']==first['audit_id']
        assert counts(s)==(3,1)


def test_outer_rollback_removes_recovery(fixture):
    s, original, lock, stage = fixture
    # SQLite needs a physical outer write before SAVEPOINT for true nested
    # rollback; PostgreSQL starts the physical transaction on SELECT FOR UPDATE.
    with pytest.raises(RuntimeError):
        with s.begin():
            s.get(Document,'test').title='outer write';s.flush()
            append_ocr_page(s,stage,original,lock)
            raise RuntimeError('caller failure')
    assert counts(s)==(1,0)


def test_modified_original_rejects(fixture):
    s, original, lock, stage = fixture
    original.write_bytes(b'changed test original')
    with s.begin():
        with pytest.raises(ValueError,match='Original changed'):append_ocr_page(s,stage,original,lock)
        assert counts(s)==(1,0)


def test_tampered_stage_rejects(fixture):
    s, original, lock, stage = fixture
    stage['independent_ocr_blocks'][0]['text']='invented deadline'
    with s.begin():
        with pytest.raises(ValueError,match='Staging package changed'):append_ocr_page(s,stage,original,lock)
        assert counts(s)==(1,0)


def test_lock_and_transaction_required(fixture):
    s, original, lock, stage = fixture
    with pytest.raises(ValueError,match='transaction'):append_ocr_page(s,stage,original,lock)
    with s.begin():
        with pytest.raises(ValueError,match='lock required'):append_ocr_page(s,stage,original,None)
