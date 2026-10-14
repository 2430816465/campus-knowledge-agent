"""Bounded PDF continuity and OCR context; citations remain immutable chunks."""
import re

LOCATION=re.compile(r'^第 (\d+) 页 / 段落 (\d+) / 字符 (\d+)$')
NEW_RULE=re.compile(r'^(?:第[一二三四五六七八九十百0-9]+[条章]|[（(][一二三四五六七八九十0-9]+[）)]|[一二三四五六七八九十百]{1,4}[、．.]|\d+[.．、]|\d{1,2}月\d{1,2}日)')
SCHEDULE_ROW=re.compile(r'^(?:[一二三四五六七八九十百]{1,4}\s*\d{1,2}月\d{1,2}日|'
    r'\d{1,3}\s+[^。！？；;\n]{2,80}\s+\d{1,2}月(?:\d{1,2}日|[上中下]旬))')
END=re.compile(r'[。！？；;：:]$')
SCHEDULE_HEADER=re.compile(r'^(?:活动内容|事项|阶段)\s+(?:活动时间|时间|日期)$')
WORD_OCR=re.compile(r'^Word 图像 (\d+) SHA=([0-9a-f]{12}) / OCR (\d+) conf=(0\.\d{3}|1\.000) xy=(\d+,\d+;\d+,\d+;\d+,\d+;\d+,\d+)$')


def docx_ocr_windows(rows, *, complete_documents=()):
    """Nearby numbered-prose context, never a new continuous quotation.

    Require a complete loaded document, stable image reference, consecutive
    OCR indices, horizontal similarly sized lines and no competing side box.
    Keep two independent immutable candidates; geometry is not semantic proof.
    """
    groups={};unverified=set()
    for chunk,doc in rows:
        pos=WORD_OCR.fullmatch(chunk.location or '')
        if doc.id not in complete_documents:continue
        if not pos:
            prefix=re.match(r'^Word 图像 (\d+) SHA=([0-9a-f]{12}) / ',chunk.location or '')
            if prefix:unverified.add((doc.id,prefix[1],prefix[2]))
            continue
        points=[tuple(map(int,p.split(','))) for p in pos[5].split(';')]
        xs,ys=zip(*points);left,right=min(xs),max(xs);top,bottom=min(ys),max(ys)
        width,height=right-left,bottom-top
        valid=(float(pos[4])>=.9 and min(width,height)>0 and max(right,bottom)<=20000
            and all(points[end][0]>points[start][0] and
                abs(points[end][1]-points[start][1]) <=
                .08*(points[end][0]-points[start][0]) for start,end in ((0,1),(3,2))))
        groups.setdefault((doc.id,pos[1],pos[2]),[]).append(
            (int(pos[3]),chunk,(left,top,right,bottom,width,height),valid))
    lookup={}
    for key,group in groups.items():
        # A rejected box still participates in uniqueness/interference checks.
        if key in unverified or len(group)>1000 or len({r[0] for r in group})!=len(group):continue
        ordered=sorted(group,key=lambda r:r[0])
        for a,b in zip(ordered,ordered[1:]):
            index,first,box,valid=a;next_index,second,next_box,next_valid=b
            text,tail=first.text.strip(),second.text.strip()
            x,y,right,bottom,width,height=box
            nx,ny,nright,nbottom,nwidth,nheight=next_box
            if (not valid or not next_valid or next_index!=index+1 or first.id in lookup or second.id in lookup
                or not 20<=len(text)<=120 or not 5<=len(tail)<=80
                or not re.match(r'^\d{1,2}[.．、]',text) or END.search(text)
                or NEW_RULE.match(tail) or SCHEDULE_ROW.match(tail) or not re.search(r'[。！？]$',tail)
                or not .8<=nheight/height<=1.25 or not 0<=ny-bottom<=.6*height
                or abs(nx-x)>2*height or width<6*height or nwidth<2*nheight):continue
            # Multi-column diagrams and overlapping labels are not prose.
            if any(c.id not in (first.id,second.id) and
                min(nbottom,cbox[3])>max(y,cbox[1]) and
                min(max(right,nright),cbox[2])>max(min(x,nx),cbox[0])
                for _,c,cbox,_ in group):continue
            members=(first,second)
            lookup[first.id]=lookup[second.id]=members
    return lookup


def pdf_windows(rows, *, complete_documents=()):
    groups={}
    for chunk,doc in rows:
        position=LOCATION.fullmatch(chunk.location or '')
        if position and int(position[3])==1 and len(chunk.text)<=200:
            groups.setdefault((doc.id,int(position[1])),[]).append((int(position[2]),chunk))
    lookup={}
    table_chunks=set()
    # Explicit schedule headers mark a table, not wrapped running prose.
    # Do not invent row/column relations by joining successive PDF fragments.
    for group in groups.values():
        in_table=False
        for _,chunk in sorted(group,key=lambda r:(r[0],r[1].id)):
            text=chunk.text.strip()
            if SCHEDULE_HEADER.fullmatch(text):
                in_table=True
            elif NEW_RULE.match(text) and not SCHEDULE_ROW.match(text):
                in_table=False
            if in_table:table_chunks.add(chunk.id)
    for group in groups.values():
        current=[];size=0;last=None
        def flush():
            if len(current)>1:
                members=tuple(c for _,c in current)
                for c in members:lookup[c.id]=members
        for paragraph,chunk in sorted(group,key=lambda r:(r[0],r[1].id)):
            text=chunk.text.strip()
            if chunk.id in table_chunks:
                flush();current=[];size=0;last=None
                continue
            if not text or re.fullmatch(r'-?\s*\d+\s*-?',text):
                flush();current=[];size=0;last=None
                continue
            if current and (paragraph!=last+1 or NEW_RULE.match(text) or SCHEDULE_ROW.match(text) or len(current)>=8 or size+len(text)>700):
                flush();current=[];size=0
            current.append((paragraph,chunk));size+=len(text);last=paragraph
            if END.search(text):
                flush();current=[];size=0;last=None
        flush()
    # Only callers that loaded every chunk of the named documents may prove
    # page-end/page-start adjacency. A ranked subset cannot prove a boundary.
    pages = {}
    for chunk, doc in rows:
        pos = LOCATION.fullmatch(chunk.location or '')
        if doc.id in complete_documents and pos:
            pages.setdefault((doc.id, int(pos[1])), []).append((int(pos[2]),int(pos[3]),chunk))
    for (doc_id, page), entries in sorted(pages.items()):
        following = pages.get((doc_id,page+1))
        if not following:
            continue
        end = max(entries,key=lambda x:(x[0],x[1]))
        start = min(following,key=lambda x:(x[0],x[1]))
        left,right = end[2],start[2]
        # Page counters, headers, new numbered rules, split long paragraphs and
        # ended sentences are not a continuation. Conservative misses are kept.
        if (left.id in table_chunks or right.id in table_chunks
                or end[1]!=1 or start[:2]!=(1,1) or not 20<=len(left.text.strip())<=200
                or not 12<=len(right.text.strip())<=200 or END.search(left.text.strip())
                or NEW_RULE.match(right.text.strip()) or SCHEDULE_ROW.match(right.text.strip())
                or re.match(r'^(?:附件|目录|南京晓庄学院|第\s*\d+\s*页)',right.text.strip())):
            continue
        tail = lookup.get(left.id,(left,))
        head = lookup.get(right.id,(right,))
        if tail[-1].id!=left.id or head[0].id!=right.id:
            continue
        members = tail+head
        positions = [LOCATION.fullmatch(c.location) for c in members]
        if (len(members)>8 or sum(len(c.text.strip()) for c in members)>700
                or {int(p[1]) for p in positions}!={page,page+1}):
            continue
        for chunk in members:
            lookup[chunk.id]=members
    return lookup


def expand_evidence(evidence,max_total=12):
    """Round-robin windows: keep both comparison anchors before filling long windows."""
    groups=[]
    for row in evidence[:4]:
        pieces=row.get('supporting_chunks') or []
        groups.append([{**row,**part,'supporting_chunks':[]} for part in pieces] if pieces else [row])
    output,seen=[],set()
    for position in range(8):
        for group in groups:
            if position>=len(group):continue
            row=group[position]
            if row['id'] not in seen:
                output.append(row);seen.add(row['id'])
            if len(output)>=max_total:return output
    return output


def complete_citation_windows(selected, evidence):
    """Display complete related raw windows, without inventing model claims.

    Related pieces may not all have fit in model input. Mark them as context,
    never as model-selected citations; they still require live DB validation.
    """
    windows = {}
    for row in evidence[:4]:
        parts = row.get('supporting_chunks') or []
        if parts:
            for part in parts:
                windows[(row['document_id'],part['id'])] = (row,parts)
    selected_ids = {r['id'] for r in selected}
    output, seen, required = [], set(), []
    for chosen in selected:
        related = windows.get((chosen['document_id'],chosen['id']))
        if related:
            base,parts = related
            required.append(frozenset(p['id'] for p in parts))
            rows = [{**base,**part,'quote':part['text'],'supporting_chunks':[],
                     'supporting_context':part['id'] not in selected_ids} for part in parts]
        else:
            rows = [chosen]
        for row in rows:
            if row['id'] not in seen:
                output.append(row);seen.add(row['id'])
    return output,required


def retain_complete_windows(fresh, required):
    """Drop a whole citation window if one required piece failed revalidation."""
    valid = {r['id'] for r in fresh}
    for group in required:
        if not group <= valid:
            valid -= group
    return [r for r in fresh if r['id'] in valid]
