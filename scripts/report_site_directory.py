"""SHA-verify archived official directories and join read-only host inventories."""
import argparse
from collections import Counter
from datetime import datetime,timezone
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.config import DATA,ROOT
from app.db import engine
from app.site_directory import read_directories,directory_coverage
from scripts.report_knowledge_coverage import read_inventory


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path,default=ROOT/'reports/site-directory-coverage.json')
    args=parser.parse_args()
    report=args.report.resolve()
    if report.is_relative_to((DATA/'school-archive').resolve()):
        parser.error('report must be outside the archive')
    directory=read_directories(DATA/'school-archive')
    inventory=read_inventory(engine)
    result={'checked_at':datetime.now(timezone.utc).isoformat(),'business_snapshot_at':inventory['checked_at'],
        'read_only':True,'network_or_model_requests':0,**directory_coverage(directory,inventory)}
    report.parent.mkdir(parents=True,exist_ok=True)
    report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'sources':Counter(s['status'] for s in result['sources']),
        'entries':len(result['entries']),'entry_statuses':Counter(e['status'] for e in result['entries']),
        'matched_business_hosts':len(result['matched_business_hosts']),
        'unassigned_business_hosts':len(result['business_hosts_without_directory_identity']),
        'document_applicability_verified':False},ensure_ascii=True))


if __name__=='__main__':main()
