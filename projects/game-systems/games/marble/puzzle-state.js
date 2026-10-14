import {LEVELS} from './puzzle-levels.js';
import {LEVELS as HARD_LEVELS} from './puzzle-hard-levels.js';
import {SOLUTIONS as HARD_SOLUTIONS} from './puzzle-hard-solutions.js';
import {nextCollision,reflect} from './physics.js';
import {SOLUTIONS} from './puzzle-solutions.js';
export const clone=x=>JSON.parse(JSON.stringify(x));
const routeCache=new WeakMap();
export class PuzzleGame{
 constructor(index=0,campaign='normal'){this.campaign=campaign;this.start(index)}
 start(index){
  this.level=clone((this.campaign==='hard'?HARD_LEVELS:LEVELS)[index]);this.index=index;this.phase='aim';this.left=this.level.shots;this.used=0;
  this.flags=[];this.removed=[];this.activated=[];this.rotated=[];this.brokenPlates=[];this.splitUsed=[];
  this.boostUsed=false;this.routeHint=false;this.assistUsed=false;this.longPreview=false;this.recorded=false;
  this.trace=[];this.paths=[];this.lastPaths=[];this.path=[];this.lastPath=[];this.balls=[];this.ball=null;
  this.effects=[];this.sounds=[];this.shotTime=0;this.notice=this.level.hint;
 }
 room(ball){
  const l=this.level,walls=l.walls.filter(w=>!this.removed.includes(w.id)&&(w.active!==false||this.activated.includes(w.id)));
  if(l.boss&&this.ready())walls.splice(0,walls.length,...walls.filter(w=>w.id!=='shield'));
  const nodes=l.nodes.filter(n=>!this.flags.includes(n.id));
  const portals=(l.portals||[]).filter(p=>p.id!==ball?.ignorePortal);
  const splitters=(l.splitters||[]).filter(s=>!this.splitUsed.includes(s.id));
  return {width:640,height:360,walls,columns:[],
   plates:l.plates.map((p,i)=>({...p,index:i,...(this.rotated.includes(i)?{y1:p.y2,y2:p.y1}:{})})).filter(p=>!this.brokenPlates.includes(p.index)),
   enemies:[...nodes,...portals.map(p=>({...p,kind:'portal'})),...splitters.map(s=>({...s,kind:'splitter'}))].map(n=>({...n,hp:1,type:'node'})),target:l.revision==='normal-2'&&!this.ready()?null:{...l.exit}};
 }
 ready(){return this.level.requires.every(id=>this.flags.includes(id))}
 event(kind,x,y){this.effects.push({kind,x,y,life:.45});if(this.effects.length>40)this.effects.shift();this.sounds.push({kind:kind==='break'?'explode':kind==='win'?'reward':kind==='switch'||kind==='portal'||kind==='split'?'chain':kind==='hurt'?'hurt':'bounce'})}
 shoot(angle){
  if(this.phase!=='aim'||this.left<=0||!Number.isFinite(angle)||Math.abs(angle)>=Math.PI/2)return false;
  this.trace=[];this.splitUsed=[];this.longPreview=false;this.left--;this.used++;this.shotTime=0;
  this.ball={...this.level.origin,id:0,vx:Math.sin(angle)*390,vy:-Math.cos(angle)*390,r:5,time:0,hits:0,bounces:0,portals:0,dead:false};
  this.balls=[this.ball];this.paths=[[{...this.level.origin}]];this.path=this.paths[0];this.phase='flight';this.sounds.push({kind:'launch'});return true;
 }
 finish(){
  this.lastPaths=clone(this.paths);this.lastPath=this.lastPaths[0]||[];this.ball=null;this.balls=[];
  if(this.phase!=='won'){this.flags=this.flags.filter(id=>!this.level.nodes.some(n=>n.id===id&&n.relay));this.phase=this.left?'aim':'failed'}
  this.notice=this.phase==='failed'?'发射次数用尽 · 可以免费重试':this.level.hint;
 }
 contact(b,h,room){
  const path=this.paths[b.id];path.push({x:b.x,y:b.y});b.hits++;
  this.trace.push({kind:h.kind,id:h.id,ball:b.id,x:b.x,y:b.y,bounces:b.bounces,vx:b.vx,vy:b.vy});let bounce=true;
  if(h.kind==='bottom'){b.dead=true;return}
  if(h.kind==='plate'){
   const p=room.plates[h.id],id=p.index;
   if(!this.flags.includes('plate:'+id))this.flags.push('plate:'+id);
   if(p.fragile){this.brokenPlates.push(id);this.event('break',b.x,b.y)}
  }
  if(h.kind==='rect'){
   const w=room.walls[Number(h.id.slice(1))];if(!this.flags.includes('wall:'+w.id))this.flags.push('wall:'+w.id);
   if(w.hazard){this.event('hurt',b.x,b.y);b.dead=true;return}
   if(w.breakable){this.removed.push(w.id);this.event('break',b.x,b.y);bounce=false}
  }
  if(h.kind==='enemy'){
   const n=room.enemies.find(n=>n.id===h.id);
   if(n.kind==='portal'){
    const dest=this.level.portals.find(p=>p.id===n.pair);b.portals++;
    if(!dest||b.portals>6){b.dead=true;return}
    const speed=Math.hypot(b.vx,b.vy),offset=dest.r+b.r+1;
    b.x=dest.x+b.vx/speed*offset;b.y=dest.y+b.vy/speed*offset;b.ignorePortal=dest.id;
    path.push({x:b.x,y:b.y,jump:true});if(!this.flags.includes(n.id))this.flags.push(n.id);
    this.event('portal',dest.x,dest.y);bounce=false;
   }else if(n.kind==='splitter'){
    this.splitUsed.push(n.id);if(!this.flags.includes(n.id))this.flags.push(n.id);this.event('split',b.x,b.y);
    // Replace the incoming ball by two branches. No recursive split; at most two live balls.
    if(this.balls.length===1){
     const a=Math.atan2(b.vy,b.vx),spread=(n.spread||30)*Math.PI/180;
     for(const sign of [-1,1]){const id=this.paths.length,vx=Math.cos(a+sign*spread)*390,vy=Math.sin(a+sign*spread)*390;
      this.paths.push([{x:b.x,y:b.y}]);this.balls.push({...b,id,vx,vy,fork:true,ignorePortal:null,dead:false});}
     b.dead=true;return;
    }
    bounce=false;
   }else{
    const dir=!n.direction||({right:b.vx>0,left:b.vx<0,up:b.vy<0,down:b.vy>0}[n.direction]);
    if(dir&&(!n.forkOnly||b.fork)&&b.bounces>=(n.minBounces||0)&&(n.needs||[]).every(id=>this.flags.includes(id))){
     this.flags.push(n.id);this.removed.push(...(n.remove||[]));this.activated.push(...(n.activate||[]));
     if(n.rotate!==undefined){this.rotated.push(n.rotate);this.flags=this.flags.filter(f=>f!=='plate:'+n.rotate)}
     this.event('switch',b.x,b.y);bounce=false;
    }else this.event('hurt',b.x,b.y);
   }
  }
  if(h.kind==='target'&&this.ready()&&b.bounces>=(this.level.exit.minBounces||0)){this.phase='won';this.event('win',b.x,b.y);return}
  if(bounce){b.bounces++;Object.assign(b,reflect(b.vx,b.vy,h.nx,h.ny));this.event('bounce',b.x,b.y)}
  b.x+=b.vx/390*.025;b.y+=b.vy/390*.025;
  if(b.hits>=(this.level.contacts||12))b.dead=true;
 }
 step(dt){
  for(const e of this.effects)e.life-=dt;this.effects=this.effects.filter(e=>e.life>0);
  let guard=0;
  while(dt>1e-7&&this.phase==='flight'&&guard++<150){
   const live=this.balls.filter(b=>!b.dead);if(!live.length||this.shotTime>=8){this.finish();break}
   let event=null,time=Math.min(dt,8-this.shotTime);
   for(const b of live){
    if(b.ignorePortal){const p=this.level.portals?.find(p=>p.id===b.ignorePortal);if(!p||Math.hypot(b.x-p.x,b.y-p.y)>p.r+b.r+2)b.ignorePortal=null;}
    const room=this.room(b),h=nextCollision(room,b,time);
    if(h&&(!event||h.t<time-1e-7||Math.abs(h.t-time)<1e-7&&b.id<event.b.id)){event={b,h,room};time=h.t;}
   }
   for(const b of live){b.x+=b.vx*time;b.y+=b.vy*time;b.time+=time}
   this.shotTime+=time;dt-=time;
   if(event)this.contact(event.b,event.h,event.room);
   if(this.phase==='won'){this.finish();break}
   this.ball=this.balls.find(b=>!b.dead)||null;
   if(!this.ball||this.shotTime>=8)this.finish();
  }
 }
 fireComplete(angle){if(!this.shoot(angle))return false;for(let i=0;i<600&&this.phase==='flight';i++)this.step(1/60);return this.phase==='won'}
 preview(angle,count=1){const sim=Object.assign(Object.create(PuzzleGame.prototype),clone(this));sim.effects=[];sim.sounds=[];if(!sim.shoot(angle))return [];for(let i=0;i<600&&sim.phase==='flight'&&sim.path.length<=count;i++)sim.step(1/120);return sim.path.length>count?sim.path.slice(0,count+1):sim.path.concat(sim.ball?[{x:sim.ball.x,y:sim.ball.y}]:[])}
 route(){
  if(!this.routeHint||this.phase!=='aim')return null;
  const key=JSON.stringify([this.index,this.left,this.flags,this.removed,this.activated,this.rotated,this.brokenPlates]);
  const cached=routeCache.get(this);if(cached?.key===key)return cached.value;
  const angles=(this.campaign==='hard'?HARD_SOLUTIONS:SOLUTIONS)[this.index]||[];
  if(this.level.revision==='normal-2'){
   const sim=Object.assign(Object.create(PuzzleGame.prototype),clone(this));let first=null,shots=0;
   for(const [i,degrees] of angles.entries()){
    const node=this.level.nodes[i];if(node&&sim.flags.includes(node.id))continue;
    if(sim.phase==='won'||sim.left<=0)break;
    sim.fireComplete(degrees*Math.PI/180);shots++;
    if(!first)first={angle:degrees,points:clone(sim.lastPath),paths:clone(sim.lastPaths)};
   }
   const value=sim.phase==='won'&&first?{...first,remaining:shots}:null;
   routeCache.set(this,{key,value});return value;
  }
  for(let from=angles.length-1;from>=0;from--){
   if(angles.length-from>this.left)continue;
   const sim=Object.assign(Object.create(PuzzleGame.prototype),clone(this));let first=null;
   for(const degrees of angles.slice(from)){sim.fireComplete(degrees*Math.PI/180);if(!first)first={angle:degrees,points:clone(sim.lastPath),paths:clone(sim.lastPaths),remaining:angles.length-from};}
   if(sim.phase==='won'){routeCache.set(this,{key,value:first});return first;}
  }
  routeCache.set(this,{key,value:null});return null;
 }
 unlockRoute(outcome){if(outcome!=='complete'||this.routeHint||!['aim','failed'].includes(this.phase))return false;this.boostUsed??=this.assistUsed;this.routeHint=true;this.assistUsed=true;return true}
 help(kind,outcome){if(this.index<3||(this.boostUsed??this.assistUsed)||!['aim','failed'].includes(this.phase)||!['extra','preview'].includes(kind)||kind==='preview'&&this.phase!=='aim')return false;if(outcome==='cancel'||outcome==='fail')return false;if(outcome!=='complete')return false;this.assistUsed=true;this.boostUsed=true;if(kind==='extra'){this.left++;this.phase='aim'}else this.longPreview=true;return true}
 describe(){return {mode:'ruins',coordinates:'640x360, top-left origin, +x right, +y down',level:this.index+1,name:this.level.name,phase:this.phase,shotsLeft:this.left,shotsUsed:this.used,flags:this.flags,removed:this.removed,brokenPlates:this.brokenPlates,assistUsed:this.assistUsed,longPreview:this.longPreview,routeHint:!!this.routeHint,correctRoute:this.route(),origin:this.level.origin,room:this.room(),ball:this.ball,balls:this.balls.filter(b=>!b.dead)}}
}
