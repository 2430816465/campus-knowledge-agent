"""Read-only public PDF table geometry audit; never rewrites business records."""
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select,text
from app.db import Session,Document
from app.config import DATA
from app.source_scope import eligibility
from app.pdf_tables import extract_grids


def source_state(session,identity):
    fields=(Document.id,Document.parent_id,Document.title,Document.sha256,Document.status,
            Document.visibility,Document.kind,Document.raw_name,Document.source_url)
    metadata={r.id:dict(r._mapping) for r in session.execute(select(*fields))}
    if not eligibility(identity,metadata)['eligible']:
        raise ValueError('Source is not currently public and eligible')
    return metadata[identity]


def audit(identity,pages):
    with Session() as session:
        if session.bind.dialect.name=='postgresql':session.execute(text('SET TRANSACTION READ ONLY'))
        before=source_state(session,identity)
    root=(DATA/'raw').resolve();path=(root/before['raw_name']).resolve()
    if path.parent!=root or path.suffix.lower()!='.pdf' or path.stat().st_size>25*1024*1024:
        raise ValueError('Original path/type/size outside budget')
    result=extract_grids(path.read_bytes(),before['sha256'],pages)
    # A fresh connection checks source and ancestor permission after extraction.
    with Session() as session:
        if session.bind.dialect.name=='postgresql':session.execute(text('SET TRANSACTION READ ONLY'))
        after=source_state(session,identity)
    if before!=after:raise ValueError('Source metadata changed during audit')
    return {**result,'document_id':identity,'source_url':before['source_url'],'title':before['title'],
            'checked_at':datetime.now(timezone.utc).isoformat(),'business_database_modified':False,
            'existing_chunks_replaced':False,'full_document_audited':False}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--document',required=True)
    p.add_argument('--pages',type=int,nargs='+',required=True)
    p.add_argument('--report',type=Path,required=True)
    args=p.parse_args()
    # Reports cannot overwrite source data, code or credentials.
    report=args.report.resolve();reports=(Path(__file__).resolve().parents[1]/'reports').resolve()
    if not report.is_relative_to(reports) or report.suffix!='.json':p.error('Use a JSON path inside reports')
    if report.exists():p.error('Report exists; choose a fresh name to preserve prior evidence')
    value=audit(args.document,args.pages)
    report.parent.mkdir(parents=True,exist_ok=True)
    with report.open('x',encoding='utf-8') as output:json.dump(value,output,ensure_ascii=False,indent=2)
    print(json.dumps({key:value[key] for key in ['document_id','nonempty_cells','verified_cells','unsupported_pages','business_database_modified']}))


if __name__=='__main__':main()
