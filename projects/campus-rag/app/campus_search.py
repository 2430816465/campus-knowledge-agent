"""Opt-in partial semantic retrieval; source permissions remain in business DB."""
import math
import re
from functools import lru_cache

import httpx
from sqlalchemy import select

from . import config
from .db import Document
from .model_gate import model_deferred_notice
from .semantic_index import SemanticIndexReader, reciprocal_rank_fusion
from .semantic_ollama import OllamaCpuEmbedder, model_digest
from .semantic_sources import document_metadata, fetch_current_chunks


@lru_cache(maxsize=1)
def index_reader(root):
    return SemanticIndexReader(root)


def current_semantic_rows(session, matches, question):
    """Adapt fresh indexed chunks to existing citation contract, never raw text cache."""
    from .campus_qa import revalidate_sources
    if not matches:
        return []
    ids = {row['document_id'] for row in matches}
    docs = {row.id: row for row in session.execute(select(
        Document.id, Document.title, Document.source_url, Document.published_at,
        Document.version, Document.status, Document.warnings, Document.sha256
    ).where(Document.id.in_(ids)))}
    student = '学生' in question
    staff = bool(re.search(r'教职工|教师|老师', question))
    evidence = []
    for match in matches:
        doc = docs.get(match['document_id'])
        score = match.get('score')
        if (doc is None or not isinstance(score, (int, float)) or not math.isfinite(score)
                or score < .55 or doc.sha256 != match['source_sha256']):
            continue
        # Semantic rows lack the lexical path's section context. Subject-specific
        # questions require an explicit matching subject and no opposite subject;
        # unknown/context-dependent passages stay out rather than guess a chapter.
        subject_text = doc.title + '\n' + match['text']
        if student != staff:
            required = r'学生' if student else r'教职工|教师|老师'
            opposite = r'教职工|教师|老师' if student else r'学生'
            if not re.search(required, subject_text) or re.search(opposite, subject_text):
                continue
        evidence.append({'id': match['chunk_id'], 'chunk_id': match['chunk_id'],
            'document_id': doc.id, 'title': doc.title, 'url': doc.source_url,
            'text': match['text'], 'quote': match['text'], 'context': '',
            'location': match.get('location'), 'score': score,
            'published_at': doc.published_at, 'version': doc.version,
            'status': doc.status, 'warnings': doc.warnings or [], 'sha256': doc.sha256,
            'identity_score': 0, 'retrieval_method': 'semantic_pilot'})
    # A second fresh DB check protects a withdrawal/change between vector search
    # and adaptation. campus_answer still rechecks again after generation.
    fresh = revalidate_sources(session, evidence)
    return [{k: v for k, v in row.items() if k != 'quote'} for row in fresh]


def retrieve_public(session, question, limit=6, document_ids=None, *,
                    allow_inference=True, enabled=None, reader=None,
                    embedder=None, digest_provider=None):
    from .campus_qa import campus_retrieve, requested_years
    if document_ids is not None and not document_ids:
        return [], []
    lexical = campus_retrieve(session, question, limit=limit, document_ids=document_ids)
    table_warnings = []
    try:
        from .image_row_index import retrieve_image_rows
        image_rows = retrieve_image_rows(session, question, lexical, document_ids, limit)
        if image_rows:
            lexical = (image_rows + lexical)[:limit]
    except Exception:
        table_warnings.append('图片行核验索引暂不可用，已使用独立原文片段；不能推定跨框关系。')
    try:
        from .table_index import retrieve_tables
        tables = retrieve_tables(session,question,document_ids=document_ids,limit=limit)
        if tables:
            lexical = (tables + lexical)[:limit]
            table_warnings.append('仅按完整编号检索已核验表格行；表格索引覆盖不完整，不能据此列出全部项目。')
    except Exception:
        table_warnings.append('表格索引暂不可用，已使用正文检索。')
    enabled = config.SEMANTIC_SEARCH_ENABLED if enabled is None else enabled
    if not enabled or not allow_inference or session is None:
        return lexical, table_warnings
    warnings = table_warnings + ['语义检索目前仅覆盖部分资料；未命中不代表学校没有相关规定。']
    try:
        reader = reader or index_reader(str(config.DATA / 'semantic-index'))
        description = reader.describe()
        if not description['rows']:
            return lexical, warnings
        if digest_provider is None:
            with httpx.Client(timeout=5, trust_env=False) as client:
                digest = model_digest(client, config.OLLAMA, config.EMBED_MODEL)
        else:
            digest = digest_provider()
        if digest != description['model_digest']:
            return lexical, warnings + ['语义索引模型版本不一致，已使用关键词检索。']
        embedder = embedder or OllamaCpuEmbedder(config.OLLAMA, config.EMBED_MODEL, digest)
        # This query template is a pilot, not a calibrated corpus recall claim.
        vector = embedder(['Instruct: 检索回答校园问题的公开通知条款\nQuery: ' + question])[0]
        metadata = document_metadata(session)
        result = reader.search(vector, model_digest=digest, metadata_by_id=metadata,
            fetch_chunks=lambda ids: fetch_current_chunks(session, ids),
            allowed_document_ids=set(document_ids) if document_ids is not None else None,
            kinds=('knowledge', 'policy', 'notice'), years=requested_years(question) or None,
            limit=max(limit * 2, 12), max_candidates=256)
        if not result['available']:
            return lexical, warnings + ['语义检索暂不可用，已使用关键词检索。']
        semantic = current_semantic_rows(session, result['matches'], question)
        fused = reciprocal_rank_fusion([
            [{**row, 'chunk_id': row['id']} for row in lexical], semantic], limit=limit * 3)
        # Preserve the lexical path's balanced comparison/identity evidence.
        combined, seen_ids, seen_text = [], set(), set()
        for row in lexical[:2] + fused:
            identity = row['id']
            text = re.sub(r'\s+', '', row['text'])
            if identity in seen_ids or text in seen_text:
                continue
            combined.append(row)
            seen_ids.add(identity)
            seen_text.add(text)
            if len(combined) == limit:
                break
        return combined, warnings
    except Exception as error:
        notice = model_deferred_notice(error)
        return lexical, warnings + [notice or '语义检索暂不可用，已使用关键词检索。']
