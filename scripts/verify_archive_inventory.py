"""Read-only corpus inventory; counts downloads and usable business docs separately."""
import sys
import json
import sqlite3
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select, func
from app.db import Session, Document, Chunk, Competition, timestamp
from app.config import ROOT, DATA

def main():
    with Session() as session:
        report = {'checked_at':timestamp(), 'business_database':session.bind.dialect.name,
                  'documents_by_visibility_status_format':[
                      dict(visibility=v,status=s,format=m,count=n) for v,s,m,n in session.execute(
                          select(Document.visibility,Document.status,Document.mime,func.count()).group_by(
                              Document.visibility,Document.status,Document.mime))],
                  'document_count':session.scalar(select(func.count()).select_from(Document)),
                  'chunk_count':session.scalar(select(func.count()).select_from(Chunk)),
                  'embedded_chunk_count':session.scalar(select(func.count()).select_from(Chunk).where(Chunk.vector.is_not(None))),
                  'competition_record_count':session.scalar(select(func.count()).select_from(Competition)),
                  'published_document_count':session.scalar(select(func.count()).select_from(Document).where(Document.status=='published'))}
        xls = session.scalar(select(Document).where(Document.mime=='.xls',Document.visibility=='public',
                                                   Document.status.in_(['pending_review','published'])).order_by(Document.id))
        if xls:
            chunks = session.scalars(select(Chunk).where(Chunk.document_id==xls.id).order_by(Chunk.location)).all()
            report['real_xls_sample'] = {'id':xls.id,'title':xls.title,'url':xls.source_url,'sha256':xls.sha256,
                                        'status':xls.status,'chunk_count':len(chunks), 'warnings':xls.warnings,
                                        'sample_locations':[c.location for c in chunks[:3]]}
    with sqlite3.connect(DATA/'school-archive/frontier.sqlite3',timeout=30) as archive:
        report['archive_states'] = dict(archive.execute('SELECT state,COUNT(*) FROM urls GROUP BY state'))
        report['archive_import_states'] = dict(archive.execute("SELECT COALESCE(import_state,'pending'),COUNT(*) FROM urls WHERE state='fetched' GROUP BY import_state"))
        report['current_unique_blobs'] = archive.execute('SELECT COUNT(DISTINCT sha256) FROM urls').fetchone()[0]
    report.update(full_school_coverage_proven=False,teacher_gold_standard=False,
                  note='Downloads, URL aliases, searchable docs and competition records are different units. Read snapshots of two stores are not one atomic transaction.')
    (ROOT/'reports/archive-corpus-inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
    main()
