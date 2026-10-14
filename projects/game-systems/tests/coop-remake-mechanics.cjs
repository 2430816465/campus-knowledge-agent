const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const G=require('../games/coop/src/game-shared.js');
const tick=(w,inputs=[{},{}],n=1)=>{for(let t=0;t<n;t++)G.stepWorld(w,inputs,1/60);};
let liquids=0;
for(let i=3;i<50;i++)for(const stage of G.LEVELS[i].rooms||[G.LEVELS[i]]){
 for(const h of stage.hazards.filter(h=>h.kind))for(const slot of[0,1]){
  const w=G.createWorld(i,1);w.roomIndex=(G.LEVELS[i].rooms||[G.LEVELS[i]]).indexOf(stage);
  Object.assign(w.players[slot],{x:h.x+h.w/2-18,y:h.y+7-56,grounded:true,vy:0});tick(w);
  assert.equal(!!w.fall,h.safeRole!==slot,`level ${i+1} ${h.kind} role ${slot}`);liquids++;
 }
}
const w=G.createWorld(5,1),stage=G.stageFor(w),sw=stage.switches[0];
Object.assign(w.players[1],{x:sw.x,y:sw.y+sw.h-56,grounded:true});tick(w,[{},{interactPressed:true}]);assert(!w.flags[sw.key]);
Object.assign(w.players[0],{x:sw.x,y:sw.y+sw.h-56,grounded:true});tick(w,[{interactPressed:true},{}]);assert(w.flags[sw.key]);
{
 const w=G.createWorld(10,1),s=G.stageFor(w),gem=s.crystals[0];
 Object.assign(w.players[1-gem.role],{x:gem.x,y:gem.y,grounded:true});tick(w);assert(!w.flags[gem.key]);
 Object.assign(w.players[gem.role],{x:gem.x,y:gem.y,grounded:true});tick(w);assert(w.flags[gem.key]);
}
{
 const w=G.createWorld(6,1),s=G.stageFor(w),leaf=s.platforms.find(p=>p.balcony);
 Object.assign(w.players[0],{x:leaf.x+20,y:leaf.y+80-56,grounded:true});tick(w,[{jumpPressed:true},{}]);tick(w,[{},{}],55);
 assert.equal(w.players[0].y,leaf.y-56);assert(w.players[0].grounded,'leaf can be jumped through and landed on');
}
{
 const w=G.createWorld(10,1),s=G.stageFor(w);
 w.players.forEach((p,i)=>Object.assign(p,{x:s.roleExits[i].x,y:s.roleExits[i].y+s.roleExits[i].h-56,grounded:true}));tick(w);assert.equal(w.phase,'playing','unearned exit blocked');
 s.exitRequires.forEach(k=>w.flags[k]=true);tick(w);assert.equal(w.phase,'intermission');
}
// Load the GENERATED worker with precisely its browser importScripts contract.
const base='games/coop/src/';const ctx=vm.createContext({console,Map,Set,Math,JSON,Date,Uint8Array,Uint32Array,setInterval:()=>0,clearInterval:()=>{},postMessage:()=>{},crypto:require('node:crypto').webcrypto});
ctx.self=ctx;ctx.globalThis=ctx;ctx.importScripts=(...paths)=>paths.forEach(p=>vm.runInContext(fs.readFileSync(base+p,'utf8'),ctx));
vm.runInContext(fs.readFileSync(base+'phone-host-worker.js','utf8'),ctx);
assert.equal(ctx.RushGame.LEVELS.length,50);assert.equal(JSON.stringify(ctx.RushGame.LEVELS),JSON.stringify(G.LEVELS),'phone and Node share all 61 stages');
for(const index of[1,12,40,49]){
 const a=G.createWorld(index,1),b=ctx.RushGame.createWorld(index,1);
 for(let t=0;t<200;t++){const inputs=[{right:t<100,jumpPressed:t%45===0,interactPressed:t%25===0},{left:t>100}];G.stepWorld(a,inputs,1/60);ctx.RushGame.stepWorld(b,inputs,1/60);}
 assert.equal(JSON.stringify(a),JSON.stringify(b),'worker stepping parity level '+(index+1));
}
console.log('PASS: '+liquids+' element/role cases, rune/crystal ownership, leaf collision, exit prerequisites, actual worker 50 levels/61 stages and physics parity.');
