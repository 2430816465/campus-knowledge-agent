import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select, delete, func
from app.db import Session, init_db, Document, Chunk, Competition, Candidate, Audit
from app.config import ROOT
from app.ingest import ingest_url, parse, uid, extract_candidates
from app.model import embeddings

SOURCES = [
    ('https://pe.njxzc.edu.cn/2f/6a/c1595a143210/page.htm','notice'),
    ('https://ste.njxzc.edu.cn/2e/e0/c481a143072/pagem.htm','notice'),
    ('https://jwc.njxzc.edu.cn/2c/92/c9179a142482/pagem.htm','notice'),
    ('https://jwc.njxzc.edu.cn/34/82/c9184a144514/page.htm','policy'),
    ('https://jwc.njxzc.edu.cn/_upload/article/files/53/74/a4ff13d042eea6ddfedf895ee32c/92e95459-9ff1-4a40-8a6d-0a28c2e6b8db.pdf','catalog'),
]
init_db()
results=[]
with Session() as s:
    # 修复首份通知内联span切段；只重建未审核候选，保留原始文件和文档ID。
    first=s.scalar(select(Document).where(Document.source_url=='https://ie.njxzc.edu.cn/2d/7b/c8743a142715/page.htm'))
    comp=s.scalar(select(Competition).where(Competition.document_id==first.id)) if first else None
    if first and first.status=='pending_review' and comp and not s.scalar(select(func.count(Candidate.id)).where(Candidate.competition_id==comp.id,Candidate.status!='pending')):
        s.execute(delete(Candidate).where(Candidate.competition_id==comp.id))
        s.execute(delete(Chunk).where(Chunk.document_id==first.id))
        from app.config import DATA,EMBED_MODEL
        _,_,_,blocks,_,_=parse((DATA/'raw'/first.raw_name).read_bytes(),'.html',first.source_url)
        chunks=[Chunk(id=uid(),document_id=first.id,location=loc,text=text) for loc,text in blocks]
        s.add_all(chunks);s.flush()
        for i in range(0,len(chunks),12):
            batch=chunks[i:i+12]
            for c,v in zip(batch,embeddings([first.title+'\n'+c.text for c in batch])):
                c.vector,c.embedding_model=v,EMBED_MODEL
        extract_candidates(s,comp,chunks,first)
        s.add(Audit(id=uid(),action='parser_upgrade',entity_id=first.id,changes={'reason':'合并内联span，保持完整报名条款'}))
        s.commit()
    for url,kind in SOURCES:
        try:
            doc,duplicate=ingest_url(s,url,kind)
            item={'url':url,'id':doc.id,'title':doc.title,'status':doc.status,'duplicate':duplicate,'warnings':doc.warnings,'attachments':doc.attachments}
        except Exception as exc:
            s.rollback();item={'url':url,'error':str(exc)}
        results.append(item)
        (ROOT/'reports'/'source-import.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(item,ensure_ascii=False),flush=True)
