"""Freeze or observe a bounded V1 frontier without changing archive state."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.crawl_cohort import freeze, load, observe


def main(argv=None):
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['freeze', 'status'])
    parser.add_argument('--frontier', type=Path, default=root/'data/school-archive/frontier.sqlite3')
    parser.add_argument('--cohort', type=Path, required=True)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args(argv)
    if args.report and (args.report.resolve().is_relative_to(args.frontier.resolve().parent)
                        or args.report.resolve() == args.cohort.resolve()):
        parser.error('Report must be outside archive and distinct from cohort.')
    if args.action == 'freeze':
        value = freeze(args.frontier, args.cohort)
        result = {key: value[key] for key in ('created_at','target_count','rows_sha256')}
    else:
        value = load(args.cohort)
        if Path(value['frontier']).resolve() != args.frontier.resolve():
            parser.error('Cohort belongs to a different frontier.')
        result = observe(args.frontier, value)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({key: value for key,value in result.items()
                      if key not in ('hosts','failure_reasons','non_success_details')},ensure_ascii=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
