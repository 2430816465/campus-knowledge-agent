import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
import {LEVELS} from '../games/marble/puzzle-levels.js';
import fs from 'node:fs';
const key=g=>JSON.stringify([g.phase==='won',g.flags.filter(f=>!f.startsWith('wall:')&&!f.startsWith('plate:')||g.level.requires.includes(f)).sort(),g.removed.slice().sort(),g.activated,g.rotated]);
const results=[];
for(let id=0;id<LEVELS.length;id++){
 let frontier=[{g:new PuzzleGame(id),angles:[],windows:[]}],solution=null;const seen=new Set();
 for(let depth=0;depth<LEVELS[id].shots&&!solution;depth++){
 const next=[];
 for(const entry of frontier){let ranges=[],prev=null,range=null;
 for(let d=-88;d<=88;d=Math.round((d+.05)*100)/100){const q=Object.assign(Object.create(PuzzleGame.prototype),clone(entry.g));q.fireComplete(d*Math.PI/180);const k=key(q);if(k!==prev){range={key:k,lo:d,hi:d,won:q.phase==='won'};ranges.push(range);prev=k}else range.hi=d}
 ranges=ranges.filter(r=>r.hi-r.lo>=1.5).sort((a,b)=>Number(b.won)-Number(a.won)||(b.hi-b.lo)-(a.hi-a.lo));
 for(const r of ranges){const angle=(r.lo+r.hi)/2,g=Object.assign(Object.create(PuzzleGame.prototype),clone(entry.g));g.fireComplete(angle*Math.PI/180);const angles=[...entry.angles,angle],windows=[...entry.windows,[r.lo,r.hi]];if(g.phase==='won'){solution={level:id+1,angles,windows};break}if(g.phase==='aim'&&!seen.has(r.key)&&r.key!==key(entry.g)){seen.add(r.key);next.push({g,angles,windows})}}if(solution)break}
 frontier=next;
 }
 results.push(solution||{level:id+1,failed:true});console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync('output/puzzle/solutions.json',JSON.stringify(results,null,2));if(results.some(r=>r.failed))process.exitCode=1;

