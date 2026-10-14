"""G1 evidence audit. Synthetic unit fixtures NEVER constitute WeChat evidence.

The G denominator is supplied independently by the sending endpoint and verified
as delivered after freezing capture. Unknown identities and late observations fail.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

TRUTH_FIELDS = {
    "run_id", "scenario", "message_id", "sender_record_id", "streamer_id",
    "contact_id", "direction", "body", "order", "kind", "arrived_at_ms",
    "cutoff_at_ms", "delivery_confirmed",
}
SOURCES = {"notification", "accessibility", "projection_ocr", "accessibility_ocr"}
TYPES = {"NOTIFICATION_POSTED", "ACCESSIBILITY_SNAPSHOT", "OCR_RESULT"}


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_events(path, allow_legacy=False):
    events, previous, header, ended = [], "0", None, False
    for index, line in enumerate(Path(path).read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if ended:
            raise ValueError("Unexpected data after export completion marker")
        if row.get("record_type") == "EXPORT_START":
            if index != 1 or header is not None or events or row.get("export_schema") != 2:
                raise ValueError("Invalid export header")
            if type(row.get("expected_event_count")) is not int or row["expected_event_count"] < 0 or not row.get("export_id"):
                raise ValueError("Invalid expected event count or export ID")
            header = row
            continue
        if row.get("record_type") == "EXPORT_END":
            if header is None or row.get("export_schema") != 2:
                raise ValueError("Export completion marker has no valid header")
            if row.get("export_id") != header["export_id"] or row.get("event_count") != len(events) or len(events) != header["expected_event_count"]:
                raise ValueError("Export event count or ID mismatch")
            if row.get("last_event_hash") != previous or header.get("last_event_hash") != previous:
                raise ValueError("Export final hash mismatch")
            ended = True
            continue
        if header is None and not allow_legacy:
            raise ValueError("Missing export completion protocol; legacy evidence is diagnostic only")
        raw = row["payload_json"]
        digest = sha(raw)
        expected = sha(f'{previous}|{row["event_id"]}|{row["at_ms"]}|{digest}')
        if row["prev_hash"] != previous or digest != row["payload_sha256"] or expected != row["hash"]:
            raise ValueError(f"Evidence integrity chain failed at line {index}")
        if row["seq"] != len(events) + 1:
            raise ValueError("Export must include complete evidence from seq=1; truncated export rejected")
        payload = json.loads(raw)
        if payload.get("schema") != 1:
            raise ValueError("Unknown evidence schema")
        if any(payload.get(field) != row.get(field) for field in ("event_id", "at_ms", "elapsed_ms", "source")):
            raise ValueError("Evidence envelope differs from hashed metadata")
        row["payload"] = payload
        events.append(row)
        previous = expected
    if (header is None or not ended) and not (allow_legacy and header is None):
        raise ValueError("Incomplete export: completion marker missing; preserve file and export again")
    return events


def load_truth(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not TRUTH_FIELDS.issubset(set(reader.fieldnames or [])):
            raise ValueError("Missing truth columns: " + ", ".join(sorted(TRUTH_FIELDS - set(reader.fieldnames or []))))
        rows = list(reader)
    seen = set()
    for row in rows:
        if any(row.get(field) in (None, "") for field in TRUTH_FIELDS):
            raise ValueError("Incomplete independent truth record; do not infer missing data")
        key = (row["run_id"], row["scenario"], row["message_id"])
        if key in seen:
            raise ValueError("Duplicate independent truth message ID")
        seen.add(key)
        if row["delivery_confirmed"].lower() != "true":
            raise ValueError("G requires independent delivery confirmation; unconfirmed sends cannot be silently excluded")
        if row["direction"] not in {"INBOUND", "OUTBOUND"}:
            raise ValueError("Unknown ground-truth direction")
        row["order"] = int(row["order"])
        row["arrived_at_ms"] = int(row["arrived_at_ms"])
        row["cutoff_at_ms"] = int(row["cutoff_at_ms"])
        if row["cutoff_at_ms"] < row["arrived_at_ms"]:
            raise ValueError("Cutoff precedes arrival")
    return rows


def observations(events):
    result = []
    for event in events:
        payload = event["payload"]
        if event["source"] not in SOURCES or payload.get("type") not in TYPES or payload.get("armed") is not True:
            continue
        data = payload.get("data", {})
        if data.get("mode") in {"USER_DELAYED_SAMPLE", "USER_TRIGGERED_VISIBLE_SAMPLE"}:
            continue
        for candidate in data.get("candidates", []):
            if candidate.get("automatic") is not True:
                continue
            item = dict(candidate)
            # Use persisted observation time, not sender IDs embedded in message text.
            item.update(run_id=payload.get("run_id"), scenario=payload.get("scenario"),
                        observed_at_ms=event["at_ms"], event_id=event["event_id"], source=event["source"])
            result.append(item)
    return result


def qualified(item):
    fields = ("identity_verified", "direction_verified", "order_verified", "message_boundary_verified")
    return all(item.get(field) is True for field in fields) and all(
        item.get(field) not in (None, "", "UNKNOWN")
        for field in ("native_message_id", "streamer_id", "contact_id", "direction", "order", "kind")
    ) and item.get("binding_origin") == "observed_identifier"


def compare(truth, events):
    actual = observations(events)
    outcomes, accepted_native, duplicate_native = [], set(), set()
    for g in truth:
        related = [a for a in actual if a["run_id"] == g["run_id"] and a["scenario"] == g["scenario"] and a.get("body") == g["body"]]
        # Clock uncertainty must be documented externally; no undocumented tolerance.
        in_window = [a for a in related if g["arrived_at_ms"] <= a["observed_at_ms"] <= g["cutoff_at_ms"]]
        known = [a for a in in_window if qualified(a)]
        correct = [a for a in known if all(a.get(k) == g[k] for k in ("streamer_id", "contact_id", "direction", "order", "kind"))]
        valid = []
        for a in correct:
            native = (a["streamer_id"], a["contact_id"], a["native_message_id"])
            if native not in accepted_native:
                valid.append((native, a))
        unique = {key for key, _ in valid}
        if len(unique) > 1:
            duplicate_native.update(unique)
        success = len(unique) == 1
        if success:
            accepted_native.update(unique)
        if success:
            reason = "EXACT_AUTOMATIC_MATCH_IN_CAPTURE_WINDOW"
        elif len(unique) > 1:
            reason = "DUPLICATE_OR_AMBIGUOUS_NATIVE_MESSAGES"
        elif known:
            reason = "CONTACT_DIRECTION_ORDER_OR_KIND_MISMATCH"
        elif in_window:
            reason = "OBSERVED_TEXT_BUT_REQUIRED_FIELDS_UNRESOLVED"
        elif related:
            reason = "ONLY_OUTSIDE_CAPTURE_WINDOW_OR_AFTER_OPENING_CHAT"
        else:
            reason = "NOT_OBSERVED"
        outcomes.append({"run_id": g["run_id"], "scenario": g["scenario"], "message_id": g["message_id"],
                         "correct": success, "reason": reason, "matching_body_observations_in_window": len(in_window),
                         "late_observations": sum(a["observed_at_ms"] > g["cutoff_at_ms"] for a in related),
                         "wrong_contact_observations": sum(a.get("contact_id") != g["contact_id"] for a in known),
                         "evidence_event_ids": [a["event_id"] for a in in_window]})
    correct_count = sum(item["correct"] for item in outcomes)
    unmatched_verified = []
    for a in actual:
        if not qualified(a):
            continue
        window = [g for g in truth if a["run_id"] == g["run_id"] and a["scenario"] == g["scenario"]
                  and g["arrived_at_ms"] <= a["observed_at_ms"] <= g["cutoff_at_ms"]]
        if window and not any(all(a.get(k) == g[k] for k in ("body", "streamer_id", "contact_id", "direction", "order", "kind")) for g in window):
            unmatched_verified.append(a["event_id"])
    wrong_contacts = sum(x["wrong_contact_observations"] for x in outcomes)
    sample_ok = correct_count == len(truth) and not unmatched_verified and not wrong_contacts and not duplicate_native
    scenes = {}
    for scene in sorted({g["scenario"] for g in truth}):
        group = [x for x in outcomes if x["scenario"] == scene]
        scenes[scene] = {"G": len(group), "A": sum(x["correct"] for x in group)}
    return {"schema": 1, "evidence_integrity": "VERIFIED_HASH_CHAIN_NOT_PROOF_OF_AUTHENTICITY",
            "denominator": "independently supplied G, never collected A",
            "G": len(truth), "A": correct_count, "missing_or_incorrect": len(truth)-correct_count,
            "sample_recall": correct_count/len(truth) if truth else None,
            "raw_automatic_observations": len(actual),
            "unresolved_observations": sum(not qualified(a) for a in actual),
            "ambiguous_duplicate_native_ids": len(duplicate_native),
            "wrong_contact_observations": wrong_contacts,
            "unmatched_verified_observations_in_window": len(unmatched_verified),
            "sample_status": "NOT_TESTED" if not truth else ("SAMPLE_ONLY_REQUIRES_REVIEW" if sample_ok else "FAIL"),
            "g1_gate": "NOT_PASSED: requires real designated device, all scenarios, independent evidence and technical review; finite samples do not prove perpetual 100%",
            "scenarios": scenes, "outcomes": outcomes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--truth")
    parser.add_argument("--events", required=True)
    parser.add_argument("--output")
    parser.add_argument("--verify-only", action="store_true", help="Verify complete export and hash chain without evaluating WeChat capture")
    args = parser.parse_args()
    if args.verify_only:
        events = load_events(args.events)
        print(json.dumps({"export_status": "COMPLETE_HASH_CHAIN_VERIFIED", "event_count": len(events),
                          "wechat_acceptance": "NOT_EVALUATED"}))
        return 0
    if not args.truth or not args.output:
        parser.error("--truth and --output are required for message comparison")
    result = compare(load_truth(args.truth), load_events(args.events))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("G", "A", "missing_or_incorrect", "sample_recall", "sample_status")}, ensure_ascii=False))
    return 0 if result["sample_status"] == "SAMPLE_ONLY_REQUIRES_REVIEW" else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, json.JSONDecodeError, OSError) as exc:
        print(f"AUDIT ERROR: {exc}")
        raise SystemExit(3)
