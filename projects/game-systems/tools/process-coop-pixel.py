"""Deterministic extraction only; all source art is authored by image_gen."""
from pathlib import Path
import importlib.util, json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'output/coop-pixel-v3'
DEST = ROOT / 'games/coop/assets/pixel-v3'
DEST.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('sprites', Path.home()/'.codex/skills/generate2dsprite/scripts/generate2dsprite.py')
sprites = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sprites)
report = []

def export(name, img, size):
    bbox = img.getbbox()
    if not bbox: raise ValueError('Empty asset: '+name)
    # Never invent pixels or paint over source material. Key, trim and nearest resize only.
    crop = img.crop(bbox)
    out = crop.resize(size, Image.NEAREST)
    out.save(DEST/(name+'.png'))
    report.append(dict(name=name, sourceBBox=bbox, size=size, empty=False))

names = ['crate','chest','lever-off','lever-on','rune-sun','rune-moon','crystal-sun','crystal-moon','poison-sign']
for i,name in enumerate(names):
    img = Image.open(WORK/'props'/('prop_pack-'+str(i+1)+'.png')).convert('RGBA')
    export(name,img,(48,48))

raw = sprites.remove_bg_magenta(Image.open(WORK/'raw/strips.png').convert('RGBA'))
for i,name in enumerate(['terrain','leaf','bridge','plate-sun','plate-moon','lift']):
    cell = raw.crop((0,round(i*raw.height/6),raw.width,round((i+1)*raw.height/6)))
    # Keep the plate emblem visible instead of crushing a very wide strip into a square.
    if name.startswith('plate'):
        cell=cell.crop((round(raw.width*.32),0,round(raw.width*.68),cell.height))
    export(name,cell,(64,12) if name.startswith('plate') else (256,18))

raw = sprites.remove_bg_magenta(Image.open(WORK/'raw/doors.png').convert('RGBA'))
# Verified source spacing is slightly nonuniform; these reviewed cuts contain each whole prop.
cuts = [0,300,570,925,1260,1536]
for i,name in enumerate(['gate','gate-open','exit-sun','exit-moon','checkpoint']):
    cell=raw.crop((round(cuts[i]*raw.width/1536),0,round(cuts[i+1]*raw.width/1536),raw.height))
    export(name,cell,(24,112) if i<2 else (48,80) if i<4 else (24,48))

raw = sprites.remove_bg_magenta(Image.open(WORK/'raw/pools.png').convert('RGBA'))
for i,name in enumerate(['pool-sun','pool-moon','pool-poison']):
    export(name,raw.crop((0,round(i*raw.height/3),raw.width,round((i+1)*raw.height/3))),(128,16))

# Quantized downsample removes generation noise; this is a distant, deliberately quiet image.
bg=Image.open(WORK/'raw/background.png').convert('RGB').resize((320,180),Image.NEAREST)
bg=bg.quantize(colors=8,dither=Image.NONE).convert('RGB')
bg.save(DEST/'backdrop.png')
meta=dict(revision='hero-matched-pixel-20261001',origin='image_gen',heroUnchanged=True,assets=report)
(WORK/'asset-qc.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
(DEST/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print('Processed',len(report)+1,'generated environment assets; original hero files untouched.')
