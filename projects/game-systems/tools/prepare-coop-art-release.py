"""Isolate this art release from concurrent edits to the shared game collection."""
from pathlib import Path
import shutil, json, hashlib, re

root = Path(__file__).resolve().parents[1]
version = '1.14.0'
base = root.parent / '发布快照-1.13.0-定稿'
frozen = root.parent / ('发布快照-' + version + '-再闯美术')
build = root / 'output' / ('coop-art-release-' + version) / 'android'
assert base.is_dir() and not build.exists()
if not frozen.exists(): shutil.copytree(base, frozen)
coop = frozen / 'games/coop'
assert frozen.resolve() in coop.resolve().parents
shutil.rmtree(coop)
allowed = {'.html','.css','.js','.json','.svg','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ttf','.otf','.mp3','.wav','.ogg','.txt'}
excluded = {'server','tests','test','artifacts','node_modules','output','.git','dev-wallets.json'}
for source in (root / 'games/coop').rglob('*'):
    relative = source.relative_to(root / 'games/coop')
    if source.is_file() and not set(relative.parts).intersection(excluded) and source.suffix.lower() in allowed:
        dest = coop / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
for name in ['package.json','app.js']:
    path = frozen / name
    path.write_text(path.read_text(encoding='utf-8').replace('1.13.0', version), encoding='utf-8')
build.mkdir(parents=True)
for name in ['build.gradle','settings.gradle','gradle.properties','local.properties']:
    source = root / 'android' / name
    if source.is_file(): shutil.copy2(source, build / name)
shutil.copytree(root / 'android/app/src/main', build / 'app/src/main', ignore=shutil.ignore_patterns('assets'))
shutil.copy2(root / 'android/app/build.gradle', build / 'app/build.gradle')
path = build / 'app/build.gradle'
text = path.read_text(encoding='utf-8')
text = re.sub(r'versionCode \d+', 'versionCode 17', text)
text = re.sub(r"versionName '[^']+'", "versionName '" + version + "'", text)
path.write_text(text, encoding='utf-8')
path = build / 'app/src/main/java/com/adventurecamp/game/MainActivity.java'
path.write_text(re.sub(r'index.html\?app=[\d.]+', 'index.html?app=' + version, path.read_text(encoding='utf-8')), encoding='utf-8')
shutil.copytree(frozen, build / 'app/src/main/assets/web')
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
backup = root.parent / '备份-再闯一关像素重制前-20261001/coop'
hero = []
for p in (root / 'games/coop/assets/hero-video-modules/ready').glob('*.png'):
    relative = p.relative_to(root / 'games/coop')
    assert p.read_bytes() == (backup / relative).read_bytes()
    hero.append({'file':relative.as_posix(),'sha256':digest(p)})
protected = ['src/game-shared.js','src/campaign-data.js','src/campaign-catalog.js','src/solo-session.js','src/phone-host.js']
protected = [name for name in protected if (backup / name).is_file()]
for name in protected:
    assert (backup / name).read_bytes() == (root / 'games/coop' / name).read_bytes(), name
report = {'version':version,'versionCode':17,'baseline':str(base),'frozen':str(frozen),'android':str(build),
          'scope':'Previous delivered collection plus current coop art/UI/tutorial only',
          'heroPreserved':hero,'protectedUnchanged':protected,'physicalDeviceTested':False}
(root / 'output/coop-pixel-v3/release-preparation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
