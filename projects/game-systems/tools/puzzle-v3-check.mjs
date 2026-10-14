import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
import {LEVELS} from '../games/marble/puzzle-levels.js';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
const report=JSON.parse(fs.readFileSync('output/puzzle-v3/solutions.json','utf8'));
assert.equal(LEVELS.length,50);assert.equal(new Set(LEVELS.map(l=>l.name)).size,50);
assert.equal(new Set(LEVELS.map(l=>JSON.stringify([l.origin,l.walls,l.plates,l.nodes,l.exit,l.portals,l.splitters]))).size,50);
let replays=0;
function replay(i,angles,dt=1/60){const g=new PuzzleGame(i);for(const a of angles){assert.ok(g.shoot(a*Math.PI/180));for(let t=0;t<1000&&g.phase==='flight';t++)g.step(dt)}replays++;return g}
for(const s of report){
 const i=s.level-1;assert.ok(s.minWidth>=1.99,`angle tolerance ${s.level}`);
 for(const dt of [1/60,.01,.04]){const g=replay(i,SOLUTIONS[i],dt);assert.equal(g.phase,'won',`frame rate ${s.level}/${dt}`);assert.equal(g.assistUsed,false);assert.ok(g.used<=g.level.shots)}
 for(let j=0;j<s.windows.length;j++){const [lo,hi]=s.windows[j];for(let a=lo;a<=hi+1e-8;a+=.1){const angles=s.angles.slice();angles[j]=a;assert.equal(replay(i,angles).phase,'won',`sampled window ${s.level}/${j}/${a}`)}}
 const combinations=s.windows.reduce((list,[lo,hi])=>list.flatMap(a=>[lo,(lo+hi)/2,hi].map(v=>[...a,v])),[[]]);
 for(const angles of combinations)assert.equal(replay(i,angles).phase,'won',`window combination ${s.level}/${angles}`);
 const g=new PuzzleGame(i);assert.equal(g.unlockRoute('cancel'),false);assert.equal(g.unlockRoute('fail'),false);assert.ok(g.unlockRoute('complete'));
 for(let n=0;n<g.level.shots&&g.phase==='aim';n++){const before=JSON.stringify(g),r=g.route();assert.ok(r);assert.equal(JSON.stringify(g),before);g.fireComplete(r.angle*Math.PI/180);assert.deepEqual(g.lastPaths,r.paths)}
 assert.equal(g.phase,'won',`exact hint ${s.level}`);
}
function fixture(overrides){const g=new PuzzleGame(0);g.level={...g.level,origin:{x:320,y:320},walls:[],plates:[],portals:[],splitters:[],nodes:[],requires:['never'],exit:{x:50,y:50,r:20},...overrides};return g}
const portal=fixture({portals:[{id:'p0',pair:'p1',x:320,y:200,r:20},{id:'p1',pair:'p0',x:450,y:200,r:20}]});portal.shoot(0);portal.step(.3);assert.equal(portal.ball.vx,0);assert.equal(portal.ball.vy,-390);assert.ok(portal.path.some(p=>p.jump));assert.ok(portal.ball.x===450);assert.ok(portal.ball.bounces===0);
const mirrors=fixture({plates:[{x1:250,y1:180,x2:390,y2:180,fragile:true},{x1:250,y1:80,x2:390,y2:80}]});mirrors.fireComplete(0);assert.deepEqual(mirrors.brokenPlates,[0]);assert.equal(mirrors.room().plates[0].index,1);mirrors.fireComplete(0);assert.ok(mirrors.flags.includes('plate:1'));assert.deepEqual(mirrors.brokenPlates,[0]);mirrors.start(26);assert.deepEqual(mirrors.brokenPlates,[]);
const prepare=new PuzzleGame(26);prepare.fireComplete(SOLUTIONS[26][0]*Math.PI/180);assert.equal(prepare.phase,'aim');assert.ok(prepare.flags.includes('key'));assert.deepEqual(prepare.brokenPlates,[0]);const stillMirror=Object.assign(Object.create(PuzzleGame.prototype),clone(prepare));stillMirror.brokenPlates=[];stillMirror.fireComplete(SOLUTIONS[26][1]*Math.PI/180);assert.notEqual(stillMirror.phase,'won');prepare.fireComplete(SOLUTIONS[26][1]*Math.PI/180);assert.equal(prepare.phase,'won');
const split=fixture({splitters:[{id:'s',x:320,y:220,r:20,spread:30}]});split.shoot(0);split.step(.25);assert.equal(split.balls.filter(b=>!b.dead).length,2);assert.equal(split.balls.length,3);assert.ok(split.balls.slice(1).every(b=>b.fork));split.balls[1].dead=true;split.step(.01);assert.equal(split.phase,'flight');assert.equal(split.balls.filter(b=>!b.dead).length,1);
const forkOnly=fixture({nodes:[{id:'n',x:320,y:200,r:20,forkOnly:true,relay:true}]});forkOnly.shoot(0);forkOnly.step(.3);assert.ok(!forkOnly.flags.includes('n'));forkOnly.ball.fork=true;forkOnly.ball.x=320;forkOnly.ball.y=260;forkOnly.ball.vy=-390;forkOnly.step(.2);assert.ok(forkOnly.flags.includes('n'));forkOnly.finish();assert.ok(!forkOnly.flags.includes('n'));
const preview=new PuzzleGame(49),before=JSON.stringify(preview);assert.ok(preview.preview(SOLUTIONS[49][0]*Math.PI/180,3).length>1);assert.equal(JSON.stringify(preview),before);
const assist=new PuzzleGame(14);assert.equal(assist.help('preview','cancel'),false);assert.equal(assist.help('extra','fail'),false);assert.ok(assist.help('preview','complete'));assert.equal(assist.help('extra','complete'),false);assist.shoot(0);assert.equal(assist.longPreview,false);
console.log(`PASS ${replays} free replays, all 50 exact branch hints, sampled >=2 degree safe intervals, frame sizes, multi-shot combinations, portal direction, persistent one-use mirrors, two-stage mirror necessity, max-two splitting, fork-only relay, nonmutating preview and bounded rewards`);
