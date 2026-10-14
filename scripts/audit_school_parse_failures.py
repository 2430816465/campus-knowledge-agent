"""Finite read-only failure audit. Writes only its separate JSON report."""
import argparse
import json
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.parse_diagnostics import audit_failures


def main(argv=None):
    root = Path(__file__).resolve().parents[1]
    data = Path(os.environ.get('CAMPUS_DATA',str(root/'data')))
    if not data.is_absolute():
        data = root/data
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit',type=int,default=100)
    parser.add_argument('--archive-dir',type=Path,default=data/'school-archive')
    parser.add_argument('--report',type=Path,default=root/'reports/parse-failure-audit.json')
    args=parser.parse_args(argv)
    archive=args.archive_dir.resolve();report=args.report.resolve()
    if report.is_relative_to(archive):
        parser.error('Report must be outside the read-only archive.')
    result=audit_failures(archive/'frontier.sqlite3',archive/'blobs',limit=args.limit)
    report.parent.mkdir(parents=True,exist_ok=True)
    report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({key:result[key] for key in ('audited','remaining_not_audited','categories','literal_resource_states')},ensure_ascii=True))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
