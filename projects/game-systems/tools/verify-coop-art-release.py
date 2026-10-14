from pathlib import Path
import json, hashlib, zipfile, shutil

root=Path(__file__).resolve().parents[1]
version='1.14.0'
frozen=root.parent/('发布快照-'+version+'-再闯美术')
build=root/'output'/('coop-art-release-'+version)/'android'
apk=build/'app/build/outputs/apk/debug/app-debug.apk'
baseline=root.parent/'发布快照-1.13.0-定稿'
packed=build/'app/src/main/assets/web'
files=[p for p in packed.rglob('*') if p.is_file()]
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    names={}
    for info in z.infolist():
        name=info.filename
        if not info.flag_bits & 0x800:
            try: name=name.encode('cp437').decode('utf-8')
            except UnicodeError: pass
        names[name]=info
    for p in files:
        relative=p.relative_to(packed).as_posix()
        assert z.read(names['assets/web/'+relative])==p.read_bytes(),relative
        assert (frozen/relative).read_bytes()==p.read_bytes(),relative
for p in baseline.rglob('*'):
    relative=p.relative_to(baseline)
    if p.is_file() and relative.parts[:2]!=('games','coop') and relative.as_posix() not in ['app.js','package.json']:
        assert p.read_bytes()==(frozen/relative).read_bytes(),str(relative)
backup=root.parent/'备份-再闯一关像素重制前-20261001/coop'
protected=['game-shared.js','campaign-catalog.js','remade-campaign.js','solo.js','phone-host-worker.js','hero-video-config.js','hero-jump-config.js']
for name in protected:
    assert (backup/'src'/name).read_bytes()==(frozen/'games/coop/src'/name).read_bytes()
for p in (backup/'assets/hero-video-modules/ready').glob('*.png'):
    assert p.read_bytes()==(frozen/'games/coop/assets/hero-video-modules/ready'/p.name).read_bytes()
digest=hashlib.sha256(apk.read_bytes()).hexdigest()
target=root.parent/('再来亿把-'+version+'.apk')
for dest in [target,root.parent/'再来亿把.apk']:
    shutil.copy2(apk,dest)
    assert hashlib.sha256(dest.read_bytes()).hexdigest()==digest
report={'version':version,'versionCode':17,'sha256':digest,'bytes':apk.stat().st_size,'packedFilesVerified':len(files),
        'zipIntegrity':True,'sourceParity':True,'verificationSource':str(frozen),'baseline':str(baseline),
        'scope':'Stable 1.13.0 collection plus coop art/UI/tutorial; concurrent changes in other chats excluded',
        'unchangedHeroActionFiles':6,'protectedCoopSourceFiles':protected,'androidDeviceTested':False,'apk':str(target)}
(root/('交付校验-'+version+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
