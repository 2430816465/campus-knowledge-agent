"""Postprocess generated art; no authored sprite shapes are drawn by this script."""
from pathlib import Path
import json, shutil
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
raw = root / 'output/puzzle-art-v1'
out = root / 'games/marble/assets/puzzle'
out.mkdir(parents=True, exist_ok=True)
names = ['exit-open', 'portal-blue', 'portal-violet', 'splitter', 'switch', 'key', 'relay', 'charge', 'direction', 'rotate', 'rune', 'fork', 'exit-closed', 'launcher', 'orb', 'orb-mint']
frames = sorted((raw / 'props').glob('single-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
if len(frames) != 16:
    raise ValueError(f'Expected sixteen prop frames, got {len(frames)}')
for name, frame in zip(names, frames):
    im=Image.open(frame).convert('RGBA');a=np.array(im)
    a[(a[:,:,0]>=220)&(a[:,:,2]>=220)&(a[:,:,1]<=55),3]=0
    Image.fromarray(a).save(out / f'{name}.png')

mirrors = Image.open(raw / 'mirrors-raw.png').convert('RGBA')
for row, name in enumerate(['mirror', 'mirror-fragile']):
    img = mirrors.crop((0, row*mirrors.height//2, mirrors.width, (row+1)*mirrors.height//2))
    a = np.array(img)
    magenta = (a[:,:,0] > 160) & (a[:,:,2] > 150) & (a[:,:,1] < 120)
    a[magenta,3] = 0
    img = Image.fromarray(a)
    box = img.getbbox()
    if box is None:
        raise ValueError('Empty mirror')
    img = img.crop(box)
    img = img.resize((256, 24), Image.Resampling.NEAREST)
    img.save(out / f'{name}.png')

tiles = Image.open(raw / 'tiles-raw.png').convert('RGB')
for i, name in enumerate(['floor', 'wall', 'wall-break', 'wall-gate']):
    col, row = i%2, i//2
    img = tiles.crop((col*tiles.width//2, row*tiles.height//2, (col+1)*tiles.width//2, (row+1)*tiles.height//2))
    img.resize((64,64),Image.Resampling.NEAREST).save(out / f'{name}.png')

spikes = Image.open(raw / 'spikes-raw.png').convert('RGBA')
a = np.array(spikes)
a[(a[:,:,0]>160)&(a[:,:,2]>150)&(a[:,:,1]<120),3]=0
spikes=Image.fromarray(a)
spikes.crop(spikes.getbbox()).resize((64,32),Image.Resampling.NEAREST).save(out/'spikes.png')
meta = {'generator':'built-in image_gen', 'style':'pixel-art bronze and navy ruins', 'raw_sources':['props-raw.png','mirrors-raw.png','tiles-raw.png','spikes-raw.png'], 'props':names, 'postprocess':'generate2dsprite chroma key / per-cell alignment, mirror and spike magenta cleanup/crop, nearest-neighbor tiles; no procedural sprite creation', 'runtime':'640x360 canvas, nearest-neighbor presentation, same collisions and routes'}
(out / 'provenance.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
print('Installed 16 individual props, 2 mirror strips, 4 tile textures.')
