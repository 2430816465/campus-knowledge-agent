import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../games/workshop/active-state.js';
import {PLANS,SPAWNS,solids} from '../games/workshop/room-layouts.js';import {createNavigator} from '../games/workshop/room-navigation.js';
test('all rooms have collision-free routes between every workstation pair',()=>{for(const [room,plan] of Object.entries(PLANS)){for(const a of [SPAWNS[room],...Object.values(plan.stations).map(v=>v.slice(4))])for(const [id,v] of Object.entries(plan.stations)){const n=createNavigator(solids(room));[n.p.x,n.p.y]=a;assert.ok(n.go(v[4],v[5]),room+' '+id+' reachable');for(let t=0;t<800;t++){n.step(.01);assert.ok(n.free(n.p.x,n.p.y),room+' collision');for(const o of plan.objects.filter(o=>['island','island-bread-rack','dough-tray','counter','table','pack','wagon','wheat','berries','depot'].includes(o.id)))assert.ok(!(n.p.x>o.l&&n.p.x<o.r&&n.p.y>o.t&&n.p.y<o.b),room+' feet overlap visible '+o.id);}assert.ok(Math.hypot(n.p.x-v[4],n.p.y-v[5])<28,room+' '+id);}}});
test('retargeting between grid points cannot cut through a table corner',()=>{
 const n=createNavigator(solids('shop'));n.p.x=204;n.p.y=400;
 assert.ok(n.go(500,200));
 for(let frame=0;frame<600&&n.p.moving;frame++){n.step(1/120);assert.ok(n.free(n.p.x,n.p.y),'counter corner remains clear');}
 assert.equal(n.p.x,500);assert.equal(n.p.y,200);
});
test('frequent pointer retargets remain collision-free in every room',()=>{
 let seed=145;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(const room of Object.keys(PLANS)){
  const n=createNavigator(solids(room));[n.p.x,n.p.y]=SPAWNS[room];
  for(let turn=0;turn<150;turn++){
   n.go(40+random()*920,200+random()*300);
   const frames=1+Math.floor(random()*45);
   for(let frame=0;frame<frames;frame++){n.step(1/60);assert.ok(n.free(n.p.x,n.p.y),room+' retarget '+turn);}
  }
 }
});
test('clear floor uses a straight route and nearby clicks reach their exact position',()=>{
 const n=createNavigator(solids('bake'));n.p.x=500;n.p.y=440;
 assert.ok(n.go(620,460));assert.equal(n.route.length,1);
 while(n.p.moving)n.step(1/60);
 assert.equal(n.p.x,620);assert.equal(n.p.y,460);
 n.p.x=491;n.p.y=441;assert.ok(n.go(509,459));assert.ok(n.p.moving);
 while(n.p.moving)n.step(1/60);
 assert.equal(n.p.x,509);assert.equal(n.p.y,459);
});
test('actual movement selects all four directions and pause or stop keeps the last direction',()=>{
 const n=createNavigator();
 for(const [direction,x,y] of [['right',800,300],['left',200,300],['up',500,100],['down',500,500]]){
  n.p.x=500;n.p.y=300;assert.ok(n.go(x,y));n.step(.05);assert.equal(n.p.direction,direction);
  const paused={...n.p};n.step(1,false);assert.deepEqual(n.p,paused);
  while(n.p.moving)n.step(.1);
  assert.equal(n.p.direction,direction);n.clear();n.step(.1);assert.equal(n.p.direction,direction);
 }
 n.p.x=500;n.p.y=300;n.p.facing=-1;n.go(500+1e-8,100);n.step(.05);
 assert.equal(n.p.direction,'up');assert.equal(n.p.facing,-1,'floating-point residue cannot flip facing');
});
test('walking covers 240 world units per second at 30, 60 and 120 frames per second',()=>{
 for(const fps of [30,60,120]){
  const n=createNavigator();n.p.x=200;n.p.y=200;n.go(800,450);
  for(let frame=0;frame<fps;frame++){const before=n.p.distance;n.step(1/fps);assert.ok(Math.abs(n.p.distance-before-240/fps)<1e-8);}
  assert.ok(Math.abs(n.p.distance-240)<1e-8);assert.ok(n.p.moving);
 }
});
test('journal migration preserves completed saves and currency; clamps malformed progress',()=>{const s=E.fresh();s.version=2;s.completed=true;s.coins=430;s.journal={active:'tea',done:['unknown','forest','forest'],progress:{tea:{jam:Infinity,bread3:-2,served:99}}};const r=E.restore(s);assert.equal(r.version,3);assert.equal(r.coins,430);assert.equal(E.completed(r),true);assert.deepEqual(r.journal.done,['forest']);assert.equal(r.journal.progress.tea.served,6);});
test('themes preserve progress on switch and cannot progress by idle or inventory transfers',()=>{const s=E.fresh();s.beacons=3;assert.ok(E.chooseCommission(s,'breakfast'));s.store=[30,30,30];E.bake(s);E.tick(s,7200);assert.deepEqual(s.journal.progress.breakfast,{});E.bake(s);assert.equal(s.journal.progress.breakfast.bread0,2);E.chooseCommission(s,'forest');E.chooseCommission(s,'breakfast');assert.equal(s.journal.progress.breakfast.bread0,2);s.facilities.rack=1;E.refillShelf(s);assert.equal(s.journal.progress.breakfast.bread0,2);});
test('one-time commission reward cannot be claimed twice, paused, or before work',()=>{const s=E.fresh();s.beacons=3;E.chooseCommission(s,'breakfast');assert.equal(E.claimCommission(s,'breakfast'),false);s.journal.progress.breakfast={bread0:6,bread1:4,orders:3};s.paused=true;assert.equal(E.claimCommission(s,'breakfast'),false);s.paused=false;assert.ok(E.claimCommission(s,'breakfast'));assert.equal(s.coins,180);assert.equal(E.claimCommission(s,'breakfast'),false);assert.equal(s.coins,180);});
test('diner preference gives a transparent 20% bonus but accepts alternatives',()=>{const s=E.fresh();s.beacons=2;s.facilities.table=1;const p=E.dinerPreference(s);s.shelf[p]=1;E.serve(s);assert.equal(s.coins,Math.floor(E.RECIPES[p].value*1.85*1.2));s.shelf=[0,0,1,0];assert.ok(E.serve(s).ok);assert.equal(s.served,2);});
test('chapter batch rewards respect six-item maximum and no automatic production',()=>{const s=E.fresh();s.journal.done=['breakfast','forest'];assert.equal(E.batchCapacity(s),3);s.upgrades.polish=8;assert.equal(E.batchCapacity(s),6);E.tick(s,7200);assert.equal(s.coins,0);assert.equal(s.crafted,0);});
