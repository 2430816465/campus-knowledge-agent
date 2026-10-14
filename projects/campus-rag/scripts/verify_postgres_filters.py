"""Compare every filter family against the consistent pre-cutover SQLite snapshot."""
import json
import sys
from datetime import datetime
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.tools import search_competitions
from scripts.postgres_backup import runtime_url

cutover = json.loads((ROOT / 'reports/postgres-cutover.json').read_text(encoding='utf-8'))
sqlite = create_engine('sqlite:///' + (Path(cutover['fresh_sqlite_backup']) / 'campus.db').as_posix())
postgres = create_engine(runtime_url())
cases = [{}, {'q': '数学'}, {'q': "%' OR 1=1--"}, {'year': 2026}, {'year': 2025},
         {'track': '就业赛道'}, {'phase': '校赛'}, {'school': '南京晓庄学院'},
         {'college': '信息工程学院'}, {'major': '计算机科学与技术'}, {'education': '本科'},
         {'grade': '2024'}, {'team_size': 3}, {'recognition': 'A类'}, {'verified': True},
         {'registration': 'open'}, {'registration': 'closed'}, {'registration': 'unknown'},
         {'before': '2026-04-30'}, {'after': '2026-01-01'},
         {'after': '2026-01-01', 'before': '2026-12-31'},
         {'year': 2026, 'q': '数学', 'team_size': 3}, {'offset': 240, 'limit': 20}]
with Session(sqlite) as source, Session(postgres) as target:
    for case in cases:
        assert search_competitions(source, at='2026-10-09T15:00:00+08:00', **case) == search_competitions(target, at='2026-10-09T15:00:00+08:00', **case), 'Filter results differ: ' + str(case)
sqlite.dispose()
postgres.dispose()
report = {'checked_at': datetime.now().astimezone().isoformat(), 'passed': True,
          'cases': cases, 'case_count': len(cases), 'compared_to': cutover['fresh_sqlite_backup'],
          'scope': 'Imported public data; equal unknown/empty results do not prove school rules.'}
(ROOT / 'reports/postgres-filters.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('PostgreSQL / SQLite full filter comparison passed:', len(cases), 'cases')
