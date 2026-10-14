"""Fail closed on missing real-generation evidence or incomplete human scoring."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

CRITERIA = ["direct_use", "no_fabrication", "key_history", "host_style", "respects_boundaries"]
RATINGS = ["natural_1_5", "style_1_5", "history_1_5", "emotion_1_5", "usability_1_5"]


def evaluate(run, scores):
    summary = json.loads((run / "run-summary.json").read_text(encoding="utf-8"))
    if summary.get("real_interface_calls") is not True or summary.get("cases") != 100:
        raise ValueError("100 completed real-model pairs required; prepared fixtures cannot pass quality acceptance")
    architecture = summary.get("architecture", "JEV_DUAL_SKILL_V1")
    if architecture not in {"DUAL_SKILL_V1", "JEV_DUAL_SKILL_V1"}:
        raise ValueError("Unknown component architecture")
    required_components = ["狗头军师", "恋爱大师"] + (["Jev"] if architecture == "JEV_DUAL_SKILL_V1" else [])
    plan_path = run / "run-plan.json"
    if plan_path.is_file():
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        if plan.get("architecture", "JEV_DUAL_SKILL_V1") != architecture:
            raise ValueError("Plan and summary architectures differ")
    mappings = json.loads((run / "blind-mapping.json").read_text(encoding="utf-8"))["rows"]
    if len(mappings) != 100 or len({m["id"] for m in mappings}) != 100:
        raise ValueError("Exactly 100 unique blind pairs required")
    with scores.open(encoding="utf-8-sig", newline="") as handle: rows = list(csv.DictReader(handle))
    indexed = {}
    for row in rows:
        key = (row["case_id"], row["variant"])
        if key in indexed: raise ValueError("Duplicate human score row")
        if not row["judge"].strip() or any(row[c].strip() not in {"0", "1"} for c in CRITERIA):
            raise ValueError("Each row requires a named human judge and all five 0/1 decisions")
        if any(row[c].strip() not in {"1", "2", "3", "4", "5"} for c in RATINGS):
            raise ValueError("All blind comparative ratings must be 1..5")
        indexed[key] = row
    expected = {(m["id"], label) for m in mappings for label in ["A", "B"]}
    if set(indexed) != expected: raise ValueError("Exactly 200 complete A/B score rows required")
    passed = {"ordinary": 0, "full": 0}; preferences = dict(full=0, ordinary=0, tie=0)
    averages = {scheme: {metric: 0 for metric in RATINGS} for scheme in passed}
    for mapping in mappings:
        case_id = mapping["id"]
        grading = run / "grading" / (case_id + ".json")
        if hashlib.sha256(grading.read_bytes()).hexdigest() != mapping["grading_sha256"]: raise ValueError("Grading file changed after generation")
        pair = json.loads(grading.read_text(encoding="utf-8"))
        if pair.get("input_sha256") != mapping.get("input_sha256"): raise ValueError("Pair input hash mismatch")
        full_audit = json.loads((run / (case_id + "-full-audit.json")).read_text(encoding="utf-8"))
        plain_audit = json.loads((run / (case_id + "-ordinary-audit.json")).read_text(encoding="utf-8"))
        if full_audit.get("case_input_sha256") != mapping["input_sha256"] or plain_audit.get("input_sha256") != mapping["input_sha256"]:
            raise ValueError("Missing matching real-call audits")
        states = {c["name"]: c["state"] for c in full_audit.get("components", [])}
        if any(states.get(name) != "SUCCEEDED" for name in required_components):
            raise ValueError("Selected architecture did not run all required components")
        if architecture == "DUAL_SKILL_V1" and states.get("Jev") != "USER_DISABLED":
            raise ValueError("Dual-Skill experiment must explicitly record Jev disabled")
        totals = {}
        for scheme in passed:
            row = indexed[(case_id, mapping[scheme])]
            if row.get("input_sha256") != mapping["input_sha256"]: raise ValueError("Human scores belong to a different input/run")
            if row.get("grading_sha256") != mapping["grading_sha256"]: raise ValueError("Human scores belong to different A/B outputs")
            passed[scheme] += int(all(row[c].strip() == "1" for c in CRITERIA))
            for metric in RATINGS: averages[scheme][metric] += int(row[metric])
            totals[scheme] = sum(int(row[c]) for c in RATINGS)
        preferences["tie" if totals["full"] == totals["ordinary"] else max(totals, key=totals.get)] += 1
    return dict(state="HUMAN_SCORED", architecture=architecture, jev_included=architecture=="JEV_DUAL_SKILL_V1",
                cases=100, passed=passed, full_meets_95=passed["full"] >= 95,
                blind_preference=preferences, mean_ratings={s: {k: v / 100 for k, v in a.items()} for s, a in averages.items()},
                scores_sha256=hashlib.sha256(scores.read_bytes()).hexdigest(), note="Preference does not prove superiority; G1 and phone stability are separate gates")


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--run", type=Path, required=True); parser.add_argument("--scores", type=Path, required=True); parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try: report = evaluate(args.run, args.scores)
    except (ValueError, KeyError, OSError) as error: parser.exit(2, "NOT ACCEPTED: " + str(error) + "\n")
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"); print("Human quality report saved. full_meets_95=" + str(report["full_meets_95"]))


if __name__ == "__main__": main()
