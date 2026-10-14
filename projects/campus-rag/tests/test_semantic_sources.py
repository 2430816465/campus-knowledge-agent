import sys
from types import SimpleNamespace

from sqlalchemy import create_engine, event, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.semantic_index import SemanticIndexBuilder, SemanticIndexReader
from app.semantic_sources import (readonly_connection, document_metadata,
                                  source_chunks, search_current)


def test_real_sqlite_adapter_selects_no_json_vector_and_respects_fresh_state(tmp_path, monkeypatch):
    class Base(DeclarativeBase):
        pass
    class Document(Base):
        __tablename__ = 'documents'
        id: Mapped[str] = mapped_column(String, primary_key=True)
        parent_id: Mapped[str | None] = mapped_column(String, nullable=True)
        title: Mapped[str] = mapped_column(Text)
        sha256: Mapped[str] = mapped_column(String)
        status: Mapped[str] = mapped_column(String)
        visibility: Mapped[str] = mapped_column(String)
        kind: Mapped[str] = mapped_column(String)
        published_at: Mapped[str | None] = mapped_column(String, nullable=True)
    class Chunk(Base):
        __tablename__ = 'chunks'
        id: Mapped[str] = mapped_column(String, primary_key=True)
        document_id: Mapped[str] = mapped_column(String)
        text: Mapped[str] = mapped_column(Text)
        location: Mapped[str] = mapped_column(Text)
        vector: Mapped[str] = mapped_column(Text)
    monkeypatch.setitem(sys.modules, 'app.db', SimpleNamespace(Document=Document, Chunk=Chunk))
    engine = create_engine('sqlite:///' + (tmp_path / 'business.sqlite3').as_posix())
    Base.metadata.create_all(engine)
    try:
        with engine.begin() as connection:
            connection.execute(Document.__table__.insert(), [
                {'id': 'source', 'parent_id': None, 'title': '2023试行历史原通知', 'sha256': 'a' * 64,
                 'status': 'parse_failed', 'visibility': 'public', 'kind': 'notice', 'published_at': '2024-08-30'},
                {'id': 'child', 'parent_id': 'source', 'title': '班车附件', 'sha256': 'b' * 64,
                 'status': 'pending_review', 'visibility': 'public', 'kind': 'knowledge', 'published_at': '2024-08-30'},
            ])
            connection.execute(Chunk.__table__.insert(), {'id': 'chunk', 'document_id': 'child',
                'text': '晓庄校区班车运行历史时刻表', 'location': 'PDF第1页', 'vector': 'DO NOT SELECT THIS JSON VECTOR'})
        sql = []
        event.listen(engine, 'before_cursor_execute', lambda _conn, _cursor, statement, *_: sql.append(statement))
        with SemanticIndexBuilder(tmp_path / 'index', 'digest', 3) as builder:
            with readonly_connection(engine, snapshot=True) as connection:
                metadata = document_metadata(connection)
                assert builder.sync_inventory(source_chunks(connection), metadata) == {'enqueued': 1}
            builder.build_pending(lambda texts: [[1, 0, 0] for _ in texts])
            builder.publish()
        reader = SemanticIndexReader(tmp_path / 'index')
        try:
            result = search_current(reader, engine, [1, 0, 0], model_digest='digest', years={'2023'})
            assert result['matches'][0]['text'] == '晓庄校区班车运行历史时刻表'
            with engine.begin() as connection:
                connection.execute(Document.__table__.update().where(Document.id == 'source').values(status='withdrawn'))
            assert not search_current(reader, engine, [1, 0, 0], model_digest='digest')['matches']
        finally:
            reader.close()
        selects = [statement for statement in sql if statement.lstrip().upper().startswith('SELECT')]
        assert selects and not any('vector' in statement.lower() for statement in selects)
        # All writes in this test were its explicit fixtures/revocation. None
        # occur inside any adapter call or semantic index operation.
        assert sum(statement.lstrip().upper().startswith('UPDATE') for statement in sql) == 1
    finally:
        engine.dispose()
