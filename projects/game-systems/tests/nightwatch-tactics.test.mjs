import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,validateProfile} from '../games/nightwatch/profile.js';
import {createBattle,Battle,availableCards,selectCard} from '../games/nightwatch/battle.js';
import {WORLD,skillById} from '../games/nightwatch/data.js';
function fixture(){const p=fresh();p.frontier=30;const s=p.active=createBattle(p),engine=new Battle(s,p);s.abilities={};s.cooldowns={};s.waiting=s.partnerClock=s.wallClock=100;s.stats.crit=0;return {p,s,engine};}
function foe(engine,type='skeleton',x=240,y=260){const e=engine.spawn(type,x,y);e.hp=e.maxHp=10000;e.speed=0;e.attackClock=e.special=100;return e;}
test('aimed gravity gathers ordinary enemies but never displaces bosses or knock-immune golems',()=>{
 const {s,engine}=fixture();const e=foe(engine,'skeleton',180),boss=foe(engine,'vampire',290),golem=foe(engine,'rock_golem',310);
 s.aim={x:240,y:250};engine.cast('gravity');assert.equal(s.areas[0].x,240);engine.step(.1);
 assert(e.x>180);assert.equal(boss.x,290);assert.equal(golem.x,310);assert(boss.slow>0);assert(s.damage.gravity>0);
 s.upgrades['gravity-release']=1;const y=e.y;s.areas[0].t=.01;engine.step(.02);assert(e.y<y-40);assert.equal(golem.y,260);assert.equal(s.areas.length,0);
});
test('ward intercepts on crossing once, reflects to caster and repairs within three-charge capacity',()=>{
 const {s,engine}=fixture();const caster=foe(engine,'mage_red',200,320);engine.cast('ward');s.wall-=100;s.upgrades['ward-mend']=1;
 const shot=()=>({id:++s.entity,caster:caster.id,type:caster.type,x:200,y:320,damage:10,element:'fire',duration:.45,remaining:.45});s.enemyShots=Array.from({length:4},shot);
 const wall=s.wall,hp=caster.hp;engine.step(.4);assert.equal(s.intercepts,3);assert.equal(s.areas[0].charges,0);assert(caster.hp<hp);assert.equal(s.enemyShots.length,1);
 engine.step(.1);assert.equal(s.enemyShots.length,0);assert(Math.abs(s.wall-(wall+s.stats.health*.03-10))<1e-7);
 const after=s.wall;engine.step(.1);assert.equal(s.wall,after);
});
test('ward cannot protect melee attacks or a ranged flight outside its horizontal bounds',()=>{
 const {s,engine}=fixture();const melee=foe(engine,'skeleton',240,WORLD.wallY-18);melee.attackClock=0;engine.cast('ward');s.enemyShots=[{type:'mage_red',x:30,y:350,damage:10,element:'fire',duration:.2,remaining:.2}];const wall=s.wall;engine.step(.21);assert(s.wall<wall-10);assert.equal(s.intercepts||0,0);
});
test('ward remains useful after original caster dies, without missing-caster exception',()=>{
 const {s,engine}=fixture();foe(engine);engine.cast('ward');s.enemyShots=[{caster:999,type:'mage_low',x:240,y:320,damage:10,duration:.45,remaining:.45}];const wall=s.wall;engine.step(.5);assert.equal(s.wall,wall);assert.equal(s.intercepts,1);
});
test('mine has a full arming delay, triggers on three enemies, leaves frost once and times out otherwise',()=>{
 const {s,engine}=fixture();for(let i=0;i<3;i++)foe(engine,'skeleton',240+i*8,250);s.aim={x:250,y:250};s.upgrades['trap-frost']=1;engine.cast('trap');engine.step(.5);assert.equal(s.detonations||0,0);engine.step(.51);assert.equal(s.detonations,1);assert(s.areas.some(a=>a.kind==='snow'));engine.step(.1);assert(s.enemies.some(e=>e.slow>0));assert.equal(s.detonations,1);
 const next=fixture();foe(next.engine);next.engine.cast('trap');next.engine.step(5.9);assert.equal(next.s.detonations||0,0);next.engine.step(.11);assert.equal(next.s.detonations,1);
});
test('ice-fire reaction consumes freeze, respects its per-target cooldown and never recurses or double-counts kills',()=>{
 const {s,engine}=fixture();s.upgrades['thermal-shock']=1;const a=foe(engine),b=foe(engine,'skeleton',265);a.freeze=b.freeze=5;
 engine.damage(a,1,'fire','fire');assert.equal(a.freeze,0);assert.equal(b.freeze,5);assert.equal(s.reactions.thermal,1);assert(s.damage['thermal-shock']>0);
 a.freeze=5;engine.damage(a,1,'fire','fire');assert.equal(s.reactions.thermal,1);s.time=3.01;engine.damage(a,1,'fire','fire');assert.equal(s.reactions.thermal,2);
 a.hp=b.hp=1;a.freeze=1;s.time=6.1;engine.damage(a,.1,'fire','fire');assert.equal(s.kills,2);assert.equal(s.xp,2);
});
test('ice-lightning conducts to two nearby enemies once per three seconds, excluding hidden/dead targets',()=>{
 const {s,engine}=fixture();s.upgrades['storm-conduct']=1;const source=foe(engine),near=[foe(engine,'skeleton',260),foe(engine,'skeleton',270),foe(engine,'skeleton',280)];const hidden=foe(engine,'skeleton',240,-10);source.slow=5;
 engine.damage(source,1,'lightning','lightning');assert.equal(s.reactions.conduct,1);assert.equal(near.filter(e=>e.hp<e.maxHp).length,2);assert.equal(hidden.hp,hidden.maxHp);
 engine.damage(source,1,'lightning','lightning');assert.equal(s.reactions.conduct,1);s.time=3.1;engine.damage(source,1,'lightning','lightning');assert.equal(s.reactions.conduct,2);
});
test('wind kill extension and bounce recovery are bounded to three kills per projectile',()=>{
 const {s,engine}=fixture();s.upgrades['wind-reap']=1;for(let i=0;i<6;i++){const e=foe(engine,'skeleton',240,490-i*35);e.hp=1;}s.projectiles=[{id:99,skill:'wind',x:240,y:530,px:240,py:530,vx:0,vy:-270,r:16,life:2,damage:1000,element:'physical',pierce:99,bounce:2,hits:[]}];
 engine.step(1);assert.equal(s.kills,6);assert.equal(s.projectiles[0].reaps,3);assert.equal(s.projectiles[0].bounce,5);assert.equal(s.projectiles[0].life,2.5);
});
test('new skill research is filled when learning into pre-update saves, without altering existing snapshot levels',()=>{
 const {p,s}=fixture();s.abilities.bolt={level:1,damage:0,cooldown:0};delete s.research.gravity;p.skills.gravity=4;s.status='choice';s.points=1;s.choices=[availableCards(s,p).find(c=>c.id==='learn-gravity')];assert(selectCard(s,p,'learn-gravity'));assert.equal(s.research.gravity,4);
 const old=JSON.parse(JSON.stringify(p));delete old.skills.ward;delete old.active.research.ward;const restored=validateProfile(old);assert.equal(restored.skills.ward,1);assert(Number.isFinite(new Battle(restored.active,restored).power('ward')));
});
test('all tactical prerequisites/unlocks and five-slot restriction apply to the real draft',()=>{
 const {p,s}=fixture();s.abilities={bolt:{level:1,damage:0,cooldown:0},fire:{level:1,damage:0,cooldown:0},ice:{level:1,damage:0,cooldown:0}};p.frontier=5;
 assert(!availableCards(s,p).some(c=>c.id==='learn-gravity'||c.id==='thermal-shock'));p.frontier=30;s.upgrades['ice-freeze']=1;assert(availableCards(s,p).some(c=>c.id==='thermal-shock'));assert(!availableCards(s,p).some(c=>c.id==='ward-mend'));
 s.abilities.gravity=s.abilities.ward={level:1,damage:0,cooldown:0};assert(!availableCards(s,p).some(c=>c.kind==='learn'));assert(availableCards(s,p).some(c=>c.id==='ward-mend'));
});
test('paused and JSON-restored tactical areas retain charges, arming timers and reaction cooldowns',()=>{
 const {p,s,engine}=fixture();foe(engine);engine.cast('ward');engine.cast('trap');engine.cast('gravity');s.areas[0].charges=2;s.upgrades['thermal-shock']=1;s.enemies[0].thermalReady=8;s.abilities.bolt={level:1,damage:0,cooldown:0};s.cooldowns.bolt=100;s.paused=true;const before=JSON.stringify(s);engine.step(9);assert.equal(JSON.stringify(s),before);
 const restored=validateProfile(JSON.parse(JSON.stringify(p)));restored.active.paused=false;new Battle(restored.active,restored).step(.2);assert.equal(restored.active.areas[0].charges,2);assert(Math.abs(restored.active.areas[1].armed-.8)<1e-7);assert.equal(restored.active.enemies[0].thermalReady,8);
});
test('mixed tactical combat stays finite and respects entity caps over a long run',()=>{
 const {p,s,engine}=fixture();s.waiting=0;s.wave=4;s.spawned=0;s.waveCount=80;s.abilities=Object.fromEntries(['bolt','gravity','ward','trap','ice'].map(id=>[id,{level:1,damage:0,cooldown:0}]));s.upgrades={'trap-frost':1,'gravity-release':1,'ward-mend':1,'thermal-shock':1,'ice-freeze':1};s.stats.health=s.wall=1e6;
 for(let i=0;i<7200;i++){if(s.status==='choice')selectCard(s,p,s.choices[0].id);engine.step(1/60);assert(s.areas.length<=24);assert(s.projectiles.length<=240);assert(s.effects.length<=160);assert(Number.isFinite(s.wall));for(const x of s.enemies)assert([x.x,x.y,x.hp].every(Number.isFinite));}
 assert(Object.keys(skillById).length===15);assert((s.detonations||0)>0);
});
