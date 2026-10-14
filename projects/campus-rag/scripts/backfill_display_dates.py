"""Plan or apply a bounded date-only repair after a verified consistent backup."""
import argparse
from collections import Counter
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import sys
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
from app.config import ROOT,DATA
from app.db import Session
from app.metadata_dates import plan_dates,apply_dates


def verified_backup(folder):
    folder=Path(folder).resolve()
    if not folder.is_relative_to((DATA/'postgres-backups').resolve()):raise ValueError('backup outside local backup directory')
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if not manifest.get('snapshot_consistent'):raise ValueError('backup is not snapshot consistent')
    with (folder/'business.dump').open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
    if digest!=manifest['dump_sha256']:raise ValueError('backup dump SHA mismatch')
    return folder


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host',required=True);parser.add_argument('--limit',type=int,default=500)
    parser.add_argument('--apply',action='store_true');parser.add_argument('--backup',type=Path)
    args=parser.parse_args()
    backup=verified_backup(args.backup) if args.apply and args.backup else None
    if args.apply and backup is None:parser.error('--apply requires --backup')
    run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid4().hex[:8]
    folder=DATA/'metadata-date-repairs'/run_id
    with Session() as session:
        if not args.apply and session.bind.dialect.name=='postgresql':session.execute(text('SET TRANSACTION READ ONLY'))
        plan=plan_dates(session,args.host,DATA/'raw',args.limit)
        result={'run_id':run_id,'apply':args.apply,'backup':str(backup) if backup else None,'plan':plan}
        if args.apply:
            result['result']=apply_dates(session,plan,DATA/'raw',folder/'before.json')
            session.commit();result['database_committed']=True
        else:session.rollback();result['database_committed']=False
    folder.mkdir(parents=True,exist_ok=True)
    (folder/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'run_id':run_id,'examined':plan['examined'],'outcomes':Counter(plan['outcomes'].values()),
        'database_committed':result['database_committed'],'result':result.get('result'),
        'report':str(folder/'result.json')},ensure_ascii=True))


if __name__=='__main__':main()
