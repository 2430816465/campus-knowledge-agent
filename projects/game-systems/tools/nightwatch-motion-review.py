"""Encode screenshots of the reduced-motion regression as review artifacts."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/nightwatch/motion-fix'
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
frames = []
for i in range(40):
    before = Image.open(OUT / f'before/reduce/frame-{i:03}.png').convert('RGB')
    after = Image.open(OUT / f'after/reduce/frame-{i:03}.png').convert('RGB')
    before.thumbnail((300, 600))
    after.thumbnail((300, 600))
    w, h = before.size
    frame = Image.new('RGB', (w * 2 + 12, h + 38), '#142b28')
    frame.paste(before, (0, 38))
    frame.paste(after, (w + 12, 38))
    draw = ImageDraw.Draw(frame)
    draw.text((10, 8), '修复前：姿势锁死', font=font, fill='#f4b797')
    draw.text((w + 22, 8), '修复后：正常动作', font=font, fill='#c9e8b2')
    frames.append(frame)
palette = frames[0].quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
indexed[0].save(OUT / 'reduced-motion-comparison.gif', save_all=True, append_images=indexed[1:], duration=50, loop=0, optimize=True, disposal=1)
contact = Image.new('RGB', (frames[0].width * 3, frames[0].height), '#142b28')
for x, i in enumerate([0, 12, 24]):
    contact.paste(frames[i], (x * frames[0].width, 0))
contact.save(OUT / 'reduced-motion-comparison.png')
print(OUT / 'reduced-motion-comparison.gif')
