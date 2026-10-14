"""在线 SQLite 一致性备份，附公开/私有原文及可迁移的业务表 JSON；不复制口令。"""
import hashlib,json,shutil,sqlite3,sys,uuid
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.config import DATA,ROOT,DATABASE_URL
from app.db import Base
from sqlalchemy import create_engine,select

def backup():
    if not DATABASE_URL.startswith('sqlite:'):
        from scripts.postgres_backup import backup as postgres_backup
        folder = postgres_backup()
        print('PostgreSQL 一致性备份：'+str(folder))
        return folder
    target=DATA/'backups'/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6])
    target.mkdir(parents=True);(target/'raw').mkdir()
    with sqlite3.connect(DATA/'campus.db') as source,sqlite3.connect(target/'campus.db') as dest:
        source.backup(dest)
        assert dest.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    engine=create_engine('sqlite:///'+(target/'campus.db').as_posix())
    tables={}
    with engine.connect() as connection:
        for table in Base.metadata.sorted_tables:
            tables[table.name]=[dict(row) for row in connection.execute(select(table)).mappings()]
    raw_hashes={}
    for doc in tables['documents']:
        name=doc['raw_name'];path=DATA/'raw'/name
        if not path.is_file():raise RuntimeError('缺少原文：'+name)
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest!=doc['sha256']:raise RuntimeError('原文哈希不匹配：'+name)
        shutil.copy2(path,target/'raw'/name);raw_hashes[name]=digest
    (target/'business.json').write_text(json.dumps({'schema_version':1,'tables':tables},ensure_ascii=False),encoding='utf-8')
    manifest={'schema_version':1,'created_at':datetime.now(timezone.utc).isoformat(),'counts':{k:len(v) for k,v in tables.items()},'raw_hashes':raw_hashes,'sqlite_sha256':hashlib.sha256((target/'campus.db').read_bytes()).hexdigest(),'business_sha256':hashlib.sha256((target/'business.json').read_bytes()).hexdigest(),'secrets_included':False,'warning':'可能包含私有资料，仅保存在本机或学校允许位置'}
    (target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'reports'/'latest-backup.json').write_text(json.dumps({'path':str(target),**manifest},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'backup':str(target),'counts':manifest['counts'],'raw_files':len(raw_hashes)},ensure_ascii=False))
    return target
if __name__=='__main__':backup()
