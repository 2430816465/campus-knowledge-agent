"""Literal numbered PDF section labels with immutable source references."""
import re
from .evidence_windows import LOCATION,SCHEDULE_ROW

SCOPE_UNCERTAIN = '未编号成果段落：前置标题仅供定位，条款适用范围未确认。'


def unnumbered_result_tails(group):
    """Find a bounded, standalone result paragraph, not a shared-policy claim.

    A generic result subject after a completed sentence and immediately before
    a top-level heading does not prove the previous project's exclusive scope.
    Only complete, ordered PDF rows may be supplied. Other layouts stay literal.
    """
    uncertain = {}
    active_project = False
    for index, (page, _, chunk) in enumerate(group):
        label = section_label(chunk.text)
        if label and label[0] <= 1:
            active_project = label[0] == 1 and bool(re.search(r'(?:项目|专项)$', label[1]))
        if not active_project or not index or label:
            continue
        if not re.match(r'^(?:项目成果|研究成果|成果在)', chunk.text.strip()):
            continue
        if not group[index-1][2].text.rstrip().endswith(('。', '！', '？')):
            continue
        for end in range(index+1, min(index+5, len(group))):
            following = section_label(group[end][2].text)
            if following:
                if following[0] == 0:
                    tail = group[index:end]
                    if (all(0 <= row[0]-page <= 1 for row in tail)
                            and sum(len(row[2].text) for row in tail) <= 800):
                        for row in tail:
                            uncertain[row[2].id] = (group[index-1][2], group[end][2])
                break
    return uncertain


def section_label(text):
    text=text.strip()
    for level,pattern in [
        (0,r'^([一二三四五六七八九十]+、[^。；：:\n]{2,35})(?:[：:]|$)'),
        (1,r'^([（(][一二三四五六七八九十]+[）)]项目(?:类型|级别))$'),
        (1,r'^(\d+[.．]\s*[^。；：:\n]{2,35})(?:[。：:]|$)'),
        (2,r'^([^。；：:\n]{2,16}类)[：:]'),
    ]:
        match=re.match(pattern,text)
        if match:return level,match[1]
    return None


def pdf_sections(rows, *, complete_documents=()):
    groups={}
    for chunk,doc in rows:
        pos=LOCATION.fullmatch(chunk.location or '')
        if doc.id in complete_documents and pos and int(pos[3])==1:
            groups.setdefault(doc.id,[]).append((int(pos[1]),int(pos[2]),chunk))
    contexts, references, scopes, options={},{},{},{}
    for doc_id,group in groups.items():
        group = sorted(group,key=lambda r:(r[0],r[1],r[2].id))
        uncertain = unnumbered_result_tails(group)
        active={};options[doc_id]=set()
        for index,(page,paragraph,chunk) in enumerate(group):
            if SCHEDULE_ROW.match(chunk.text.strip()):
                # A numbered task is not the scope of the following calendar
                # row. Preserve genuine policy/category headings and ancestors.
                active={k:v for k,v in active.items() if not (k>=1
                    and re.search(r'提交|报送|发放|召开|开展|举办|办理|审核|确认|完成|进行',v[0])
                    and not re.search(r'要求|条件|规定|办法|程序|流程|材料|范围|对象|资格|管理',v[0]))}
            label=section_label(chunk.text)
            if label:
                level,value=label
                active={k:v for k,v in active.items() if k<level}
                active[level]=(value,chunk,index,page)
                if level==1 and re.search(r'(?:项目|专项|学生|人员|教师|本科生|研究生|考生)$',value):
                    options[doc_id].add(value)
            nearby={k:v for k,v in active.items() if index-v[2]<=40 and page-v[3]<=1}
            if nearby:
                contexts[chunk.id]='\n'.join(v[0] for _,v in sorted(nearby.items()))
                if chunk.id in uncertain:
                    contexts[chunk.id]=SCOPE_UNCERTAIN+'\n'+contexts[chunk.id]
                references[chunk.id]=[{'id':v[1].id,'text':v[1].text,'location':v[1].location}
                    for _,v in sorted(nearby.items()) if v[1].id!=chunk.id]
                if chunk.id in uncertain:
                    references[chunk.id].extend({'id':c.id,'text':c.text,'location':c.location}
                                               for c in uncertain[chunk.id])
                if 1 in nearby and chunk.id not in uncertain:scopes[chunk.id]=nearby[1][0]
    return contexts,references,scopes,options


def requested_scopes(question, labels):
    """Select an unambiguous literal label, never infer a student's category."""
    from .rag import ranking_terms
    if len(labels)<2 or re.search(r'不是|并非|而非|不问|不要|不用',question):return set()
    # A plan name may include one category (创新训练) while asking for all types.
    # Do not treat that title overlap as an exclusive subsection request.
    if re.search(r'项目类型|项目级别|级别.*推荐|(?:几|哪).*种.*(?:项目|类型)',question):return set()
    literal={label for label in labels if re.sub(r'^\d+[.．]\s*','',label) in question}
    if literal:return literal
    query=ranking_terms(question)
    scores={label:len(query & ranking_terms(re.sub(r'项目|专项|工作|事项|要求|方式|程序','',label)))
            for label in labels}
    return {label for label,score in scores.items() if score>=1}
