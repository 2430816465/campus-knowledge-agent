import fs from 'node:fs';
import {LEVELS} from '../games/marble/puzzle-levels.js';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
const current=JSON.parse(fs.readFileSync('output/puzzle-v3/solutions.json'));
function replay(l,angles){const g=new PuzzleGame(0);g.level=clone(l);g.left=l.shots;for(const a of angles){if(g.phase!=='aim')return false;g.fireComplete(a*Math.PI/180)}return g.phase==='won'}
function assess(l,seed){const angles=seed.slice(),widths=[];for(let j=0;j<angles.length;j++){let ranges=[],r=null;for(let k=-40;k<=40;k++){const a=angles[j]+k*.2,q=angles.slice();q[j]=a;if(replay(l,q)){if(!r){r=[a,a];ranges.push(r)}else r[1]=a}else r=null}ranges.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));r=ranges[0];if(!r)return null;angles[j]=(r[0]+r[1])/2;widths.push(r[1]-r[0])}return replay(l,angles)?{l,angles,width:Math.min(...widths)}:null}
for(let i=0;i<50;i++){
 if(current[i].minWidth>=2||!LEVELS[i].retainedFrom)continue;
 const origin=clone(LEVELS[i]),candidates=[];
 for(let j=0;j<origin.nodes.length;j++)for(const delta of [-12,12])for(const axis of ['x','y']){const l=clone(origin);l.nodes[j][axis]+=delta;l.nodes[j].r=Math.max(l.nodes[j].r,23);candidates.push(l)}
 for(const delta of [-16,16])for(const axis of ['x','y']){const l=clone(origin);l.exit[axis]+=delta;l.exit.r=28;candidates.push(l)}
 for(let j=0;j<origin.plates.length;j++)for(const scale of [1.3,1.6]){const l=clone(origin),p=l.plates[j],cx=(p.x1+p.x2)/2,cy=(p.y1+p.y2)/2;for(const k of ['x1','x2'])p[k]=cx+(p[k]-cx)*scale;for(const k of ['y1','y2'])p[k]=cy+(p[k]-cy)*scale;candidates.push(l)}
 for(let j=0;j<origin.walls.length;j++)for(const delta of [-18,18])for(const axis of ['x','y','length']){
  const l=clone(origin),w=l.walls[j];if(axis==='length'){if(w.w>w.h){w.x+=Math.abs(delta)/2;w.w-=Math.abs(delta)}else{w.y+=Math.abs(delta)/2;w.h-=Math.abs(delta)}}else w[axis]+=delta;candidates.push(l);
 }
 let best=assess(origin,SOLUTIONS[i]);
 for(const l of candidates){const q=assess(l,SOLUTIONS[i]);if(q&&q.width>(best?.width||0))best=q;if(best?.width>=3.2)break}
 if(best?.width>2.5){LEVELS[i]=best.l;SOLUTIONS[i]=best.angles;console.log('OPEN',i+1,best.width.toFixed(2))}else console.log('KEEP',i+1,best?.width);
}
fs.writeFileSync('games/marble/puzzle-levels.js','// Campaign 3: fixed authored geometry with wider reflection passages.\nexport const LEVELS = '+JSON.stringify(LEVELS,null,2)+';\n');
fs.writeFileSync('games/marble/puzzle-solutions.js','export const SOLUTIONS = '+JSON.stringify(SOLUTIONS)+';\n');
