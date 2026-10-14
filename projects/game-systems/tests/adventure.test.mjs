import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServices,mineReward,taskProgress} from '../services.js';
import {MarbleGame} from '../games/marble/state.js';
const require=createRequire(import.meta.url),C=require('../games/coop/server/contracts.cjs'),Game=require('../games/coop/src/game-shared.js');
const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
function marble(){const g=new MarbleGame();g.newRun(12);return g;}
test('empty mine runs cannot farm coins, ads or tasks; milestones capped',()=>{
 const s=createServices({load:()=>null,save:()=>{}});s.finish('empty','mine',true,999);assert.equal(s.get().coins,160);assert.throws(()=>s.adReward('empty'));assert.throws(()=>s.claim('first'));
 assert.equal(mineReward({digActions:4,maxDepth:44,treasureReached:true}),0);assert.equal(mineReward({digActions:5,maxDepth:5}),4);assert.equal(mineReward({digActions:999,maxDepth:999,rooms:999,treasureReached:true}),30);assert.equal(mineReward({digActions:NaN}),0);
});
test('solo path can complete achievement and paid orb skins are exclusive',()=>{
 const s=createServices({load:()=>null,save:()=>{}});
 ['tower','marble','mine','tower','tower','tower'].forEach((m,i)=>s.progress({id:'s'+i,mode:m,seconds:120,units:10}));
 assert.equal(taskProgress(s.get(),'all').count,4);s.claim('all');s.buy('amber-orb');s.buy('violet-orb');s.equip('amber-orb');s.equip('violet-orb');assert.deepEqual(s.get().equipped,['violet-orb']);
});
test('evolutions require both ingredients, and Boss offer guarantees an eligible evolution',()=>{
 const g=marble();assert(!g.available().some(p=>p.id==='net'));g.run.powers.chain=1;assert(!g.available().some(p=>p.id==='net'));g.run.powers.split=1;g.makeOffer('boss');assert(g.run.offer.some(p=>p.id==='net'));assert(g.choose('net'));assert.equal(g.level('net'),1);assert(!g.available().some(p=>p.id==='net'));
});
test('free reroll survives reload, preserves selection count and cannot repeat',()=>{
 const g=marble();g.makeOffer('upgrade');const count=g.run.selections;assert(g.reroll());assert.equal(g.run.selections,count);const next=new MarbleGame();assert(next.run.rerolled);assert.deepEqual(next.run.offer,g.run.offer);assert.equal(next.reroll(),false);
});
test('rail doubles one charged direct boss hit and never buffs children',()=>{
 const g=marble();g.run.powers={rail:1,bounce:1,core:1};g.shoot(0);const boss={id:1000,type:'boss',x:50,y:50,r:20,hp:1000},ball={child:false,wallBounces:2};g.damage(boss,'direct',ball);const charged=1000-boss.hp;g.damage(boss,'direct',ball);assert.equal(charged,2*(1000-charged-boss.hp));assert.equal(ball.wallBounces,0);
 const child={child:true,wallBounces:2};const before=boss.hp;g.damage(boss,'direct',child);assert(boss.hp>before-charged/2);
});
test('ice burst reaches beyond the first blast but does not recursively explode',()=>{
 const g=marble();g.run.powers={iceburst:1};g.shoot(0);g.run.room.enemies=[{id:1,type:'spirit',kind:'normal',x:115,y:100,r:4,frozen:true},{id:2,type:'spirit',kind:'bomb',x:150,y:100,r:4},{id:3,type:'spirit',kind:'normal',x:185,y:100,r:4}];g.explode(100,100,20);assert.equal(g.run.kills,2);assert(!g.run.room.enemies[2].dead);
});
test('every coop level has three unique feasible contract types',()=>{
 for(const level of Game.LEVELS){const o=C.offer(level,()=>.4);assert.equal(o.length,3);assert.equal(new Set(o.map(x=>x.id)).size,3);if(!(level.rooms||[level]).some(r=>r.memorials?.length))assert(o.every(c=>!['keepsake','perfect'].includes(c.id)));}
 assert(C.achieved('perfect',{phase:'intermission',safeRun:true,memorialFound:true}));assert(!C.achieved('safe',{phase:'intermission',safeRun:false}));assert(!C.achieved('lead0',{phase:'intermission',contractFirstExit:-1}));
});
test('server contract tracks first final exit entrant; simultaneous arrival grants neither leader stamp',()=>{
 const w=Game.createWorld(0,1),exit=Game.stageFor(w).exit;w.players[0].x=exit.x+exit.w/2;w.players[0].y=exit.y+exit.h/2;C.track(w,Game);assert.equal(w.contractFirstExit,0);w.phase='intermission';assert(C.achieved('lead0',w));assert(!C.achieved('lead1',w));
});
test('synchronized exit contract uses server time and safe variant rejects resets',()=>{
 const w={phase:'intermission',elapsed:10,contractExitTime:7,safeRun:true};assert(C.achieved('together',w));assert(C.achieved('steady',w));w.elapsed=10.01;assert(!C.achieved('together',w));w.elapsed=10;w.safeRun=false;assert(!C.achieved('steady',w));assert(!C.achieved('together',{phase:'intermission',elapsed:0}));
});
