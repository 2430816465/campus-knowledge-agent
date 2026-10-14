import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createBattle,step} from '../games/rush/battle.js';
import {STAGES,BOSS_HP} from '../games/rush/data.js';
import {fresh,upgrade,settle} from '../games/rush/profile.js';
import {route} from '../tests/rush-policy.mjs';
const p=fresh(),campaign=[],combinations=[];
function play(stage,upgrades,mask=null,minObstacle=false){
 const b=createBattle(stage,upgrades,'balance-'+stage+'-'+mask);let bossAt=null;
 for(let i=0;i<6000&&b.status==='playing';i++){
  // Isolated numeric assumption: rocks/red crates cause zero loss. Enemies and boss remain real.
  if(minObstacle)b.entities=b.entities.filter(e=>e.kind!=='rock'&&e.loot!=='trap');
  if(i%30===0)b.targetX=route(b,mask===null?undefined:e=>((mask>>e.gateIndex)&1)?'right':'left');
  step(b,1/60);if(b.bossSpawned&&bossAt===null)bossAt=b.time;
 }
 return {status:b.status,mistakes:b.mistakes,passed:b.passed,remaining:b.count,peak:b.peak,kills:b.kills,crates:b.crates,trapLoss:b.trapLoss,weapon:b.weapon,weaponType:b.weaponType,modifiers:b.modifiers,seconds:+b.time.toFixed(2),bossSeconds:bossAt===null?null:+(b.time-bossAt).toFixed(2),bossKilled:b.bossKilled,failureReason:b.failureReason,battle:b};
}
for(const stage of STAGES){
 const target={power:Math.min(7,Math.floor((stage.id+1)/2)),speed:Math.min(4,Math.floor(stage.id/3)),recruits:2};
 for(const key of ['power','speed','recruits'])while(p.upgrades[key]<target[key]){try{upgrade(p,key);}catch{break;}}
 const upgrades={...p.upgrades},before=p.shards,result=play(stage.id,upgrades);p.active=result.battle;delete result.battle;settle(p);
 campaign.push({stage:stage.id,title:stage.name,upgrades,before,reward:p.pending.shards,after:p.shards,...result});p.pending=null;
 assert.equal(result.status,'won','earned-resource campaign '+stage.id);
 if(stage.id<3)continue;
 for(let mask=0;mask<2**stage.gates.length;mask++){
  const intendedMistakes=Array.from(stage.correctRoute).reduce((n,c,i)=>n+Number((((mask>>i)&1)?'R':'L')!==c),0);
  const r=play(stage.id,upgrades,mask,true);delete r.battle;
  assert.ok(!(intendedMistakes>stage.mistakeLimit&&r.status==='won'),'above-limit path must never win '+stage.id+' '+mask);
  combinations.push({stage:stage.id,mask,intendedMistakes,eligible:intendedMistakes<=stage.mistakeLimit,...r});
 }
}
const stages=STAGES.map(s=>{
 const rows=combinations.filter(r=>r.stage===s.id),eligible=rows.filter(r=>r.eligible),atCap=eligible.filter(r=>r.intendedMistakes===s.mistakeLimit);
 return {stage:s.id,gateCount:s.gates.length,route:s.correctRoute,limit:s.mistakeLimit,bossHp:BOSS_HP[s.id-1],maxAllowedResistance:s.mistakeLimit===null?0:s.mistakeLimit*.08,effectiveBossHpAtLimit:s.mistakeLimit===null?BOSS_HP[s.id-1]:+(BOSS_HP[s.id-1]/(1-s.mistakeLimit*.08)).toFixed(1),eligiblePaths:eligible.length,eligibleWins:eligible.filter(r=>r.status==='won').length,atCapPaths:atCap.length,atCapWins:atCap.filter(r=>r.status==='won').length};
});
for(const row of stages.filter(s=>s.stage>=3))assert.ok(row.atCapWins>0,'Tolerance allowance must have a playable path at stage '+row.stage);
await fs.mkdir('artifacts/rush/balance',{recursive:true});
await fs.writeFile('artifacts/rush/balance/audit.json',JSON.stringify({assumptions:['18-stage campaign uses only initial/first-clear currency; no repeated grinding or injected currency.','528 alternative routes assume zero rock/red-crate loss; enemies, projectiles, rewards and boss HP use production mechanics.','A fixed bot is not an optimal human strategy or a measured completion rate.'],campaign,stages,combinations},null,2));
console.log(JSON.stringify({campaign:campaign.length,combinations:combinations.length,stages},null,2));
