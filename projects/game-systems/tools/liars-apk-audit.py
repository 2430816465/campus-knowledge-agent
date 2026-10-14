"""Read the shipped APK, preserve a web baseline, and compare the tavern files."""
from pathlib import Path, PurePosixPath
import hashlib, json, zipfile, shutil

root = Path(__file__).resolve().parent.parent
apk = root.parent / '再来亿把-1.26.0.apk'
out = root / 'artifacts/liars-126-audit'
web = out / 'apk-web'
out.mkdir(parents=True, exist_ok=True)
digest = lambda b: hashlib.sha256(b).hexdigest()
report = {'apk': str(apk), 'apkSHA256': digest(apk.read_bytes()), 'files': [], 'liarsDifferences': []}
with zipfile.ZipFile(apk) as z:
    for entry in z.infolist():
        if not entry.filename.startswith('assets/web/') or entry.is_dir(): continue
        name = entry.filename
        if not entry.flag_bits & 0x800:
            try:
                name = name.encode('cp437').decode('utf-8')
            except UnicodeError:
                pass
        rel = PurePosixPath(name.removeprefix('assets/web/'))
        assert not rel.is_absolute() and '..' not in rel.parts
        dest = web.joinpath(*rel.parts)
        data = z.read(entry)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        report['files'].append({'path': str(rel), 'bytes': len(data), 'sha256': digest(data)})
        if str(rel).startswith('games/liars/'):
            current = root.joinpath(*rel.parts)
            if not current.exists() or digest(current.read_bytes()) != digest(data):
                report['liarsDifferences'].append(str(rel))
report['version'] = json.loads((web / 'package.json').read_text(encoding='utf-8'))['version']
report['moduleFiles'] = sum(f['path'].startswith('games/liars/') for f in report['files'])
report_path = out / ('apk-current-comparison.json' if (out / 'apk-baseline.json').exists() else 'apk-baseline.json')
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
backup = root.parent / '备份-再骗一杯126流程审核前-20261002'
if not backup.exists():
    backup.mkdir()
    shutil.copytree(root / 'games/liars', backup / 'liars')
    for p in (root / 'tests').glob('liars*'):
        if p.is_file(): shutil.copy2(p, backup / p.name)
print(json.dumps({k: v for k, v in report.items() if k != 'files'}, ensure_ascii=False))
