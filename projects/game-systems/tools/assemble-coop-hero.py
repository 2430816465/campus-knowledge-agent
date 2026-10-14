"""Pack generated frames and create the second player's deterministic gold palette."""
from pathlib import Path
from PIL import Image
import colorsys
root = Path(__file__).resolve().parents[1]
out = root / 'games/coop/assets/art-v3'
out.mkdir(exist_ok=True)
for action in ('run', 'jump'):
    frames = [Image.open(root / f'artifacts/coop-lan/{action}/{action}-{i}.png').convert('RGBA') for i in range(1,17)]
    if action == 'jump': frames[-1].save(out/'idle.png')
    sheet = Image.new('RGBA', (1280,80))
    for i,frame in enumerate(frames): sheet.paste(frame,(i*80,0))
    sheet.save(out/f'{action}.png')
for action in ('run','jump','idle'):
    im = Image.open(out/f'{action}.png').convert('RGBA')
    pixels=[]
    for r,g,b,a in im.getdata():
        h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if a and .52<h<.76 and s>.3:
            r,g,b=[round(x*255) for x in colorsys.hsv_to_rgb(.115,s*.8,v)]
        pixels.append((r,g,b,a))
    im.putdata(pixels)
    im.save(out/f'{action}-gold.png')
