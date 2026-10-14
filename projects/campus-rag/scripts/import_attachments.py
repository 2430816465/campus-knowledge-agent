"""批量下载已采集通知正文列出的官方附件，保留父子来源；旧格式失败不会静默丢弃。"""
import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db import Session,Document
from app.ingest import ingest_url
from app.config import ROOT
events=[]
with Session() as session:
    parents=session.scalars(select(Document).where(Document.visibility=='public',Document.kind.in_(['notice','policy']))).all()
    for parent in parents:
        for attachment in parent.attachments:
            try:
                kind='catalog' if '分类目录' in attachment['title'] else 'policy'
                doc,duplicate=ingest_url(session,attachment['url'],kind=kind,parent_id=parent.id)
                if attachment['title'] and doc.title==Path(attachment['url']).name:
                    doc.title=attachment['title'];session.commit()
                events.append({'parent_id':parent.id,'id':doc.id,'url':doc.source_url,'title':doc.title,'duplicate':duplicate,'status':doc.status,'warnings':doc.warnings,'error':doc.error})
            except Exception as exc:
                session.rollback();events.append({'url':attachment['url'],'error':f'{type(exc).__name__}: {str(exc)[:200]}'})
            (ROOT/'reports'/'attachments.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(events[-1],ensure_ascii=False),flush=True);time.sleep(.7)
