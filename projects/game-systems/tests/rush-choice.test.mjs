import test from 'node:test';
import assert from 'node:assert/strict';
import {createChoiceBattle,stepChoice,selectOffer,applyGrowth,defenseOffers,choicePlan,gateCount,BOSSES,ENEMIES,GROWTH,choiceDamage,choiceInterval} from '../games/rush/choice.js';
import {fresh,load,persist,settle} from '../games/rush/profile.js';
import {milestoneKey} from '../economy.js';
test('eighteen unique bosses and reachable mixed two/three-lane decisions',()=>{
 assert.equal(new Set(BOSSES.map(b=>b.name)).size,18);assert.equal(new Set(ENEMIES.map(e=>e.role)).size,8);
 for(let s=1;s<=18;s++){const p=choicePlan(s),g=p.events.filter(e=>e.kind==='gates');assert.equal(g.length,gateCount(s));assert.ok(g.every(e=>[2,3].includes(e.choices.length)));
  if(s>=3){assert.equal(g.length,s+3);const twos=g.filter(e=>e.choices.length===2).length;assert.ok(twos>=Math.floor(g.length/3)&&twos<=Math.ceil(g.length/3));assert.ok(g.some(e=>e.choices.length===3));}else assert.ok(g.every(e=>e.choices.length===2));
  assert.equal(p.events.filter(e=>e.kind==='boss').length,1);
  for(const gate of g)for(let i=0;i<gate.choices.length;i++){
   const b=createChoiceBattle(s);b.cursor=999;b.fire=999;b.x=b.targetX=42+(i+.5)*396/gate.choices.length;
   b.entities=[{...structuredClone(gate),id:1,y:633,age:0,hit:false}];stepChoice(b,1/60);
   assert.equal(b.gateHistory[0].choice,i);const choice=gate.choices[i];
   if(choice.upgrade)assert.ok(b.growth[choice.upgrade]>0||b.shield>0||b.count>3);else assert.equal(b.count,choice.op==='×'?6:3+choice.value);
  }
 }
});
test('growth changes real damage and timing, caps, and all-team ascension',()=>{
 const b=createChoiceBattle(5),damage=choiceDamage(b),interval=choiceInterval(b);
 applyGrowth(b,'sword');applyGrowth(b,'art');applyGrowth(b,'realm');assert.ok(choiceDamage(b)>damage);assert.ok(choiceInterval(b)<interval);assert.equal(b.shield,8);
 for(const id of Object.keys(b.growth)){for(let n=0;n<10;n++)applyGrowth(b,id);assert.equal(b.growth[id],GROWTH[id].max);assert.equal(applyGrowth(b,id),false);}
});
test('defense choices freeze all combat and resume exactly once; cannot pick unoffered upgrade',()=>{
 const b=createChoiceBattle(1,{},'d','defense');b.offers=defenseOffers(b);assert.equal(new Set(b.offers).size,4);const frozen=structuredClone(b);stepChoice(b,1);assert.deepEqual(b,frozen);
 assert.equal(selectOffer(b,'invalid'),false);assert.equal(selectOffer(b,b.offers[0]),true);assert.equal(b.wave,2);assert.equal(b.offers,null);assert.equal(selectOffer(b,'sword'),false);stepChoice(b,1/60,1);assert.equal(b.x,240);
});
test('campaign and defense serialize growth, in-flight shots, pending choices and settle idempotently',()=>{
 for(const mode of ['campaign','defense']){const p=fresh();p.active=createChoiceBattle(3,{},'save',mode);for(let n=0;n<200;n++)stepChoice(p.active,1/60);applyGrowth(p.active,'realm');if(mode==='defense')p.active.offers=defenseOffers(p.active);
  const storage={raw:null,getItem(){return this.raw},setItem(k,v){this.raw=v}};persist(storage,p);assert.deepEqual(load(storage).profile.active,p.active);
  p.active.status='won';const result=settle(p),shards=p.shards;settle(p);assert.equal(p.shards,shards);assert.equal(p.cleared.length,mode==='defense'?0:1);persist(storage,p);assert.deepEqual(load(storage).profile.pending,result);
 }
});
test('defense cannot claim or consume a campaign first clear, even with a stage field',()=>{
 assert.equal(milestoneKey('rush',true,1,{submode:'defense',stage:1},'d'),null);
 assert.equal(milestoneKey('rush',true,1,{stage:1},'c'),'rush-stage-1');
});
test('melee windup precedes damage; defeat freezes simulation without wave resurrection',()=>{
 for(const mode of ['campaign','defense']){const b=createChoiceBattle(1,{},'loss',mode);b.cursor=999;b.count=1;b.core=1;b.shield=0;b.fire=999;b.entities=[{kind:'enemy',id:1,x:240,y:mode==='defense'?601:640,age:0,hp:999,maxHp:999,speed:0,damage:30,shoot:999}];stepChoice(b,1/60);assert.equal(b.status,'playing');assert.equal(b.entities[0].melee,true);for(let i=0;i<18;i++)stepChoice(b,1/60);assert.equal(b.status,'lost');const time=b.time;stepChoice(b,1);assert.equal(b.time,time);if(mode==='defense')assert.equal(b.core,0);}
});
