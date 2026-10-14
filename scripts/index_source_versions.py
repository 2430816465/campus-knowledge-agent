"""Finite resumable original-version audit. Read-only PG/raw; derived SQLite only."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db import engine,Document,Chunk
from app.config import DATA,ROOT
from app.semantic_sources import readonly_connection,document_metadata
from app.source_scope import eligibility
from app.model_gate import FileMutex
from app.evaluation import original_segments
from app.source_versions import PARSER_VERSION,original_year,open_cache,save_evidence


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit',type=int,default=32)
    parser.add_argument('--document-id',action='append',default=[])
    parser.add_argument('--report',type=Path,default=ROOT/'reports/source-version-index.json')
    args=parser.parse_args(argv)
    if not 0<=args.limit<=500:
        parser.error('limit must be 0..500')
    root=DATA/'source-versions'
    with FileMutex(root/'builder.lock',timeout=0):
        cache=open_cache(root/'evidence.sqlite3')
        try:
            known={r[0] for r in cache.execute('SELECT sha256 FROM evidence WHERE parser=?',(PARSER_VERSION,))}
            with readonly_connection(engine,snapshot=True) as connection:
                metadata=document_metadata(connection)
                statement=select(Document.id,Document.sha256,Document.raw_name).where(
                    Document.id.in_(select(Chunk.document_id)),Document.mime.in_(['.html','.htm','.pdf','text/html','application/pdf']))
                if args.document_id:
                    statement=statement.where(Document.id.in_(args.document_id))
                documents=[dict(r) for r in connection.execute(statement.order_by(Document.id)).mappings()]
                eligible=[d for d in documents if eligibility(d['id'],metadata)['eligible']]
            # No long-lived business transaction while opening originals.
            attempted,events=0,[]
            for document in eligible:
                sha=document['sha256']
                if sha in known or attempted>=args.limit:
                    continue
                attempted+=1
                try:
                    result=original_year(original_segments(DATA/'raw',document))
                except Exception as exc:
                    result={'state':'failed','reason':type(exc).__name__+': '+str(exc)[:180]}
                save_evidence(cache,sha,result,datetime.now(timezone.utc).isoformat())
                known.add(sha)
                events.append({'document_id':document['id'],'source_sha256':sha,**result})
            counts=dict(cache.execute('SELECT state,COUNT(*) FROM evidence WHERE parser=? GROUP BY state',(PARSER_VERSION,)))
            report={'checked_at':datetime.now(timezone.utc).isoformat(),'parser_version':PARSER_VERSION,'attempted':attempted,
                'eligible_documents':len(eligible),'cache_counts':counts,'remaining_unique_hashes':len({d['sha256'] for d in eligible}-known),
                'business_database_writes':0,'network_or_model_requests':0,'current_policy_validity_verified':False,'events':events}
            args.report.parent.mkdir(parents=True,exist_ok=True)
            args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({k:v for k,v in report.items() if k!='events'},ensure_ascii=True))
            return 1 if any(e['state']=='failed' for e in events) else 0
        finally:
            cache.close()


if __name__=='__main__':
    raise SystemExit(main())
