"""Bounded literal event/date recall, never a source of inferred dates."""
import re
from sqlalchemy import select,or_
from .db import Chunk

DATE_QUESTION=re.compile(r'哪一天|哪天|几号|几月|何日|何时|什么时候|什么时间|日期|时间')
CALENDAR_DATE=re.compile(r'\d{1,2}月\d{1,2}日|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}')


def literal_event_supported(text,phrase,question):
    compact=re.sub(r'\s+','',text)
    if phrase not in compact or not CALENDAR_DATE.search(compact):return False
    if '召开' in question:
        # Committee members attending a ceremony do not establish when the
        # committee met. Require a literal meeting relation in the same clause.
        term=re.escape(phrase)
        if not re.search(r'召开[^。！？；;]{0,24}'+term+r'|'+term+r'[^。！？；;]{0,24}(?:召开|会议)',compact):
            return False
    return True


def event_year_compatible(text,phrases,years):
    """Academic-year endpoints cannot override an explicit event year in a chunk."""
    compact=re.sub(r'\s+','',text)
    if not years or not any(p in compact for p in phrases):return True
    explicit={int(y) for y in re.findall(r'(20\d{2})(?:年(?!级)|届|[-/.]\d{1,2}[-/.]\d{1,2})',
        re.sub(r'20\d{2}[-—–~至/]+20\d{2}学年','',compact))}
    return not explicit or bool(explicit & {int(y) for y in years})


def event_phrases(question):
    if not DATE_QUESTION.search(question) or re.search(r'不是|并非|不问|排除|不要|而非',question):
        return []
    value=re.sub(r'20\d{2}\s*(?:年|届)?',' ',question)
    value=re.sub(r'南京晓庄学院|请问|告诉我|学校|哪一天|什么时候|什么时间|安排|举办|举行|召开|完成|日期|时间|何时|何日|哪天|几号|几月|最晚|应当|应该|在哪|应|的|是|与|和',' ',value)
    # Keep actual literal nouns, not invented aliases or values from an answer.
    return list(dict.fromkeys(p for p in re.findall(r'[\u4e00-\u9fff]{4,32}',value) if 4<=len(p)<=16))[:3]


def literal_event_matches(session,question,allowed_ids):
    from .campus_qa import requested_years
    phrases=event_phrases(question)
    years=requested_years(question)
    if not phrases or not allowed_ids:return [],{}
    rows=session.execute(select(Chunk.id,Chunk.document_id,Chunk.text).where(
        Chunk.document_id.in_(allowed_ids),or_(*(Chunk.text.contains(p,autoescape=True) for p in phrases)))
        .order_by(Chunk.document_id,Chunk.id).limit(129)).all()
    # A broad or repeated phrase must not be treated as a complete event scope.
    if len(rows)>128:return [],{}
    matches={}
    for row in rows:
        compact=re.sub(r'\s+','',row.text)
        if (any(literal_event_supported(compact,p,question) for p in phrases)
                and event_year_compatible(compact,phrases,years)):
            matches.setdefault(row.document_id,set()).add(row.id)
    if len(matches)>32:return [],{}
    return (phrases,matches) if matches else ([],{})


def fallback_event_candidates(evidence,question):
    """Keep independently requested dates when fallback cannot explain them.

    Only literal supported targets count, not inferred synonyms or an assertion
    that all requested information has been found. These remain candidates.
    """
    from .campus_qa import requested_years
    phrases=event_phrases(question);years=requested_years(question)
    selected=[];matched=set()
    for phrase in phrases:
        for row in evidence[:4]:
            compact=re.sub(r'\s+','',row['text'])
            if (literal_event_supported(compact,phrase,question)
                    and event_year_compatible(compact,[phrase],years)):
                matched.add(phrase)
                if not any(r['id']==row['id'] for r in selected):selected.append(row)
                break
    return selected if len(matched)>=2 else evidence[:1]
