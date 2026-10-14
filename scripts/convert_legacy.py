"""复用已安装 Word 进行公开旧 DOC 转换；不安装 Office、不上传原文。"""
import json,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db import Session,Document,Audit
from app.config import DATA,ROOT
from app.ingest import ingest_bytes,uid
events=[];converted=DATA/'converted';converted.mkdir(exist_ok=True)
with Session() as session:
    for original in session.scalars(select(Document).where(Document.mime=='.doc',Document.status=='parse_failed',Document.visibility=='public')):
        output=converted/(original.sha256+'.docx')
        if not output.exists():
            result=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'scripts/convert_doc.ps1'),'-InputFile',str(DATA/'raw'/original.raw_name),'-OutputFile',str(output)],timeout=90,capture_output=True)
            if result.returncode!=0:
                from zipfile import is_zipfile
                if not output.is_file() or not is_zipfile(output):raise SystemExit('本地Word转换失败；保留原DOC和失败状态，不输出Office调试正文')
                # Office退出时可能返回清理异常；以已保存的有效DOCX再次解析为准。
        doc,duplicate=ingest_bytes(session,output.read_bytes(),original.title+'x',visibility='public',kind=original.kind,parent_id=original.parent_id)
        doc.source_url=original.source_url
        doc.warnings=list(dict.fromkeys(doc.warnings+[f'本文件由已安装的Microsoft Word禁用宏、只读打开后本地转换；原DOC文档ID={original.id}，非官网原始DOCX；须核对版式与内容']))
        original.error='原始DOC不直接解析；已本地转换为DOCX，转换记录ID='+doc.id
        original.status='converted'
        if original.parent_id:
            parent=session.get(Document,original.parent_id)
            parent.attachments=[{**a,'status':'converted','document_id':original.id,'converted_document_id':doc.id} if a.get('document_id')==original.id else a for a in parent.attachments]
        session.add(Audit(id=uid(),action='local_word_conversion',entity_id=doc.id,changes={'original_id':original.id,'original_sha256':original.sha256,'converted_sha256':doc.sha256,'macros_disabled':True}));session.commit()
        events.append({'original_id':original.id,'converted_id':doc.id,'status':doc.status,'duplicate':duplicate,'macros_disabled':True})
(ROOT/'reports/legacy-conversion.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(events,ensure_ascii=False))
