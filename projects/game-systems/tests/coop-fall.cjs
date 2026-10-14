const assert=require('node:assert/strict');const G=require('../games/coop/src/game-shared.js');
const step=(w,inputs=[{},{}],n=1)=>{for(let t=0;t<n;t++)G.stepWorld(w,inputs,1/60)};
// Exact regression: head intersects the upper pit while jumping on the lower bridge.
for(const slot of[0,1])for(const y of[244,484]){
 const w=G.createWorld(1,1);w.flags.lowerBridge=true;w.flags.upperBridge=true;
 Object.assign(w.players[slot],{x:530,y,grounded:true,vy:0});
 const inputs=[{},{}];inputs[slot]={jump:true};step(w,inputs);step(w,[{},{}],65);
 assert.equal(w.safeRun,true);assert.equal(w.fall,undefined);assert.equal(w.players[slot].y,y);
}
require('./coop-remake.cjs').regressions();
{
 const w=G.createWorld(1,1);Object.assign(w.players[1],{x:530,y:484,grounded:true,vy:0});
 let t=0;while(!w.fall&&t++<40)step(w);
 assert.ok(w.fall,'closed bridge triggers downward fall');assert.equal(w.fall.slot,1);assert.equal(w.safeRun,false);
 const y=w.players[1].y;const saved=w.checkpointState;
 step(w,[{right:true,interact:true,jump:true},{jump:true}],12);
 assert.ok(w.fall);assert.ok(w.players[1].y>y+25,'visible descent before reset');assert.equal(w.phase,'playing','fall does not settle a level');
 while(w.fall)step(w);assert.deepEqual(w.players,saved.players,'both teammates restore together');
}
{
 const w=G.createWorld(1,1);Object.assign(w.players[0],{x:450,y:484,grounded:true,vy:0});
 w.transits[0]={direction:1,remaining:.42,gateId:'test'};
 for(let t=0;t<100&&!w.fall;t++)step(w);
 assert.ok(w.fall,'one-way transit cannot skip fall detection');
}
// Authored third-stage floor is temporarily shortened only in this test fixture.
{
 const stage=G.LEVELS[2],prior=stage.platforms;
 try{
  stage.platforms=[{x:0,y:580,w:390,h:140}];
  const w=G.createWorld(2,1),b=w.boxes[0];b.x=300;
  Object.assign(w.players[0],{x:265,y:524,grounded:true});Object.assign(w.players[1],{x:350,y:524,grounded:true});
  for(let t=0;t<60&&!w.fall;t++)step(w,[{right:true},{}]);
  assert.ok(w.fall,'crate can push teammate off cliff');assert.equal(w.fall.slot,1);
 }finally{stage.platforms=prior;}
}
console.log("PASS fall animation/reset, both bridge tiers/slots, upper-to-lower drop, transit and crate cliff push.");
