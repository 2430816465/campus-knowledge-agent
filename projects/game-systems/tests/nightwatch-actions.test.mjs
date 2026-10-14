import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../games/nightwatch/profile.js';
import {Battle,createBattle,abilityInterval} from '../games/nightwatch/battle.js';
import {heroAnimation,monsterAnimation,guardianAnimation,rollingRockPose} from '../games/nightwatch/scene-art.js';
import {MONSTERS,WORLD,STAGES} from '../games/nightwatch/data.js';

const animations=Object.fromEntries(MONSTERS.flatMap(d=>[[d.id,{count:8}],[d.id+'-attack',{count:8,releaseFrame:d.id==='skeleton'?3:4}]]));
function fixture(){const p=fresh(),s=createBattle(p);s.waiting=1000;s.wave=1;s.abilities={};s.partnerClock=s.wallClock=1000;s.stats.crit=0;const events=[],engine=new Battle(s,p,x=>events.push(x));return {p,s,engine,events};}
function advance(engine,seconds){for(let left=seconds;left>1e-8;){const dt=Math.min(1/120,left);engine.step(dt);left-=dt;}}

test('both guardians finish the eight-frame action and stand ready until their buff expires',()=>{
 for(const summon of ['golem','dragon']){const {s,engine}=fixture();s.summon=summon;assert.equal(engine.summon(),true);
  const frames=new Set();for(let i=0;i<64;i++){frames.add(guardianAnimation(s,animations).frame);advance(engine,.01);}
  assert.deepEqual([...frames].sort(),[0,1,2,3,4,5,6,7]);advance(engine,.02);
  const idle=guardianAnimation(s,animations);assert.equal(idle.action,'idle');assert.equal(idle.frame,0);assert.equal(idle.name,(summon==='golem'?'rock_golem':'dragon')+'-attack');
  s.paused=true;const held=guardianAnimation(s,animations);advance(engine,2);assert.deepEqual(guardianAnimation(s,animations),held);
  assert.deepEqual(guardianAnimation(JSON.parse(JSON.stringify(s)),animations),held);s.paused=false;advance(engine,9);assert.equal(guardianAnimation(s,animations),null);
 }
});

test('rolling rocks rotate by ground travel and preserve physical size, damage and saved phase',()=>{
 const {s,engine}=fixture();s.abilities.rock={level:1,damage:0,cooldown:0};const e=engine.spawn('rock_golem',210,180);e.hp=e.maxHp=1e8;e.attackClock=e.special=1000;
 assert.equal(engine.cast('rock'),true);const p=s.projectiles[0],before=rollingRockPose(p);assert.equal(before.angle,0);assert.equal(before.radius,24);
 advance(engine,.2);const after=rollingRockPose(s.projectiles[0]);assert.ok(Math.abs(after.travel-30)<1e-8);assert.ok(Math.abs(after.angle-30/24)<1e-8);assert.equal(after.y,WORLD.wallY-30);
 assert.deepEqual(rollingRockPose(JSON.parse(JSON.stringify(s.projectiles[0]))),after);s.paused=true;advance(engine,1);assert.deepEqual(rollingRockPose(s.projectiles[0]),after);assert.equal(rollingRockPose(s.projectiles[0],true).angle,0);
});

test('every monster has distance-driven locomotion, anticipation, contact and recovery',()=>{
 for(const d of MONSTERS){const {engine}=fixture(),e=engine.spawn(d.id,200,WORLD.wallY-d.radius);e.special=1000;
  const poses=new Set();for(let i=0;i<24;i++){e.attackClock=.24-i*.01;e.attackPose=0;poses.add(monsterAnimation(e,animations).frame);}
  for(let i=0;i<32;i++){e.attackPose=.32-i*.01;const pose=monsterAnimation(e,animations);assert.equal(pose.name,d.id+'-attack');poses.add(pose.frame);}
  assert.deepEqual([...poses].sort(),[0,1,2,3,4,5,6,7],d.id);e.attackPose=0;e.attackClock=1;assert.equal(monsterAnimation(e,animations).action,'idle');
  e.y=100;e.walkDistance=0;const first=monsterAnimation(e,animations).frame;e.walkDistance=9;assert.notEqual(monsterAnimation(e,animations).frame,first);
 }
});
test('melee anticipates contact while ranged casters finish walking before planting their feet',()=>{
 for(const id of ['orc_warrior','guard_mid','skeleton']){const {engine}=fixture(),e=engine.spawn(id,200,0);
  e.y=WORLD.wallY-e.radius-4-e.speed*.12;e.attackClock=-5;e.special=1000;
  const pose=monsterAnimation(e,animations);assert.equal(pose.name,id+'-attack');assert.equal(pose.action,'windup');assert.ok(pose.frame>=1&&pose.frame<=2);
 }
 for(const id of ['mage_red','mage_low','dragon']){const {engine}=fixture(),e=engine.spawn(id,200,299);e.attackClock=-5;e.special=1000;assert.equal(monsterAnimation(e,animations).action,'walk');}
});
test('hero plays all eight frames at ordinary and maximum rate; release is actual shot time',()=>{
 for(const interval of [.62,.3,.14]){const b={time:0,heroShotAt:-10,heroShotInterval:interval,heroReleaseInterval:interval,cooldowns:{bolt:interval},enemies:[{hp:1,y:100}]},seen=[];
  for(let t=0;t<interval*3;t+=.001){b.time=t;const shot=Math.floor((t+1e-9)/interval);b.heroShotAt=shot?shot*interval:-10;b.cooldowns.bolt=interval-(t%interval);const p=heroAnimation(b,{count:8,releaseFrame:3});if(p.action==='shoot'&&seen.at(-1)!==p.frame)seen.push(p.frame);}
  assert.deepEqual(seen.slice(0,8),[0,1,2,3,4,5,6,7]);b.time=interval;b.heroShotAt=interval;assert.equal(heroAnimation(b,{count:8,releaseFrame:3}).frame,3);
  b.enemies=[];b.heroShotAt=-10;b.cooldowns.bolt=.01;assert.equal(heroAnimation(b).action,'idle');
 }
});
test('hero actual launch frequency stays unchanged at ordinary and maximum rate',()=>{
 for(const speed of [0,100]){const {s,engine}=fixture();s.abilities={bolt:{level:1,damage:0,cooldown:0}};s.stats.speed=speed;s.cooldowns.bolt=.2;const e=engine.spawn('rock_golem',240,100);e.hp=e.maxHp=1e8;e.speed=0;const releases=[];let previous=-10;
  for(let i=0;i<800;i++){engine.step(.005);if(s.heroShotAt!==previous&&s.heroShotAt>=0){previous=s.heroShotAt;releases.push(s.time);assert.equal(heroAnimation(s).frame,3);}}
  assert.ok(releases.length>5);for(let i=1;i<releases.length;i++)assert.ok(Math.abs(releases[i]-releases[i-1]-abilityInterval(s,'bolt'))<.00501);
 }
});
test('ranged spell damages exactly once on arrival, including after its caster dies',()=>{
 const {s,engine,events}=fixture(),e=engine.spawn('mage_red',230,350);e.attackClock=0;const wall=s.wall,damage=e.attack;
 engine.step(.001);assert.equal(s.wall,wall);assert.equal(s.enemyShots.length,1);const duration=s.enemyShots[0].duration;e.hp=0;
 advance(engine,duration-.01);assert.equal(s.wall,wall);advance(engine,.02);assert.ok(Math.abs(wall-s.wall-damage)<1e-8);assert.equal(s.enemyShots.length,0);assert.equal(events.filter(x=>x==='wallhit').length,1);
 advance(engine,1);assert.equal(events.filter(x=>x==='wallhit').length,1);
});
test('final victory waits for pending spells; lethal arrival defeats instead of granting victory',()=>{
 for(const lethal of [false,true]){const {s,engine}=fixture();s.waiting=0;s.wave=STAGES[0].waves;s.waveCount=s.spawned=10;s.waveTime=10;const e=engine.spawn('mage_low',200,350);e.attackClock=0;if(lethal)s.wall=1;engine.step(.001);e.hp=0;engine.step(.001);assert.equal(s.status,'playing');advance(engine,.6);assert.equal(s.status,lethal?'defeated':'result');}
});
test('pause stops flying spells, animation clocks and damage; saved flights resume once',()=>{
 const {p,s,engine}=fixture(),e=engine.spawn('dragon',200,360);e.attackClock=0;engine.step(.001);s.paused=true;const frozen=JSON.stringify(s);engine.step(5);assert.equal(JSON.stringify(s),frozen);
 const saved=JSON.parse(frozen);saved.paused=false;saved.enemies=[];const resumed=new Battle(saved,p);const wall=saved.wall;advance(resumed,.6);assert.ok(Math.abs(wall-saved.wall-e.attack)<1e-8);assert.equal(saved.enemyShots.length,0);
});
test('freeze holds attack recovery, cooldown and elite dash without discarded travel',()=>{
 const {s,engine}=fixture(),e=engine.spawn('skeleton_elite',200,100);e.special=0;e.attackPose=.22;engine.step(.01);const x={y:e.y,dash:e.dashRemaining,pose:e.attackPose,clock:e.attackClock,travel:e.walkDistance};e.freeze=.5;
 advance(engine,.3);assert.equal(e.y,x.y);assert.equal(e.dashRemaining,x.dash);assert.equal(e.attackPose,x.pose);assert.equal(e.attackClock,x.clock);assert.equal(e.walkDistance,x.travel);
 e.freeze=0;advance(engine,.23);assert.ok(Math.abs(e.y-100-e.speed*.24-35)<1e-7);assert.ok(Math.abs(e.walkDistance-(e.y-100))<1e-7);assert.equal(e.dashRemaining,0);assert.equal(s.status,'playing');
});
test('elite dash is continuous while retaining 35 pixels and seven-second interval',()=>{
 const {engine}=fixture(),e=engine.spawn('skeleton_elite',200,100);e.special=0;let previous=e.y;for(let i=0;i<24;i++){engine.step(.01);assert.ok(e.y-previous<2);previous=e.y;}assert.ok(Math.abs(e.y-100-e.speed*.24-35)<1e-7);assert.ok(Math.abs(e.special-6.77)<1e-7);
});
test('boss summoning exposes the same release frame and preserves spawn count',()=>{
 const {engine,s}=fixture(),e=engine.spawn('knight_black',240,200);e.special=.02;e.attackClock=5;assert.equal(monsterAnimation(e,animations).action,'summon-windup');engine.step(.021);assert.equal(s.enemies.length,4);const pose=monsterAnimation(e,animations);assert.equal(pose.action,'summon');assert.equal(pose.frame,4);
});

test('casters plant feet throughout full windup/recovery and keep their three-second release interval',()=>{
 for(const id of ['mage_red','mage_low','dragon']){const {s,engine}=fixture(),e=engine.spawn(id,200,350);e.special=1000;e.attackClock=.24;s.wall=s.stats.health=1e8;
  let castY=null,previousClock=e.attackClock;const frames=new Set(),releases=[];
  for(let i=0;i<1400;i++){
   const beforeY=e.y,beforePose=monsterAnimation(e,animations);engine.step(.005);const pose=monsterAnimation(e,animations);
   if(e.attackClock>previousClock)releases.push(s.time);previousClock=e.attackClock;
   if(pose.action==='walk'){castY=null;if(beforePose.action==='walk')assert.ok(Math.abs(e.y-beforeY-e.speed*.005)<1e-8);}
   else {castY??=e.y;assert.equal(e.y,castY,id+' planted while casting');frames.add(pose.frame);}
  }
  assert.deepEqual([...frames].sort(),[0,1,2,3,4,5,6,7]);assert.ok(releases.length>=3);for(let i=1;i<releases.length;i++)assert.ok(Math.abs(releases[i]-releases[i-1]-3)<.006);
 }
});
test('first ranged windup, freeze and save/resume retain the same planted position and spell timing',()=>{
 const {p,s,engine}=fixture(),e=engine.spawn('mage_red',200,299);e.attackClock=-5;e.special=1000;
 while(e.y<=300)engine.step(.005);assert.equal(e.y,300.01);assert.ok(Math.abs(e.attackClock-.24)<1e-9);assert.equal(monsterAnimation(e,animations).frame,0);assert.equal(s.enemyShots.length,0);
 advance(engine,.1);e.freeze=.5;const held={y:e.y,clock:e.attackClock,pose:monsterAnimation(e,animations)};advance(engine,.3);assert.equal(e.y,held.y);assert.equal(e.attackClock,held.clock);assert.deepEqual(monsterAnimation(e,animations),held.pose);
 const saved=JSON.parse(JSON.stringify(s)),restored=new Battle(saved,p);for(let i=0;i<100;i++){engine.step(.005);restored.step(.005);assert.deepEqual(saved.enemies,s.enemies);assert.deepEqual(saved.enemyShots,s.enemyShots);assert.equal(saved.wall,s.wall);}
 assert.equal(e.y,300.01);assert.ok(e.attackPose>0);assert.equal(s.enemyShots.length,1);
 advance(engine,.3);assert.ok(e.y>300.01);assert.ok(e.y<300.01+e.speed*.3);
});
test('all bosses stand through summoning and resume at normal speed after recovery',()=>{
 for(const id of ['vampire','knight_black','dragon']){const {s,engine}=fixture(),e=engine.spawn(id,240,200);e.attackClock=1000;e.special=.24;
  advance(engine,.5);assert.equal(e.y,200);assert.equal(s.enemies.length,4);assert.ok(e.specialPose>0);const special=e.special,pose=e.specialPose;e.freeze=.3;advance(engine,.2);assert.equal(e.special,special);assert.equal(e.specialPose,pose);assert.equal(e.y,200);
  e.freeze=0;advance(engine,.2);assert.ok(e.y>200);assert.ok(e.y<200+e.speed*.2);assert.ok(Math.abs(e.special-8.54)<.02);
 }
});
