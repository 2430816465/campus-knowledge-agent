"""Closed lookup intents: return whole collected notices, never invent a summary.

This is deliberately not a policy/eligibility engine or an answer cache. Each
request reads current chunks and passes every returned chunk through the same
live public-source checks as model answers. Oversized/ambiguous inputs fall back.
"""
import re
from sqlalchemy import select
from .db import Document, Chunk

MAX_DOCUMENTS = 3
MAX_CHUNKS = 96
MAX_CHARACTERS = 10000
POSITION = re.compile(r'^网页段落 (\d+) / 字符 (\d+)$')


def lookup_topic(question):
    q = re.sub(r'[？?。\s]', '', question)
    q = re.sub(r'^请问', '', q)
    if re.fullmatch(
        r'(?:20\d{2}年)?(?:春季|秋季)?(?:学期)?普通话(?:水平)?(?:考试|测试)?'
        r'(?:什么时候报名|何时报名|报名时间(?:是什么)?|报名(?:有哪些|有什么)?(?:要求|条件)|报名需要什么条件)', q):
        return 'mandarin'
    if re.fullmatch(
        r'(?:线上)?(?:学籍)?档案查询(?:利用)?'
        r'(?:如何办理|怎么办理|办理流程(?:是什么)?|需要提交什么材料|需要什么材料|需要到校办理吗|要到校办理吗)', q):
        return 'archive'
    return None


def source_lookup(session, question, evidence, *, document_ids=None):
    topic = lookup_topic(question)
    if session is None or topic is None:
        return None
    from .semester import semester_key
    from .time_scope import version_matches, calendar_year, remaining_clarification
    wanted_term = semester_key(question) if topic == 'mandarin' else None
    templates = {}
    for row in evidence:
        title = row.get('title', '')
        matching = (('普通话' in title and '报名通知' in title and ' / ' not in title)
                    if topic == 'mandarin' else
                    ('档案' in title and re.search(r'查询|利用', title)
                     and re.search(r'通告|流程', title) and ' / ' not in title))
        if matching and (topic != 'mandarin' or version_matches(question, title)):
            templates.setdefault(row['document_id'], row)
    if not templates and (wanted_term or (topic == 'mandarin' and calendar_year(question))):
        # A notice may label eligibility 报名对象 rather than 要求. For the
        # closed lookup intent only, resolve its explicit title version; do
        # not invent a body hit or escape a caller's selected document scope.
        statement = select(Document).where(Document.visibility == 'public',
            Document.status.in_(('pending_review', 'published')),
            Document.title.contains('普通话'), Document.title.contains('报名通知'))
        if document_ids is not None:
            statement = statement.where(Document.id.in_(document_ids))
        candidates = session.scalars(statement.order_by(Document.id).limit(65)).all()
        if len(candidates) == 65:
            return None  # An incomplete candidate set cannot establish a version.
        seen_hashes = set()
        for doc in candidates:
            if ' / ' in doc.title or not version_matches(question, doc.title) or doc.sha256 in seen_hashes:
                continue
            seen_hashes.add(doc.sha256)
            templates[doc.id] = {'document_id': doc.id, 'title': doc.title, 'url': doc.source_url,
                'sha256': doc.sha256, 'version': doc.version, 'status': doc.status,
                'published_at': doc.published_at, 'warnings': doc.warnings or []}
    if not templates or len(templates) > MAX_DOCUMENTS:
        return None
    docs = {d.id: d for d in session.scalars(select(Document).where(Document.id.in_(templates)))}
    if len(docs) != len(templates) or any(d.mime not in ('.html', 'text/html') or d.error
        or d.status not in ('pending_review', 'published') for d in docs.values()):
        return None
    chunks = session.scalars(select(Chunk).where(Chunk.document_id.in_(templates))
                             .limit(MAX_CHUNKS + 1)).all()
    if not chunks or len(chunks) > MAX_CHUNKS or sum(len(c.text) for c in chunks) > MAX_CHARACTERS:
        return None  # Never truncate a trailing condition or exception for speed.
    groups = {identity: [] for identity in templates}
    for chunk in chunks:
        position = POSITION.fullmatch(chunk.location or '')
        if not position or not chunk.text.strip():
            return None  # No inferred PDF/table/OCR reading order.
        groups[chunk.document_id].append((tuple(map(int, position.groups())), chunk))
    selected = []
    for identity, entries in groups.items():
        if not entries or len({p for p, _ in entries}) != len(entries):
            return None
        body = '\n'.join(c.text for _, c in sorted(entries, key=lambda p: p[0]))
        # Require real notice sections, rather than a directory/attachment stub.
        required = ('报名对象', '报名时间', '注意事项') if topic == 'mandarin' else ('业务内容', '申请', '办理')
        if not all(word in re.sub(r'\s+', '', body) for word in required):
            return None
        template = templates[identity]
        for _, chunk in sorted(entries, key=lambda p: p[0]):
            selected.append({**template, 'id': chunk.id, 'text': chunk.text, 'quote': chunk.text,
                'location': chunk.location, 'context': '', 'context_chunks': [], 'supporting_chunks': []})
    from .campus_qa import revalidate_sources
    fresh = revalidate_sources(session, selected)
    if len(fresh) != len(selected):
        return {'answer': '引用资料已发生变化或不再允许公开访问，请重新查询。',
                'mode': 'insufficient_evidence', 'sources': [], 'document_ids': [], 'warnings': []}
    lines = ['以下直接展示相关通知的完整已收录正文，保留条件、例外及办理阶段，未生成模型摘要。']
    warnings = []
    if len(groups) > 1:
        if topic == 'mandarin':
            lines.append(remaining_clarification(question, [t['title'] for t in templates.values()]))
        lines.append('检索到多个来源版本，以下分别展示，不能将不同版本的办理方式拼接使用；请向主管部门核实适用版本。')
        warnings.append('不同来源版本分别展示，发布/转载日期不证明现行有效性。')
    notice = '\n\n'.join(lines)
    sections = []
    previous = None
    for index, row in enumerate(fresh, 1):
        if row['document_id'] != previous:
            lines.append(f"【{row['title']}｜网页发布日期：{row.get('published_at') or '未知'}】")
            sections.append({'title': row['title'], 'published_at': row.get('published_at'), 'text': ''})
            previous = row['document_id']
        lines.append(f"[{index}] {row['quote']}")
        sections[-1]['text'] += (f"[{index}] {row['quote']}\n\n")
        warnings.extend(row.get('warnings', []))
    lines.append('附件名称仅表明通知列有附件，附件内容请打开原件核对。请核对来源日期和适用范围；未经教师审核的关键规则不作为资格或认定结论。')
    return {'answer': '\n\n'.join(lines), 'mode': 'verified_source_lookup', 'sources': fresh,
        'lookup_notice': notice, 'source_sections': sections,
        'lookup_needs_version': topic == 'mandarin' and len(groups) > 1,
        'version_clarification': remaining_clarification(question, [t['title'] for t in templates.values()]) if topic == 'mandarin' and len(groups) > 1 else '',
        'explanation': [], 'model': {'quote_method': 'server_copy_full_collected_html',
            'generation_skipped': True}, 'warnings': list(dict.fromkeys(warnings)),
        'document_ids': list(groups)}
