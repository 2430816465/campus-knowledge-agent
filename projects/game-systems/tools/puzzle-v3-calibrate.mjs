import fs from 'node:fs';
import {PuzzleGame} from '../games/marble/puzzle-state.js';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
import {LEVELS} from '../games/marble/puzzle-levels.js';
function replay(index,angles){const g=new PuzzleGame(index);for(const a of angles){if(g.phase!=='aim')return false;g.fireComplete(a*Math.PI/180)}return g.phase==='won'}
const report=[];
for(let i=0;i<50;i++){
 const angles=SOLUTIONS[i].slice(),windows=[];
 for(let j=0;j<angles.length;j++){
  let ranges=[],r=null;
  for(let k=-160;k<=160;k++){const a=angles[j]+k*.05,q=angles.slice();q[j]=a;const ok=replay(i,q);
   if(ok){if(!r){r=[a,a];ranges.push(r)}else r[1]=a}else r=null;}
  ranges.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));r=ranges[0];if(!r)throw Error('No reference '+(i+1));angles[j]=(r[0]+r[1])/2;windows.push(r);
 }
 // Recompute around the new centers and retain a sampled 80% inner interval.
 for(let j=0;j<angles.length;j++){
  const center=angles[j];let lo=center,hi=center;
  while(lo>center-10){const q=angles.slice();q[j]=lo-.05;if(!replay(i,q))break;lo-=.05}
  while(hi<center+10){const q=angles.slice();q[j]=hi+.05;if(!replay(i,q))break;hi+=.05}
  angles[j]=(lo+hi)/2;windows[j]=[lo+(hi-lo)*.1,hi-(hi-lo)*.1];
 }
 const min=Math.min(...windows.map(([a,b])=>b-a));report.push({level:i+1,name:LEVELS[i].name,angles,windows,minWidth:min});
 console.log(i+1,LEVELS[i].name,'min width',min.toFixed(2),angles);
}
fs.writeFileSync('output/puzzle-v3/solutions.json',JSON.stringify(report,null,2));
fs.writeFileSync('games/marble/puzzle-solutions.js','// Verified campaign 3 reference angles in degrees.\nexport const SOLUTIONS = '+JSON.stringify(report.map(s=>s.angles))+';\n');
