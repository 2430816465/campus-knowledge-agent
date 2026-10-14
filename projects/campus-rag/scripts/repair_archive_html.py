"""Finite HTML recovery at a free pipeline/crawler checkpoint; preview by default."""
import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from app.config import DATA,DATABASE_URL
from app.db import Session
from app.archive_html_repair import load_plan,archive_record,business_record,source_bytes,apply_one,ArchiveRepairError
from scripts.sync_school_archive import PipelineLock,PipelineBusyError,atomic_json


def inspect_targets(db,factory,targets,blob_root):
    from sqlalchemy import text
    result=[]
    with factory() as session:
        if session.bind.dialect.name=='postgresql':session.execute(text('SET TRANSACTION READ ONLY'))
        for target in targets:
            row=archive_record(db,target);doc=business_record(session,target)
            content=source_bytes(blob_root,target['sha256'])
            result.append({**target,'archive_state':row['import_state'],'business_status':doc.status,
                'bytes_verified':len(content),'qualification':'repair guards enforced at application; not yet applied'})
    return result


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--report',type=Path)
    args=parser.parse_args(argv)
    archive=DATA/'school-archive';frontier=archive/'frontier.sqlite3'
    if args.report and (not args.report.resolve().is_relative_to((ROOT/'reports').resolve())
            or args.report.resolve()==args.plan.resolve()):
        parser.error('Report must be under reports/ and distinct from the plan')
    plan,digest=load_plan(args.plan)
    if not args.apply:
        with sqlite3.connect(frontier.resolve().as_uri()+'?mode=ro',uri=True) as db:
            db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
            result={'mode':'preview','plan_sha256':digest,'active_data_modified':False,
                'targets':inspect_targets(db,Session,plan['targets'],archive/'blobs')}
        if args.report:atomic_json(args.report,result)
        print(json.dumps(result,ensure_ascii=True));return 0
    try:
        with PipelineLock(archive/'pipeline.lock'),PipelineLock(archive/'crawler.lock'):
            if subprocess.check_output(['git','status','--porcelain','--','app','scripts','tests'],cwd=ROOT,text=True).strip():
                raise ValueError('Commit implementation before applying recovery')
            from sqlalchemy.engine import make_url
            from scripts.postgres_backup import backup,runtime_url
            url=make_url(DATABASE_URL)
            if not (url==make_url(runtime_url()) and url.host=='127.0.0.1' and url.port==5433 and url.database=='campus'):
                raise ValueError('Production recovery database identity mismatch')
            with sqlite3.connect(frontier.resolve().as_uri()+'?mode=ro',uri=True) as check:
                check.row_factory=sqlite3.Row;check.execute('PRAGMA query_only=ON');check.execute('BEGIN')
                inspect_targets(check,Session,plan['targets'],archive/'blobs')
            folder=backup()  # Fresh consistent snapshot while both worker locks are held.
            report=args.report or ROOT/'reports'/('html-repair-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid4().hex[:8]+'.json')
            result={'mode':'apply','plan_sha256':digest,'code_version':subprocess.check_output(
                ['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'backup':str(folder),
                'backup_manifest_sha256':hashlib.sha256((folder/'manifest.json').read_bytes()).hexdigest(),
                'events':[],'completed':False,'teacher_publication_performed':False,'model_or_embedding_calls':0}
            atomic_json(report,result)
            with sqlite3.connect(frontier,timeout=10) as db:
                db.row_factory=sqlite3.Row
                for target in plan['targets']:
                    try:event=apply_one(db,Session,target,archive/'blobs')
                    except ArchiveRepairError as exc:
                        event={**target,'failed':True,'stage':exc.stage,'error_type':exc.cause_type,
                            'retry_requires_rechecking_durable_business_audit':True}
                    result['events'].append(event);atomic_json(report,result)
            result['completed']=True;result['failed']=sum(bool(e.get('failed')) for e in result['events'])
            result['chunks_created']=sum(e.get('chunks_created',0) for e in result['events'])
            result['archive_records_changed']=sum(bool(e.get('archive_changed')) for e in result['events'])
            atomic_json(report,result)
            print(json.dumps({**{k:v for k,v in result.items() if k!='events'},'report':str(report)},ensure_ascii=True))
            return 1 if result['failed'] else 0
    except PipelineBusyError:
        print(json.dumps({'mode':'apply','deferred':True,'reason':'pipeline_or_crawler_lock_held',
            'business_database_opened':False,'backup_started':False,'workers_restarted':False}))
        return 75


if __name__=='__main__':raise SystemExit(main())
