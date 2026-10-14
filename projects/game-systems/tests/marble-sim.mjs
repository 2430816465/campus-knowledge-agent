import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state-v2.js';
import {ROOMS,ENEMIES} from '../games/marble/data.js';
import {nextCollision} from '../games/marble/physics.js';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const copy=x=>structuredClone(x);
const make=(id='R01')=>{storage.clear();const g=new MarbleGame();g.newRun(42);g.run.sequence[0]=id;g.enterRoom(0);return g};
const fly=(g,a)=>{g.shoot(a);for(let i=0;i<760&&g.run.phase==='flight';i++)g.step(1/120);assert.notEqual(g.run.phase,'flight','shot must terminate');return g};
const hp=g=>g.run.room.enemies.reduce((n,e)=>n+e.hp,0);
assert.equal(Object.keys(ROOMS).length,14);
assert(nextCollision({walls:[{x:140,y:100,w:40,h:20}],door:null,columns:[],enemies:[]}, {x:160,y:200,vx:0,vy:-5000},1/30)?.kind==='rect','swept wall collision');
{
 const g=make();fly(g,0);assert.equal(g.run.phase,'reward');assert.equal(g.run.pending.clear,4);assert.equal(g.run.hp,30);assert.equal(g.run.room.enemies[0].hp,0);
 const offer=copy(g.run.offer);g.load();assert.deepEqual(g.run.offer,offer,'refresh keeps choices');g.choose(offer[0]);assert.equal(g.run.roomIndex,1)
}
{
 const g=make('R01');g.run.room.enemies[0].hp=18;fly(g,.7);assert(g.canUndo());assert(g.undo());assert.equal(g.run.help.freeUndo,1);assert.equal(g.undo(),false);assert.equal(g.run.room.enemies[0].hp,18)
}
{
 const g=make('R06');assert.equal(g.run.room.doorOpen,false);let reached=false;for(let a=-1.1;a<=1.1;a+=.03){const h=make('R06');fly(h,a);if(h.run.room.doorOpen){reached=true;break}}assert(reached,'switch must be reachable by real shot')
}
const witnesses={};
for(const id of Object.keys(ROOMS)){
 const base=make(id);let run=copy(base.run),angles=[];
 for(let turn=0;turn<12&&run.phase==='aim';turn++){
  const before=run.room.enemies.reduce((n,e)=>n+e.hp,0),oldHp=run.hp;let best=null;
  for(let i=0;i<=92;i++){
   const angle=-1.1+i*2.2/92,g=make(id);g.run=copy(run);fly(g,angle);
   const damage=before-hp(g),loss=oldHp-g.run.hp,clear=g.run.phase==='reward'||g.run.phase==='result';
   const value=damage*10-loss*2+(clear?1000:0)+(g.run.room.chestOpen&&!run.room.chestOpen?2:0);
   if(g.run.phase==='failed'&&!clear)continue;
   if(!best||value>best.value)best={value,angle,run:copy(g.run),damage};
  }
  if(!best)break;run=best.run;angles.push(+best.angle.toFixed(3));if(run.phase==='reward'||run.phase==='result')break;
 }
 witnesses[id]={clear:run.phase==='reward'||run.phase==='result',angles,hp:run.hp,remaining:run.room.enemies.reduce((n,e)=>n+e.hp,0)};
}
console.log(JSON.stringify(witnesses,null,2));
assert(Object.values(witnesses).every(x=>x.clear),'every room has a sampled no-upgrade route');
{
 const g=make(),route={};
 for(let room=0;room<5;room++){
  const id=g.run.room.id;
  route[id]=[];
  for(let turn=0;turn<12&&g.run.phase==='aim';turn++){
   const before=hp(g),oldHp=g.run.hp;let best=null;
   for(let i=0;i<=92;i++){
    const angle=-1.1+i*2.2/92,trial=make(id);trial.run=copy(g.run);fly(trial,angle);
    if(trial.run.phase==='failed')continue;
    const clear=trial.run.phase==='reward'||trial.run.phase==='result';
    const value=(before-hp(trial))*10-(oldHp-trial.run.hp)*2+(clear?1000:0);
    if(!best||value>best.value)best={angle,value};
   }
   assert(best,`no viable shot in ${id}`);route[id].push(+best.angle.toFixed(3));fly(g,best.angle);
  }
  assert(['reward','result'].includes(g.run.phase),`full first run stuck in ${id}`);
  if(g.run.phase==='reward'){if(g.run.offerType==='relic'){assert(g.openChest());assert(g.selectRelic(g.run.offer[0].id));assert(g.continueRelic())}else assert(g.choose(g.run.offer[0]))}
 }
 assert.equal(g.run.phase,'result');assert.equal(g.run.win,true);assert.equal(g.run.roomsCleared,5);assert.equal(g.run.pending.clear,20);assert.equal(g.run.pending.boss,6);console.log('first full run',JSON.stringify(route));
}
{
 const hits=[];for(let a=-.06;a<=.06;a+=.02){const g=make();fly(g,a);hits.push(g.run.phase==='reward')}assert(hits.filter(Boolean).length>=5,'R01 has a non-pixel-perfect aiming window');
}
{
 const outcomes=[];for(let delta=-.02;delta<=.021;delta+=.01){const g=make('R03'),angle=-1.1+56*2.2/92+delta;fly(g,angle);let turns=1;for(;turns<4&&g.run.phase==='aim';turns++){let best=null;for(let i=0;i<=92;i++){const a=-1.1+i*2.2/92,t=make('R03');t.run=copy(g.run);fly(t,a);const value=(hp(g)-hp(t))*10+(t.run.phase==='reward'?1000:0)-(g.run.hp-t.run.hp)*2;if(t.run.phase!=='failed'&&(!best||value>best.value))best={a,value}}if(!best)break;fly(g,best.a)}outcomes.push({delta:+delta.toFixed(2),clear:g.run.phase==='reward',turns,hp:g.run.hp})}console.log('R03 aiming margin',JSON.stringify(outcomes));assert(outcomes.filter(x=>x.clear).length>=4,'R03 should tolerate nearby aiming angles with adjusted follow-up');
}
{
 const g=make('R04'),enemy=g.run.room.enemies[0];let b={x:enemy.x,y:enemy.y+enemy.r+7,first:false,echoReady:false,echoUsed:false,pierced:false,burst:false};g.hitEnemy(enemy,b);assert.equal(enemy.hp,21,'front shield reduces ten to three');
 b={...b,x:enemy.x+enemy.r+7,y:enemy.y,first:false};g.hitEnemy(enemy,b);assert.equal(enemy.hp,11,'side hit deals full damage');
}
{
 const g=make('R08'),[guard,,priest]=g.run.room.enemies;guard.hp=8;priest.clock=1;g.run.phase='shotEnd';g.enemyTurn();assert.equal(guard.hp,14,'priest heals living ally before attacks');assert.equal(g.run.hp,30);
 guard.hp=0;priest.clock=1;g.run.room.enemies[1].hp=0;g.run.phase='shotEnd';g.enemyTurn();assert.equal(guard.hp,0,'priest never revives dead ally');
}
{
 const g=make('R01');g.run.room.enemies[0].hp=18;assert(g.shoot(.8));g.advance(250);const id=g.run.id;g.load();assert.equal(g.run.id,id);assert.equal(g.run.phase,'aim');assert.equal(g.run.room.enemies[0].hp,18);assert.equal(g.run.help.freeUndo,0,'refresh rollback costs no undo');
}
{
 const g=make('R05');g.run.hp=1;assert(g.shoot(1.1));g.earlyRecall();assert.equal(g.run.phase,'failed');assert(g.rescue());assert.equal(g.run.hp,12);assert.equal(g.run.help.rescue,1);assert.equal(g.run.phase,'aim');assert.equal(g.run.shotSnapshot,null);assert(g.run.room.enemies.every(e=>e.hp<=0||e.clock===ENEMIES[e.type].period));assert.equal(g.rescue(),false);
}
{
 const g=make('R01');g.run.room.enemies[0].hp=40;assert(g.shoot(.8));g.earlyRecall();const clock=g.run.room.enemies[0].clock;g.earlyRecall();assert.equal(g.run.room.enemies[0].clock,clock,'recall settles only once');assert(g.undo());assert.equal(g.run.help.freeUndo,1);assert(g.shoot(.8));g.earlyRecall();assert(g.undo(true));assert.equal(g.run.help.freeUndo,1);assert.equal(g.run.help.adUndo,1);assert.equal(g.undo(true),false);
}
{
 const g=make('R02');g.run.upgrades=['echo','first','core','burst'];const b={x:180,y:250,vx:0,vy:-430,hits:0,first:false,echoReady:false,echoUsed:false,pierced:false,burst:false};g.ball=b;g.onHit({kind:'rect',nx:0,ny:1});assert.equal(b.echoReady,true,'rectangular wall charges echo');const enemy=g.run.room.enemies[0];enemy.hp=enemy.maxHp=30;const before=enemy.hp;b.x=enemy.x;b.y=enemy.y+enemy.r+7;g.hitEnemy(enemy,b);assert.equal(before-enemy.hp,21,'base 10 + core 2 + first 5 + echo 4');
}

