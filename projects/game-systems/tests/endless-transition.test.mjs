import test from 'node:test';
import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state-endless.js';
import {pressure} from '../games/marble/endless-data.js';
const save=new Map();globalThis.localStorage={getItem:k=>save.get(k)||null,setItem:(k,v)=>save.set(k,v)};
const game=()=>{save.clear();const g=new MarbleGame();g.newRun(77);return g};
test('clearing spirits chips Boss armor/health with a hard per-volley cap and no recursion',()=>{
 const g=game(),r=g.run;r.shot=50;g.spawnBoss();const b=r.room.enemies.find(e=>e.type==='boss');b.hp=1000;b.armor=12;g.shoot(0);
 for(let i=0;i<200;i++)g.damage({id:10000+i,type:'spirit',kind:'bomb',x:100,y:100,r:4},'blast');
 assert.equal(r.volley.clearPulses,8);assert.equal(b.armor,0);assert.equal(b.hp,964);assert.equal(r.volley.kills,200);assert.equal(r.volley.procs.fire,0);assert.equal(r.volley.xpGain,45);
});
test('two two-shot freezes are independent of extra choice, saved, non-stacking and finite',()=>{
 const g=game(),r=g.run;g.grantAssist('extraChoice');g.choose(r.offer[0].id);assert(g.canAdHelp('freeze'));assert(!g.canAdHelp('extraChoice'));
 assert(g.grantAssist('freeze'));assert(!g.grantAssist('freeze'));g.persist();const loaded=new MarbleGame();assert.equal(loaded.run.freezeTurns,2);assert.equal(loaded.run.support.extraUsed,1);
 for(let i=0;i<2;i++){loaded.run.phase='aim';loaded.shoot(0);const e=loaded.run.room.enemies[0],y=e.y;loaded.endVolley();assert.equal(e.toY,y);loaded.endDescent()}
 assert(!loaded.run.freezeNext);assert.equal(loaded.run.freezeTurns,0);assert(loaded.grantAssist('freeze'));assert.equal(loaded.run.support.freezeUsed,2);loaded.run.freezeNext=false;assert(!loaded.canAdHelp('freeze'));
});
test('1.22 save migrates Boss health proportion and preserves existing bosses without paying extra gifts',()=>{
 const g=game(),r=g.run;r.balanceRevision=2;r.shot=40;r.hp=4;r.xp=99;delete r.support;delete r.freezeTurns;r.supportUsed=true;r.help.records=[{id:r.id+':extraChoice:2'}];
 r.room.enemies=[{id:1,type:'boss',x:100,y:180,r:23,hp:100,maxHp:200,spawnShot:15},{id:2,type:'boss',x:500,y:100,r:23,hp:1000,maxHp:2000,spawnShot:28}];g.persist();
 const loaded=new MarbleGame(),s=loaded.run;assert.equal(s.balanceRevision,4);assert.equal(s.hp,4);assert.equal(s.xp,99);assert.equal(s.room.enemies.length,2);assert.equal(s.room.enemies[0].id,1);assert.equal(s.room.enemies[0].hp,pressure(15).bossHp/2);assert.equal(s.queuedBossRewards,0);assert.equal(s.support.extraUsed,1);assert(loaded.canAdHelp('freeze'));loaded.persist();assert.equal(new MarbleGame().run.room.enemies[0].hp,s.room.enemies[0].hp);
});
test('late pressure accelerates while normal spirits still die to one direct hit',()=>{
 assert(pressure(15).bossHp<=150);assert(pressure(50).bossHp<600);
 assert(pressure(90).bossHp-pressure(75).bossHp>pressure(55).bossHp-pressure(40).bossHp);
 assert(pressure(90).drop-pressure(75).drop>pressure(55).drop-pressure(40).drop);
 assert(pressure(90).spawnMin>pressure(55).spawnMin*2);
 const g=game();g.run.shot=90;g.shoot(0);const e={id:999,type:'spirit',kind:'normal',x:100,y:100,r:4};g.damage(e,'direct');assert(e.dead);
});
