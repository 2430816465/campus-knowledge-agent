import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const output='output/endless-balance-v2',sandbox=path.resolve(output,'baseline-runtime');
fs.mkdirSync(sandbox,{recursive:true});
for(const name of fs.readdirSync('games/marble').filter(n=>n.endsWith('.js')))fs.copyFileSync('games/marble/'+name,sandbox+'/'+name);
for(const name of ['state-endless.js','endless-data.js'])fs.copyFileSync(output+'/before/'+name,sandbox+'/'+name);
const old=await import(pathToFileURL(sandbox+'/state-endless.js'));
const oldData=await import(pathToFileURL(sandbox+'/endless-data.js'));
const now=await import('../games/marble/state-endless.js');
const data=await import('../games/marble/endless-data.js');
const saved=new Map();globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
const results={natural:[],snapshots:[]};
const settle=g=>{for(let i=0;i<40&&['flight','descent'].includes(g.run.phase);i++)g.advance(250);g.sounds=[]};
const draft=(g,d)=>{
 const r=g.run;if(r.offerType==='imprint'){g.chooseImprint('nova');return}
 const score=item=>{
  const n=g.level(item.id),to=d.nextPower(item.id,n,item.tier),m=r.queue.length;
  if(item.id==='extra')return (d.stats('extra',to)>d.stats('extra',n)?(m<4?39:27):8)+item.tier;
  if(item.id==='heal')return r.hp<6?42:0;
  const base={fire:35,chain:29,pierce:23,split:27,bounce:18,core:20,frost:18,net:30,iceburst:30,rail:28}[item.id]||0;
  return base+item.tier*3+(n===0?3:0)+(item.id==='core'&&r.room.enemies.some(e=>e.type==='boss')?8:0);
 };
 g.choose([...r.offer].sort((a,b)=>score(b)-score(a))[0].id);
};
for(const [variant,Game,d] of [['before',old.MarbleGame,oldData],['after',now.MarbleGame,data]]){
 for(const seed of [1,22,77,101,202,303]){
  saved.clear();const g=new Game();g.newRun(seed);g.persist=()=>{};const trail=[],drafts=[];
  const end=g.endVolley.bind(g);g.endVolley=()=>{end();g.remaining=g.run.room.enemies.filter(e=>e.type!=='boss').length};
  while(g.run.shot<100&&g.run.phase!=='failed'){
   const r=g.run;if(r.phase==='reward'){drafts.push({shot:r.shot,offer:structuredClone(r.offer)});draft(g,d);continue}
   const sorted=[...r.room.enemies].sort((a,b)=>b.y-a.y),boss=sorted.find(e=>e.type==='boss');
   const target=sorted[0]?.y>265?sorted[0]:boss&&r.shot%3!==0?boss:sorted[Math.min(2,sorted.length-1)];
   const before=r.room.enemies.filter(e=>e.type!=='boss').length,angle=target?Math.atan2(target.x-320,344-target.y):0;
   g.shoot(angle);settle(g);
   trail.push({shot:r.shot,hp:r.hp,kills:r.volley.kills,clearFraction:1-g.remaining/Math.max(1,before),fullClear:g.remaining===0,remaining:g.remaining,alive:r.room.enemies.length,balls:r.queue.length,xp:r.volley.xpGain??r.volley.kills,bossKills:r.bossKills});
  }
  const avg=(lo,hi,k)=>{const a=trail.filter(t=>t.shot>=lo&&t.shot<=hi);return a.length?+(a.reduce((s,t)=>s+Number(t[k]),0)/a.length).toFixed(3):null};
  const result={variant,seed,end:g.run.shot,firstHurt:trail.find(t=>t.hp<10)?.shot??null,bossKills:g.run.bossKills,midKills:avg(20,40,'kills'),midFraction:avg(20,40,'clearFraction'),midFullClear:avg(20,40,'fullClear'),lateFraction:avg(45,65,'clearFraction'),lateFullClear:avg(45,65,'fullClear'),trail,drafts,powers:g.run.powers};
  results.natural.push(result);console.log(JSON.stringify({...result,trail:undefined,drafts:undefined,powers:undefined}));
 }
}
// Identical random field geometry and angles isolate bounded build capacity.
for(const shot of [30,50,70,90])for(const seed of [1,77])for(const build of ['formed','max']){
 const setup=new now.MarbleGame();setup.newRun(seed);setup.run.shot=shot;setup.run.room.enemies=[];setup.run.room.obstacles=[];
 setup.spawn(Math.max(data.pressure(shot).target,oldData.pressure(shot).target));
 const world=structuredClone(setup.run.room);
 for(const [variant,Game,d] of [['before',old.MarbleGame,oldData],['after',now.MarbleGame,data]])for(const angle of [-.75,-.35,0,.35,.75]){
  saved.clear();const g=new Game();g.newRun(seed);g.persist=()=>{};const r=g.run;r.room=structuredClone(world);r.shot=shot;r.fireBranch='nova';
  r.powers=build==='max'?Object.fromEntries(d.POWERS.filter(p=>p.id!=='heal').map(p=>[p.id,p.max])):{extra:variant==='before'?4:10,fire:8,pierce:6,chain:6,split:6,bounce:6,core:6,frost:4,net:1,iceburst:1,rail:1};
  r.queue=Array(variant==='before'?Math.min(d.ENDLESS.maxMain,1+r.powers.extra):d.stats('extra',r.powers.extra)).fill('basic');
  r.nextBoss=9999;r.room.enemies.push({id:99999,type:'boss',x:320,y:65,r:23,hp:d.pressure(shot).bossHp,maxHp:d.pressure(shot).bossHp,intentIndex:1,rushIn:3});
  g.shoot(angle);for(let i=0;i<40&&r.phase==='flight';i++)g.advance(250);
  const remaining=r.room.enemies.filter(e=>d.live(e)&&e.type!=='boss').length,boss=r.room.enemies.find(e=>e.type==='boss'),hp=d.pressure(shot).bossHp;
  results.snapshots.push({variant,shot,seed,build,angle,count:world.enemies.length,remaining,kills:r.volley.kills,fraction:1-remaining/world.enemies.length,fullClear:remaining===0,bossHp:hp,bossDamage:hp-(boss?.hp||0),generated:r.volley.generated,procs:r.volley.procs});
 }
}
fs.writeFileSync(output+'/comparison.json',JSON.stringify(results,null,2));
const aggregate=[];for(const shot of [30,50,70,90])for(const build of ['formed','max'])for(const variant of ['before','after']){
 const a=results.snapshots.filter(t=>t.shot===shot&&t.build===build&&t.variant===variant),avg=k=>+(a.reduce((s,t)=>s+Number(t[k]),0)/a.length).toFixed(3);
 aggregate.push({shot,build,variant,kills:avg('kills'),fraction:avg('fraction'),fullClear:avg('fullClear'),bossDamage:avg('bossDamage')});
}
fs.writeFileSync(output+'/snapshot-summary.json',JSON.stringify(aggregate,null,2));console.log(JSON.stringify(aggregate));
