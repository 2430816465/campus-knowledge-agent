import json
import sys
import time
import subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.db import init_db, Session, Chunk
from app.config import ROOT
from app.ingest import ingest_url
from app.rag import answer
from app.model import embeddings
from sqlalchemy import select

init_db()
with Session() as s:
    start = time.perf_counter()
    doc, duplicate = ingest_url(s,'https://ie.njxzc.edu.cn/2d/7b/c8743a142715/page.htm')
    chunks = s.scalars(select(Chunk).where(Chunk.document_id == doc.id)).all()
    result = answer(s,'2026年五一数学建模竞赛我校报名截止时间是什么？',year=2026,at='2026-10-09T13:50:00+08:00')
    report = {'document_id':doc.id,'source':doc.source_url,'title':doc.title,'sha256':doc.sha256,'status':doc.status,'chunks':len(chunks),'indexed':sum(bool(c.vector) for c in chunks),'embedding_dimension':len(next((c.vector for c in chunks if c.vector),[])),'duplicate':duplicate,'answer':result,'total_seconds':round(time.perf_counter()-start,3)}
    (ROOT/'reports'/'stage1.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if not result['sources'] or '4 月 12 日 20:00' not in result['answer'] and '4月12日20:00' not in result['answer']:
        raise SystemExit('截止原文未检出：需修复检索或选择')
    if result['mode'] != 'local_model_evidence':
        raise SystemExit('未验证本地模型链路')
