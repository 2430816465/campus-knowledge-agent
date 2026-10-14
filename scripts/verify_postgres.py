"""Read-only PostgreSQL API acceptance and original-file staging; retain live SQLite."""
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
runtime = json.loads((ROOT / '.secrets/postgres-runtime.json').read_text(encoding='utf-8'))
os.environ['DATABASE_URL'] = runtime['DATABASE_URL']
from fastapi.testclient import TestClient
from app.main import app
from app.db import Session, Chunk

report = {'checked_at': datetime.now().astimezone().isoformat(),
          'database': 'postgresql', 'live_app_switched': False}
with TestClient(app) as client:
    health = client.get('/api/health').json()
    assert health['database'] == 'postgresql'
    report['health'] = health
    coverage = client.get('/api/coverage').json()
    ids = []
    while True:
        page = client.get('/api/competitions', params={'offset': len(ids), 'limit': 20}).json()
        ids.extend(row['competition_id'] for row in page['items'])
        if len(ids) >= page['total']:
            break
        assert page['items']
    assert len(ids) == len(set(ids)) == coverage['competitions'] == 257
    assert client.get('/api/competitions', params={'q': "%' OR 1=1--"}).json()['total'] == 0
    report['pagination'] = {'records': len(ids), 'unique': len(set(ids)), 'passed': True}
    comp = 'f6749c9f-973c-4630-85c3-52dcdfae0c36'
    result = client.post('/api/chat', json={
        'question': '2026年五一数学建模竞赛我校报名截止时间是什么？',
        'competition_id': comp, 'year': 2026}).json()
    assert result.get('sources') and '4 月 12 日' in result['answer'] and '20:00' in result['answer']
    with Session() as session:
        for source in result['sources']:
            chunk = session.get(Chunk, source['id'])
            assert chunk and chunk.document_id == source['document_id'] and source['quote'] in chunk.text
    report['real_notice_answer'] = result

migration = json.loads((ROOT / 'reports/postgres-migration.json').read_text(encoding='utf-8'))
backup = Path(migration['backup'])
manifest = json.loads((backup / 'manifest.json').read_text(encoding='utf-8'))
raw_target = Path('//wsl.localhost/Ubuntu/home/dzy/campus-agent/data/raw')
raw_target.mkdir(parents=True, exist_ok=True)
for name, expected in manifest['raw_hashes'].items():
    assert Path(name).name == name
    source = backup / 'raw' / name
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
    dest = raw_target / name
    if dest.exists():
        assert hashlib.sha256(dest.read_bytes()).hexdigest() == expected, 'Existing raw file differs'
    else:
        shutil.copy2(source, dest)
    assert hashlib.sha256(dest.read_bytes()).hexdigest() == expected
report['linux_raw_files_verified'] = len(manifest['raw_hashes'])
report['passed'] = True
(ROOT / 'reports/postgres-acceptance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'real_notice_answer'}, ensure_ascii=False, indent=2))
print('Real notice answer mode:', result['mode'])
