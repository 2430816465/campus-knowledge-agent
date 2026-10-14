from pathlib import Path
import json,hashlib,zipfile,shutil,re,argparse
R=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=Path,help='Frozen, tested release source when another task is editing the shared tree.')
args=parser.parse_args()
source_root=args.source_root.resolve() if args.source_root else R
apk=R/'android/app/build/outputs/apk/debug/app-debug.apk'
packed=R/'android/app/src/main/assets/web'
with zipfile.ZipFile(apk) as z:
 assert z.testzip() is None
 names={}
 for info in z.infolist():
  name=info.filename
  if not info.flag_bits & 0x800:
   try:name=name.encode('cp437').decode('utf-8')
   except UnicodeError:pass
  names[name]=info
 files=[p for p in packed.rglob('*') if p.is_file()]
 for p in files:
  relative=p.relative_to(packed).as_posix()
  assert z.read(names['assets/web/'+relative])==p.read_bytes(),relative
  source=source_root/relative
  assert source.is_file() and source.read_bytes()==p.read_bytes(),relative
backup=R.parent/'备份-完善前-20260930'
tower=[p for p in (backup/'games/tower').rglob('*') if p.is_file()]
for p in tower:assert p.read_bytes()==(R/p.relative_to(backup)).read_bytes(),str(p)
gradle=(R/'android/app/build.gradle').read_text(encoding='utf-8')
version=re.search(r"versionName '([^']+)'",gradle).group(1)
version_code=int(re.search(r'versionCode (\d+)',gradle).group(1))
target=R.parent/('再来亿把-'+version+'.apk')
shutil.copy2(apk,target)
shutil.copy2(apk,R.parent/'再来亿把.apk')
digest=hashlib.sha256(apk.read_bytes()).hexdigest()
for p in [target,R.parent/'再来亿把.apk']:assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
working_differences=[p.relative_to(packed).as_posix() for p in files if not (R/p.relative_to(packed)).is_file() or p.read_bytes()!=(R/p.relative_to(packed)).read_bytes()]
report={'version':version,'versionCode':version_code,'sha256':digest,'bytes':apk.stat().st_size,'packedFilesVerified':len(files),'unchangedTowerSourceFiles':len(tower),'zipIntegrity':True,'sourceParity':True,'verificationSource':str(source_root),'workingTreeDifferences':working_differences,'androidDeviceTested':False,'apk':str(target)}
(R/('交付校验-'+version+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
