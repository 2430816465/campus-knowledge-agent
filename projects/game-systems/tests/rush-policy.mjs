import {createBattle,step,gateValue} from '../games/rush/battle.js';
export function route(b,chooseGate){
 const boss=b.entities.find(e=>e.kind==='boss');
 const gate=b.entities.filter(e=>e.kind==='gates'&&!e.hit).sort((a,c)=>c.y-a.y)[0];
 const chest=b.entities.filter(e=>e.kind==='chest'&&e.loot!=='trap'&&!e.hit&&e.y>20&&e.y<620).sort((a,c)=>c.y-a.y|| (a.loot==='weapon'?-1:1))[0];
 const value=g=>g.effect?b.count*(1+({haste:.2,range:.15,damage:.25}[g.effect])):gateValue(b.count,g.op,g.value);
 const left=gate&&(chooseGate?chooseGate(gate)==='left':b.layoutVersion>=4&&gate.correctSide?gate.correctSide==='left':value(gate.left)>=value(gate.right)),split=gate?.split||240;
 const urgent=gate&&gate.y>500;
 let desired=urgent?(left?split-70:split+70):chest?chest.x:boss?boss.x:gate?(left?split-70:split+70):240;
 const half=(Math.min(8,b.count)-1)*13,min=42+half,max=438-half;
 const lower=urgent&&!left?Math.max(min,split+8):min,upper=urgent&&left?Math.min(max,split-8):max;
 const candidates=[desired,180,240,300,min,max,split-30,split+30].map(x=>Math.max(lower,Math.min(upper,x)));
 const traps=b.entities.filter(e=>e.loot==='trap'&&!e.dead&&e.y>20&&e.y<800);
 const rocks=b.entities.filter(e=>e.kind==='rock'&&!e.hit&&e.y>400&&e.y<750);
 const offsets=Array.from({length:Math.min(8,b.count)},(_,i)=>(i-(Math.min(8,b.count)-1)/2)*26);
 const risk=x=>traps.reduce((n,e)=>n+(offsets.some(o=>Math.abs(x+o-e.x)<43)?1000:0),0)+rocks.reduce((n,e)=>n+(offsets.some(o=>Math.abs(x+o-e.x)<42)?180:0),0)+Math.abs(x-desired);
 return candidates.sort((a,c)=>risk(a)-risk(c))[0];
}
export function play(stage,upgrades={},move=route){const b=createBattle(stage,upgrades,'test-'+stage);for(let i=0;i<6000&&b.status==='playing';i++){b.targetX=move(b);step(b,1/60);}return b;}
