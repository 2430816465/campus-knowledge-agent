"""Verify vendored Skill bytes and local licenses, without fetching moving branches."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    lock = json.loads((ROOT / "research/skill-files.json").read_text(encoding="utf-8"))
    for item in lock["files"]:
        target = (ROOT / item["path"]).resolve()
        target.relative_to(ROOT.resolve())
        if hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]:
            raise SystemExit("Vendored source changed: " + item["path"])
    actual = {p.relative_to(ROOT).as_posix() for p in (ROOT / "product-core/src/main/resources/skills").rglob("*") if p.is_file()}
    if actual != {i["path"] for i in lock["files"]}:
        raise SystemExit("Vendored file inventory mismatch")
    print("Pinned Skill text/license hashes verified: " + str(len(actual)))


if __name__ == "__main__":
    main()
