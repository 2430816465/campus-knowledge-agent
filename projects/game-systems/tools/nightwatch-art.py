from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parents[1]
dest = root / 'games/nightwatch/assets'
dest.mkdir(parents=True, exist_ok=True)
source = Path(r'C:\Users\24308\.codex\generated_images\01a0f688-5857-7d30-b40c-6f36d0709fcf\exec-67ab612c-8d2a-4ac6-818e-94f6f9844c8b.png')
bg = Image.open(source).convert('RGB')
bg.save(dest / 'battlefield.webp', quality=88, method=6)
bg.resize((384,576), Image.Resampling.LANCZOS).crop((0,150,384,406)).save(dest / 'cover.webp', quality=90, method=6)
manifest = {'generator':'built-in image_gen', 'backgroundSource':str(source), 'backgroundSize':bg.size, 'reused':[]}
monster_ids=['skeleton','skeleton_elite','skeleton_captain','orc_warrior','rock_golem','mage_red','vampire','dragon','knight_black','ghost_warrior','mage_low','guard_mid']
for name in monster_ids:
    file=root / ('games/tower/assets/art/monsters/%s/remade/idle-clean.png'%name)
    if not file.exists():
        raise FileNotFoundError(file)
    img=Image.open(file).convert('RGBA')
    img=img.crop(img.getbbox())
    img.thumbnail((110,110),Image.Resampling.NEAREST)
    img.save(dest / (name+'.webp'),lossless=True)
    manifest['reused'].append({'id':name,'source':str(file.relative_to(root)),'size':img.size})
manifest['hero']={'source':'Original generated rune-crossbow hero; no old sword animation reused','idleFrames':4,'shootFrames':6,'profile':'hero-profile.json','processing':'generate2dsprite: feet alignment, shared scale, strict QC; raw sources and QC in artifacts/nightwatch/art'}
(dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('Nightwatch art:',len(list(dest.glob('*.webp'))),'images,',sum(p.stat().st_size for p in dest.glob('*.webp')),'bytes')
