"""Read-budget and ancestor rules for global policy retrieval."""
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session
from app.db import Base, Document, Chunk
from app import rag


def store():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    return engine


def add(s, ident, body, *, title='竞赛学分政策', parent=None, status='published', visibility='public'):
    s.add(Document(id=ident, title=title, sha256=ident.ljust(64, 'a'), raw_name='x.txt', mime='.txt',
        kind='policy', parent_id=parent, status=status, visibility=visibility))
    s.add(Chunk(id='chunk-'+ident, document_id=ident, text=body, location='第1段', vector=[1., 0.]))


def test_global_semantic_path_never_reads_legacy_vectors_or_calls_model(monkeypatch):
    engine = store()
    with Session(engine) as s:
        add(s, 'doc', '竞赛学分按政策认定。')
        s.commit()
        s.execute(text("UPDATE chunks SET vector='not-valid-json'")); s.commit()
        monkeypatch.setattr(rag, 'embeddings', lambda _: (_ for _ in ()).throw(AssertionError('model called')))
        hits, warnings = rag.retrieve(s, '竞赛学分如何认定？', kind=['policy'], semantic=True)
        assert hits and hits[0]['document_id'] == 'doc'
        assert warnings and '关键词' in warnings[0]


def test_global_candidates_have_sql_limit_and_no_vector_column():
    engine = store()
    with Session(engine) as s:
        add(s, 'doc', '竞赛学分按政策认定。')
        for i in range(650):
            s.add(Chunk(id=f'extra-{i}', document_id='doc', text='竞赛学分按政策认定。', location='段落'))
        s.commit()
        statements = []
        event.listen(engine, 'before_cursor_execute', lambda c, cursor, sql, params, ctx, many: statements.append((sql, params)))
        hits, _ = rag.retrieve(s, '竞赛学分如何认定？', kind=['policy'], semantic=False)
        chunk_sql = [(sql, args) for sql, args in statements if 'FROM chunks' in sql]
        assert hits and len(chunk_sql) == 1
        sql, args = chunk_sql[0]
        assert 'LIMIT' in sql and 500 in args
        assert 'chunks.vector' not in sql and 'chunks.embedding_model' not in sql


def test_public_child_of_private_or_withdrawn_ancestor_is_excluded():
    for kwargs in ({'visibility': 'private'}, {'status': 'withdrawn'}):
        engine = store()
        with Session(engine) as s:
            add(s, 'parent', '政策封面', **kwargs)
            add(s, 'child', '竞赛学分按政策认定。', parent='parent')
            add(s, 'allowed', '竞赛学分按有效政策认定。')
            s.commit()
            hits, _ = rag.retrieve(s, '竞赛学分认定', kind=['policy'], semantic=False)
            assert {h['document_id'] for h in hits} == {'allowed'}


def test_year_filter_precedes_global_candidate_limit():
    engine = store()
    with Session(engine) as s:
        add(s, 'new', '竞赛学分认定现行条款。', title='2026竞赛学分政策')
        add(s, 'old', '竞赛学分认定历史条款。', title='2025竞赛学分政策')
        for i in range(600):
            s.add(Chunk(id=f'old-{i}', document_id='old', text='竞赛学分认定历史条款。', location='段落'))
        s.commit()
        hits, _ = rag.retrieve(s, '竞赛学分认定', year=2026, kind=['policy'], semantic=False)
        assert [h['document_id'] for h in hits] == ['new']


def test_source_scope_missing_parent_is_not_public_evidence():
    engine = store()
    with Session(engine) as s:
        add(s, 'orphan', '竞赛学分认定。', parent='absent')
        s.commit()
        hits, _ = rag.retrieve(s, '竞赛学分认定', kind=['policy'], semantic=False)
        assert hits == []
