"""Named-subject boundary checks. Matching a subject is not proof of a claim."""
import re


def compact(value):
    return re.sub(r'[\s“”"\'‘’《》、，,·：:（）()]', '', value or '').lower()


def named_subjects(question):
    # Prefer the explicit current turn to a historic intent prefix.
    focus = question.split('；追问：')[-1]
    subjects = []
    for match in re.finditer(r'[\u4e00-\u9fffA-Za-z]{2,14}杯', compact(focus)):
        name = re.split(r'关于|请问|查询|参加|组织|全国|第[一二三四五六七八九十\d]+届', match[0])[-1].lstrip('和及与')
        if len(name) >= 3:
            subjects.append(name)
    if '答辩' in focus:
        subjects.append('答辩')
    return list(dict.fromkeys(subjects))


def source_text(row):
    # Only server source metadata and original excerpts; never answer/question.
    return compact('\n'.join(str(row.get(k) or '') for k in
        ('title', 'text', 'quote', 'context')))


def graduate_defense(question):
    return '答辩' in question and bool(re.search(r'毕业|论文|学位', question))


def graduate_source(text):
    # A practice-team/proposal defense is a different event even in the same year.
    return bool(re.search(r'毕业(?:生|设计|论文|答辩)|(?:本科|学位|毕业)论文|论文答辩|学位答辩', text))


def filter_evidence(session, question, rows):
    subjects = named_subjects(question)
    if not subjects:
        return rows
    parents = {}
    if session is not None and rows:
        from sqlalchemy import select
        from .db import Document
        pending = {r['document_id'] for r in rows}
        for _ in range(17):
            if not pending:
                break
            docs = session.execute(select(Document.id, Document.title, Document.parent_id)
                .where(Document.id.in_(pending))).all()
            parents.update({d.id: d for d in docs})
            pending = {d.parent_id for d in docs if d.parent_id and d.parent_id not in parents}
    kept = []
    for row in rows:
        text, identity, seen = source_text(row), row.get('document_id'), set()
        while identity in parents and identity not in seen:
            seen.add(identity)
            doc = parents[identity]
            text += compact(doc.title)
            identity = doc.parent_id
        if any(s in text for s in subjects) and (not graduate_defense(question) or graduate_source(text)):
            kept.append(row)
    return kept


def topic_issues(question, result):
    subjects = named_subjects(question)
    if not subjects or result.get('mode') in ('clarification', 'insufficient_evidence'):
        return []
    groups = (result.get('answer_view') or {}).get('groups') or []
    sources = result.get('sources') or result.get('web_sources') or []
    texts = [source_text(s) + compact('\n'.join(s.get('paragraphs') or [])) for s in sources]
    for group in groups:
        if group.get('source_type') == 'unverified':
            continue
        # A real parent relation can identify a generically named attachment.
        text = source_text(group) + ''.join(source_text(q) for q in group.get('quotes') or [])
        for q in group.get('quotes') or []:
            ref = q.get('ref')
            if isinstance(ref, int) and 1 <= ref <= len(texts):
                texts[ref - 1] += text
        if not sources:
            texts.append(text)
    if not texts or any(not any(s in text for s in subjects) for text in texts):
        return ['named_subject_missing_from_cited_evidence']
    if graduate_defense(question) and any(not graduate_source(text) for text in texts):
        return ['graduate_defense_scope_missing_from_cited_evidence']
    if any(not any(s in text for text in texts) for s in subjects):
        return ['named_subject_comparison_incomplete']
    from .answer_relevance import requested_field, FIELDS
    if requested_field(question) == 'defense_date':
        # Merely mentioning defense eligibility cannot substantiate a date.
        originals = '\n'.join(str(s.get(k) or '') for s in sources
                              for k in ('text', 'quote', 'context'))
        originals += '\n' + '\n'.join(p for s in sources for p in s.get('paragraphs') or [])
        originals += '\n' + '\n'.join(q.get('text', '') for g in groups
                                        if g.get('source_type') != 'unverified' for q in g.get('quotes') or [])
        if not re.search(FIELDS['defense_date'], originals):
            return ['defense_date_missing_from_cited_original']
    return []
