"""Process image-generated art; never draw or synthesize source sprite artwork."""
import json
import shutil
import subprocess
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/nightwatch/art-v2'
ASSETS = ROOT / 'games/nightwatch/assets/art-v2'
RAW = Path(r'C:\Users\24308\.codex\generated_images\01a0f688-5857-7d30-b40c-6f36d0709fcf')
PROCESSOR = Path(r'C:\Users\24308\.codex\skills\generate2dsprite\scripts\generate2dsprite.py')
SOURCES = {
    'hero-idle': '0696d1ba-e3fc-4a8a-a72d-631cd0688c24',
    'hero-shoot': '02b454d4-57b0-4354-b457-a2eb56052057',
    'orc_warrior': 'f6d05fcd-93b2-490b-ba9f-2a150cbee7d7',
    'mage_red': 'ba9edeb7-9c57-46f8-85b2-b6fbe54fcc84',
    'ghost_warrior': '9b180ff7-e4d7-4f8d-8936-ef4bec1e977c',
    'rock_golem': '55b53c0b-da8c-40c3-b20c-0fd9854766ea',
    'skeleton_elite': 'ede87185-63f1-48b3-ba24-b9023db54cce',
    'mage_low': '02b82865-1c5b-4bf4-93d0-273f28adc4f6',
    'vampire': 'bb547dd9-136e-45f2-9f62-7e40d00fe722',
    'dragon': 'ee7fd817-7b8a-48d8-9543-c05469eb2a9f',
}
ATLAS = {
    'icons': ('81de0c4a-eee0-441f-910c-7901794568f4', 3, 4),
    'projectiles': ('892357bd-a1dc-4fab-ab50-6817cf5ba834', 2, 4),
    'impacts': ('11be6f02-b198-4888-94ed-bfed87ea2fbe', 4, 4),
    'grounds': ('b9db47c9-a41b-4b9c-8373-ab729cef0326', 2, 4),
    'talents': ('bf3d038d-a365-4ebe-961d-241f4a314e7e', 2, 2),
}

def process(name, source, *, rows=2, cols=4, body=True, profile=None):
    folder = OUT / name
    original_source = source
    if name == 'icons':
        # The generated third row starts at Y721, before a uniform Y724 cut.
        # Split in the inspected empty gutters, pad slots, retain every tip.
        folder.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, folder / 'source-original.png')
        image = Image.open(source).convert('RGB')
        cuts = [0,370,700,image.height]
        side = max(image.width//cols,max(b-a for a,b in zip(cuts,cuts[1:])))
        normalized = Image.new('RGB',(side*cols,side*rows),(255,0,255))
        for row in range(rows):
            for col in range(cols):
                slot = image.crop((col*image.width//cols,cuts[row],(col+1)*image.width//cols,cuts[row+1]))
                normalized.paste(slot,(col*side+(side-slot.width)//2,row*side+(side-slot.height)//2))
        normalized.save(folder / 'slots-normalized.png')
        source = folder / 'slots-normalized.png'
    args = [sys.executable, str(PROCESSOR), 'process', '--input', str(source),
            '--target', 'player' if name.startswith('hero') else 'creature' if body else 'asset',
            '--mode', 'idle' if name == 'hero-idle' else 'attack' if name == 'hero-shoot' else 'walk' if body else 'atlas',
            '--output-dir', str(folder), '--rows', str(rows), '--cols', str(cols),
            '--cell-size', '128', '--fit-scale', '.8', '--trim-border', '4',
            '--align', 'feet' if body else 'center', '--shared-scale',
            '--scale-strategy', 'preserve',
            '--component-mode', 'largest' if body else 'all', '--label-prefix', 'frame',
            '--strict-qc', '--reject-edge-touch', '--duration', '90']
    if body:
        args += ['--max-body-scale-cv', '.08', '--max-anchor-y-std', '.05']
    else:
        args += ['--min-component-area', '24', '--edge-clean-depth', '6']
    if profile:
        args += ['--scale-profile', str(profile), '--max-profile-scale-drift', '.10']
    if name == 'hero-idle':
        args += ['--write-scale-profile', str(ASSETS / 'hero-profile.json'), '--profile-name', 'nightwatch-hero-v2']
    cached = body and '--reuse-bodies' in sys.argv and (folder / 'pipeline-meta.json').exists()
    if not cached:
        result = subprocess.run(args, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(name + ': ' + result.stderr[-2500:] + result.stdout[-1500:])
    meta = json.loads((folder / 'pipeline-meta.json').read_text(encoding='utf-8'))
    if body and not cached:
        # Alternating planted feet must not translate the entire torso sideways.
        # Keep the sheet's shared body root; the processor still locks ground Y.
        centers = [f['anchor_source'][0] for f in meta['frames']]
        root_x = sum(centers) / len(centers)
        registered, offsets = [], []
        for i, info in enumerate(meta['frames']):
            frame_path = folder / ('frame-'+str(i+1)+'.png')
            frame = Image.open(frame_path).convert('RGBA')
            offset = round((info['anchor_source'][0]-root_x)*info['source_to_output_scale'])
            fixed = Image.new('RGBA', frame.size)
            fixed.alpha_composite(frame, (offset,0))
            bbox = fixed.getbbox()
            if not bbox or min(bbox[:2]) <= 0 or bbox[2] >= 128 or bbox[3] >= 128:
                raise RuntimeError(name + ': root registration would clip frame ' + str(i+1))
            fixed.save(frame_path)
            registered.append(fixed)
            offsets.append(offset)
        sheet = Image.new('RGBA', (cols*128,rows*128))
        for i, frame in enumerate(registered):
            sheet.alpha_composite(frame, ((i%cols)*128,(i//cols)*128))
        sheet.save(folder / 'sheet-transparent.png')
        registered[0].save(folder / 'animation.gif',save_all=True,append_images=registered[1:],duration=90,loop=0,disposal=2)
        (folder / 'root-registration.json').write_text(json.dumps({'offsets':offsets,'sharedSourceRootX':root_x,'clipped':False}),encoding='utf-8')
    if source != folder / 'raw-sheet.png':
        shutil.copy2(source, folder / 'raw-sheet.png')
    shutil.copy2(folder / 'sheet-transparent.png', ASSETS / (name + '.png'))
    print(name, json.dumps(meta['qc_summary']))
    boxes = [Image.open(folder / ('frame-'+str(i+1)+'.png')).getbbox() for i in range(rows*cols)]
    return {'file': name + '.png', 'count': rows*cols, 'rows': rows, 'cols': cols, 'boxes': boxes,
            'cell': 128, 'origin': meta.get('output_origin', [64,116] if body else [64,64]),
            'bodyHeight': meta['qc_summary']['output_subject_height_mean'],
            'qc': meta['qc_summary'], 'source': str(original_source), 'processedSource': str(source)}

def export_portrait(source, destination, fit):
    image = Image.open(source).convert('RGBA')
    image = image.crop(image.getbbox())
    scale = fit / max(image.size)
    image = image.resize(tuple(round(n*scale) for n in image.size), Image.Resampling.NEAREST)
    canvas = Image.new('RGBA', (128,128))
    canvas.alpha_composite(image, ((128-image.width)//2,(128-image.height)//2))
    canvas.save(destination)

def export_icons():
    icon_keys = ['crossbow','fire','ice','lightning','beam','rock','snow','wind','meteor','familiar','chain','flame']
    for i, key in enumerate(icon_keys):
        export_portrait(OUT / 'icons' / ('frame-'+str(i+1)+'.png'), ASSETS / ('icon-'+key+'.png'),106)
    for i, key in enumerate(['repair','power','speed','critical']):
        export_portrait(OUT / 'talents' / ('frame-'+str(i+1)+'.png'), ASSETS / ('icon-'+key+'.png'),106)
    export_portrait(OUT / 'hero-idle' / 'frame-1.png', ASSETS / 'hero-portrait.png',110)

def archive_prompts():
    document = json.loads((ROOT / 'games/nightwatch/ART-V2-PROMPTS.json').read_text(encoding='utf-8'))
    for name,entry in document['entries'].items():
        source = RAW / entry['source']
        header = 'Verbatim generation prompt' if entry['promptRecord']=='verbatim' else 'Archived brief summary; not a verbatim tool transcript'
        if name in ['background','heroMaster']:
            target = OUT / ('map-prompt-used.txt' if name=='background' else 'hero-master-prompt-used.txt')
            shutil.copy2(source, OUT / ('map-raw.png' if name=='background' else 'hero-master.png'))
        else:
            folder = OUT / name
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / 'prompt-used.txt'
            if name=='icons':
                shutil.copy2(source,folder/'source-original.png')
        target.write_text(header+'\n\n'+entry['prompt']+'\n\nReferences: '+json.dumps(entry.get('references',[]),ensure_ascii=False)+'\n',encoding='utf-8')
    (OUT / 'sources.json').write_text(json.dumps(document,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    if '--archive-only' in sys.argv:
        archive_prompts()
        return
    if '--export-only' in sys.argv:
        export_icons()
        return
    manifest = {'version': 2, 'background': 'battlefield.webp', 'animations': {}, 'atlases': {}}
    background = RAW / 'exec-b653c8d9-a113-4830-8752-e1f3a5f30816.png'
    Image.open(background).save(ASSETS / 'battlefield.webp', quality=92, method=6)
    shutil.copy2(background, OUT / 'map-raw.png')
    for name, uid in SOURCES.items():
        manifest['animations'][name] = process(name, RAW / ('exec-' + uid + '.png'),
            profile=ASSETS / 'hero-profile.json' if name == 'hero-shoot' else None)
    for name in ['skeleton', 'guard_mid', 'knight_black']:
        folder = ROOT / 'games/guard/assets/monsters' / name / 'walk'
        meta = json.loads((folder / 'pipeline-meta.json').read_text(encoding='utf-8'))
        shutil.copy2(folder / 'sheet-transparent.png', ASSETS / (name + '.png'))
        manifest['animations'][name] = {'file': name+'.png', 'count':16, 'rows':4, 'cols':4,
            'cell':128, 'origin':[64,116], 'bodyHeight':meta['qc_summary']['output_subject_height_mean'],
            'qc':meta['qc_summary'], 'source':str(folder / 'sheet-transparent.png')}
    for name, (uid, rows, cols) in ATLAS.items():
        manifest['atlases'][name] = process(name, RAW / ('exec-' + uid + '.png'), rows=rows, cols=cols, body=False)
    export_icons()
    (ASSETS / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    archive_prompts()
    print('Manifest:', ASSETS / 'manifest.json')

if __name__ == '__main__':
    main()
