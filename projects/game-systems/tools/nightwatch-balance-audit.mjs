import fs from 'node:fs/promises';
import {fresh,stats,conclude,quests,claim,equipBest,improve,acquire,grantLoot} from '../games/nightwatch/profile.js';
import {createBattle,Battle,selectCard} from '../games/nightwatch/battle.js';
const priorities=['learn-ice','learn-lightning','ice-freeze','bolt-multi','bolt-pierce','bolt-split','bolt-explode','fire-ground','fire-super','ice-multi','lightning-chain','lightning-stun','learn-rock','learn-chain','learn-beam','bolt-damage','fire-damage','all-power'];
export function simulate(p,{stage=1,seed=61904,guardian=true,strategy='planned',revive=false}={}){
 p.selected=stage;p.frontier=Math.max(stage,p.frontier);p.seed=seed;
 const s=createBattle(p),metric={stage,seed,strategy,guardian,attack:s.stats.attack,maxWall:s.stats.health,wallHits:0,firstWallHit:null,maxAdvance:0,maxEnemies:0,guardianUses:0,choices:0,openingKills:[],damage:{}};
 const engine=new Battle(s,p,type=>{if(type==='wallhit'){metric.wallHits++;metric.firstWallHit??=+s.time.toFixed(2);}}),hit=engine.damage.bind(engine);
 engine.damage=(e,...args)=>{const alive=e.hp>0;hit(e,...args);if(alive&&e.hp<=0&&s.wave<=3)metric.openingKills.push({age:+(s.time-e.born).toFixed(2),y:+e.y.toFixed(1),wave:s.wave,type:e.type});};
 for(let i=0;i<54000;i++){
  if(s.status==='choice'){const card=strategy==='random'?s.choices[Math.floor(s.seed%3)]:[...s.choices].sort((a,b)=>(priorities.indexOf(a.id)<0?99:priorities.indexOf(a.id))-(priorities.indexOf(b.id)<0?99:priorities.indexOf(b.id)))[0];selectCard(s,p,card.id);metric.choices++;}
  if(s.status==='defeated'&&revive&&!s.revived){s.revived=true;s.wall=s.stats.health*.6;s.status='playing';for(const e of s.enemies){e.y=Math.max(40,e.y-140);e.attackClock=2;e.stun=2;}}
  if(s.status==='defeated'||s.status==='result')break;
  if(guardian&&s.summonCooldown<=0&&s.enemies.some(e=>e.y>380)&&engine.summon())metric.guardianUses++;
  engine.step(1/30);
  metric.maxAdvance=Math.max(metric.maxAdvance,...s.enemies.map(e=>e.y));metric.maxEnemies=Math.max(metric.maxEnemies,s.enemies.length);
 }
 const ages=metric.openingKills.map(x=>x.age).sort((a,b)=>a-b);
 return {s,metric:{...metric,status:s.status,wave:s.wave,kills:s.kills,wallPct:+(s.wall/s.stats.health*100).toFixed(1),seconds:+s.time.toFixed(1),openingMedianLife:ages[Math.floor(ages.length/2)]||0,openingMaxY:Math.max(0,...metric.openingKills.map(x=>x.y)),damage:s.damage}};
}
export function referenceProfile(stage){
 const p=fresh();p.frontier=stage;p.selected=stage;p.weapon=1+Math.floor(stage*.65);p.wallLevel=1+Math.floor(stage*.5);
 for(const g of p.gear){g.rank=1+Math.floor((stage-1)/5);g.quality=Math.min(3,Math.floor(stage/7));g.level=Math.floor(stage*.4);}
 for(const id of Object.keys(p.skills))p.skills[id]=1+Math.floor(stage*.22);
 if(stage>=5){p.core='frost';p.cores.push('frost');}if(stage>=10){p.partner='witch';p.partners.push('witch');p.partnerLevels.witch=1+Math.floor(stage/5);p.wall='frost';p.walls.push('frost');}return p;
}
export function prepare(p,stage){
 equipBest(p);
 for(const q of quests(p))if(q.done&&!q.claimed)claim(p,q.id);
 if(stage>=3&&!p.cores.includes('frost'))acquire(p,'core','frost');
 if(stage>=4&&!p.partners.includes('witch'))acquire(p,'partner','witch');
 if(stage>=10&&!p.walls.includes('frost'))acquire(p,'wall','frost');
 const targets=[['weapon','',2+Math.floor(stage*.65),()=>p.weapon],['wall','',1+Math.floor(stage*.5),()=>p.wallLevel],...p.gear.filter(g=>Object.values(p.equipped).includes(g.uid)).map(g=>['gear',g.uid,Math.floor(stage*.4),()=>g.level]),...['ice','fire','lightning','bolt'].map(id=>['skill',id,1+Math.floor(stage*.22),()=>p.skills[id]]),['partner',p.partner,1+Math.floor(stage/5),()=>p.partnerLevels[p.partner]]];
 for(let pass=0;pass<30;pass++)for(const [type,id,level,current]of targets)if(current()<level)improve(p,type,id);
}
export function progression(seed){const p=fresh();p.seed=seed;const runs=[];for(let stage=1;stage<=30;stage++){
 let won=false;
 for(let attempt=0;attempt<4;attempt++){
  prepare(p,stage);
  const {s,metric}=simulate(p,{stage,seed:seed+p.runs*17,revive:true});p.active=s;const r=conclude(p,s,s.status==='result');p.active=null;runs.push({...metric,attempt,revived:s.revived,coins:p.coins,ore:p.ore,pages:p.pages,weapon:p.weapon,wallLevel:p.wallLevel});
  if(r.win){won=true;break;}
  prepare(p,stage);
  const farm=simulate(p,{stage:Math.max(1,stage-1),seed:seed+p.runs*29,revive:true});p.active=farm.s;conclude(p,farm.s,farm.s.status==='result');p.active=null;
 }
 if(!won)break;
 }return {seed,frontier:p.frontier,clears:Object.keys(p.clears).length,totalRuns:p.runs,firstTry:runs.filter(x=>x.status==='result'&&x.attempt===0).length,runs};}
if(process.argv[1]?.endsWith('nightwatch-balance-audit.mjs')){
 const report=[];
 for(const stage of [1,2,3,5,10,11,15,20,21,25,30])for(const seed of [61904,8914,310,9127,78123])report.push(simulate(referenceProfile(stage),{stage,seed}).metric);
 for(const seed of [61904,8914,310,9127,78123])for(const strategy of ['planned','random'])report.push(simulate(fresh(),{seed,guardian:false,strategy}).metric);
 await fs.mkdir('artifacts/nightwatch/balance',{recursive:true});await fs.writeFile('artifacts/nightwatch/balance/audit.json',JSON.stringify(report,null,2));
 for(const stage of [1,2,3,5,10,11,15,20,21,25,30]){const r=report.filter(x=>x.stage===stage&&x.guardian);console.log(JSON.stringify({stage,wins:r.filter(x=>x.status==='result').length,wall:r.map(x=>x.wallPct),waves:r.map(x=>x.wave),life:r.map(x=>x.openingMedianLife),hit:r.map(x=>x.firstWallHit)}));}
 console.log('Fresh no guardian',JSON.stringify(report.filter(x=>!x.guardian).map(({seed,strategy,status,wave,wallPct,openingMedianLife,firstWallHit})=>({seed,strategy,status,wave,wallPct,openingMedianLife,firstWallHit}))));
 const campaigns=[61904,8914,310,9127,78123].map(progression);await fs.writeFile('artifacts/nightwatch/balance/progression.json',JSON.stringify(campaigns,null,2));console.log('Real resource progression',JSON.stringify(campaigns.map(({seed,clears,totalRuns,firstTry,runs})=>({seed,clears,totalRuns,firstTry,lastWall:runs.at(-1).wallPct})),null,2));
}
