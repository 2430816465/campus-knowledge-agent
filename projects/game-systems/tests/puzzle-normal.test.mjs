import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS} from '../games/marble/puzzle-levels.js';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
import {PuzzleGame} from '../games/marble/puzzle-state.js';
import {AimGesture} from '../games/marble/puzzle-aim.js';
function replay(index,angles){const g=new PuzzleGame(index);for(const a of angles){if(g.phase==='won')break;g.fireComplete(a*Math.PI/180)}return g;}
test('50 normal rooms use only static reflecting walls and persistent targets',()=>{
 assert.equal(LEVELS.length,50);assert.equal(SOLUTIONS.length,50);
 assert.equal(new Set(LEVELS.map(l=>JSON.stringify([l.origin,l.walls,l.nodes,l.exit]))).size,50);
 for(const l of LEVELS){assert.equal(l.revision,'normal-2');assert.equal(l.plates.length+l.portals.length+l.splitters.length,0);assert(l.walls.length>=1&&l.walls.length<=8);assert(l.nodes.length<=3);assert.equal(l.shots,l.nodes.length+2);assert(!l.exit.minBounces);for(const n of l.nodes)assert(!n.direction&&!n.relay&&!n.needs&&!n.minBounces);}
});
test('all 50 wall blueprints differ even after translation and mirroring; adjacent difficulty separates',()=>{
 const shape=(walls,sx,sy)=>{const rects=walls.map(w=>({x:sx===1?w.x:-w.x-w.w,y:sy===1?w.y:-w.y-w.h,w:w.w,h:w.h})),x=Math.min(...rects.map(w=>w.x)),y=Math.min(...rects.map(w=>w.y));return JSON.stringify(rects.map(w=>[w.x-x,w.y-y,w.w,w.h]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));};
 const seen=new Set();
 for(const [i,l] of LEVELS.entries()){
  const variants=[shape(l.walls,1,1),shape(l.walls,-1,1),shape(l.walls,1,-1),shape(l.walls,-1,-1)].sort();assert(!seen.has(variants[0]),'same wall blueprint '+(i+1));seen.add(variants[0]);
  assert.equal(l.difficulty.rank,i+1);if(i)assert(l.difficulty.blindWinChance<=LEVELS[i-1].difficulty.blindWinChance*.98+1e-8,'neighbor tie '+(i+1));
  for(const p of [...l.nodes,l.exit]){assert(p.r>=12);for(const w of l.walls)assert(p.x+p.r+5<=w.x||p.x-p.r-5>=w.x+w.w||p.y+p.r+5<=w.y||p.y-p.r-5>=w.y+w.h,'overlapping target '+(i+1));}
 }
});
test('every room wins without ads, including independently perturbed angles',()=>{
 for(let i=0;i<50;i++){
  assert.equal(replay(i,SOLUTIONS[i]).phase,'won','reference '+(i+1));
  const combos=3**SOLUTIONS[i].length;
  for(let k=0;k<combos;k++){let bits=k;const angles=SOLUTIONS[i].map(a=>{const d=(bits%3-1)*1.5;bits=Math.floor(bits/3);return a+d});assert.equal(replay(i,angles).phase,'won',`level ${i+1}, ${angles}`)}
 }
});
test('collected light targets persist across misses and save restoration',()=>{
 const index=SOLUTIONS.findIndex((s,i)=>i>=30&&s.length>1),g=new PuzzleGame(index);
 g.fireComplete(SOLUTIONS[index][0]*Math.PI/180);assert(g.flags.some(f=>f.startsWith('light-')));const flags=g.flags.filter(f=>f.startsWith('light-'));g.fireComplete(89*Math.PI/180);for(const id of flags)assert(g.flags.includes(id));const loaded=Object.assign(new PuzzleGame(index),JSON.parse(JSON.stringify(g)));for(const id of flags)assert(loaded.flags.includes(id));
});
test('hint follows any partial collection order and closed goals never obstruct normal shots',()=>{
 for(const [index,l] of LEVELS.entries()){
  const states=2**l.nodes.length;
  for(let mask=0;mask<states;mask++){
   const g=new PuzzleGame(index);g.flags=l.nodes.filter((_,n)=>mask&(1<<n)).map(n=>n.id);g.left=l.nodes.filter(n=>!g.flags.includes(n.id)).length+1;g.unlockRoute('complete');
   assert.equal(!!g.room().target,g.ready());let guard=0;
   while(g.phase==='aim'&&guard++<5){const route=g.route();assert(route,'partial route '+(index+1)+' mask '+mask);g.fireComplete(route.angle*Math.PI/180);}
   assert.equal(g.phase,'won','partial route win '+(index+1)+' mask '+mask);
  }
 }
});
test('gesture follows equal movements equally after long holds; full half circle, no bottom dead zone',()=>{
 const g=new AimGesture({x:320,y:325},{x:320,y:320});const a=g.move({x:350,y:320}),b=g.move({x:380,y:320});assert(Math.abs((b-a)-a)<1e-10);assert(g.canFire);assert(g.move({x:1200,y:340})>89*Math.PI/180);assert(g.move({x:-500,y:340})<-89*Math.PI/180);const tap=new AimGesture({x:320,y:320},{x:320,y:320});assert(!tap.canFire);const direct=new AimGesture({x:320,y:100},{x:320,y:320});assert(direct.canFire);assert.equal(direct.angle,0);
});
test('reversing at either angle limit responds immediately after dragging beyond it',()=>{
 for(const sign of [-1,1]){
  const g=new AimGesture({x:320,y:325},{x:320,y:320});
  g.move({x:320+sign*600,y:325});g.move({x:320+sign*900,y:325});
  assert.equal(g.angle,sign*89.5*Math.PI/180);
  const a=g.move({x:320+sign*895,y:325});
  assert(Math.abs(a)<89.5*Math.PI/180);assert(Math.abs(Math.abs(a)*180/Math.PI-(89.5-5*180/416))<1e-9);
 }
});
test('route/extra help requires completed voluntary ad; retry and new room have separate state',()=>{
 const g=new PuzzleGame(40),initial=g.left;assert(!g.unlockRoute('cancel'));assert(!g.unlockRoute('fail'));assert(!g.routeHint);assert(g.unlockRoute('complete'));assert(g.route());assert(!g.unlockRoute('complete'));assert(!g.help('extra','cancel'));assert(g.help('extra','complete'));assert.equal(g.left,initial+1);assert(!g.help('extra','complete'));g.start(41);assert(!g.assistUsed&&!g.routeHint&&!g.boostUsed);
});

