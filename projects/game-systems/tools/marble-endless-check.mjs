import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state.js';
import {MarbleGame as V3} from '../games/marble/state-v3.js';
import {pressure,ENDLESS as C,RARITIES,POWERS,nextPower,offerEffect,EVOLUTIONS} from '../games/marble/endless-data.js';
import {nextCollision} from '../games/marble/physics.js';
const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
const game=seed=>{const g=new MarbleGame();g.newRun(seed);return g};
const advance=g=>{for(let i=0;i<50&&['flight','descent'].includes(g.run.phase);i++)g.advance(250)};
const choose=g=>{while(g.run.phase==='reward'){if(g.run.offerType==='imprint')g.chooseImprint('nova');else g.choose(g.run.offer[0].id)}};
const g=game(22),same=game(22);assert.deepEqual(g.run.room,same.run.room);assert.equal(g.run.queue.length,1);assert.ok(g.run.room.enemies.every(e=>!('hp' in e)));assert.equal(g.run.room.width,640);assert.ok(g.run.room.obstacles.length>0);
assert.equal(g.run.room.enemies.length,C.startEnemies);assert.equal(pressure(0).target,C.startEnemies);assert.ok(pressure(10).target<pressure(30).target&&pressure(30).target<pressure(60).target);assert.ok(pressure(70).target<=C.maxEnemies);
for(const side of [-1,1]){const aim=game(31+side);aim.startAim(320,300);assert.ok(aim.fire(320+side*280,338));assert.ok(side*aim.run.volley.angle>1.5);aim.advance(30);assert.ok(side*aim.run.volley.balls[0].vx>0);}
const downAim=game(37);downAim.startAim(320,300);assert.equal(downAim.fire(400,350),false);assert.equal(downAim.run.phase,'aim');
const older=game(38);older.run.revision=2;older.spawn(200,true);older.persist();const migrated=new MarbleGame();assert.equal(migrated.run.revision,3);assert.equal(migrated.run.room.enemies.length,C.startEnemies);
g.run.room.enemies=[{id:1000,type:'spirit',kind:'normal',x:320,y:280,r:4,dead:false}];g.run.room.obstacles=[];g.shoot(0);advance(g);assert.equal(g.run.kills,1);assert.equal(g.run.shot,1);assert.ok(g.audioEvents>0);assert.equal(g.canUndo(),false);assert.equal(g.undo(),false);assert.equal(g.toggleStrong(),false);
const paused=game(23);paused.shoot(.5);paused.paused=true;paused.advance(250);assert.equal(paused.run.volley.elapsed,0);paused.paused=false;paused.advance(250);const loaded=new MarbleGame();assert.equal(loaded.run.phase,'aim');assert.equal(loaded.run.shot,0);
const leak=game(24);leak.run.room.enemies=[{id:1,type:'spirit',kind:'normal',x:40,y:320,r:4},{id:2,type:'boss',x:510,y:310,r:23,hp:50,maxHp:50}];leak.shoot(0);leak.earlyRecall();advance(leak);assert.equal(leak.run.hp,7);leak.run.hp=1;leak.run.room.enemies=[{id:3,type:'spirit',kind:'normal',x:30,y:321,r:4}];leak.shoot(0);leak.earlyRecall();advance(leak);assert.equal(leak.run.phase,'failed');assert.equal(leak.rescue(),false);
const schedule=game(3),arr=[];for(let i=0;i<66;i++){choose(schedule);schedule.run.room.enemies=[];schedule.shoot(0);schedule.earlyRecall();advance(schedule);if(schedule.run.room.enemies.some(e=>e.type==='boss'))arr.push(schedule.run.shot)}assert.deepEqual(arr,[15,28,39,48,55,60,65]);
// XP is conserved, thresholds rise, and an overfull bar cannot award every shot.
const xp=game(4);xp.run.xp=10000;xp.run.shot=2;xp.offerNext();assert.equal(xp.run.phase,'aim');xp.run.shot=3;const need=xp.run.xpNeed;xp.offerNext();assert.equal(xp.run.xp,10000-need);assert.ok(xp.run.xpNeed>need);choose(xp);assert.equal(xp.run.phase,'aim');xp.run.shot=4;xp.offerNext();assert.equal(xp.run.phase,'aim');
// Four rarity levels actually change effects, not only the border color.
for(const p of POWERS.filter(p=>!EVOLUTIONS[p.id])){const effects=[0,1,2,3].map(t=>offerEffect(p.id,0,t));assert.equal(new Set(effects).size,4,p.id)}
const counts=[0,0,0,0];for(let i=0;i<40000;i++)counts[g.rollTier()]++;counts.forEach((n,i)=>assert.ok(Math.abs(n/400-RARITIES[i].weight)<1.5));
const tier=game(32);tier.run.selections=2;tier.makeOffer('upgrade');tier.run.offer=[{id:'fire',tier:1},{id:'extra',tier:3},{id:'pierce',tier:0}];assert.ok(tier.canAdHelp('tier'));assert.equal(tier.canRaise(tier.run.offer[1]),false);assert.equal(tier.grantAssist('tier','ad','fire',999),false);assert.ok(tier.grantAssist('tier','fallback','fire',tier.run.offerSerial));assert.equal(tier.run.offer[0].tier,2);assert.equal(tier.grantAssist('tier','ad','pierce',tier.run.offerSerial),false);tier.persist();const reload=new MarbleGame();assert.deepEqual(reload.run.offer,tier.run.offer);assert.equal(reload.canAdHelp('tier'),false);assert.ok(reload.choose('fire'));assert.equal(reload.run.powers.fire,4);assert.equal(reload.run.owned.fire.tier,2);
// Both tactical assists share one use. Freeze includes bosses and lasts one descent.
const freeze=game(3);freeze.run.room.enemies=[{id:1,type:'boss',x:80,y:200,r:23,hp:50,maxHp:50}];assert.ok(freeze.grantAssist('freeze'));assert.equal(freeze.canAdHelp('extraChoice'),false);freeze.shoot(0);freeze.earlyRecall();advance(freeze);assert.equal(freeze.run.room.enemies.find(e=>e.id===1).y,200);assert.equal(freeze.run.freezeNext,false);freeze.shoot(0);freeze.earlyRecall();advance(freeze);assert.ok(freeze.run.room.enemies.find(e=>e.id===1).y>200);
const extra=game(3),oldXp=extra.run.xp;assert.ok(extra.grantAssist('extraChoice'));assert.equal(extra.run.offerType,'ad');assert.equal(extra.run.xp,oldXp);choose(extra);assert.equal(extra.canAdHelp('freeze'),false);
// Physical reflection consumes durability; zero-durability obstacles cease colliding.
const ob=game(3);ob.run.room.enemies=[];ob.run.room.obstacles=[{id:'o1',x:320,y:280,r:12,hits:1,maxHits:3,kind:0}];ob.shoot(0);ob.advance(120);assert.equal(ob.run.room.obstacles[0].hits,0);assert.ok(ob.run.volley.balls[0].vy>0);assert.notEqual(nextCollision(ob.run.room,{x:320,y:344,vx:0,vy:-540,r:5},1)?.kind,'obstacle');
const combo=game(8);combo.run.powers=Object.fromEntries(POWERS.filter(p=>p.id!=='heal').map(p=>[p.id,p.max]));combo.run.queue=Array(C.maxMain).fill('basic');combo.run.room.enemies=[];combo.spawn(500,true);combo.shoot(.12);advance(combo);assert.ok(combo.run.kills>25);assert.ok(combo.run.volley.generated<=C.maxBalls);assert.ok(combo.run.volley.elapsed<=C.flight+.01);assert.ok(combo.fx.length<=C.fxCap);
const noRecursion=game(1);noRecursion.run.room.enemies=Array.from({length:4},(_,i)=>({id:i+1,type:'spirit',kind:'bomb',x:100+i*30,y:100,r:4}));noRecursion.shoot(0);noRecursion.explode(100,100,35);assert.equal(noRecursion.run.kills,2);assert.equal(noRecursion.run.volley.generated,0);
assert.ok(pressure(160).drop>pressure(35).drop*3);assert.ok(pressure(160).bossHp>pressure(35).bossHp*5);const combatSummary={kills:combo.run.kills,generated:combo.run.volley.generated};combo.run.kills=100000;combo.run.bossKills=100;combo.finish();assert.equal(combo.reward(),40);assert.equal(combo.bonusValue(),12);
const old=new V3();old.newRun(8);old.persist();const compatible=new MarbleGame();assert.equal(compatible.run.version,3);compatible.shoot(.3);advance(compatible);assert.notEqual(compatible.run.phase,'flight');
console.log(JSON.stringify({ok:true,bossSchedule:arr,rarityCounts:counts,combatSummary,oldSaveVersion:compatible.run.version}));


