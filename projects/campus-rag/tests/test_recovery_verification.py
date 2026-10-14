import hashlib
import sqlite3
import pytest
from sqlalchemy import create_engine, delete, update
from sqlalchemy.orm import Session
from app.db import Base, Document, Chunk, Audit
from scripts.recovery_stage import stage_page
from scripts.recovery_transaction import append_ocr_page
from scripts.recovery_verification import verify_committed_recovery, verify_observed_recovery
from scripts.sync_school_archive import PipelineLock
import scripts.recovery_verification as verification


@pytest.fixture
def stores(tmp_path):
    archive = tmp_path/'archive'; (archive/'blobs').mkdir(parents=True)
    original = archive/'blobs'/hashlib.sha256(b'isolated original').hexdigest()
    original.write_bytes(b'isolated original')
    expected = dict(id='doc', sha256=original.name, source_url='https://www.njxzc.edu.cn/a.pdf', parent_id=None, version=1, checked_at='old', status='partial_parse', visibility='private')
    stage = stage_page(expected, dict(original_sha256=original.name,original_page=21,coordinate_system='render pixels, origin top-left',render_scale=1.5,boxes=[dict(box=[[1,1],[2,1],[2,2],[1,2]],text='日期：',confidence=.9)]))
    engine = create_engine('sqlite:///'+str(tmp_path/'business.sqlite3'))
    Base.metadata.create_all(engine)
    with Session(engine) as session, session.begin():
        session.add(Document(**expected,title='isolated',raw_name='test.pdf',mime='.pdf',error='OCR incomplete'))
    ledger = dict(url=expected['source_url'],sha256=original.name,state='fetched',import_state='partial_parse',import_error='OCR incomplete',document_id='doc')
    archive_path = archive/'archive.sqlite3'
    with sqlite3.connect(archive_path) as conn:
        conn.execute('CREATE TABLE urls(url TEXT PRIMARY KEY,sha256 TEXT,state TEXT,import_state TEXT,import_error TEXT,document_id TEXT)')
        conn.execute('INSERT INTO urls VALUES(?,?,?,?,?,?)',tuple(ledger.values()))
    def append(commit=True):
        with PipelineLock(archive/'business-import.lock') as lock, Session(engine) as session:
            session.begin()
            # Start physical outer transaction for SQLite SAVEPOINT semantics.
            session.execute(update(Document).where(Document.id=='doc').values(title='isolated'))
            append_ocr_page(session,stage,original,lock)
            session.commit() if commit else session.rollback()
    yield engine,archive_path,stage,ledger,append
    engine.dispose()


def verify(stores):
    engine,path,stage,ledger,_ = stores
    return verify_committed_recovery(engine,path,stage,ledger)


def test_crash_before_business_commit_is_not_success(stores):
    stores[-1](commit=False)
    assert verify(stores)['status']=='business_recovery_not_visible'


def test_business_commit_needs_no_false_archive_success_rewrite(stores):
    stores[-1]()
    result=verify(stores)
    assert result['status']=='page_recovery_verified_parse_state_retained'
    assert result['verified_chunks']==1 and result['archive_writes']==0
    assert not result['full_document_parse_completed']
    stores[-1]()
    assert verify(stores)==result


@pytest.mark.parametrize('column,value',[('sha256','changed'),('import_state','imported'),('import_error','changed'),('document_id','other'),('state','pending')])
def test_archive_change_blocks_reconciliation(stores,column,value):
    stores[-1]()
    with sqlite3.connect(stores[1]) as conn:
        conn.execute(f'UPDATE urls SET {column}=?',(value,))
    assert verify(stores)['status']=='archive_changed_retain_evidence'


def test_missing_chunk_not_hidden_by_committed_audit(stores):
    stores[-1]()
    with Session(stores[0]) as session,session.begin():session.execute(delete(Chunk))
    assert verify(stores)['status']=='chunk_incomplete_retain_evidence'


def test_changed_audit_not_accepted(stores):
    stores[-1]()
    with Session(stores[0]) as session,session.begin():session.execute(update(Audit).values(action='other'))
    assert verify(stores)['status']=='audit_conflict_retain_evidence'


def test_review_change_not_accepted(stores):
    stores[-1]()
    with Session(stores[0]) as session,session.begin():session.execute(update(Document).values(status='published'))
    assert verify(stores)['status']=='document_changed_retain_evidence'


def test_readonly_verification_does_not_create_missing_archive(stores,tmp_path):
    engine,_,stage,ledger,_=stores
    absent=tmp_path/'absent.sqlite3'
    with pytest.raises(sqlite3.OperationalError):verify_committed_recovery(engine,absent,stage,ledger)
    assert not absent.exists()


def test_caller_connection_cannot_hide_uncommitted_recovery(stores):
    engine,path,stage,ledger,_=stores
    with engine.connect() as connection:
        with pytest.raises(ValueError,match='Database engine required'):
            verify_committed_recovery(connection,path,stage,ledger)


@pytest.mark.parametrize('mode',['success','early_return','exception'])
def test_archive_connection_closed_on_all_paths(stores,monkeypatch,mode):
    stores[-1]()
    if mode=='early_return':
        with sqlite3.connect(stores[1]) as conn:conn.execute("UPDATE urls SET import_state='changed'")
    elif mode=='exception':
        with sqlite3.connect(stores[1]) as conn:conn.execute('DROP TABLE urls')
    opened=[]
    real_connect=sqlite3.connect
    def tracking_connect(*args,**kwargs):
        conn=real_connect(*args,**kwargs)
        opened.append(conn)  # keep alive, preventing GC from hiding a leak
        return conn
    monkeypatch.setattr(verification.sqlite3,'connect',tracking_connect)
    if mode=='exception':
        with pytest.raises(sqlite3.OperationalError):verify(stores)
    else:
        verify(stores)
    assert len(opened)==1
    with pytest.raises(sqlite3.ProgrammingError,match='closed'):
        opened[0].execute('SELECT 1')


def observed_stores(stores):
    engine,path,stage,ledger,append = stores
    append()
    observed = dict(ledger, url=ledger['url'].replace('https:', 'http:'),
                    final_url=ledger['url'])
    with sqlite3.connect(path) as conn:
        conn.execute('ALTER TABLE urls ADD COLUMN final_url TEXT')
        conn.execute('UPDATE urls SET url=?,final_url=?',
                     (observed['url'], observed['final_url']))
    return engine,path,stage,observed


def test_recorded_redirect_verified_without_mutating_either_store(stores):
    engine,path,stage,observed = observed_stores(stores)
    before = path.read_bytes()
    result = verify_observed_recovery(engine,path,stage,observed)
    assert result['status']=='page_recovery_verified_parse_state_retained'
    assert result['verified_chunks']==1
    assert result['archive_writes']==0 and not result['publication_performed']
    assert path.read_bytes()==before
    assert verify_observed_recovery(engine,path,stage,observed)==result
    # The legacy API must still refuse a redirect that lost final_url.
    with pytest.raises(ValueError,match='identity mismatch'):
        verify_committed_recovery(engine,path,stage,
            {k:v for k,v in observed.items() if k!='final_url'})


@pytest.mark.parametrize('column,value',[
    ('final_url',None),('final_url','https://www.njxzc.edu.cn/other.pdf'),
    ('sha256','changed'),('document_id','other'),('state','pending'),
    ('import_state','imported'),('import_error','new warning'),
])
def test_changed_observed_preconditions_retain_evidence(stores,column,value):
    engine,path,stage,observed = observed_stores(stores)
    with sqlite3.connect(path) as conn:
        conn.execute(f'UPDATE urls SET {column}=?',(value,))
    result = verify_observed_recovery(engine,path,stage,observed)
    assert result['status']=='archive_changed_retain_evidence'
    assert result['verified_chunks']==0


@pytest.mark.parametrize('final_url',[None,'https://www.njxzc.edu.cn/unobserved.pdf'])
def test_protocol_similarity_alone_cannot_bind_recovery(stores,final_url):
    engine,path,stage,observed = observed_stores(stores)
    observed['final_url']=final_url
    with pytest.raises(ValueError,match='Recorded source binding required'):
        verify_observed_recovery(engine,path,stage,observed)


def test_redirect_verification_still_requires_all_committed_chunks(stores):
    engine,path,stage,observed = observed_stores(stores)
    with Session(engine) as session,session.begin():
        session.execute(delete(Chunk))
    assert verify_observed_recovery(engine,path,stage,observed)['status']=='chunk_incomplete_retain_evidence'
