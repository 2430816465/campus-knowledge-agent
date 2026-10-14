"""Run only with the web process stopped. Require complete equality; preserve SQLite."""
import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sqlalchemy import create_engine
from scripts.postgres_backup import tables, runtime_url
from scripts.backup import backup

restore = json.loads((ROOT / 'reports/postgres-restore-check.json').read_text(encoding='utf-8'))
assert restore['passed'], 'A successful independent PostgreSQL restore drill is required'
assert 'DATABASE_URL' not in os.environ, 'Remove ambient database override before cutover'
target = ROOT / '.secrets/runtime.json'
assert not target.exists(), 'Runtime already selected; inspect instead of replacing it'

# There is no public listener during the cutover; fail if still running.
import socket
with socket.socket() as sock:
    sock.settimeout(1)
    assert sock.connect_ex(('127.0.0.1', 8008)) != 0, 'Stop the project web process first'
folder = backup()
sqlite = create_engine('sqlite:///' + (folder / 'campus.db').as_posix())
postgres = create_engine(runtime_url())
with sqlite.connect() as left, postgres.connect() as right:
    source_tables = tables(left)
    destination_tables = tables(right)
assert source_tables == destination_tables, 'SQLite changed since migration; source retained, reconcile before switching'
sqlite.dispose()
postgres.dispose()

configuration = {'DATABASE_URL': runtime_url()}
pending = target.with_suffix('.pending')
with pending.open('x', encoding='utf-8') as output:
    json.dump(configuration, output)
pending.chmod(0o600)
pending.replace(target)
report = {'checked_at': datetime.now().astimezone().isoformat(), 'configuration_selected': 'postgresql',
          'source_sqlite_retained': True, 'fresh_sqlite_backup': str(folder),
          'all_tables_identical': True, 'tables': source_tables,
          'web_restart_and_live_acceptance_pending': True}
(ROOT / 'reports/postgres-cutover.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k != 'tables'}, ensure_ascii=False, indent=2))
