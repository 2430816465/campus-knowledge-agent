"""Audit runtime sources against staged assets / an APK, without changing saves."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'.html','.css','.js','.json','.svg','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ttf','.otf','.mp3','.wav','.ogg','.txt'}
EXCLUDED = {'server','tests','test','artifacts','node_modules','output','.git','dev-wallets.json'}
RUNTIME_ROOTS = ['assets','licenses'] + ['games/' + name for name in ['tower','marble','mine','coop','shared','liars','evolve','workshop','chess','nightwatch','rush']]

def runtime_files(root):
    result = {}
    policy=json.loads((root/'runtime-pack-policy.json').read_text(encoding='utf-8'))
    for name in RUNTIME_ROOTS:
        for path in (root/name).rglob('*'):
            rel = path.relative_to(root)
            if not path.is_file() or set(rel.parts).intersection(EXCLUDED) or not (path.suffix.lower() in ALLOWED or path.name.upper() in {'LICENSE','COPYING','NOTICE'} or path.name.endswith('.license')):
                continue
            if rel.as_posix() in policy['excludedFiles'] or any(rel.as_posix().startswith(prefix) for prefix in policy['excludedPrefixes']):
                continue
            if rel.as_posix() == 'games/chess/assets/manifest.json':
                continue
            result[rel.as_posix()] = path
    result['games/camp-bridge.js'] = root/'games/camp-bridge.js'
    for path in root.iterdir():
        if path.is_file() and not path.name.startswith('交付校验-') and path.suffix.lower() in ALLOWED:
            result[path.name] = path
    return result

def group(path):
    parts = path.split('/')
    return parts[1] if len(parts)>2 and parts[0]=='games' else 'collection'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def zip_name(info):
    # Android aapt can store UTF-8 filename bytes without the ZIP UTF-8 flag.
    # Python then decodes them as CP437; Android itself still reads UTF-8.
    if not info.flag_bits & 0x800:
        try:
            return info.filename.encode('cp437').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return info.filename

def audit(root, apk):
    expected = runtime_files(root)
    staged = root/'android/app/src/main/assets/web'
    staged_missing, staged_different = [], []
    with ZipFile(apk) as z:
        packed = {zip_name(info)[len('assets/web/'):]:info.filename for info in z.infolist() if zip_name(info).startswith('assets/web/') and not info.is_dir()}
        rows = {key:{'sourceFiles':0,'newInSource':0,'changedInSource':0,'unchanged':0,'sourceBytes':0} for key in [group(p) for p in expected]}
        missing, changed, manifest = [], [], []
        for rel, path in sorted(expected.items()):
            data = path.read_bytes(); digest = sha(data); r = rows[group(rel)]
            r['sourceFiles'] += 1; r['sourceBytes'] += len(data)
            if rel not in packed:
                missing.append(rel); r['newInSource'] += 1
            elif sha(z.read(packed[rel])) != digest:
                changed.append(rel); r['changedInSource'] += 1
            else:
                r['unchanged'] += 1
            target = staged/rel
            if not target.is_file(): staged_missing.append(rel)
            elif sha(target.read_bytes()) != digest: staged_different.append(rel)
            manifest.append({'path':rel,'bytes':len(data),'sha256':digest})
        entries = sorted(p.split('/')[1] for p in packed if p.startswith('games/') and p.endswith('/index.html') and len(p.split('/'))==3)
        source_entries = sorted(p.split('/')[1] for p in expected if p.startswith('games/') and p.endswith('/index.html') and len(p.split('/'))==3)
        corruption = z.testzip()
    return {'sourceRoot':str(root),'apk':str(apk),'apkSha256':sha(apk.read_bytes()),'sourceEntries':source_entries,'apkEntries':entries,'groups':rows,'missingFromApk':missing,'differentFromApk':changed,'extraInApk':sorted(set(packed)-set(expected)),'stagedMissing':staged_missing,'stagedDifferent':staged_different,'zipCorruption':corruption,'manifest':manifest}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--apk',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--exact',action='store_true')
    args=parser.parse_args()
    report=audit(args.root.resolve(),args.apk.resolve())
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['sourceEntries','apkEntries','groups','zipCorruption']},ensure_ascii=False))
    if args.exact:
        assert not report['missingFromApk'] and not report['differentFromApk'] and not report['extraInApk'], 'APK differs from frozen runtime sources'
        assert not report['stagedMissing'] and not report['stagedDifferent'], 'Staged assets differ from sources'
        assert report['zipCorruption'] is None

if __name__=='__main__': main()
