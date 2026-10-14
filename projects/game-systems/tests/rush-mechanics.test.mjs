import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,step,spawn,fireInterval,shotRange} from '../games/rush/battle.js';
import {plan,previousPlan,MECHANICS,MAX_SQUAD} from '../games/rush/data.js';
import {route} from './rush-policy.mjs';
const isolated=(stage=1)=>{const b=createBattle(stage,{},'fixture');b.cursor=999;b.fire=100;return b;};
const frames=(b,n)=>{for(let i=0;i<n;i++)step(b,1/60);};
const target=(b,kind,x,y,extra)=>{spawn(b,{kind,x,...extra});const e=b.entities.at(-1);e.y=y;return e;};
const impact=(b,e,damage=999,type='sword')=>{b.bullets.push({x:e.x,y:e.y+16,oldY:e.y+16,phase:'flight',damage,pierce:0,hits:[],weaponType:type,distance:0,maxRange:450});step(b,1/60);};
test('new mechanic families first appear every three stages, then combine with previous ones',()=>{
 assert.deepEqual(MECHANICS.map(m=>m.first),[1,4,7,10,13,16]);
 for(const [effect,first]of [['haste',4],['range',7],['damage',10]]){
  assert.ok(plan(first).some(e=>e.kind==='gates'&&(e.left.effect===effect||e.right.effect===effect)));
  for(let n=1;n<first;n++)assert.ok(!plan(n).some(e=>e.kind==='gates'&&(e.left.effect===effect||e.right.effect===effect)));
 }
 for(const [loot,first]of [['lightning',13],['flame',16]]){assert.ok(plan(first).some(e=>e.loot===loot));for(let n=1;n<first;n++)assert.ok(!plan(n).some(e=>e.loot===loot));}
 for(let n=1;n<=18;n++){assert.ok(plan(n).some(e=>e.loot==='trap'));assert.ok(plan(n).filter(e=>e.kind==='chest'&&e.loot!=='trap').length>=2);}
});
test('first stage pressure rises mildly, second rises substantially but stays below third',()=>{
 const pressure=events=>events.filter(e=>['enemy','boss'].includes(e.kind)).reduce((n,e)=>n+e.hp,0);
 const now=[1,2,3].map(n=>pressure(plan(n))),before=[1,2,3].map(n=>pressure(previousPlan(n)));
 assert.ok(now[0]>before[0]&&now[0]<before[0]*1.3);assert.ok(now[1]>before[1]*1.5);assert.ok(now[2]>now[1]*1.2);
 assert.equal(plan(2).filter(e=>e.kind==='enemy').length,26);assert.equal(plan(3).filter(e=>e.kind==='enemy').length,30);
 assert.ok(plan(3).filter(e=>e.loot==='trap').every(e=>e.amount>=plan(2).find(e=>e.loot==='trap').amount));
});
test('stat gates affect only their selected side, cap at three stacks and never add recruits',()=>{
 for(const effect of ['haste','range','damage']){const b=isolated(10);b.x=b.targetX=132;
  for(let i=0;i<5;i++){target(b,'gates',240,632,{left:{effect,value:1,op:'+'},right:{op:'+',value:10}});step(b,1/60);}
  assert.equal(b.modifiers[effect],3);assert.equal(b.count,3);assert.equal(b.passed,5);
  const saved=JSON.parse(JSON.stringify(b));frames(saved,20);assert.equal(saved.modifiers[effect],3);
 }
});
test('haste increases actual emitted shots, range limits flight and the range gate reaches distant enemies',()=>{
 const base=isolated(7),fast=isolated(7);base.fire=fast.fire=0;fast.modifiers.haste=2;frames(base,180);frames(fast,180);
 assert.ok(fast.shots>base.shots);assert.ok(fireInterval(fast)<fireInterval(base));
 for(const [stack,hit]of [[0,false],[1,true]]){
  const b=isolated(7);b.modifiers.range=stack;const e=target(b,'enemy',240,60,{hp:100,damage:0,type:'skeleton'});
  b.bullets.push({x:240,y:616,oldY:616,phase:'flight',damage:10,pierce:0,hits:[],weaponType:'sword',distance:0,maxRange:shotRange(b)});
  frames(b,40);assert.equal(e.hp<100,hit);assert.equal(b.bullets.length,0);
 }
});
test('damage gate boosts direct projectile damage without changing squad or tier',()=>{
 const values=[];for(const stack of [0,2]){const b=isolated(10);b.count=1;b.fire=0;b.modifiers.damage=stack;target(b,'enemy',240,450,{hp:100,damage:0,type:'skeleton'});frames(b,15);values.push(b.entities[0].hp);assert.equal(b.count,1);assert.equal(b.weapon,0);}
 assert.equal(100-values[1],(100-values[0])*1.5);
});
test('break rewards immediately grant tier, new weapon or many recruits without walking into the box',()=>{
 for(const loot of ['weapon','rescue','army','lightning','flame']){const b=isolated(16),e=target(b,'chest',132,250,{hp:5,loot,amount:loot==='army'?20:5,delivery:'break'});impact(b,e);
  assert.equal(b.crates,1);assert.equal(b.entities.length,0);
  if(['rescue','army'].includes(loot))assert.equal(b.count,loot==='army'?23:8);
  else{assert.equal(b.weapon,1);assert.equal(b.weaponType,loot==='weapon'?'sword':loot);}
  frames(b,10);assert.equal(b.crates,1);
 }
 const full=isolated();full.count=47;impact(full,target(full,'chest',132,250,{hp:5,loot:'army',amount:20,delivery:'break'}));assert.equal(full.count,MAX_SQUAD);assert.equal(full.rescued,1);
});
test('red crates penalize on breaking or contact once; cannot die offscreen or resurrect zero recruits',()=>{
 for(const method of ['shot','contact']){const b=isolated();b.count=8;const e=target(b,'chest',240,method==='shot'?250:640,{hp:5,loot:'trap',amount:4,delivery:'break'});if(method==='shot')impact(b,e);else step(b,1/60);assert.equal(b.count,4);assert.equal(b.trapLoss,4);frames(b,20);assert.equal(b.count,4);}
 const hidden=isolated(),e=target(hidden,'chest',240,40,{hp:5,loot:'trap',amount:4,delivery:'break'});impact(hidden,e);assert.equal(hidden.count,3);assert.equal(e.hp,5);
 const dead=isolated();impact(dead,target(dead,'chest',240,250,{hp:5,loot:'trap',amount:9,delivery:'break'}));assert.equal(dead.status,'lost');assert.equal(dead.count,0);target(dead,'chest',240,640,{hp:0,loot:'army',amount:20,delivery:'break'});frames(dead,10);assert.equal(dead.count,0);
});
test('lightning chains to at most two nearby enemies, flame splashes nearby enemies, neither hits crates',()=>{
 for(const type of ['lightning','flame']){const b=isolated(16),main=target(b,'enemy',240,300,{hp:100,damage:0,type:'skeleton'});
  const group=[260,280,290].map(x=>target(b,'enemy',x,300,{hp:100,damage:0,type:'skeleton'}));
  const far=target(b,'enemy',410,300,{hp:100,damage:0,type:'skeleton'}),box=target(b,'chest',240,320,{hp:100,loot:'trap',amount:5,delivery:'break'});impact(b,main,10,type);
  assert.equal(main.hp,90);assert.equal(group.filter(e=>e.hp<100).length,type==='lightning'?2:3);assert.equal(far.hp,100);assert.equal(box.hp,100);assert.equal(b.count,3);assert.ok(b.effects.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)));
 }
});
test('version two saves retain archived layouts, unlimited range and touch collection, then resume exactly',()=>{
 const b=isolated(2);b.layoutVersion=2;delete b.modifiers;delete b.weaponType;b.cursor=0;b.fire=0;frames(b,610);
 assert.ok(b.entities.some(e=>e.loot==='weapon'&&e.delivery===undefined));assert.ok(!b.entities.some(e=>e.loot==='trap'));assert.equal(shotRange(b),Infinity);
 const restored=JSON.parse(JSON.stringify(b));for(let i=0;i<600;i++){const x=route(b);b.targetX=restored.targetX=x;step(b,1/60);step(restored,1/60);}assert.deepEqual(restored,b);
 assert.equal(createBattle(2).layoutVersion,5);
});
