import fs from 'node:fs/promises';
import {fresh} from '../games/nightwatch/profile.js';
import {SKILLS} from '../games/nightwatch/data.js';
import {createBattle,Battle} from '../games/nightwatch/battle.js';
// A stationary, resistance-free arena isolates each spell's base output.
const rows=[];
for(const skill of SKILLS){const row={id:skill.id,name:skill.name,cooldown:skill.cooldown,multiplier:skill.damage};for(const count of [1,8]){
 const p=fresh();p.seed=741;const s=createBattle(p),engine=new Battle(s,p);s.waiting=1e6;s.partnerClock=s.wallClock=1e6;s.stats.crit=0;s.stats.fire=s.stats.ice=s.stats.lightning=s.stats.arcane=0;s.stats.pierce=s.stats.multi=0;s.abilities={[skill.id]:{level:1,damage:0,cooldown:0}};s.cooldowns={[skill.id]:0};
 for(let i=0;i<count;i++){const e=engine.spawn('skeleton',count===1?240:200+(i%3)*35,230+Math.floor(i/3)*32);e.hp=e.maxHp=1e9;e.speed=e.attack=0;}
 for(let i=0;i<3600;i++)engine.step(1/60);
 row[count===1?'singleDpsPerAttack':'groupDpsPerAttack']=+(Object.values(s.damage).reduce((a,x)=>a+x,0)/60/s.stats.attack).toFixed(3);
 }rows.push(row);}
await fs.mkdir('artifacts/nightwatch/balance',{recursive:true});await fs.writeFile('artifacts/nightwatch/balance/spells.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
