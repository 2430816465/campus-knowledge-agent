const assert=require('node:assert/strict');const G=require('../games/coop/src/game-shared.js');
function scene(){const w=G.createWorld(2,1);w.players.forEach(p=>Object.assign(p,{y:524,grounded:true,vy:0}));return w;}
for(const direction of[-1,1])for(const slot of[0,1]){
 const w=scene(),box=w.boxes[0],p=w.players[slot],other=w.players[1-slot];
 p.x=direction>0?box.x-35:box.x+box.w-1;other.x=direction>0?box.x+box.w-2:box.x-34;
 const initial=box.x,startOther=other.x;
 for(let i=0;i<20;i++){const inputs=[{},{}];inputs[slot]=direction>0?{right:true}:{left:true};G.stepWorld(w,inputs,1/60);assert.equal(other.y,524,'side pushing never teleports teammate onto box');}
 assert.ok((box.x-initial)*direction>30,'crate continues moving');assert.ok((other.x-startOther)*direction>30,'teammate moves with crate');
 assert.equal(G.rectsOverlap(box,G.bodyRect(other)),false,'contact resolves without body penetration');
}
{
 const w=scene(),b=w.boxes[0];w.players[0].x=b.x-35;Object.assign(w.players[1],{x:b.x+10,y:b.y-56});G.stepWorld(w,[{right:true},{}],1/60);assert.ok(b.x>236,'player on top does not block lateral crate motion');
}
{
 const w=scene(),b=w.boxes[0];b.x=898;w.boxes.push({...b,id:'second',x:950});w.players[0].x=863;w.players[1].x=1000;
 const before=JSON.stringify(w.boxes.map(b=>b.x));G.stepWorld(w,[{right:true},{}],1/60);
 assert.equal(JSON.stringify(w.boxes.map(b=>b.x)),before,'wall behind teammate blocks entire crate chain');assert.equal(w.players[1].x,1000);
}
{
 const w=scene(),b=w.boxes[0];w.boxes.push({...b,id:'second',x:288});w.players[0].x=201;w.players[1].x=338;
 for(let t=0;t<12;t++)G.stepWorld(w,[{right:true},{}],1/60);
 assert.ok(w.boxes.every(b=>b.x>280),'two crates and teammate move together');assert.ok(w.players[1].x>370);
}
{
 const w=scene(),b=w.boxes[0];w.players[0].x=b.x-35;w.players[1].x=b.x+b.w-2;
 for(let tick=0;tick<20;tick++)G.stepWorld(w,[{right:true},{jump:tick===0}],1/60);
 assert.ok(b.x>236,'ordinary teammate jump clears the crate without a teleport');
}
console.log('PASS crate/teammate chains: both directions/slots, no teleport, walls, two crates, rider and escape jump');
