import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
import {LEVELS} from '../games/marble/puzzle-levels.js';
const solutions=JSON.parse(fs.readFileSync('output/puzzle/solutions.json','utf8'));
assert.equal(LEVELS.length,20);assert.equal(new Set(LEVELS.map(l=>l.name)).size,20);
for(const s of solutions)for(const portion of [.15,.5,.85]){const g=new PuzzleGame(s.level-1);for(const [lo,hi] of s.windows){assert.ok(hi-lo>=1.5);g.fireComplete((lo+(hi-lo)*portion)*Math.PI/180)}assert.equal(g.phase,'won',`free tolerance ${s.level}/${portion}`);assert.equal(g.assistUsed,false);assert.ok(g.used<=g.level.shots)}
const relay=new PuzzleGame(14);relay.flags=['n0','n1'];relay.phase='flight';relay.path=[];relay.finish();assert.deepEqual(relay.flags,[]);
// Direct geometric hit fixture tests direction/charge independently of the solver.
function fixture(node){const g=new PuzzleGame(6);g.level={...g.level,origin:{x:320,y:320},walls:[],plates:[],nodes:[{id:'n0',x:320,y:180,r:14,kind:'lock',...node}],requires:['n0'],exit:{x:80,y:80,r:18}};return g}
const wrong=fixture({direction:'down'});wrong.shoot(0);wrong.step(.4);assert.ok(!wrong.flags.includes('n0'));assert.ok(wrong.ball.vy>0);
const correct=fixture({direction:'up'});correct.shoot(0);correct.step(.4);assert.ok(correct.flags.includes('n0'));
const charge=fixture({minBounces:3});charge.shoot(0);charge.step(.4);assert.ok(!charge.flags.includes('n0'));
const charged=fixture({minBounces:3});charged.shoot(0);charged.ball.bounces=3;charged.step(.4);assert.ok(charged.flags.includes('n0'));
const order=fixture({needs:['prior']});order.shoot(0);order.step(.4);assert.ok(!order.flags.includes('n0'));
const preview=new PuzzleGame(19),before=JSON.stringify(preview);assert.ok(preview.preview(solutions[19].angles[0]*Math.PI/180,3).length>1);assert.equal(JSON.stringify(preview),before);
const assist=new PuzzleGame(14);assert.equal(assist.help('preview','cancel'),false);assert.equal(assist.help('extra','fail'),false);assert.equal(assist.help('preview','complete'),true);assert.equal(assist.help('extra','complete'),false);assist.shoot(0);assert.equal(assist.longPreview,false);assist.start(14);assert.equal(assist.assistUsed,false);
for(let i=0;i<20;i++){const l=LEVELS[i];for(const n of l.nodes){assert.ok(n.x>=30&&n.x<=610&&n.y>=45&&n.y<=320);for(const m of l.nodes)if(m!==n)assert.ok(Math.hypot(n.x-m.x,n.y-m.y)>n.r+m.r+10)}}
console.log('PASS 60 free solution replays, 20 unique layouts, relay reset/order, direction, true bounce charging, non-mutating preview, bounded assist, target clearance');
