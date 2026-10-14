# -*- coding: utf-8 -*-
from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'tools/optimization-final-verification.mjs'
s=f.read_text(encoding='utf-8').replace('/games/tower/index.html\'','/games/tower/index.html?camp=1\'')
f.write_text(s,encoding='utf-8')
f=p/'games/rush/battle.js';s=f.read_text(encoding='utf-8')
old="const wrong=side!==e.correctSide;b.mistakes"
new="const other=e[side==='left'?'right':'left'];const wrong=b.layoutVersion>=5?(!g.effect&&!other.effect&&b.count<gateValue(old,other.op,other.value)):side!==e.correctSide;b.mistakes"
assert old in s;s=s.replace(old,new);f.write_text(s,encoding='utf-8')
f=p/'artifacts/audit-1.20.0/play-audit.mjs';s=f.read_text(encoding='utf-8').replace('artifacts/audit-1.20.0','artifacts/optimization-1.21.0').replace('4210','4230').replace("['coop','liars','evolve','chess','workshop']","['coop','liars','evolve','chess','workshop','marble']")
s=s.replace("else if(id==='mine'){const can=f.locator('canvas');const r=await can.boundingBox();await p.mouse.click(r.x+r.width*.5,r.y+r.height*.58);}","else if(id==='mine'){const r=await f.locator('canvas').boundingBox(),hit=await f.evaluate(()=>MT.MM.Game.scene.hit.start),size=await f.locator('canvas').evaluate(e=>({w:e.width,h:e.height}));await p.mouse.click(r.x+(hit.x+hit.w/2)*r.width/size.w,r.y+(hit.y+hit.h/2)*r.height/size.h);}")
s=s.replace("if(id==='coop')await f.getByRole('button',{name:'已了解，略过',exact:true}).click();","if(id==='coop'){const skip=f.getByRole('button',{name:'已了解，略过',exact:true});if(await skip.isVisible())await skip.click();}")
(p/'tools/optimization-play.mjs').write_text(s,encoding='utf-8')
