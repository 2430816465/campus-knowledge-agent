"""将 backup/business.json 迁入全新的 PostgreSQL/SQLite；目标 URL 从环境读取。"""
import argparse,hashlib,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine,select,func
from app.db import Base
parser=argparse.ArgumentParser();parser.add_argument('backup');args=parser.parse_args()
folder=Path(args.backup);manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
payload=(folder/'business.json').read_bytes()
assert hashlib.sha256(payload).hexdigest()==manifest['business_sha256']
url=os.environ.get('MIGRATION_TARGET_URL')
if not url:raise SystemExit('请在本机设置 MIGRATION_TARGET_URL；不要把含密码的 URL 发到聊天')
engine=create_engine(url);Base.metadata.create_all(engine)
tables=json.loads(payload)['tables']
with engine.begin() as connection:
    if any(connection.scalar(select(func.count()).select_from(t)) for t in Base.metadata.sorted_tables):
        raise SystemExit('目标库非空；拒绝覆盖或追加，先创建独立空业务库')
    for table in Base.metadata.sorted_tables:
        if tables[table.name]:connection.execute(table.insert(),tables[table.name])
    counts={t.name:connection.scalar(select(func.count()).select_from(t)) for t in Base.metadata.sorted_tables}
    assert counts==manifest['counts']
print(json.dumps({'dialect':engine.dialect.name,'counts':counts,'secrets_printed':False,'note':'还须迁移 raw 目录、核对原文哈希并在目标环境验收'},ensure_ascii=False))
