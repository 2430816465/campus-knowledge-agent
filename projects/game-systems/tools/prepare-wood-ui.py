"""Slice generated blank skin assets and install the shared presentation layer."""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:\Users\24308\.codex\generated_images\01a0f688-5857-7d30-b40c-6f36d0709fcf\exec-f1fdc31a-853f-419b-91e0-26d11d0e75fa.png')
out = ROOT/'assets/ui/wood'
out.mkdir(parents=True, exist_ok=True)
im = Image.open(SOURCE).convert('RGBA')
rows = [(44,722),(761,893),(918,1050),(1076,1207)]
for name,(top,bottom) in zip(['panel','primary','secondary','plaque'],rows):
    part=im.crop((0,top,im.width,bottom))
    bounds=part.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
    part=part.crop(bounds)
    part.save(out/(name+'.png'),optimize=True)
    print(name,part.size)
(out/'provenance.json').write_text(json.dumps({'source':str(SOURCE),'reference':'B 像素木牌','generator':'built-in image_gen','processing':'alpha-bounded lossless crop only; no recoloring','files':['panel.png','primary.png','secondary.png','plaque.png']},ensure_ascii=False,indent=2),encoding='utf-8')

def replace(path, old, new):
    p=ROOT/path;s=p.read_text(encoding='utf-8')
    if new in s:return
    assert old in s,(path,old)
    p.write_text(s.replace(old,new),encoding='utf-8')

replace('index.html','<script type="module" src="app.js">','<link rel="stylesheet" href="games/shared/wood-ui.css"><script src="games/shared/wood-ui.js"></script><script type="module" src="app.js">')
for game in ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']:
    for p in (ROOT/'games'/game).glob('*.html'):
        s=p.read_text(encoding='utf-8')
        if 'wood-ui.js' not in s:
            s=s.replace('</head>','<script src="../shared/wood-ui.js"></script></head>')
            s=s.replace('</body>','<link rel="stylesheet" href="../shared/wood-ui.css"></body>')
            p.write_text(s,encoding='utf-8')

# Paint the existing mine hot areas without changing their coordinates or ownership.
p=ROOT/'games/mine/src/modes/mining/MiningUI.js';s=p.read_text(encoding='utf-8')
s=s.replace('const {x,y,w,h}=rect;\n    const g=',"const {x,y,w,h}=rect;\n    if(window.WoodUI?.paint(ctx,'panel',rect)){ctx.restore();return;}\n    const g=",1)
old="    MM.U.fillRound(ctx,x,y+1,w,h-4,14,skin.line);\n    MM.U.fillRound(ctx,x,y,w,h-4,14,fill);\n    MM.U.strokeRound(ctx,x,y,w,h-4,14,o.armed?skin.green:skin.line,o.armed?4:2);"
new="    const painted=window.WoodUI?.paint(ctx,o.armed||o.primary?'primary':'secondary',rect,{disabled});\n    if(!painted){\n"+old+"\n    }"
assert old in s;s=s.replace(old,new)
p.write_text(s,encoding='utf-8')
print('Installed skin links in all ten games and marble sub-entry')
