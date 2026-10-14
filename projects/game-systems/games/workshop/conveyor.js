// Shared route coordinates drive both the belt and its cargo. All ports overlap
// their machine feet, and each source joins the same continuous trunk.
export function conveyorNetwork({farms,oven,counter,active}){
 const sources=farms.filter((f,i)=>!active||active[i]);
 const inlet={x:oven.x-oven.width*.3,y:oven.y+5},turn={x:oven.x-oven.width*.5-18,y:inlet.y};
 // In a tall layout the common lane stays ABOVE the next row of sprites.
 // In a wide layout it can meet the inlet directly, without a tiny zigzag.
 const gap=inlet.y-farms[0].y;
 const trunkY=gap<90?inlet.y:farms[0].y+Math.min(80,gap*.35);
 const routes=farms.map(f=>[{x:f.x,y:f.y-4},{x:f.x,y:trunkY},{x:turn.x,y:trunkY},turn,inlet]);
 const outlet={x:oven.x+oven.width*.3,y:oven.y+5},end={x:counter.x-counter.width*.3,y:counter.y+5},mid=(outlet.x+end.x)/2;
 const output=[outlet,{x:mid,y:outlet.y},{x:mid,y:end.y},end];
 // Split the trunk at every junction so overlapping routes never paint slats twice.
 const xs=[...new Set([...sources.map(f=>f.x),turn.x])].sort((a,b)=>a-b),edges=[];
 for(let i=1;i<xs.length;i++){const edge=[{x:xs[i-1],y:trunkY},{x:xs[i],y:trunkY}];if(xs[i-1]>=turn.x)edge.reverse();edges.push(edge);}
 sources.forEach(f=>edges.push([{x:f.x,y:f.y-4},{x:f.x,y:trunkY}]));
 edges.push([{x:turn.x,y:trunkY},turn],[turn,inlet]);
 for(let i=1;i<output.length;i++)edges.push([output[i-1],output[i]]);
 const joints=[...sources.map(f=>({x:f.x,y:trunkY})),{x:turn.x,y:trunkY},turn,...output.slice(1,-1)];
 return {routes,output,edges:edges.filter(([a,b])=>Math.hypot(b.x-a.x,b.y-a.y)>.01),joints};
}
export function routePoint(points,progress){
 if(progress<=0)return {...points[0]};if(progress>=1)return {...points.at(-1)};
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
 let distance=Math.max(0,Math.min(1,progress))*lengths.reduce((a,b)=>a+b,0);
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]&&lengths[i]>0){const t=distance/lengths[i];return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}distance-=lengths[i];}
 return {...points.at(-1)};
}
