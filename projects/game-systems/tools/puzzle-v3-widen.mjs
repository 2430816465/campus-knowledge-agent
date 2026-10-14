import fs from 'node:fs';
import {LEVELS} from '../games/marble/puzzle-levels.js';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
const old=JSON.parse(fs.readFileSync('output/puzzle-v3/solutions.json'));
function replay(l,angles){const g=new PuzzleGame(0);g.level=clone(l);g.left=l.shots;for(const a of angles){if(g.phase!=='aim')return false;g.fireComplete(a*Math.PI/180)}return g.phase==='won'}
for(let i=0;i<50;i++){
 if(old[i].minWidth>=2||!LEVELS[i].retainedFrom)continue;
 let best=null;
 for(const size of [21,23,25,27])for(const exitSize of [25,28,31]){
  const l=clone(LEVELS[i]);l.nodes.forEach(n=>n.r=size);l.exit.r=exitSize;const angles=SOLUTIONS[i].slice(),widths=[];
  for(let j=0;j<angles.length;j++){
   const ranges=[];let range=null;
   for(let k=-35;k<=35;k++){const a=angles[j]+k*.2,q=angles.slice();q[j]=a;if(replay(l,q)){if(!range){range=[a,a];ranges.push(range)}else range[1]=a}else range=null}
   ranges.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));if(!ranges.length){widths.push(0);break}range=ranges[0];angles[j]=(range[0]+range[1])/2;widths.push(range[1]-range[0]);
  }
  const width=Math.min(...widths);if(replay(l,angles)&&(!best||width>best.width))best={l,angles,width};
 }
 if(best&&best.width>2.5){LEVELS[i]=best.l;SOLUTIONS[i]=best.angles;console.log('WIDEN',i+1,best.width.toFixed(2),best.angles)}
 else console.log('RETAIN',i+1,best?.width);
}
fs.writeFileSync('games/marble/puzzle-levels.js','// Campaign 3: fixed authored geometry, adjusted for touch tolerance.\nexport const LEVELS = '+JSON.stringify(LEVELS,null,2)+';\n');
fs.writeFileSync('games/marble/puzzle-solutions.js','// Verified campaign 3 reference angles in degrees.\nexport const SOLUTIONS = '+JSON.stringify(SOLUTIONS)+';\n');
