import test from 'node:test';
import assert from 'node:assert/strict';
import {createChoiceBattle,stepChoice,activateBurst,choiceDamage,choiceInterval,choicePlan,selectOffer,defenseOffers} from '../games/rush/choice.js';
import * as old from '../games/rush/choice-v6.js';
import {actorFrame,actorType} from '../games/rush/actor.js';
import {ANIMATIONS} from '../games/rush/animation.js';
import {fresh,load,persist,settle} from '../games/rush/profile.js';
const tick=(b,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)stepChoice(b,1/60);};
const quiet=(stage=3)=>{const b=createChoiceBattle(stage);b.cursor=999;b.fire=999;return b;};
test('all version six schedules and saved combat remain identical to the archived engine',()=>{
 for(let stage=1;stage<=18;stage++){
  assert.deepEqual(choicePlan(stage,6),old.choicePlan(stage));
  const a=old.createChoiceBattle(stage,{},'six'),b=structuredClone(a);
  for(let i=0;i<1000;i++){const dir=i%240<120?1:-1;old.stepChoice(a,1/60,dir);stepChoice(b,1/60,dir);}
  assert.deepEqual(b,a);
  assert.deepEqual(choicePlan(stage).events.filter(e=>e.kind!=='supply'),old.choicePlan(stage).events);
 }
});
test('burst has a real bounded benefit, only activates at full charge, and freezes with choices',()=>{
 const b=quiet(),normalDamage=choiceDamage(b),normalInterval=choiceInterval(b);
 assert.equal(activateBurst(b),false);b.energy=100;assert.equal(activateBurst(b),true);assert.equal(activateBurst(b),false);
 assert.ok(choiceDamage(b)>normalDamage);assert.ok(choiceInterval(b)<normalInterval);assert.equal(b.burstUses,1);
 b.offers=defenseOffers(b);const saved=structuredClone(b);stepChoice(b,1);assert.deepEqual(b,saved);b.offers=null;
 tick(b,3.1);assert.equal(b.burstTime,0);assert.equal(choiceDamage(b),normalDamage);assert.equal(choiceInterval(b),normalInterval);
 const first=quiet(1);first.energy=100;assert.equal(activateBurst(first),false);
});
test('supplies reward exactly once by shooting or contact, without counting as kills',()=>{
 for(const method of ['shot','contact'])for(const loot of ['recruit','shield']){
  const b=quiet();b.entities=[{kind:'supply',name:'箱子',id:1,x:240,y:method==='shot'?400:640,hp:1,maxHp:1,speed:0,age:0,loot}];
  if(method==='shot')b.bullets=[{x:240,y:411,vx:0,vy:-660,age:0,delay:0,damage:3,distance:0,maxRange:500,hits:[],pierce:0}];
  tick(b,.1);assert.equal(b.supplies,1);assert.equal(b.kills,0);assert.equal(b.energy,12);assert.equal(loot==='recruit'?b.count:b.shield,loot==='recruit'?6:10);
  tick(b,1);assert.equal(b.supplies,1);
 }
 const b=quiet();b.count=48;b.entities=[{kind:'supply',id:1,x:240,y:600,hp:1,maxHp:1,speed:0,age:0,loot:'recruit'}];tick(b,.1);assert.equal(b.count,48);assert.equal(b.shield,8);
});
test('boss warnings lock landing before release; moving later does not retarget shots',()=>{
 const b=quiet();b.entities=[{kind:'boss',id:1,type:'mage_red',skill:'aim',x:240,y:230,age:0,hp:999,maxHp:999,shoot:.89,speed:0,damage:12}];
 stepChoice(b,1/60);const target=b.entities[0].lock.x;assert.equal(target,240);b.x=b.targetX=380;tick(b,.90);
 assert.equal(b.entities[0].lock,null);assert.equal(b.enemyBullets.length,1);const p=b.enemyBullets[0];assert.ok(Math.abs(p.vx)<3,'shot aims at the old center, not the new player position');
});
test('charge reaches the formation, quake matches its circles, and melee can be dodged',()=>{
 for(const skill of ['charge','quake']){const b=quiet();b.count=1;b.entities=[{kind:'boss',id:1,type:'rock_golem',skill,x:240,y:230,age:0,hp:999,maxHp:999,shoot:.89,speed:0,damage:12}];
  if(skill==='quake'){stepChoice(b,1/60);b.entities[0].lock.targets=[240];}tick(b,1.8);assert.equal(b.status,'lost',skill+' damages real formation');}
 const b=quiet();b.entities=[{kind:'enemy',id:1,type:'skeleton',x:240,y:640,age:0,hp:999,maxHp:999,speed:0,damage:30,shoot:999}];stepChoice(b,1/60);b.x=b.targetX=380;tick(b,.5);assert.equal(b.count,3);
});
test('registered animation origins are stable, movement drives strides, damage maps to release frame',()=>{
 for(const type of Object.keys(ANIMATIONS).filter(k=>!k.endsWith('-attack'))){
  const walk=actorFrame({type,kind:'enemy',id:0,distance:0}),next=actorFrame({type,kind:'enemy',id:0,distance:12});assert.notEqual(walk.index,next.index);
  const atk=actorFrame({type,kind:'enemy',melee:true,attackElapsed:.28});assert.equal(atk.index,atk.meta.releaseFrame);assert.equal(atk.bodyHeight,walk.bodyHeight);assert.deepEqual(atk.meta.origin,[64,116]);
 }
 assert.equal(actorType('skeleton_captain'),'skeleton_elite');
});
test('new live attack, supplies and burst roundtrip deterministically, damaged fields fail safely',()=>{
 const p=fresh();p.active=quiet();p.active.energy=100;activateBurst(p.active);p.active.entities=[{kind:'boss',id:1,type:'mage_red',skill:'aim',x:240,y:230,age:0,hp:999,maxHp:999,shoot:.89}];tick(p.active,.2);
 const storage={raw:null,getItem(){return this.raw},setItem(k,v){this.raw=v}};persist(storage,p);const resumed=load(storage);assert.equal(resumed.corrupt,null);assert.deepEqual(resumed.profile,p);
 tick(p.active,.5);tick(resumed.profile.active,.5);assert.deepEqual(p.active,resumed.profile.active);
 const bad=JSON.parse(storage.raw);bad.active.burstTime=-1;storage.raw=JSON.stringify(bad);assert.ok(load(storage).corrupt);
 p.active.status='won';const r=settle(p);assert.equal(r.burstUses,1);assert.equal(r.supplies,0);
});
