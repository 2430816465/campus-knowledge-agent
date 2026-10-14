from datetime import datetime, timezone
from sqlalchemy import create_engine, String, Text, Integer, ForeignKey, JSON, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import DATABASE_URL

def timestamp():
    return datetime.now(timezone.utc).isoformat()

engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite:') else {}, pool_pre_ping=True)
if DATABASE_URL.startswith('sqlite:'):
    @event.listens_for(engine, 'connect')
    def sqlite_setup(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('PRAGMA busy_timeout=10000')
Session = sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class Document(Base):
    __tablename__ = 'documents'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    publisher: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    imported_at: Mapped[str] = mapped_column(String(40), default=timestamp)
    checked_at: Mapped[str] = mapped_column(String(40), default=timestamp)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    raw_name: Mapped[str] = mapped_column(Text)
    mime: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(32), default='pending_review')
    visibility: Mapped[str] = mapped_column(String(16), default='private')
    kind: Mapped[str] = mapped_column(String(16), default='notice')
    version: Mapped[int] = mapped_column(Integer, default=1)
    supersedes: Mapped[str | None] = mapped_column(String(36), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    attachments: Mapped[list] = mapped_column(JSON, default=list)

class Chunk(Base):
    __tablename__ = 'chunks'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey('documents.id'), index=True)
    text: Mapped[str] = mapped_column(Text)
    location: Mapped[str] = mapped_column(String(120))
    vector: Mapped[list | None] = mapped_column(JSON, nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

class Competition(Base):
    __tablename__ = 'competitions'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    alias: Mapped[str | None] = mapped_column(Text, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    track: Mapped[str | None] = mapped_column(Text, nullable=True)
    phase: Mapped[str | None] = mapped_column(Text, nullable=True)
    school: Mapped[str] = mapped_column(Text, default='南京晓庄学院')
    document_id: Mapped[str] = mapped_column(ForeignKey('documents.id'), index=True)
    fields: Mapped[dict] = mapped_column(JSON, default=dict)
    review_status: Mapped[str] = mapped_column(String(32), default='pending_review')
    last_verified: Mapped[str | None] = mapped_column(String(40), nullable=True)

class Candidate(Base):
    __tablename__ = 'candidates'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    competition_id: Mapped[str] = mapped_column(ForeignKey('competitions.id'), index=True)
    field: Mapped[str] = mapped_column(String(64))
    value: Mapped[dict] = mapped_column(JSON)
    quote: Mapped[str] = mapped_column(Text)
    chunk_id: Mapped[str] = mapped_column(ForeignKey('chunks.id'))
    status: Mapped[str] = mapped_column(String(32), default='pending')
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

class Audit(Base):
    __tablename__ = 'audit'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    at: Mapped[str] = mapped_column(String(40), default=timestamp)
    action: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(36))
    changes: Mapped[dict] = mapped_column(JSON, default=dict)

class Feedback(Base):
    __tablename__ = 'feedback'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    at: Mapped[str] = mapped_column(String(40), default=timestamp)
    message: Mapped[str] = mapped_column(Text)

def init_db():
    Base.metadata.create_all(engine)
