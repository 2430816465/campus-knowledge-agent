"""Nearest-neighbor export of image_gen art; reuse the sprite processor's crops/scale/anchors."""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'games' / 'rush' / 'assets'
report = {}
for name in ('apprentice', 'flying-sword'):
    folder = root / name
    meta = json.loads((folder / 'pipeline-meta.json').read_text(encoding='utf-8'))
    raw = Image.open(folder / 'raw-sheet-clean.png').convert('RGBA')
    cell = meta['cell_size']
    sheet = Image.new('RGBA', (cell * meta['cols'], cell * meta['rows']))
    frames = []
    for info, label in zip(meta['frames'], meta['frame_labels']):
        source = raw.crop(info['source_box'])
        trim = meta['trim_border']
        source = source.crop((trim, trim, source.width - trim, source.height - trim))
        source = source.crop(info['crop_bbox']).resize(tuple(info['output_size']), Image.Resampling.NEAREST)
        source.putalpha(source.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
        frame = Image.new('RGBA', (cell, cell))
        frame.paste(source, tuple(info['paste_position']))
        bbox = frame.getbbox()
        assert bbox and 0 < bbox[0] < bbox[2] < cell and 0 < bbox[1] < bbox[3] < cell
        frame.save(folder / (label + '.png'))
        row, col = info['grid']
        sheet.paste(frame, (col * cell, row * cell))
        frames.append(frame)
    sheet.save(folder / 'sheet-transparent.png')
    frames[0].save(folder / 'animation.gif', save_all=True, append_images=frames[1:],
                   duration=meta['duration'], loop=0, disposal=2, transparency=0)
    alphas = sorted(set(sheet.getchannel('A').get_flattened_data()))
    assert alphas == [0, 255]
    assert not any(a and r > 200 and b > 200 and g < 100 for r, g, b, a in sheet.get_flattened_data())
    report[name] = {'resampling': 'NEAREST', 'alpha': alphas, 'sheet': list(sheet.size),
                    'frames': len(frames), 'source': 'built-in image_gen; no procedural sprite art',
                    'scaleAndAnchor': 'shared scale and frame placement from pipeline-meta.json',
                    'edgeTouchFrames': [], 'magentaPixels': 0}
(root / 'pixel-export-qc.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
