import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state-v2.js';
import {RELICS,TUNING,relicChoices} from '../games/marble/data.js';

const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const fresh=()=>{storage.clear();const g=new MarbleGame();g.newRun(42);return g};
const fly=(g,a)=>{assert(g.shoot(a));for(let i=0;i<760&&g.run.phase==='flight';i++)g.step(1/120);assert.notEqual(g.run.phase,'flight')};
const chest=g=>{g.run.roomIndex=2;g.run.sequence[2]='R06';g.enterRoom(2);g.run.room.enemies.forEach(e=>e.hp=0);g.run.phase='shotEnd';g.clearRoom()};
const hp=g=>g.run.room.enemies.reduce((n,e)=>n+e.hp,0);

{
 const g=fresh();g.run.room.enemies[0].hp=g.run.room.enemies[0].maxHp=100;g.shoot(0);const b=g.ball,e=g.run.room.enemies[0];b.x=e.x;b.y=e.y+e.r+7;g.hitEnemy(e,b);assert.equal(b.combo,1);assert.equal(g.run.energy,12);assert.equal(g.run.bestCombo,1);g.onHit({kind:'wall',nx:0,ny:1});assert.equal(g.run.energy,12);assert.equal(b.combo,1);g.earlyRecall();assert.equal(g.run.energy,12);
 g.run.energy=100;assert(g.toggleStrong());g.startAim(180,500);g.cancelAim();assert.equal(g.run.energy,100);g.shoot(0);assert.equal(g.run.energy,0);assert.equal(g.ball.limit,10);assert(g.ball.strong);const before=e.hp;g.ball.x=e.x;g.ball.y=e.y+e.r+7;g.hitEnemy(e,g.ball);assert.equal(before-e.hp,12);assert.equal(g.run.energy,0);g.earlyRecall();assert(g.undo());assert.equal(g.run.energy,100,'undo restores strong cost');
}
{
 const g=fresh();g.run.room.enemies=[1,2,3].map(id=>({id,type:'guard',x:100*id,y:200,r:22,hp:1,maxHp:1,clock:2}));g.shoot(0);const b=g.ball;b.hits=7;const enemy=g.run.room.enemies[0];g.onHit({kind:'enemy',id:enemy.id,nx:0,ny:1});assert.equal(b.refunds,1);assert.equal(b.limit,9);assert.equal(g.run.phase,'flight','last collision kill refunds before cap');for(const e of g.run.room.enemies.slice(1))g.applyDamage(e,1,'crystal',b);assert.equal(b.refunds,2);assert.equal(b.limit,10);assert.equal(b.kills,3);assert.equal(g.run.energy,12,'indirect kills add no energy');g.earlyRecall();assert.equal(g.run.phase,'reward')
}
{
 const g=fresh();g.run.relics=RELICS.map(x=>({id:x.id,tier:2}));g.run.room.enemies=[{id:1,type:'guard',x:160,y:200,r:22,hp:10,maxHp:10,clock:2},{id:2,type:'guard',x:200,y:200,r:22,hp:4,maxHp:4,clock:2}];g.run.hp=20;g.shoot(0);const b=g.ball;b.x=160;b.y=229;g.onHit({kind:'wall',nx:0,ny:1});g.hitEnemy(g.run.room.enemies[0],b);assert.equal(g.run.room.seedUsed,true);assert.equal(g.run.hp,23);assert.equal(b.emberUsed,true);assert.equal(g.run.room.enemies[1].hp,0);assert.equal(b.combo,1);assert.equal(g.run.energy,12);assert.equal(b.kills,2);g.earlyRecall()
}
{
 const g=fresh();g.meta.pity=4;chest(g);assert.equal(g.run.offerType,'relic');assert.equal(new Set(g.run.offer.map(x=>x.id)).size,3);assert(g.run.offer.some(x=>x.tier===2));assert.equal(g.meta.pity,0);const old=structuredClone(g.run.offer),plays=g.meta.chestRuns.length;g.load();assert.deepEqual(g.run.offer,old);assert.equal(g.meta.chestRuns.length,plays);assert(g.openChest());assert(g.selectRelic(old[0].id));const selected=g.run.relicSelected;assert.equal(g.run.relics.length,1);if(selected.tier<2){const before=selected.tier;assert(g.upgradeRelic('fallback'));assert.equal(selected.tier,before+1);assert.equal(g.upgradeRelic('fallback'),false);assert.equal(g.run.help.records[0].source,'fallback')}assert(g.continueRelic());assert.equal(g.run.roomIndex,3)
}
{
 const sample=Array.from({length:10000},(_,i)=>relicChoices(i,0)).flat();const counts=[0,1,2].map(t=>sample.filter(x=>x.tier===t).length/sample.length);assert(Math.abs(counts[0]-.70)<.02);assert(Math.abs(counts[1]-.25)<.02);assert(Math.abs(counts[2]-.05)<.01);assert(Array.from({length:200},(_,i)=>relicChoices(i,4)).every(items=>items.some(x=>x.tier===2)))
}
{
 const g=fresh();g.run.energy=80;delete g.run.bestCombo;delete g.run.relics;delete g.run.challenge;delete g.run.help.used;g.run.version=1;g.persist();storage.set('adventure-camp-demo-v1',JSON.stringify({coins:777}));const restored=new MarbleGame();assert.equal(restored.run.bestCombo,0);assert.deepEqual(restored.run.relics,[]);assert.equal(restored.run.energy,80);assert.equal(JSON.parse(storage.get('adventure-camp-demo-v1')).coins,777)
}
{
 const g=fresh();g.meta.challengeUnlocked=true;assert(g.newRun(42,true));assert.equal(g.run.sequence[1],'E02');assert.equal(g.run.sequence[3],'E04');const route={};for(let room=0;room<5;room++){const id=g.run.room.id;route[id]=[];for(let turn=0;turn<14&&g.run.phase==='aim';turn++){const before=hp(g),oldHp=g.run.hp;let best=null;for(let i=0;i<=92;i++){const angle=-1.1+i*2.2/92,t=new MarbleGame();t.run=structuredClone(g.run);t.paused=false;fly(t,angle);if(t.run.phase==='failed')continue;const clear=['reward','result'].includes(t.run.phase),score=(before-hp(t))*10-(oldHp-t.run.hp)*2+(clear?1000:0);if(!best||score>best.score)best={angle,score}}assert(best,`no viable no-ad shot in ${id}`);route[id].push(+best.angle.toFixed(3));fly(g,best.angle)}assert(['reward','result'].includes(g.run.phase),`challenge stuck in ${id}`);if(g.run.phase==='reward'){if(g.run.offerType==='relic'){g.openChest();g.selectRelic(g.run.offer[0].id);g.continueRelic()}else g.choose(g.run.offer[0])}}assert.equal(g.run.win,true);assert.equal(g.run.help.used,0);assert(g.reward()>26);assert(g.reward()<=TUNING.challengeRewardCap);console.log('challenge no-ad route',JSON.stringify(route))
}
console.log('marble v2 mechanics passed');

