import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
const solutions=JSON.parse(fs.readFileSync('output/puzzle/solutions.json','utf8'));
const key=g=>JSON.stringify([g.phase==='won',g.flags.filter(f=>!f.startsWith('wall:')&&!f.startsWith('plate:')||g.level.requires.includes(f)).sort(),g.removed.slice().sort(),g.activated,g.rotated]);
for(const s of solutions){let g=new PuzzleGame(s.level-1);s.windows=[];for(let i=0;i<s.angles.length;i++){const goal=Object.assign(Object.create(PuzzleGame.prototype),clone(g));goal.fireComplete(s.angles[i]*Math.PI/180);const wanted=key(goal);let ranges=[],lo=null;for(let d=-88;d<=88.25;d+=.25){const q=Object.assign(Object.create(PuzzleGame.prototype),clone(g));if(d<=88)q.fireComplete(d*Math.PI/180);const ok=d<=88&&key(q)===wanted;if(ok&&lo===null)lo=d;if(!ok&&lo!==null){ranges.push([lo,d-.25]);lo=null}}ranges.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));assert.ok(ranges.length);const range=ranges[0],d=(range[0]+range[1])/2;s.angles[i]=d;s.windows.push(range);g.fireComplete(d*Math.PI/180)}assert.equal(g.phase,'won');console.log(JSON.stringify(s))}
fs.writeFileSync('output/puzzle/solutions.json',JSON.stringify(solutions,null,2));
