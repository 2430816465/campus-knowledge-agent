import math
import re
import time
from collections import Counter

import pytest
from sqlalchemy import select, event
from app import main
from app.db import Document
from app.rag import ranking_terms
from app.title_features import GENERIC_TITLE, title_terms, title_weights
from test_campus_information import client, insert
from test_campus_qa import factory, add
from app.campus_qa import campus_retrieve


def test_cached_features_are_exact_immutable_and_corpus_sensitive():
    titles = ('关于2026年秋季普通话报名通知', '档案查询办理通知', '普通话测试公告')
    legacy = lambda title: set(ranking_terms(re.sub(GENERIC_TITLE, ' ', title)))
    assert all(title_terms(title) == legacy(title) for title in titles)
    counts = Counter(term for title in titles for term in legacy(title))
    expected = {term: math.log(1+len(titles)/(n+1)) for term,n in counts.items()}
    assert dict(title_weights(titles)) == expected
    with pytest.raises(TypeError):
        title_weights(titles)['伪造'] = 1
    assert dict(title_weights(titles[:1])) != expected
    assert title_weights(titles) is title_weights(titles)


@pytest.mark.parametrize('field,value', [('status','withdrawn'),('visibility','private')])
def test_warm_features_never_cache_access(field,value):
    with factory()() as session:
        doc, chunk = add(session,'考生报名时间：2026年10月12日至10月14日。',title='2026年秋季普通话水平测试报名通知')
        assert campus_retrieve(session,'普通话什么时候报名？')
        assert campus_retrieve(session,'普通话什么时候报名？')
        setattr(doc,field,value)
        session.commit()
        assert not campus_retrieve(session,'普通话什么时候报名？')


def teacher(client):
    token = 'optimization-test-token'
    main.sessions[token] = time.time()+60
    client.cookies.set('campus_admin',token)
    return token


def test_teacher_full_database_search_paging_and_private_boundary(client):
    for n in range(65):
        insert(client,f'page-{n:02}',title=f'分页标题{n:02}',visibility='private' if n==0 else 'public')
    for params in ({'offset':50},{'q':'私有'},{'parent_id':'d'}):
        assert client.get('/api/admin/documents',params=params).status_code == 401
    token = teacher(client)
    try:
        first=client.get('/api/admin/documents').json()
        second=client.get('/api/admin/documents?offset=50').json()
        assert first['total']==75 and len(first['items'])==50
        assert len(second['items'])==25
        assert not ({d['id'] for d in first['items']} & {d['id'] for d in second['items']})
        assert len({d['id'] for d in first['items']+second['items']})==75
        assert 'd' in {d['id'] for d in first['items']+second['items']}
        assert client.get('/api/admin/documents',params={'q':'分页标题00'}).json()['total']==1
        assert client.get('/api/admin/documents',params={'q':'%'}).json()['total']==1
        assert client.get('/api/admin/documents',params={'q':"' OR 1=1 --"}).json()['total']==0
        assert client.get('/api/admin/documents?offset=999').json()['items']==[]
        assert client.get('/api/admin/documents?limit=101').status_code==422
        assert client.get('/api/admin/documents?offset=-1').status_code==422
        main.sessions[token]=time.time()-1
        assert client.get('/api/admin/documents?offset=50').status_code==401
    finally:
        main.sessions.pop(token,None)


def test_teacher_evidence_children_not_limited_to_loaded_page(client):
    insert(client,'outside',parent='a',visibility='private')
    token=teacher(client)
    try:
        result=client.get('/api/admin/documents',params={'parent_id':'a','limit':1}).json()
        assert result['total']==1 and result['items'][0]['id']=='outside'
        client.cookies.clear()
        assert client.get('/api/admin/documents?parent_id=a').status_code==401
        assert client.get('/api/documents/outside/chunks').status_code==401
    finally:
        main.sessions.pop(token,None)


def test_coverage_counts_all_records_but_limits_materialized_sources(client):
    for n in range(25):
        insert(client,f'coverage-{n}',title=f'资料{n}')
    with client.store() as session:
        expected=session.scalars(select(Document).where(Document.visibility=='public')).all()
        statements=[]
        bind=session.get_bind()
        def capture(conn,cursor,statement,parameters,context,executemany):
            statements.append(statement)
        event.listen(bind,'before_cursor_execute',capture)
        try:
            result=main.coverage(session)
        finally:
            event.remove(bind,'before_cursor_execute',capture)
        assert result['documents']==len(expected)
        assert result['published']==sum(d.status=='published' for d in expected)
        assert result['searchable']==sum(d.status in ('published','pending_review') for d in expected)
        assert result['failed']==2 and len(result['sources'])==20 and result['sources_truncated']
        assert any('LIMIT' in query for query in statements)
        assert not any('documents.title' in query and 'LIMIT' not in query for query in statements)
