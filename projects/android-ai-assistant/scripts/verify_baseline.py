"""Verify immutable input bytes and index every non-empty source line for review."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINES = {
    "CODEX_MASTER_PROMPT.md": ("M", "2034bc47ffac16b126ed4d6dd5e1082d387751a061a41d890759125a7f4be070"),
    "docs/PRD_V1.0.md": ("P", "cfe5b345322db00812a1c05524c1eecf3208009609142acab25aacd27f2743f0"),
}


def main():
    sources, index = [], []
    for relative, (prefix, expected) in BASELINES.items():
        data = (ROOT / relative).read_bytes()
        actual = hashlib.sha256(data).hexdigest()
        if actual != expected:
            raise SystemExit("Frozen baseline changed: " + relative)
        sources.append(dict(path=relative, sha256=actual))
        for number, text in enumerate(data.decode("utf-8-sig").splitlines(), 1):
            if text.strip():
                index.append(dict(id=f"{prefix}-L{number:03}", source=relative,
                                  line=number, text=text, status="SOURCE_INDEX_ONLY_NOT_ACCEPTANCE"))
    output = ROOT / "reports" / "baseline-index.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dict(schema=1, sources=sources, source_lines=index), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Both frozen files match original SHA256; indexed {len(index)} non-empty lines.")


if __name__ == "__main__":
    main()
