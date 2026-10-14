import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,step,spawn,bossSeal,bossDamageScale,members} from '../games/rush/battle.js';
import {STAGES,plan,cratePlan,CRATE_STAGES,mistakeLimit,BOSS_HP} from '../games/rush/data.js';
import {fresh,settle,persist,load} from '../games/rush/profile.js';
const advance=(b,seconds)=>{for(let i=0;i<seconds*60&&b.status==='playing';i++)step(b,1/60);};
function ready(stage,mistakes=0){const b=createBattle(stage,{power:8,speed:6,recruits:5});b.layoutVersion=4;b.cursor=999;b.passed=STAGES[stage-1].gates.length;b.mistakes=mistakes;b.count=b.peak=48;b.weapon=3;b.modifiers={haste:3,range:3,damage:3};return b;}
function boss(b,hp=100,y=360){spawn(b,{kind:'boss',x:240,hp,damage:2,type:'dragon'});b.entities.at(-1).y=y;return b.entities.at(-1);}
test('authored tolerance bands and fixed answers cover every gate; boss HP rises through all 18 stages',()=>{
 assert.deepEqual(STAGES.map(s=>s.mistakeLimit),[null,null,3,3,3,3,2,2,2,2,2,2,1,1,1,1,1,0]);
 for(const s of STAGES){assert.equal(s.correctRoute.length,s.gates.length);assert.equal(s.mistakeLimit,mistakeLimit(s.id));const gates=plan(s.id).filter(e=>e.kind==='gates');gates.forEach((e,i)=>{assert.equal(e.gateIndex,i);assert.equal(e.correctSide,s.id<3?null:s.correctRoute[i]==='L'?'left':'right');});assert.equal(plan(s.id).find(e=>e.kind==='boss').hp,BOSS_HP[s.id-1]);if(s.id>1)assert.ok(BOSS_HP[s.id-1]>BOSS_HP[s.id-2]);}
});
test('all 528 gate-choice combinations settle fixed mistakes once and classify the precise boundary',()=>{
 let checked=0;
 for(const s of STAGES.slice(2)){
  const gates=plan(s.id).filter(e=>e.kind==='gates');
  for(let mask=0;mask<2**gates.length;mask++){
   const b=ready(s.id);b.passed=0;let mistakes=0;
   gates.forEach((event,i)=>{const side=(mask>>i)&1?'right':'left';mistakes+=Number(side!==event.correctSide);b.x=b.targetX=side==='left'?170:310;spawn(b,event);b.entities.at(-1).y=members(b)[0].y-8;step(b,1/60);assert.equal(b.mistakes,mistakes);assert.equal(b.passed,i+1);const resumed=JSON.parse(JSON.stringify(b));step(resumed,1/60);assert.equal(resumed.mistakes,mistakes);assert.equal(resumed.passed,i+1);});
   assert.equal(b.mistakes,mistakes);assert.equal(bossSeal(b),mistakes>s.mistakeLimit?'broken':'open');assert.equal(b.gateHistory.length,gates.length);checked++;
  }
 }
 assert.equal(checked,528);
});
test('at the exact allowance every stage boss can die from real shots; one extra mistake blocks max builds',()=>{
 for(const s of STAGES.slice(2))for(const [extra,expected]of [[0,'won'],[1,'lost']]){
  const b=ready(s.id,s.mistakeLimit+extra),e=boss(b,BOSS_HP[s.id-1]);advance(b,12);
  assert.equal(b.status,expected,'stage '+s.id+' extra '+extra);assert.equal(b.bossKilled,!extra);if(extra){assert.equal(e.hp,e.maxHp);assert.equal(b.failureReason,'seal');}
 }
});
test('last-gate seal prevents early ranged kills, then opens immediately after the final decision',()=>{
 const b=ready(18);b.passed--;const e=boss(b,1,180);advance(b,1);assert.equal(e.hp,1);assert.equal(b.bossKilled,false);assert.equal(bossSeal(b),'pending');
 const event=plan(18).filter(e=>e.kind==='gates').at(-1);spawn(b,event);b.entities.at(-1).y=members(b)[0].y-8;b.x=b.targetX=310;step(b,1/60);assert.equal(bossSeal(b),'open');advance(b,2);assert.equal(b.status,'won');
});
test('legacy version 4 keeps its authored answer even when another side gives more crew',()=>{
 for(const recruits of [0,5]){const b=createBattle(18,{recruits});b.layoutVersion=4;b.cursor=999;b.count=3;b.x=b.targetX=170;const event=plan(18).filter(e=>e.kind==='gates')[1];spawn(b,event);b.entities[0].y=632;step(b,1/60);assert.equal(b.count,1);assert.equal(b.mistakes,0);assert.equal(event.correctSide,'left');}
 const b=createBattle(17);b.layoutVersion=4;b.cursor=999;b.x=b.targetX=310;spawn(b,plan(17).filter(e=>e.kind==='gates')[2]);b.entities[0].y=632;step(b,1/60);assert.equal(b.mistakes,1);assert.equal(b.count,0);assert.equal(b.status,'lost');
});
test('obstacles and traps do not consume gate tolerance; damage scale is linear and only affects the boss',()=>{
 const b=ready(7);b.mistakes=1;const m=members(b)[0];spawn(b,{kind:'rock',x:m.x,radius:16});b.entities.at(-1).y=m.y;step(b,1/60);assert.ok(b.count<48);assert.equal(b.mistakes,1);assert.equal(bossDamageScale(b),.92);
 spawn(b,{kind:'chest',x:b.x,hp:999,loot:'trap',amount:4,delivery:'break'});b.entities.at(-1).y=members(b)[0].y;step(b,1/60);assert.equal(b.trapLoss,4);assert.equal(b.mistakes,1);
 for(let n=0;n<=3;n++){b.mistakes=n;assert.ok(Math.abs(bossDamageScale(b)-(1-n*.08))<1e-9);}assert.equal(bossDamageScale(createBattle(2)),1);
});
test('chain and area damage cannot break a locked boss seal through nearby enemies',()=>{
 for(const weaponType of ['lightning','flame']){const b=ready(18,1);b.weaponType=weaponType;const e=boss(b,100,400);spawn(b,{kind:'enemy',x:214,hp:10000,damage:1,type:'skeleton'});const foe=b.entities.at(-1);foe.y=400;advance(b,1);assert.equal(e.hp,100);assert.ok(foe.hp<10000);}
});
test('version 3 saves retain old boss HP and no gate requirement; new runs reset errors and reward failure correctly',()=>{
 const old=createBattle(18);old.layoutVersion=3;old.time=50.99;old.cursor=cratePlan(18).filter(e=>e.time<=old.time).length;step(old,1/60);assert.equal(old.entities.find(e=>e.kind==='boss').maxHp,760);assert.equal(bossSeal(old),'inactive');assert.ok(!old.entities.some(e=>e.correctSide));assert.equal(CRATE_STAGES[17].pace,STAGES[17].pace);
 const b=ready(18,1);boss(b);advance(b,12);const p=fresh();p.active=b;const r=settle(p);assert.equal(r.win,false);assert.equal(r.mistakes,1);assert.equal(r.mistakeLimit,0);assert.equal(r.failureReason,'seal');assert.deepEqual(p.cleared,[]);assert.equal(createBattle(18).mistakes,0);
 const a=ready(7,2);a.gateHistory=[{index:0,side:'right',correctSide:'left',wrong:true}];p.pending=null;p.active=a;const store={raw:null,getItem(){return this.raw;},setItem(k,v){this.raw=v;}};persist(store,p);assert.deepEqual(load(store).profile.active,a);a.mistakes=-1;persist(store,p);assert.ok(load(store).corrupt);
});
