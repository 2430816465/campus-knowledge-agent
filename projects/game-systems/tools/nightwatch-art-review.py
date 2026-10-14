"""Compose review previews from existing game renders and audit processed art."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/nightwatch/art-v2'
ASSETS = ROOT / 'games/nightwatch/assets/art-v2'

def motion(folder, count, destination):
    frames = [Image.open(folder / f'frame-{i:03}.png').convert('RGB') for i in range(count)]
    # Contacts come from captured pixels; no game art is synthesized here.
    samples = [frames[i] for i in [0,count//4,count//2,count*3//4]]
    w,h = samples[0].size
    contact = Image.new('RGB',(w*4,h))
    for i,frame in enumerate(samples):
        contact.paste(frame,(i*w,0))
    contact.save(destination.with_suffix('.png'))
    # A shared palette preserves the static map between frames and lets GIF
    # store only changed rectangles instead of an entire screen every frame.
    palette = contact.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    indexed = [frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(destination, save_all=True, append_images=indexed[1:], duration=50, loop=0, optimize=True, disposal=1)

def main():
    motion(OUT/'browser/natural-motion-frames',80,OUT/'battle-motion.gif')
    motion(OUT/'browser/motion-frames',36,OUT/'dense-motion.gif')
    manifest = json.loads((ASSETS/'manifest.json').read_text(encoding='utf-8'))
    report = {'animations':{},'atlases':{},'icons':{},'runtimeBytes':sum(p.stat().st_size for p in ASSETS.iterdir() if p.is_file())}
    for group in ['animations','atlases']:
        for name,meta in manifest[group].items():
            q = meta['qc']
            assert q['empty_count']==q['edge_touch_count']==q['paste_clamped_count']==0, name
            if group=='animations':
                assert q['body_scale_cv']<=.08 and q['anchor_y_std']<=.05, name
                assert q.get('profile_body_scale_drift',0)<=.10, name
            sheet = Image.open(ASSETS/meta['file']).convert('RGBA')
            assert sheet.size==(meta['cell']*meta['cols'],meta['cell']*meta['rows'])
            for i in range(meta['count']):
                cell=meta['cell'];x=i%meta['cols']*cell;y=i//meta['cols']*cell
                frame = sheet.crop((x,y,x+cell,y+cell));box=frame.getbbox()
                assert box and min(box[:2])>0 and box[2]<cell and box[3]<cell, (name,i)
            report[group][name]=q
    for path in ASSETS.glob('icon-*.png'):
        image=Image.open(path).convert('RGBA');box=image.getbbox()
        assert image.size==(128,128) and box and max(box[2]-box[0],box[3]-box[1])==106
        report['icons'][path.stem]={'bbox':box,'opticalSize':106}
    assert len(report['icons'])==16
    (OUT/'qc-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'animations':len(report['animations']),'atlases':len(report['atlases']),'icons':len(report['icons']),'bytes':report['runtimeBytes'],'qc':'passed'}))

if __name__=='__main__':
    main()
