import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state-endless.js';
const saved=new Map();globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
const game=()=>{saved.clear();const g=new MarbleGame();g.newRun(77);return g};
const fixtures=g=>{g.run.room.enemies=[{id:1,type:'spirit',kind:'normal',x:30,y:300,r:4},{id:2,type:'boss',x:200,y:280,r:23,hp:777,maxHp:900,armor:70,rushIn:1,intentIndex:1},{id:3,type:'spirit',kind:'shield',x:500,y:180,r:6,shield:true,frozen:true},{id:4,type:'spirit',kind:'normal',x:60,y:30,r:4,dead:true}];return g.run.room.enemies};
test('two free uses halve all live enemy depths, retaining health, Boss intent and obstacles',()=>{
 const g=game(),r=g.run,es=fixtures(g),obstacles=structuredClone(r.room.obstacles);
 r.hp=4;r.xp=12;r.shot=42;r.nextBoss=44;r.freezeNext=true;g.aim={dx:20,dy:-200};
 assert(!g.canAdHelp('pushback'));assert(g.pushback());assert.deepEqual(es.map(e=>e.y),[150,140,90,30]);
 assert.equal(r.hp,4);assert.equal(r.xp,12);assert.equal(r.shot,42);assert.equal(r.nextBoss,44);assert(r.freezeNext);
 assert.equal(es[1].hp,777);assert.equal(es[1].armor,70);assert.equal(es[1].rushIn,1);assert(es[2].shield&&es[2].frozen);
 assert.deepEqual(r.room.obstacles,obstacles);assert.equal(g.aim,null);assert.equal(r.help.used,0);assert(!r.supportUsed);
 assert(g.pushback());assert.deepEqual(es.map(e=>e.y),[75,70,45,30]);assert(!g.pushback());assert(g.canAdHelp('pushback'));
 assert.equal(new Set(r.help.records.map(e=>e.id)).size,2);
});
test('two rewarded uses are independently capped and duplicate or stale callbacks cannot spend another use',()=>{
 const g=game(),r=g.run;fixtures(g);assert(!g.grantAssist('pushback','ad',r.id,0));g.pushback();g.pushback();
 assert(!g.grantAssist('pushback','ad','other-run',0));assert(!g.grantAssist('pushback','ad',r.id,1));
 assert(g.grantAssist('pushback','ad',r.id,0));assert(!g.grantAssist('pushback','ad',r.id,0));
 assert(g.grantAssist('pushback','fallback',r.id,1));assert(!g.grantAssist('pushback','ad',r.id,2));
 assert.deepEqual(r.pushback,{freeUsed:2,adUsed:2});assert.equal(r.help.used,2);assert.equal(r.help.records.length,4);
 assert(g.canAdHelp('freeze'));assert(g.canAdHelp('extraChoice'));assert(!r.supportUsed);
 g.newRun(80);assert(!g.grantAssist('pushback','ad',r.id,0));assert.deepEqual(g.run.pushback,{freeUsed:0,adUsed:0});
});
test('pushback is unavailable during flight, descent, rewards, failure, results and pause',()=>{
 const g=game();fixtures(g);for(const phase of ['flight','descent','reward','failed','result']){g.run.phase=phase;assert(!g.pushback(),phase);assert(!g.canAdHelp('pushback'),phase)}
 g.run.phase='aim';g.paused=true;assert(!g.pushback());g.paused=false;assert(g.pushback());
});
test('top bounds prevent offscreen movement; a field with nothing to retreat spends no charge',()=>{
 const g=game();g.run.room.enemies=[{id:1,type:'boss',x:250,y:48,r:23,hp:50,maxHp:50}];assert(g.pushback());assert.equal(g.run.room.enemies[0].y,27);
 assert(!g.pushback());assert.equal(g.run.pushback.freeUsed,1);g.run.room.enemies=[];assert(!g.pushback());
});
test('reload and interrupted-volley recovery retain positions and charges, old saves start with two free uses',()=>{
 const g=game();fixtures(g);g.pushback();const pos=g.run.room.enemies.map(e=>e.y);const loaded=new MarbleGame();
 assert.deepEqual(loaded.run.pushback,{freeUsed:1,adUsed:0});assert.deepEqual(loaded.run.room.enemies.map(e=>e.y),pos);
 loaded.shoot(.3);loaded.advance(150);loaded.persist();const recovered=new MarbleGame();assert.equal(recovered.run.phase,'aim');
 assert.deepEqual(recovered.run.pushback,{freeUsed:1,adUsed:0});assert.deepEqual(recovered.run.room.enemies.map(e=>e.y),pos);
 delete recovered.run.pushback;recovered.persist();const migrated=new MarbleGame();assert.deepEqual(migrated.run.pushback,{freeUsed:0,adUsed:0});
 assert.equal(migrated.describe().pushback.freeRemaining,2);
});
