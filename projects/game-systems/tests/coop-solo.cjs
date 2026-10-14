const assert = require('node:assert/strict');
const Game = require('../games/coop/src/game-shared.js');
const {Session, KEY} = require('../games/coop/src/solo.js');
const {controller} = require('./coop-integration.cjs');
const store = new Map();
const storage = {getItem: k => store.get(k), setItem: (k, v) => store.set(k,v)};
const maps = JSON.stringify(Game.LEVELS);
for (let index = 0; index < 50; index++) {
  const s = new Session(storage);
  s.start(index);
  assert.deepEqual(s.world, Game.createWorld(index, s.run, true), `level ${index+1} uses the exact multiplayer map/world`);
  for (let t=0;t<30;t++) s.step();
  assert(s.world.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'both players simulated');
}
assert.equal(JSON.stringify(Game.LEVELS), maps, 'no solo mutation of campaign data');
// Existing first-chapter two-player routes use ordinary inputs from spawns.
for (let index = 0; index < 3; index++) {
  const w = Game.createWorld(index, 1, true);
  controller.firstStage = 'push'; controller.partnerStage = null;
  for (let t=0;t<14000 && w.phase==='playing';t++) Game.stepWorld(w, [controller(index,w,0),controller(index,w,1)],1/60);
  assert.equal(w.phase,'intermission',`duo route ${index+1}`);
}
console.log('PASS: 50 shared map entries, unchanged campaign data, and duo routes 1–3.');
// Serial single-player routes: each tick can drive only one player.
for (let index = 0; index < 3; index++) {
  store.clear(); const s = new Session(storage); s.start(index);
  controller.firstStage = 'push'; controller.partnerStage = null;
  let age=0;
  const busy = input => input.left || input.right || input.jump || input.interact;
  for (let t=0;t<18000 && s.world.phase==='playing';t++) {
    const inputs = [controller(index,s.world,0),controller(index,s.world,1)];
    const active=s.active, other=1-active;
    if ((!busy(inputs[active]) && busy(inputs[other])) || (age>100 && s.world.players[active].grounded && busy(inputs[other]))) {s.switchPlayer();age=0;}
    s.setInput(inputs[s.active]); s.step(); age++;
  }
  assert.equal(s.world.phase,'intermission',`single active-input route ${index+1}`);
  assert.equal(s.award.base,30);
  const firstId=s.award.id;
  const restored=new Session(storage);
  assert.equal(restored.world.phase,'intermission'); assert.equal(restored.award.id,firstId);
  assert.equal(restored.progress.coins,30);
  s.start(index);
  // Settlement repeat fixture verifies idempotence; route already verified above.
  s.world.phase='intermission'; s.settle();
  assert.equal(s.award.base,0);assert.equal(s.award.id,null);assert.equal(s.progress.coins,30);
  assert.equal(s.next().world.levelIndex,index+1);
}
store.clear(); const s=new Session(storage);s.start(0);
for(let t=0;t<35;t++)s.step();
const w=s.world;
s.setInput({right:true,jumpPressed:true});s.switchPlayer();s.step();
assert.equal(w.players[0].vx,0,'switch immediately drops old movement');
assert.equal(w.players[0].input.jump,false,'no stale jump on standby role');
s.setInput({right:true});for(let t=0;t<10;t++)s.step();
assert(w.players[1].vx>0,'new active role moves');
s.save();const resumed=new Session(storage);assert.equal(resumed.active,1);assert.equal(resumed.world.players[1].vx,0);
// A real pressure-plate fixture checks standby occupancy with active-role movement.
s.start(0);const w2=s.world;
const plate=Game.stageFor(w2).plates[0];
w2.players[0].x=plate.x;w2.players[0].y=plate.y-Game.PHYSICS.playerHeight;w2.players[0].grounded=true;
s.switchPlayer();s.setInput({right:true});for(let t=0;t<25;t++)s.step();
assert.equal(w2.plates[plate.id],true,'standby character holds authored pressure plate');
s.start(49);s.world.phase='intermission';s.settle();assert.equal(s.next(),undefined,'50 has no invalid level 51');
let saveError=false;new Session({getItem:()=>null,setItem:()=>{throw Error('full')}},()=>{saveError=true}).start(0);assert(saveError);
assert(storage.getItem(KEY));
console.log('PASS: solo 1–3 serial routes, standby pressure, role release, resume, first-clear receipts, next/finale, save failure.');
