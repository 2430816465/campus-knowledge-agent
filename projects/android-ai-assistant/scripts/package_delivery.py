"""Package own source and public reports, never private evidence or build caches."""
import hashlib
import json
import zipfile
from pathlib import Path

from verify_baseline import main as verify_baseline
from verify_product_sources import main as verify_product_sources

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {".gitignore", ".gitattributes", "README.md", "CODEX_MASTER_PROMPT.md",
              "build.gradle.kts", "settings.gradle.kts", "gradle.properties", "gradlew", "gradlew.bat"}
SOURCE_DIRS = {"app", "probe-core", "product-app", "product-core", "qa-runner", "qa", "gradle", "scripts", "docs", "reports"}
EXCLUDED_PARTS = {"build", ".gradle", ".kotlin", ".git", ".idea", "__pycache__", "private"}


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def allowed(path):
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDED_PARTS for part in rel.parts):
        return False
    if path.name.endswith(".local.json") or path.name in {"emulator-ui-debug.png"}:
        return False
    if path.suffix.lower() in {".keystore", ".jks", ".hprof", ".apk", ".zip", ".pyc"}:
        return False
    return (rel.as_posix() in ROOT_FILES or rel.parts[0] in SOURCE_DIRS or
            rel.as_posix() in {"research/upstream-lock.json", "research/skill-files.json"} or
            rel.parts[:2] in {("research", "licenses"), ("evidence", "templates")})


def main():
    verify_baseline()
    verify_product_sources()
    delivery = ROOT / "deliverables"
    delivery.mkdir(exist_ok=True)
    apks = [delivery / name for name in ("xindong-g1-probe-debug.apk", "xindong-junshi-debug.apk")]
    if not all(apk.is_file() for apk in apks):
        raise SystemExit("Build both real APKs first.")
    files = sorted((p for p in ROOT.rglob("*") if p.is_file() and allowed(p)), key=lambda p: p.as_posix())
    inventory = []
    archive = delivery / "xindong-junshi-source.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        for path in files:
            try:
                path.resolve().relative_to(ROOT.resolve())
            except ValueError:
                raise SystemExit("Source path outside project rejected")
            if path.is_symlink():
                raise SystemExit("Source link outside project rejected")
            relative = path.relative_to(ROOT).as_posix()
            output.write(path, "xindong-junshi-ai/" + relative)
            inventory.append(dict(path=relative, bytes=path.stat().st_size, sha256=digest(path)))
    with zipfile.ZipFile(archive) as handle:
        if handle.testzip() is not None or len(handle.infolist()) != len(inventory):
            raise SystemExit("Source archive integrity failed")
        for item in inventory:
            archived = handle.read("xindong-junshi-ai/" + item["path"])
            if hashlib.sha256(archived).hexdigest() != item["sha256"]:
                raise SystemExit("Archived source hash mismatch")
    (delivery / "source-files.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    (delivery / "SHA256SUMS.txt").write_text("".join(f"{digest(p)}  {p.name}\n" for p in apks+[archive]), encoding="utf-8")
    print(f"Source package: {len(files)} verified files; source ZIP {archive.stat().st_size} bytes; both APK hashes saved.")


if __name__ == "__main__":
    main()
