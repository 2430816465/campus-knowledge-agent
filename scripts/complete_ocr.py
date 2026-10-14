"""补做已保存 PDF 的待 OCR 页，无需重复识别已完成的页面。"""
import json,re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db import Session,Document,Chunk,Audit
from app.config import DATA,ROOT,EMBED_MODEL
from app.ingest import local_ocr,uid,link_attachment
from app.model import embeddings
import pypdfium2
events=[]
with Session() as session:
    for doc in session.scalars(select(Document).where(Document.status=='partial_parse',Document.mime=='.pdf')):
        pending={int(m[1]) for w in doc.warnings if '待 OCR' in w and (m:=re.search(r'第\s*(\d+)\s*页',w))}
        pdf=pypdfium2.PdfDocument(DATA/'raw'/doc.raw_name);completed=set();new=[]
        for page_number in sorted(pending):
            bitmap=pdf[page_number-1].render(scale=1.5)
            try:result=local_ocr(bitmap.to_numpy())
            finally:bitmap.close()
            if not result:continue
            completed.add(page_number)
            for n,item in enumerate(result,1):new.append(Chunk(id=uid(),document_id=doc.id,text=item[1],location=f'第 {page_number} 页 / OCR 框 {n} / 置信度 {item[2]:.3f}'))
            print(f'OCR 已补做第 {page_number} 页，{len(result)} 框',flush=True)
        pdf.close();session.add_all(new)
        for i in range(0,len(new),12):
            batch=new[i:i+12]
            try:
                for c,v in zip(batch,embeddings([doc.title+'\n'+c.text for c in batch])):c.vector,c.embedding_model=v,EMBED_MODEL
            except Exception:break
        doc.warnings=[w for w in doc.warnings if not ('待 OCR' in w and (m:=re.search(r'第\s*(\d+)\s*页',w)) and int(m[1]) in completed)]
        doc.warnings += [f'第 {n} 页已补做本地 OCR；关键字段须人工核对图像' for n in sorted(completed)]
        if completed==pending and pending:doc.status='pending_review'
        link_attachment(session,doc.parent_id,doc.source_url,doc)
        session.add(Audit(id=uid(),action='complete_ocr',entity_id=doc.id,changes={'pages':sorted(completed),'chunks':len(new)}));session.commit()
        events.append({'id':doc.id,'pages_completed':sorted(completed),'remaining':sorted(pending-completed),'status':doc.status,'new_chunks':len(new)})
    (ROOT/'reports/ocr-completion.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf-8')
