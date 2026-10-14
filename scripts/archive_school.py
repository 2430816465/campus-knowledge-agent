"""Resume official public site discovery/download; separate from business import."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA, ROOT
from app.school_archive import SchoolArchive

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--seed', action='append', default=[])
    p.add_argument('--cohort', type=Path, help='Immutable V1 baseline; download only its initial pending URLs.')
    p.add_argument('--max-requests', type=int, default=200)
    p.add_argument('--delay', type=float, default=.7,
                   help='Post-request pause; minimum .7 seconds. Connections are reused within one batch.')
    p.add_argument('--workers', type=int, choices=range(1,5), default=4,
                   help='Network workers (default 4); one content request per host, owner-only SQLite.')
    p.add_argument('--retry-failed', action='store_true')
    p.add_argument('--retry-deferred', action='store_true', help='Explicitly recheck requests deferred by unavailable robots.')
    p.add_argument('--rediscover-archived', action='store_true', help='Replay verified archived HTML links without HTTP; use --max-requests 0 for replay only.')
    p.add_argument('--refresh-after-hours', type=float, help='Explicitly requeue fetched URLs older than this age; default does not refresh.')
    p.add_argument('--robots-ttl-hours', type=float, default=24, help='Robots cache lifetime; expired failures never imply permission.')
    args = p.parse_args()
    cohort_urls = None
    if args.cohort:
        from app.crawl_cohort import load, target_urls
        cohort = load(args.cohort)
        if Path(cohort['frontier']).resolve() != (DATA/'school-archive/frontier.sqlite3').resolve():
            p.error('Cohort belongs to a different frontier.')
        if args.retry_failed or args.retry_deferred or args.refresh_after_hours is not None:
            p.error('Cohort pass cannot refresh/retry states.')
        cohort_urls = target_urls(cohort)
    with SchoolArchive(DATA / 'school-archive', robots_ttl_hours=args.robots_ttl_hours) as archive:
        for seed in args.seed or ['https://www.njxzc.edu.cn/main.htm']:
            archive.enqueue(seed, '南京晓庄学院官网入口')
        try:
            result = archive.run(args.max_requests, max(.7, args.delay), args.retry_failed,
                                 refresh_after_hours=args.refresh_after_hours, retry_deferred=args.retry_deferred,
                                 rediscover_archived=args.rediscover_archived, cohort_urls=cohort_urls, workers=args.workers)
        finally:
            archive.report(ROOT / 'reports/school-archive.json')
    print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
