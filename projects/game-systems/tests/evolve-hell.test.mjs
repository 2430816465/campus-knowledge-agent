import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EvolutionGame} from '../games/evolve/state.js';
import {HellEvolutionGame} from '../games/evolve/hell.js';
const game=()=>{const g=new HellEvolutionGame();g.newRun(991,'hell');g.run.entities=[];g.run.spawnClock=-100;return g;};
test('challenge inherits exact speed, body plus two and lower triple cascade',()=>{
 const g=game(),normal=new EvolutionGame();normal.newRun(991);assert.equal(g.speed(),normal.speed());
 g.eat({level:1,x:0,y:0});assert.equal(g.run.level,1);g.eat({level:1,x:0,y:0});assert.equal(g.run.level,2);
 for(let i=0;i<6;i++)g.eat({level:1,x:0,y:0});assert.equal(g.run.level,3);assert.equal(g.run.followers.length,0);
});
test('toxic warning holds position and does no damage before timed explosion',()=>{
 const g=game(),r=g.run;r.elapsed=8;r.hell.nextPulse=8;r.shield=0;g.update(.02);assert.equal(r.hell.pulses.length,3);assert.equal(r.phase,'playing');
 const z=r.hell.pulses[0],x=z.x;assert.equal(g.hazards().filter(h=>h.kind==='pulse')[0].active,false);
 r.player.x+=200;g.update(.02);assert.equal(z.x,x);r.player.x=z.x;r.player.y=z.y;r.elapsed=z.start;g.update(.02);assert.equal(r.phase,'fallen');assert.match(r.cause,/毒潮/);
});
test('rift consumes companion independently; body contact fails; shield protects',()=>{
 const g=game(),r=g.run,z=g.hazards()[0];r.shield=0;r.followers=[{level:1,x:z.x,y:z.y}];g.placeFollowers=()=>{};g.update(.02);
 assert.equal(r.phase,'playing');assert.equal(r.followers.length,0);assert.equal(r.hell.lost,1);
 const h=g.hazards()[0];r.player.x=h.x;r.player.y=h.y;r.shield=1;g.update(.02);assert.equal(r.phase,'playing');r.shield=0;g.update(.02);assert.equal(r.phase,'fallen');assert.match(r.cause,/裂隙/);
});
test('storm is periodic, fixed input speed stays, pause freezes hazard schedule',()=>{
 const g=game();g.run.elapsed=18;assert.equal(g.currentZones().filter(z=>z.hell).length,4);assert.equal(g.describe().hell.storm,true);
 const s=g.snapshot();g.paused=true;g.update(.04);assert.deepEqual(g.snapshot(),s);g.run.elapsed=28;assert.equal(g.currentZones().filter(z=>z.hell).length,0);
});
test('hell save restores pending warnings, used revive and normal save stays unchanged',()=>{
 const g=game();g.run.elapsed=8;g.update(.02);const s=g.snapshot(),restored=new HellEvolutionGame(s);assert.deepEqual(restored.snapshot(),s);
 g.run.phase='fallen';assert(g.revive());assert.equal(g.run.hell.pulses.length,0);g.run.phase='fallen';assert.equal(new HellEvolutionGame(g.snapshot()).revive(),false);
 const n=new EvolutionGame();n.newRun(2);assert.equal(n.snapshot().hell,undefined);assert.equal(n.snapshot().mode,undefined);
});
test('hell keeps lower food abundant, remote equals scarce and does not erase visible food',()=>{
 const g=game(),r=g.run;r.level=10;g.fillPopulation(150);g.refreshPopulation();assert(r.entities.filter(e=>e.level<10).length>r.entities.length*.7);assert(r.entities.filter(e=>e.level>10).length>=Math.ceil(r.entities.length*.08));
 const visible={id:999,level:10,x:r.player.x+100,y:r.player.y,angle:0,age:1,turn:0};r.entities.push(visible);g.visibleArea={x:r.player.x-500,y:r.player.y-500,width:1000,height:1000};g.refreshPopulation();assert(r.entities.includes(visible));
});
test('late body has enough advance warning to leave a toxin circle without slowing',()=>{
 const g=game(),r=g.run;r.level=19;r.elapsed=8;r.shield=0;g.update(.02);const z=r.hell.pulses[0];
 assert((z.start-r.elapsed)*g.speed()>z.r+152+50);assert.equal(g.speed(),210);
 const counts=Array.from({length:20},(_,i)=>i+1).map(l=>{r.level=l;return g.speed();});assert(counts.every(v=>v===210));
});
