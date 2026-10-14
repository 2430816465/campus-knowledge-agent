"""Presentation of verified evidence; never manufacture or truncate policy text."""
import re
from urllib.parse import urlparse
from sqlalchemy import select
from .db import Document
from .source_scope import eligibility


def public_url(value):
    try:
        parsed = urlparse(value or '')
        return value if parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username and not parsed.password else None
    except ValueError:
        return None


def source_groups(session, sources):
    """Read current parent chains and group citations with their public attachments."""
    docs = {}
    pending = {s['document_id'] for s in sources}
    for _ in range(17):
        if not pending:
            break
        rows = session.scalars(select(Document).where(Document.id.in_(pending))
                               .execution_options(populate_existing=True)).all()
        docs.update({d.id: d for d in rows})
        pending = {d.parent_id for d in rows if d.parent_id and d.parent_id not in docs}
    metadata = {k: {'id': d.id, 'parent_id': d.parent_id, 'visibility': d.visibility,
                    'status': d.status} for k, d in docs.items()}
    groups = {}
    for number, source in enumerate(sources, 1):
        decision = eligibility(source['document_id'], metadata)
        if not decision['eligible']:
            return None
        root_id = (decision['ancestor_ids'] or [source['document_id']])[-1]
        doc = docs[root_id]
        group = groups.setdefault(root_id, {'document_id': root_id, 'title': doc.title,
            'url': public_url(doc.source_url), 'published_at': doc.published_at,
            'quotes': [], 'attachments': []})
        group['quotes'].append({'ref': number, 'text': source.get('quote') or source.get('text', ''),
            'title': source.get('title', ''), 'location': source.get('location', ''),
            'context': source.get('context', ''), 'version': source.get('version'),
            'status': source.get('status')})
    if groups:
        children = session.scalars(select(Document).where(Document.parent_id.in_(groups))
                                   .execution_options(populate_existing=True)).all()
        metadata.update({d.id: {'id': d.id, 'parent_id': d.parent_id, 'visibility': d.visibility,
                               'status': d.status} for d in children})
        for doc in children:
            url = public_url(doc.source_url)
            if url and eligibility(doc.id, metadata)['eligible']:
                groups[doc.parent_id]['attachments'].append({'title': doc.title, 'url': url})
        # Links declared by the public original remain useful even before parsing.
        # A known private/withdrawn child must never reappear via the link list.
        forbidden = {d.source_url for d in children if not eligibility(d.id, metadata)['eligible']}
        for identity, group in groups.items():
            seen = {a['url'] for a in group['attachments']}
            for item in docs[identity].attachments or []:
                if not isinstance(item, dict):
                    continue
                url = public_url(item.get('url'))
                if url and url not in seen and url not in forbidden:
                    group['attachments'].append({'title': item.get('title') or item.get('name') or '通知附件', 'url': url})
                    seen.add(url)
    return list(groups.values())


def build_answer_view(session, question, result):
    sources = result.get('sources') or []
    if sources:
        from .campus_qa import revalidate_sources
        fresh = revalidate_sources(session, sources)
        groups = source_groups(session, fresh) if len(fresh) == len(sources) else None
        if groups is None:
            result.update(answer='引用资料已变化或不再公开，请重新查询。', mode='insufficient_evidence',
                          sources=[], document_ids=[], explanation=[], source_sections=[])
            return {'label': '助手回答', 'paragraphs': [result['answer']], 'groups': []}
    else:
        groups = []
    claims = result.get('explanation') or []
    references = {s.get('id'): i for i, s in enumerate(sources, 1)}
    paragraphs = []
    scope_note = ''
    for claim in claims:
        if isinstance(claim, dict) and isinstance(claim.get('text'), str):
            refs = [references[x] for x in claim.get('ids', []) if x in references]
            if refs:
                paragraphs.append(claim['text'] + ' ' + ''.join(f'[{i}]' for i in refs))
    label = ('助手回答 · 原文字段核对' if result.get('mode') == 'verified_field_answer'
             else '助手回答 · 基于原文解释') if paragraphs else '助手回答'
    if result.get('mode') == 'verified_source_lookup':
        label = '原文摘答 · 未生成模型解释'
        from .semester import semester_key
        named_version = semester_key(question)
        matching = [g for g in groups if named_version and semester_key(g['title']) == named_version]
        if result.get('lookup_needs_version') and len(matching) != 1:
            from .time_scope import remaining_clarification
            paragraphs = [result.get('version_clarification') or remaining_clarification(question, [g['title'] for g in groups])]
        else:
            # Whole literal paragraphs only. The preview explicitly has incomplete
            # coverage; the entire notice, including exceptions, remains available.
            first = matching[0] if len(matching) == 1 else groups[0] if groups else None
            if first:
                terms = ('报名时间|额满|名额限制' if re.search('时间|何时|什么时候', question) else
                         '到校|邮件|邮寄' if '到校' in question else
                         '申请|材料|受理|寒暑假|业务内容|报名对象|注意事项')
                matches = []
                preceding_heading = ''
                for quote in first['quotes']:
                    text = quote['text'].strip()
                    if len(text) <= 12:
                        preceding_heading = text
                    else:
                        if re.search(terms, text + preceding_heading):
                            matches.append(quote)
                        preceding_heading = ''
                scope_note = f"摘自《{first['title']}》｜网页发布：{first['published_at'] or '未知'}。适用时间请核对原文。"
                paragraphs = []
                for quote in matches[:2]:
                    # A long paragraph is not shortened; leave it in full text.
                    if len(quote['text']) <= 220:
                        paragraphs.append(quote['text'] + f" [{quote['ref']}]")
                paragraphs.append('此处仅为摘录；完整条件、例外和其他版本请展开“原文对照”。')
    if not paragraphs:
        if groups:
            label = '助手回答 · 待核对'
            paragraphs = [('查到了相关原文，但尚不足以给出可靠结论。请展开“原文对照”，并核对所问年份和适用范围。'
                           if result.get('mode') == 'evidence_fallback' else
                           '查到了可对照的原文。请展开“原文对照”查看具体条款，关键规则仍需核实适用范围。')]
        else:
            paragraphs = [result.get('answer') or '现有资料不足以回答，请补充问题或核对官网通知。']
    return {'label': label, 'paragraphs': paragraphs, 'groups': groups, 'scope_note': scope_note,
            'notice': '原文待教师审核；历史资料的发布日期不代表现行有效。' if any(s.get('status') != 'published' for s in sources) else ''}
