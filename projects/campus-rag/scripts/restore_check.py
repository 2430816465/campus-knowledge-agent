"""恢复到全新目录，核对原文哈希、表数量、外键和真实通知检索；不覆盖活动数据。"""
import argparse,hashlib,json,shutil,sqlite3,sys,uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.config import DATA,ROOT
from sqlalchemy import create_engine,select,func
from sqlalchemy.orm import Session
from app.db import Base
from app.rag import retrieve

parser=argparse.ArgumentParser();parser.add_argument('backup');parser.add_argument('--target')
args=parser.parse_args();source=Path(args.backup).resolve()
target=Path(args.target).resolve() if args.target else DATA/'restore-checks'/uuid.uuid4().hex[:12]
if target.exists():raise SystemExit('恢复目标必须不存在；不覆盖任何已有目录')
if target==DATA.resolve() or DATA.resolve() in target.parents and target.name in ('raw','inbox'):
    raise SystemExit('恢复目标不能是活动数据目录')
manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
for file,key in [('campus.db','sqlite_sha256'),('business.json','business_sha256')]:
    assert hashlib.sha256((source/file).read_bytes()).hexdigest()==manifest[key],file+'备份损坏'
shutil.copytree(source,target)
with sqlite3.connect(target/'campus.db') as connection:
    assert connection.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert connection.execute('PRAGMA foreign_key_check').fetchall()==[]
for name,digest in manifest['raw_hashes'].items():
    assert hashlib.sha256((target/'raw'/name).read_bytes()).hexdigest()==digest
engine=create_engine('sqlite:///'+(target/'campus.db').as_posix());counts={}
with engine.connect() as connection:
    for table in Base.metadata.sorted_tables:counts[table.name]=connection.scalar(select(func.count()).select_from(table))
assert counts==manifest['counts']
with Session(engine) as session:
    hits,_=retrieve(session,'2026五一数学建模我校报名时间',year=2026,semantic=False)
    assert any('4 月 12 日' in hit['text'] and '20:00' in hit['text'] for hit in hits)
report={'passed':True,'backup':str(source),'restored_to':str(target),'counts':counts,'raw_hashes_verified':len(manifest['raw_hashes']),'retrieval_verified':'2026五一数学建模校内报名时间','active_database_overwritten':False}
(ROOT/'reports'/'restore-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
