"""Read-only repeatable-read business inventory; no text/vector/model requests."""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select, func, text
from app.db import engine, Document, Chunk
from app.coverage_inventory import inventory


def read_inventory(bind):
    if bind.dialect.name == 'postgresql':
        bind = bind.execution_options(isolation_level='REPEATABLE READ')
    with bind.connect() as connection:
        sqlite_read_only = None
        try:
            with connection.begin():
                if connection.dialect.name == 'postgresql':
                    connection.execute(text('SET TRANSACTION READ ONLY'))
                elif connection.dialect.name == 'sqlite':
                    sqlite_read_only = connection.exec_driver_sql('PRAGMA query_only').scalar()
                    connection.exec_driver_sql('PRAGMA query_only=ON')
                    connection.exec_driver_sql('BEGIN')
                columns = [getattr(Document,name) for name in
                           ('id','title','source_url','publisher','published_at','sha256','status','visibility','parent_id')]
                documents = [dict(row) for row in connection.execute(select(*columns).order_by(Document.id)).mappings()]
                from app.source_versions import enrich_metadata
                from app.config import DATA
                documents = list(enrich_metadata({d['id']:d for d in documents}, DATA/'source-versions'/'evidence.sqlite3').values())
                chunks = dict(connection.execute(select(Chunk.document_id,func.count()).group_by(Chunk.document_id)).all())
                report = inventory(documents,chunks,current_year=datetime.now().year)
        finally:
            if sqlite_read_only is not None:
                connection.exec_driver_sql('PRAGMA query_only=' + str(int(sqlite_read_only)))
    return {'checked_at':datetime.now(timezone.utc).isoformat(), 'read_only_business_database':True,
            'business_dialect':bind.dialect.name, 'raw_text_or_vectors_loaded':False,
            'network_or_model_requests':0, **report}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path,default=Path(__file__).resolve().parents[1]/'reports/knowledge-coverage.json')
    args = parser.parse_args(argv)
    result = read_inventory(engine)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({key:result[key] for key in ('checked_at','document_count','chunk_count','eligible_documents_with_chunks','reviewed_published_documents','missing_publication_date','missing_publisher','unmatched_title_metadata')},ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
