"""Selective read-only business DB adapter. Never selects Chunk.vector."""
from contextlib import contextmanager

from sqlalchemy import select

from .semantic_index import SourceChunk


@contextmanager
def readonly_connection(engine, *, snapshot=False):
    connection = engine.connect()
    try:
        if snapshot:
            connection = connection.execution_options(isolation_level='REPEATABLE READ' if engine.dialect.name == 'postgresql' else 'SERIALIZABLE')
        with connection.begin():
            if engine.dialect.name == 'postgresql':
                connection.exec_driver_sql('SET TRANSACTION READ ONLY')
            yield connection
    finally:
        connection.close()


def document_metadata(connection):
    from .db import Document
    fields = (Document.id, Document.parent_id, Document.title, Document.sha256,
              Document.status, Document.visibility, Document.kind, Document.published_at)
    from .source_versions import enrich_metadata
    from .config import DATA
    metadata = {row['id']: dict(row) for row in connection.execute(select(*fields)).mappings()}
    return enrich_metadata(metadata, DATA/'source-versions'/'evidence.sqlite3')


def source_chunks(connection, *, kinds=('knowledge', 'policy', 'notice')):
    from .db import Chunk, Document
    statement = select(Chunk.id, Chunk.document_id, Chunk.text, Document.title, Document.sha256).join(
        Document, Chunk.document_id == Document.id).where(Document.visibility == 'public',
        Document.status.in_(('pending_review', 'published')), Document.kind.in_(kinds)).order_by(Chunk.id)
    for row in connection.execution_options(stream_results=True).execute(statement).mappings().yield_per(500):
        yield SourceChunk(row['id'], row['document_id'], row['sha256'], row['title'], row['text'])


def fetch_current_chunks(connection, chunk_ids):
    from .db import Chunk
    statement = select(Chunk.id, Chunk.document_id, Chunk.text, Chunk.location).where(Chunk.id.in_(chunk_ids))
    return {row['id']: dict(row) for row in connection.execute(statement).mappings()}


def search_current(reader, engine, query_vector, *, model_digest, **scope):
    # PostgreSQL default READ COMMITTED: each candidate SELECT is fresh. The
    # caller still rechecks metadata after answer generation before displaying.
    with readonly_connection(engine) as connection:
        metadata = document_metadata(connection)
        return reader.search(query_vector, model_digest=model_digest, metadata_by_id=metadata,
                             fetch_chunks=lambda ids: fetch_current_chunks(connection, ids), **scope)
