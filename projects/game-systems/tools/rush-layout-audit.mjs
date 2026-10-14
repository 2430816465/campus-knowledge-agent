import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createBattle,step} from '../games/rush/battle.js';
import {fresh,upgrade,settle} from '../games/rush/profile.js';
import {STAGES,plan} from '../games/rush/data.js';
import {route} from '../tests/rush-policy.mjs';
const campaigns=[];
for(const cadence of [15,30,45]){
 const p=fresh(),rows=[];
 for(let stage=1;stage<=18;stage++){
  const target={power:Math.min(7,Math.floor((stage+1)/2)),speed:Math.min(4,Math.floor(stage/3)),recruits:2};
  for(const id of ['power','speed','recruits'])while(p.upgrades[id]<target[id]){try{upgrade(p,id);}catch{break;}}
  const before=p.shards,b=createBattle(stage,p.upgrades,'audit-'+cadence+'-'+stage);
  for(let i=0;i<6000&&b.status==='playing';i++){if(i%cadence===0)b.targetX=route(b);step(b,1/60);}
  const row={stage,title:STAGES[stage-1].name,upgrades:{...p.upgrades},before,status:b.status,seconds:+b.time.toFixed(2),remaining:b.count,peak:b.peak,weapon:b.weapon,weaponType:b.weaponType,modifiers:{...b.modifiers},rescued:b.rescued,trapLoss:b.trapLoss,crates:b.crates,kills:b.kills};
  p.active=b;settle(p);row.reward=p.pending.shards;row.after=p.shards;rows.push(row);p.pending=null;
  if(b.status!=='won')break;
 }
 campaigns.push({decisionSeconds:cadence/60,rows,cleared:p.cleared.length});
}
const layouts=STAGES.map(s=>({stage:s.id,title:s.name,terrain:s.terrain,hint:s.hint,pace:s.pace,gates:s.gates,rocks:s.rocks,chests:s.chests,waves:s.waves,boss:plan(s.id).find(e=>e.kind==='boss')}));
await fs.mkdir('artifacts/rush/layouts',{recursive:true});
await fs.mkdir('artifacts/rush/mechanics',{recursive:true});
await fs.writeFile('artifacts/rush/layouts/campaign.json',JSON.stringify({note:'固定自动策略；仅初始与首通收入，禁止追加货币/强制胜利；不代表真人难度。',campaigns,layouts},null,2));
const pressure=events=>events.filter(e=>['enemy','boss'].includes(e.kind)).reduce((sum,e)=>sum+e.hp,0);
const difficulty=STAGES.slice(0,3).map(s=>({stage:s.id,enemies:plan(s.id).filter(e=>e.kind==='enemy').length,totalHp:+pressure(plan(s.id)).toFixed(1),bossHp:plan(s.id).find(e=>e.kind==='boss').hp,trapAmounts:plan(s.id).filter(e=>e.loot==='trap').map(e=>e.amount)}));
await fs.writeFile('artifacts/rush/mechanics/campaign.json',JSON.stringify({note:'真实可赚取资源的固定策略，不能代替真人难度评价。',difficulty,campaigns,layouts},null,2));
for(const c of campaigns)console.log(`${c.decisionSeconds}s decisions: ${c.cleared}/18`,c.rows.find(r=>r.status!=='won')||'all cleared');
assert.equal(campaigns.find(c=>c.decisionSeconds===.5).cleared,18,'Half-second route must clear with legitimately earned growth');
