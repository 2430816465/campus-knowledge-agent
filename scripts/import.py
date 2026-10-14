"""Windows/Linux CLI：批量本地资料导入，默认私有；失败记录不阻止后续文件。"""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.db import init_db,Session
from app.ingest import ingest_bytes,ingest_url
from app.config import ROOT

p=argparse.ArgumentParser()
p.add_argument('paths',nargs='*')
p.add_argument('--url')
p.add_argument('--kind',choices=['notice','policy','catalog'],default='notice')
p.add_argument('--public',action='store_true')
p.add_argument('--no-embedding',action='store_true')
args=p.parse_args()
init_db();results=[]
with Session() as s:
    if args.url:
        doc,duplicate=ingest_url(s,args.url,args.kind,embed=not args.no_embedding)
        results.append({'url':args.url,'id':doc.id,'status':doc.status,'duplicate':duplicate})
    for input_path in args.paths:
        path=Path(input_path).resolve()
        files=list(path.rglob('*')) if path.is_dir() else [path]
        for file in files:
            if not file.is_file():continue
            try:
                if file.stat().st_size>20*1024*1024:raise ValueError('超过20MB')
                doc,duplicate=ingest_bytes(s,file.read_bytes(),file.name,visibility='public' if args.public else 'private',kind=args.kind,embed=not args.no_embedding)
                results.append({'file':str(file),'id':doc.id,'status':doc.status,'duplicate':duplicate})
            except Exception as exc:
                s.rollback();results.append({'file':str(file),'error':str(exc)})
report=ROOT/'reports'/'last-batch.json'
report.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
