"""替换未审核目录的旧叠字索引；原文不变、字段证据ID不变，先备份。"""
import sys,re
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select,delete
from app.db import Session,Document,Chunk,Candidate,Competition,Audit
from app.config import DATA,EMBED_MODEL
from app.ingest import uid
from app.model import embeddings
from backup import backup
import pdfplumber
backup()
with Session() as session:
    doc=session.scalar(select(Document).where(Document.id=='28674895-f283-4633-a03d-ac333a88361d'))
    candidates=session.scalars(select(Candidate).join(Competition).where(Competition.document_id==doc.id)).all()
    if doc.status!='pending_review' or any(c.status!='pending' for c in candidates):raise SystemExit('已有审核，不覆盖；请使用新版本')
    referenced={c.chunk_id for c in candidates}
    removed=session.execute(delete(Chunk).where(Chunk.document_id==doc.id,Chunk.id.not_in(referenced))).rowcount
    with pdfplumber.open(DATA/'raw'/doc.raw_name) as pdf:
        for n,page in enumerate(pdf.pages,1):
            text=page.dedupe_chars(extra_attrs=()).extract_text() or ''
            for start in range(0,len(text),900):session.add(Chunk(id=uid(),document_id=doc.id,text=text[start:start+1000],location=f'第 {n} 页 / 完整正文字符 {start+1}'))
    session.flush()
    chunks=session.scalars(select(Chunk).where(Chunk.id.in_(referenced))).all()
    for i in range(0,len(chunks),12):
        batch=chunks[i:i+12]
        for c,v in zip(batch,embeddings([doc.title+'\n'+c.text for c in batch])):c.vector,c.embedding_model=v,EMBED_MODEL
        print(f'目录语义索引 {min(i+12,len(chunks))}/{len(chunks)}',flush=True)
    session.add(Audit(id=uid(),action='catalog_index_rebuild',entity_id=doc.id,changes={'removed_unreviewed_old_chunks':removed,'table_rows_indexed':len(chunks),'full_page_text':'keyword_only'}));session.commit()
