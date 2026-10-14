import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state-endless.js';
import {ENDLESS as C,POWERS,EVOLUTIONS,RARITIES,stats,nextPower,volleyLimits,volleyXP,pressure,offerEffect} from '../games/marble/endless-data.js';
const saved=new Map();globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
const game=()=>{saved.clear();const g=new MarbleGame();g.newRun(77);return g};
test('rarity improves real effects and extra balls use epic/legendary fixed gains',()=>{
 assert.deepEqual(RARITIES.map(t=>t.points),[1,2,4,6]);
 assert.deepEqual([0,1,2,3].map(t=>stats('extra',nextPower('extra',0,t))),[1,1,2,3]);
 assert.deepEqual([0,1,2,3].map(t=>stats('core',nextPower('core',0,t))),[16,20,28,36]);
 assert.deepEqual([0,1,2,3].map(t=>stats('chain',nextPower('chain',0,t))[1]),[3,4,6,8]);
 for(const p of POWERS.filter(p=>!EVOLUTIONS[p.id]&&p.id!=='extra'))assert.equal(new Set([0,1,2,3].map(t=>offerEffect(p.id,0,t))).size,4,p.id);
 assert.equal(stats('extra',7),C.maxMain);assert.equal(stats('extra',5),6);assert.equal(stats('extra',6),7);
});
test('extra main balls increase shared budgets without copying complete ability stacks',()=>{
 const one=volleyLimits({fire:18,chain:18,split:12}),many=volleyLimits({extra:28,fire:18,chain:18,split:12,frost:18,net:1,iceburst:1});
 assert(many.fire>one.fire&&many.fire<one.fire*C.maxMain);assert(many.chain>one.chain&&many.chain<one.chain*C.maxMain);
 assert.equal(many.split,18);assert.equal(many.frost,1);assert.equal(many.net,2);assert.equal(many.iceburst,2);
 assert.equal(volleyLimits({extra:28,fire:18},'nova').fire,Math.ceil(many.fire/2));
 assert.equal(volleyLimits({extra:28,fire:18},'spark').fire,many.fire+2);
});
test('epic and legendary splits produce four and six children even on one main ball',()=>{
 for(const [tier,count] of [[2,4],[3,6]]){const g=game();g.run.powers.split=nextPower('split',0,tier);g.run.room.enemies=[{id:100,type:'spirit',kind:'normal',x:320,y:150,r:4}];g.shoot(0);const b=g.spawnBall(0);g.hit(g.run.room.enemies[0],b);assert.equal(g.run.volley.procs.split,count);assert.equal(g.run.volley.balls.filter(b=>b.child).length,count)}
 assert.match(offerEffect('bounce',0,3),/底部可反弹 2 次/);assert(!offerEffect('bounce',0,2).includes('底部可反弹 2 次'));
});
test('a real dense volley respects all proc, projectile, XP and lifetime bounds',()=>{
 const g=game(),r=g.run;r.room.enemies=[];r.room.obstacles=[];r.powers=Object.fromEntries(POWERS.filter(p=>p.id!=='heal').map(p=>[p.id,p.max]));r.queue=Array(C.maxMain).fill('basic');r.fireBranch='nova';g.spawn(650);g.shoot(-.23);
 for(let i=0;i<40&&['flight','descent'].includes(r.phase);i++)g.advance(250);
 const v=r.volley;assert(v.kills>150);assert(v.generated<=C.maxBalls);assert(v.elapsed<=C.flight+.01);assert(v.xpGain<=45);
 for(const [id,used] of Object.entries(v.procs))assert(used<=v.limits[id],id);
});
test('mass kills do not create mass experience or back-to-back drafts',()=>{
 const g=game(),r=g.run;r.room.enemies=[];g.shoot(0);
 for(let i=0;i<250;i++)g.damage({id:i,type:'spirit',kind:'normal',x:100,y:100,r:4},'blast');
 assert.equal(r.volley.rawXP,250);assert.equal(r.volley.xpGain,45);assert.equal(r.xp,45);assert.equal(volleyXP(24),24);assert.equal(volleyXP(100),37);
 r.shot=3;g.offerNext();const xp=r.xp;g.choose(r.offer[0].id);assert.equal(r.phase,'aim');assert.equal(r.xp,xp);assert.equal(r.selections,1);
 r.shot=4;g.offerNext();assert.equal(r.phase,'aim');
});
test('Boss gifts stay queued and cannot stack multiple combat drafts in one turn',()=>{
 const g=game(),r=g.run;r.shot=10;r.xp=1000;r.queuedBossRewards=2;g.offerNext();assert.equal(r.offerType,'boss');g.choose(r.offer[0].id);
 if(r.offerType==='imprint')g.chooseImprint('nova');assert.equal(r.phase,'aim');assert.equal(r.queuedBossRewards,1);assert.equal(r.xp,1000);
 r.shot=11;g.offerNext();assert.equal(r.offerType,'boss');assert.equal(r.queuedBossRewards,0);
});
test('first two drafts guarantee attack roles while keeping independent rarity rolls',()=>{
 const g=game(),r=g.run;g.makeOffer('upgrade');assert(!r.offer.some(p=>p.id==='extra'));assert(r.offer.some(p=>['fire','chain'].includes(p.id)));
 r.phase='aim';r.shot=6;g.makeOffer('upgrade');assert(r.offer.some(p=>p.id==='fire'));assert(r.offer.some(p=>['chain','split'].includes(p.id)));
});
test('a mass leak provides a reaction window rather than instant death',()=>{
 const g=game(),r=g.run;r.phase='descent';r.room.enemies=Array.from({length:40},(_,id)=>({id,type:'spirit',kind:'normal',x:30+id*10,y:325,r:4}));g.endDescent();
 assert.equal(r.hp,7);assert.deepEqual(r.lastLeak,{raw:40,damage:3});assert.notEqual(r.phase,'failed');
 r.hp=3;r.room.enemies=[{id:999,type:'boss',hp:999,maxHp:999,x:100,y:330,r:23}];g.endDescent();assert.equal(r.phase,'failed');
});
test('old endless saves retain health, XP and Boss health proportion, migrating ball counts',()=>{
 const g=game(),r=g.run;r.balanceRevision=1;r.shot=30;r.hp=4;r.xp=123;r.powers.extra=11;r.queue=Array(12).fill('basic');r.room.enemies=[{id:999,type:'boss',x:320,y:65,r:23,hp:25,maxHp:100,spawnShot:30}];g.persist();
 const loaded=new MarbleGame(),s=loaded.run;assert.equal(s.balanceRevision,4);assert.equal(s.hp,4);assert.equal(s.xp,123);assert.equal(s.queue.length,8);assert.equal(s.powers.extra,7);assert.equal(s.room.enemies[0].hp,Math.ceil(pressure(30).bossHp*.25));
 loaded.persist();assert.equal(new MarbleGame().run.queue.length,8);
});
test('enemy growth continues after finite ability growth and rewards remain capped',()=>{
 for(const key of ['spawnMin','drop','bossHp'])assert(pressure(90)[key]>pressure(50)[key]&&pressure(50)[key]>pressure(20)[key],key);
 const g=game();g.run.kills=99999;g.run.bossKills=99;g.finish();assert.equal(g.reward(),40);assert.equal(g.bonusValue(),12);
});

