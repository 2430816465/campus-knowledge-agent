"""Summarize a real export without exposing message text or inventing G/A."""
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path

from compare_evidence import load_events, observations, qualified


def describe(path, run_id):
    path = Path(path)
    events = load_events(path)
    selected = [e for e in events if e['payload'].get('run_id') == run_id]
    if not selected:
        raise ValueError('Requested run_id is absent from this export')
    counts = Counter(e['payload'].get('type') for e in selected)
    times = {}
    for name in ('SESSION_START', 'SESSION_END'):
        values = [e['at_ms'] for e in selected if e['payload'].get('type') == name]
        times[name] = [dict(at_ms=value, local_time=datetime.fromtimestamp(
            value / 1000, timezone(timedelta(hours=8))).isoformat()) for value in values]
    beats = [e['payload']['data'] for e in selected if e['payload'].get('type') == 'HEARTBEAT']
    snapshots = [e['payload']['data'] for e in selected if e['payload'].get('type') == 'ACCESSIBILITY_SNAPSHOT']
    candidates = observations(selected)
    click_ocr = [e['payload']['data'] for e in selected if e['payload'].get('type') == 'OCR_RESULT'
                 and e['payload']['data'].get('mode') == 'USER_TRIGGERED_VISIBLE_SAMPLE']
    heartbeat_times = [e['at_ms'] for e in selected if e['payload'].get('type') == 'HEARTBEAT']
    return dict(schema=1, run_id=run_id,
                source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                complete_export_events=len(events), run_events=len(selected),
                export_status='COMPLETE_HASH_CHAIN_VERIFIED_NOT_PROOF_OF_AUTHENTICITY',
                event_types=dict(sorted(counts.items())), boundaries=times,
                heartbeat_count=len(beats),
                heartbeat_max_wall_interval_ms=max((b-a for a,b in zip(heartbeat_times, heartbeat_times[1:])), default=None),
                heartbeat_all_true={key: all(b.get(key) is True for b in beats) if beats else None
                                    for key in ('accessibility_permission', 'accessibility_connected',
                                                'notification_permission', 'notification_connected', 'monitor_active')},
                projection_active_heartbeats=sum(b.get('projection_active') is True for b in beats),
                auto_screenshot_heartbeats=sum(b.get('auto_accessibility_screenshot') is True for b in beats),
                accessibility_visible_wechat_snapshots=sum(s.get('wechat_window_visible') is True for s in snapshots),
                raw_automatic_candidates=len(candidates),
                candidates_meeting_current_qualification=sum(qualified(c) for c in candidates),
                user_click_requests=sum(e['payload'].get('type') == 'SCREENSHOT_REQUESTED' and
                                        e['payload']['data'].get('mode') == 'USER_TRIGGERED_VISIBLE_SAMPLE' for e in selected),
                user_click_rejections=sum(e['payload'].get('type') == 'SCREENSHOT_REQUEST_REJECTED' and
                                          e['payload']['data'].get('mode') == 'USER_TRIGGERED_VISIBLE_SAMPLE' for e in selected),
                user_click_ocr_results=len(click_ocr),
                user_click_unverified_text_lines=sum(len(data.get('lines', [])) for data in click_ocr),
                screenshot_callback_latencies_ms=[e['payload']['data'].get('callback_latency_ms') for e in selected
                                                  if e['payload'].get('type') == 'SCREENSHOT_CALLBACK_SUCCESS'],
                user_click_ocr_all_unverified=all(d.get('recognition_status') == 'UNVERIFIED' for d in click_ocr) if click_ocr else None,
                user_click_ocr_all_nonautomatic=all(d.get('automatic') is False for d in click_ocr) if click_ocr else None,
                G=None, A=None, message_acceptance='NOT_EVALUATED_INDEPENDENT_TRUTH_REQUIRED',
                g1_gate='NOT_PASSED')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--events', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = describe(args.events, args.run_id)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    main()
