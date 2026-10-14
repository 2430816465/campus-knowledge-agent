import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db import Base, Document, Chunk
from app.main import app, db


@pytest.fixture(params=['sqlite','postgresql'] if os.environ.get('CAMPUS_TEST_POSTGRES') else ['sqlite'])
def client(request):
    connection = None
    if request.param == 'postgresql':
        from app.config import DATABASE_URL
        engine = create_engine(DATABASE_URL)
        connection = engine.connect()
        # Temporary tables shadow public tables only on this isolated connection.
        # Never create, delete or truncate production data.
        from sqlalchemy import text
        for table in ('documents','chunks'):
            connection.execute(text(f'CREATE TEMP TABLE {table} (LIKE public.{table} INCLUDING ALL)'))
        connection.commit()
        factory = sessionmaker(connection)
    else:
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        factory = sessionmaker(engine)
    rows = [
        ('a', '通知', '2026-10-01', 'public', 'pending_review', 'notice'),
        ('b', '办事制度', '2026-10-10', 'public', 'published', 'policy'),
        ('c', '未知日期', None, 'public', 'published', 'policy'),
        ('d', '私有资料', '2026-10-11', 'private', 'published', 'notice'),
        ('e', '失败资料', '2026-10-11', 'public', 'parse_failed', 'notice'),
        ('f', '已撤回', '2026-10-11', 'public', 'withdrawn', 'notice'),
        ('g', '同日通知', '2026-10-10', 'public', 'published', 'notice'),
        ('h', '空日期', '', 'public', 'pending_review', 'notice'),
        ('i', '字面%标题', '2025-01-01', 'public', 'published', 'catalog'),
        ('j', '部分解析', '2026-10-11', 'public', 'partial_parse', 'notice'),
    ]
    with factory() as session:
        for id, title, date, visibility, status, kind in rows:
            session.add(Document(id=id,title=title,published_at=date,visibility=visibility,status=status,
                                 kind=kind,sha256='a'*64,raw_name='test.txt',mime='text/plain'))
        session.commit()
    def dependency():
        with factory() as session:
            yield session
    app.dependency_overrides[db] = dependency
    test_client = TestClient(app)
    test_client.store = factory
    yield test_client
    app.dependency_overrides.pop(db, None)
    if connection is not None:
        connection.close()
    engine.dispose()


def test_order_and_access_across_pages(client):
    result = client.get('/api/campus-information?limit=2').json()
    assert result['total'] == 6
    assert [d['id'] for d in result['items']] == ['b', 'g']
    assert [d['id'] for d in client.get('/api/campus-information?limit=2&offset=2').json()['items']] == ['a','i']
    assert [d['id'] for d in client.get('/api/campus-information?limit=2&offset=4').json()['items']] == ['c','h']
    assert result['items'][0]['kind'] == 'policy'


def test_filters_do_not_change_review_state(client):
    assert client.get('/api/campus-information?verified=true').json()['total'] == 4
    assert client.get('/api/campus-information?year=2026').json()['total'] == 3
    assert [d['id'] for d in client.get('/api/campus-information',params={'q':'%'}).json()['items']] == ['i']
    assert client.get('/api/campus-information?limit=101').status_code == 422


def insert(client, id, title='重复通知', date='2026-10-11', body=None,
           sha=None, parent=None, status='pending_review', visibility='public'):
    with client.store() as session:
        session.add(Document(id=id, title=title, published_at=date, visibility=visibility,
                             status=status, kind='notice', sha256=sha or id.ljust(64, '0'),
                             parent_id=parent, raw_name='test.txt', mime='text/plain',
                             source_url='https://example.edu/' + id))
        if body is not None:
            session.add(Chunk(id='chunk-' + id, document_id=id, text=body, location='正文'))
        session.commit()


def test_exact_body_merges_before_pagination_but_different_dates_and_body_survive(client):
    insert(client, 'x1', body='报名截至3月20日16:00')
    insert(client, 'x2', body='报名截至3月20日16:00', status='published')
    insert(client, 'x3', body='报名截至3月21日16:00')
    insert(client, 'x4', date='2025-10-11', body='报名截至3月20日16:00')
    result = client.get('/api/campus-information', params={'q':'重复通知', 'limit':1}).json()
    assert result['total'] == 3
    assert result['merged_duplicates'] == 1
    assert result['items'][0]['id'] == 'x2'
    assert {d['id'] for d in result['items'][0]['sources']} == {'x1','x2'}
    pages = [client.get('/api/campus-information', params={'q':'重复通知','limit':1,'offset':i}).json()['items'][0]['id'] for i in range(3)]
    assert pages == ['x2','x3','x4']
    assert client.get('/api/campus-information', params={'q':'重复通知','verified':True}).json()['total'] == 1
    with client.store() as session:
        assert session.get(Document,'x1').status == 'pending_review'
        assert session.get(Document,'x2').status == 'published'
        assert session.query(Document).count() == 14
        assert session.query(Chunk).count() == 4


def test_empty_body_falls_back_to_exact_raw_and_does_not_guess(client):
    insert(client, 'r1', sha='b'*64)
    insert(client, 'r2', sha='b'*64)
    insert(client, 'r3', sha='c'*64)
    insert(client, 'r4', sha='b'*64, body='实际正文')
    result = client.get('/api/campus-information', params={'q':'重复通知'}).json()
    assert result['total'] == 3
    assert result['merged_duplicates'] == 1


def test_attachments_from_all_duplicate_sources_remain_accessible_and_private_stay_hidden(client):
    insert(client, 'p1', body='相同正文')
    insert(client, 'p2', body='相同正文')
    insert(client, 'a1', title='通知图片', parent='p1', sha='d'*64)
    insert(client, 'a2', title='通知图片', parent='p2', sha='d'*64)
    insert(client, 'a3', title='通知附件', parent='p2')
    insert(client, 'a4', title='秘密附件', parent='p1', visibility='private')
    insert(client, 'a5', title='失败附件', parent='p1', status='parse_failed')
    insert(client, 'orphan', title='孤立附件', parent='d')
    result = client.get('/api/campus-information',params={'limit':100}).json()
    parent = next(d for d in result['items'] if d['id']=='p1')
    assert {d['id'] for d in parent['related']} == {'a1','a3'}
    assert {s['id'] for s in parent['related'][0]['sources']} == {'a1','a2'}
    assert result['nested_documents'] == 3
    assert 'orphan' in {d['id'] for d in result['items']}
    assert all(d['id'] not in {'a4','a5','d'} for d in result['items'])
    # Searching only for the child must not hide it when the parent is filtered out.
    child_search = client.get('/api/campus-information',params={'q':'通知图片'}).json()
    assert child_search['total'] == 1
    assert {s['id'] for s in child_search['items'][0]['sources']} == {'a1','a2'}
    assert client.get('/api/campus-information',params={'limit':100}).json() == result


def test_chunk_boundaries_and_order_preserve_exact_content_identity(client):
    insert(client,'split1',body='甲')
    insert(client,'split2',body='甲乙')
    insert(client,'split3',body='乙')
    with client.store() as session:
        session.add(Chunk(id='second-1',document_id='split1',text='乙',location='附录'))
        # Same ordered chunks, despite the reverse insertion order.
        session.get(Chunk,'chunk-split3').location='附录'
        session.add(Chunk(id='second-3',document_id='split3',text='甲',location='正文'))
        session.commit()
    result=client.get('/api/campus-information',params={'q':'重复通知'}).json()
    assert result['total']==2 and result['merged_duplicates']==1
    assert {d['id'] for d in result['items'][0]['sources']}=={'split1','split3'}
    assert result['items'][1]['id']=='split2'


def test_empty_parent_and_literal_search_are_not_special_patterns(client):
    insert(client,'root-empty',title='根_%/路径',parent='')
    insert(client,'child-empty',title='根_%/路径 附件',parent='root-empty')
    result=client.get('/api/campus-information',params={'q':'根_%/路径'}).json()
    assert result['total']==1 and result['nested_documents']==1
    assert result['items'][0]['related'][0]['id']=='child-empty'
    assert client.get('/api/campus-information',params={'q':"' OR 1=1 --"}).json()['total']==0
