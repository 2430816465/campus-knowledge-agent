import pytest
from sqlalchemy import select, func
from app.db import Candidate, Chunk, Document
from app.rag import resolve_competition, retrieve
from test_rag_routing import session, add


def copies(session):
    pairs = []
    for path in ('first', 'second'):
        doc, comp, chunk = add(session, '2026年五一数学建模竞赛',
                               '我校报名时间截至4月12日20:00。', year=2026, competition=True)
        doc.source_url = f'https://ie.njxzc.edu.cn/{path}/page.htm'
        doc.published_at = '2026-04-07'
        pairs.append((doc, comp, chunk))
    session.commit()
    return pairs


def test_exact_parsed_copies_resolve_without_database_merge(session):
    pairs = copies(session)
    result = resolve_competition(session, '2026年五一数学建模报名时间？')
    assert result['status'] == 'matched'
    assert {s['document_id'] for s in result['exact_parsed_copies']} == {p[0].id for p in pairs}
    assert len({s['sha256'] for s in result['exact_parsed_copies']}) == 2
    assert len({s['parsed_body_sha256'] for s in result['exact_parsed_copies']}) == 1
    hits, _ = retrieve(session, '2026年五一数学建模报名时间？', semantic=False)
    assert hits and any('20:00' in h['text'] for h in hits)
    assert session.scalar(select(func.count()).select_from(Document)) == 2


@pytest.mark.parametrize('change', ['body', 'host', 'date', 'title', 'fields', 'review',
                                    'parent', 'attachment', 'location', 'empty', 'verified',
                                    'candidate', 'port', 'count'])
def test_nonidentical_or_authoritative_versions_remain_ambiguous(session, change):
    pairs = copies(session)
    doc, comp, chunk = pairs[1]
    if change == 'body': chunk.text = '我校报名时间截至4月13日20:00。'
    elif change == 'host': doc.source_url = 'https://music.njxzc.edu.cn/page.htm'
    elif change == 'date': doc.published_at = '2026-04-08'
    elif change == 'title': doc.title += '更正'
    elif change == 'fields': comp.fields = {'deadline': '2026-04-13'}
    elif change == 'review': comp.review_status = 'reviewed'
    elif change == 'parent': doc.parent_id = pairs[0][0].id
    elif change == 'attachment': doc.attachments = ['https://ie.njxzc.edu.cn/file.pdf']
    elif change == 'location': chunk.location = '网页段落 2 / 字符 1'
    elif change == 'empty': chunk.text = ' '
    elif change == 'verified': comp.last_verified = '2026-10-10'
    elif change == 'candidate':
        session.add(Candidate(id='reviewed-candidate', competition_id=comp.id, field='deadline',
                              value={}, quote='人工依据', chunk_id=chunk.id, status='confirmed'))
    elif change == 'port': doc.source_url = 'https://ie.njxzc.edu.cn:443/page.htm'
    elif change == 'count':
        for i in range(256):
            session.add(Chunk(id=f'extra-{i}', document_id=doc.id, text='额外正文', location=str(i)))
    session.commit()
    assert resolve_competition(session, '2026年五一数学建模报名时间？')['status'] == 'ambiguous'


def test_unrequested_different_years_do_not_collapse(session):
    pairs = copies(session)
    pairs[1][1].year = 2025
    session.commit()
    assert resolve_competition(session, '五一数学建模报名时间？')['status'] == 'ambiguous'
