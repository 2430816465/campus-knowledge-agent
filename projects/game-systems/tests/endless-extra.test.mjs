import test from 'node:test';
import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state-endless.js';
import {stats,nextPower,bossInterval} from '../games/marble/endless-data.js';
const saves=new Map();globalThis.localStorage={getItem:k=>saves.get(k)||null,setItem:(k,v)=>saves.set(k,v)};
const game=()=>{saves.clear();const g=new MarbleGame();g.newRun(101);g.persist=()=>{};return g};
test('extra ball pool is gated by first kill and epic/legendary rarity, including rerolls and ad offers',()=>{
 const g=game(),r=g.run;
 for(let bossKills=0;bossKills<=1;bossKills++)for(let tier=0;tier<4;tier++){
  r.bossKills=bossKills;g.rollTier=()=>tier;let found=0;
  for(let i=0;i<120;i++){g.makeOffer(i%2?'boss':'ad',true);for(const o of r.offer||[])if(o.id==='extra'){found++;assert(bossKills&&tier>=2)}}
  if(bossKills&&tier>=2)assert(found>0);
 }
 assert.deepEqual([0,1,2,3].map(t=>nextPower('extra',0,t)),[0,0,1,2]);
 r.bossKills=1;r.phase='reward';r.offerType='boss';r.offer=[{id:'extra',tier:2}];assert(g.choose('extra'));assert.equal(r.queue.length,2);
 r.phase='reward';r.offerType='boss';r.offer=[{id:'extra',tier:3}];assert(g.choose('extra'));assert.equal(r.queue.length,4);
 assert.equal(stats('extra',nextPower('extra',6,3)),8);
 r.bossKills=0;r.phase='reward';r.offerType='ad';r.offer=[{id:'extra',tier:3}];assert(!g.choose('extra'));
});
test('Boss schedule is independent, slows to ten shots and rotates four forms',()=>{
 const g=game(),r=g.run;const shots=[15,30,44,57,69,80,90,100];
 shots.forEach((shot,i)=>{assert.equal(r.nextBoss,shot);r.shot=shot;g.spawnBoss();assert.equal(r.room.enemies.filter(e=>e.type==='boss').length,i+1);assert.equal(r.room.enemies.at(-1).form,i%4)});
 assert.equal(bossInterval(99),10);
 const next=r.nextBoss;r.phase='aim';g.shoot(0);const boss=r.room.enemies.find(e=>e.type==='boss');boss.hp=1;g.damage(boss);assert.equal(r.nextBoss,next);
 r.room.enemies=[{id:999,type:'boss',hp:10,maxHp:10,y:330,x:200,r:23}];r.phase='descent';g.endDescent();assert.equal(r.nextBoss,next);
});
