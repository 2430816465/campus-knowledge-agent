"""Finite resumable PDF grid builder. Writes derived cache, never business DB."""
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db import Session,Document
from app.config import DATA,ROOT
from app.model_gate import FileMutex
from app.table_index import open_writer,save_audit,save_disposition,live_metadata,PARSER
from app.source_scope import eligibility
from scripts.audit_pdf_tables import audit,source_state


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--document-id',action='append',default=[])
    parser.add_argument('--limit',type=int,default=4)
    parser.add_argument('--retry-failed',action='store_true',help='Explicitly retry failed/deferred hashes')
    parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args()
    report=args.report.resolve()
    if not 1<=args.limit<=32:parser.error('limit must be 1..32')
    if not report.is_relative_to(ROOT/'reports') or report.suffix!='.json' or report.exists():
        parser.error('Choose a fresh JSON report inside reports')
    root=DATA/'table-index'
    with FileMutex(root/'builder.lock',timeout=0):
        db=open_writer(root/'rows.sqlite3')
        try:
            known={sha for sha,result in db.execute('SELECT sha,result FROM documents WHERE parser=?',(PARSER,))
                   if not args.retry_failed or json.loads(result).get('state','indexed')=='indexed'}
            with Session() as session:
                statement=select(Document.id,Document.sha256,Document.raw_name).where(
                    Document.visibility=='public',Document.status.in_(['published','pending_review']),
                    Document.kind.in_(['knowledge','policy','notice']))
                if args.document_id:statement=statement.where(Document.id.in_(args.document_id))
                candidates=[dict(r._mapping) for r in session.execute(statement.order_by(Document.id))]
                metadata=live_metadata(session)
                candidates=[c for c in candidates if eligibility(c['id'],metadata)['eligible']]
            events=[]
            for candidate in candidates:
                if len(events)>=args.limit:break
                if candidate['sha256'] in known or Path(candidate['raw_name']).suffix.lower()!='.pdf':continue
                event={'document_id':candidate['id'],'sha256':candidate['sha256']}
                try:
                    # Verify authority before inspecting any raw file, then audit rechecks again.
                    with Session() as session:source_state(session,candidate['id'])
                    path=(DATA/'raw'/candidate['raw_name']).resolve()
                    if path.parent!=(DATA/'raw').resolve() or path.stat().st_size>25*1024*1024:
                        raise ValueError('Original path or byte budget')
                    import pypdfium2
                    pdf=pypdfium2.PdfDocument(path)
                    try:
                        pages=len(pdf)
                    finally:
                        pdf.close()
                    if not 1<=pages<=20:
                        event.update(state='deferred',reason='document_page_budget',pages=pages)
                    else:
                        value=audit(candidate['id'],list(range(1,pages+1)))
                        if value['sha256']!=candidate['sha256']:raise ValueError('Source version changed')
                        event.update(save_audit(db,value));known.add(value['sha256'])
                except Exception as error:
                    event.update(state='failed',reason=type(error).__name__)
                if event['state'] in ('failed','deferred'):
                    save_disposition(db,candidate['sha256'],event['state'],event['reason'])
                    known.add(candidate['sha256'])
                events.append(event)
            result={'checked_at':datetime.now(timezone.utc).isoformat(),'parser':PARSER,
                'events':events,'business_database_writes':0,'network_or_model_requests':0,
                'full_pdf_coverage_proven':False,'cached_documents':db.execute('SELECT COUNT(*) FROM documents WHERE parser=?',(PARSER,)).fetchone()[0],
                'cached_rows':db.execute('SELECT COUNT(*) FROM grid_rows WHERE parser=?',(PARSER,)).fetchone()[0]}
            report.parent.mkdir(parents=True,exist_ok=True)
            with report.open('x',encoding='utf-8') as output:json.dump(result,output,ensure_ascii=False,indent=2)
            print(json.dumps({k:v for k,v in result.items() if k!='events'}))
            return int(any(e['state']=='failed' for e in events))
        finally:db.close()


if __name__=='__main__':raise SystemExit(main())
