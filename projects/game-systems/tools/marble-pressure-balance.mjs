import {MarbleGame} from '../games/marble/state.js';
import fs from 'node:fs';
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
const results=[];
for(const policy of ['nearest','boss','random'])for(const seed of [1,22,77,101,202,303]){
 const g=new MarbleGame();g.newRun(seed);g.persist=()=>{};const trail=[];
 while(g.run.shot<85&&g.run.phase!=='failed'){
  const r=g.run;if(r.phase==='reward'){if(r.offerType==='imprint'){g.chooseImprint('nova');continue}const order=['extra','fire','pierce','chain','split','core','bounce','frost','heal'];g.choose([...r.offer].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id))[0].id);continue}
  const enemies=r.room.enemies,near=[...enemies].sort((a,b)=>b.y-a.y),boss=near.find(e=>e.type==='boss');
  const e=policy==='boss'&&boss&&near[0]?.y<275?boss:near[Math.min(2,near.length-1)];
  const angle=policy==='random'?Math.sin((seed+r.shot)*2.399)*1.3:e?Math.atan2(e.x-320,344-e.y):0;
  const before=enemies.length;g.shoot(angle);for(let i=0;i<40&&['flight','descent'].includes(r.phase);i++)g.advance(250);
  trail.push({shot:r.shot,hp:r.hp,kills:r.volley.kills,clear:r.volley.kills/Math.max(1,before),boss:r.bossKills,alive:r.room.enemies.length,balls:r.queue.length});g.sounds=[];
 }
 const avg=(lo,hi,key)=>{const a=trail.filter(x=>x.shot>=lo&&x.shot<=hi);return a.length?+(a.reduce((s,x)=>s+x[key],0)/a.length).toFixed(2):null};
 const result={policy,seed,end:g.run.shot,hp10:trail.find(x=>x.shot===10)?.hp,hp20:trail.find(x=>x.shot===20)?.hp,bossKills:g.run.bossKills,midKills:avg(20,35,'kills'),midClear:avg(20,35,'clear'),lateClear:avg(40,60,'clear')};results.push(result);console.log(JSON.stringify(result));
}
fs.mkdirSync('output/balance',{recursive:true});fs.writeFileSync('output/balance/pressure-results.json',JSON.stringify(results,null,2));
