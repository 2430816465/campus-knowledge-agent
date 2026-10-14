import {createChoiceBattle,stepChoice,selectOffer,GROWTH} from '../games/rush/choice.js';
import fs from 'node:fs/promises';
export function desirability(b,g){
 if(!g.upgrade){const next=Math.min(48,g.op==='×'?b.count*g.value:b.count+g.value);return(next-b.count)*(b.count<12?4:b.count<24?2:1);}
 const id=g.upgrade;if(GROWTH[id].max&&b.growth[id]>=GROWTH[id].max)return 1;
 if(id==='heal')return b.core<65?35:0;
 if(id==='recruit')return(48-b.count)*1.4;
 if(id==='shield')return b.shield<10?6:1;
 if(id==='art'&&b.growth.art<2)return 24;
 if(id==='realm')return 23;
 return ({sword:19,art:12,chain:16,blast:14,damage:12,haste:11,range:6})[id]||0;
}
const report=[];
for(let stage=1;stage<=18;stage++){
 const b=createChoiceBattle(stage,{},'test-'+stage);
 for(let n=0;n<60*230&&b.status==='playing';n++){
  const gate=b.entities.find(e=>e.choices&&!e.hit&&e.y>240);
  if(gate){const pick=gate.choices.map((g,i)=>({i,value:desirability(b,g)})).sort((a,c)=>c.value-a.value)[0].i;b.targetX=42+(pick+.5)*396/gate.choices.length;}
  else {const boss=b.entities.find(e=>e.kind==='boss');if(boss)b.targetX=boss.x;}
  stepChoice(b,1/60);
 }
 report.push({stage,status:b.status,count:b.count,kills:b.kills,passed:b.passed,time:Math.round(b.time),growth:b.growth,remaining:b.entities.filter(e=>e.kind==='boss').map(e=>e.hp)});
}
const b=createChoiceBattle(1,{},'defense-test','defense');
for(let n=0;n<60*1500&&b.status==='playing';n++){
 if(b.offers){const id=[...b.offers].sort((a,c)=>desirability(b,{upgrade:c})-desirability(b,{upgrade:a}))[0];selectOffer(b,id);}
 stepChoice(b,1/60);
}
report.push({mode:'defense',status:b.status,wave:b.wave,core:b.core,time:Math.round(b.time),count:b.count,growth:b.growth,kills:b.kills});
await fs.mkdir(new URL('../artifacts/rush-choice-1.23.0/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../artifacts/rush-choice-1.23.0/simulation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
