import test from 'node:test';
import assert from 'node:assert/strict';
import {conveyorNetwork,routePoint} from '../games/workshop/conveyor.js';
test('each material route starts at its own farm, shares an oven port and stays continuous at every bend',()=>{
 for(const portrait of [true,false]){
  const farms=[120,360,600].map(x=>({x,y:portrait?630:290,width:138})),oven={x:portrait?288:870,y:portrait?870:312,width:156},counter={x:portrait?570:1140,y:portrait?920:327,width:166},n=conveyorNetwork({farms,oven,counter});
  n.routes.forEach((route,i)=>{assert.equal(routePoint(route,0).x,farms[i].x);assert.deepEqual(routePoint(route,1),n.routes[0].at(-1));for(let j=1;j<route.length;j++){const a=route[j-1],b=route[j];assert(a.x===b.x||a.y===b.y);}
   let prior=routePoint(route,0);for(let k=1;k<=1000;k++){const point=routePoint(route,k/1000);assert(Math.hypot(point.x-prior.x,point.y-prior.y)<2);prior=point;}
  });
  assert.deepEqual(routePoint(n.output,1),n.output.at(-1));assert(n.edges.every(([a,b])=>a.x===b.x||a.y===b.y));
 }
});
