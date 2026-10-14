import {WORLD, monsterById, ELEMENTS} from './data.js';

export const ART_ICONS=['crossbow','fire','ice','lightning','beam','rock','snow','wind','meteor','familiar','chain','flame','repair','power','speed','critical'];
export const PRESENTATION_BUILD='20261002-pending-tactics-v6';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const strides={skeleton:28,orc_warrior:42,guard_mid:27,mage_red:27,ghost_warrior:32,rock_golem:32,skeleton_elite:34,mage_low:27,vampire:32,knight_black:33,dragon:40};
const actorHeight=e=>e.radius*2.75;

// Frames are selected from combat clocks, never render frame counters. The
// release frame coincides with the actual projectile/damage event.
export function heroAnimation(b,meta={count:8,releaseFrame:3},reduced=false){
 const count=meta.count,release=meta.releaseFrame??3,cycle=Math.min(.48,b.heroShotInterval??.62);
 const recovery=Math.min(.48,b.heroReleaseInterval??b.heroShotInterval??.62)*(count-release)/count;
 const elapsed=b.time-(b.heroShotAt??-10);
 if(elapsed>=0&&elapsed<recovery)return {action:'shoot',phase:'release',cycleStart:Math.round(((b.heroShotAt??-10)-Math.min(.48,b.heroReleaseInterval??b.heroShotInterval??.62)*release/count)*1e6)/1e6,frame:release+Math.min(count-release-1,Math.floor(elapsed/recovery*(count-release)))};
 const windup=cycle*release/count,cooldown=b.cooldowns?.bolt??Infinity;
 if(b.enemies.some(e=>e.hp>0&&e.y>=0)&&cooldown>0&&cooldown<=windup)return {action:'shoot',phase:'windup',cycleStart:Math.round((b.time+cooldown-windup)*1e6)/1e6,frame:Math.min(release-1,Math.floor((1-cooldown/windup)*release))};
 return {action:'idle',phase:'ready',frame:reduced?0:Math.floor(b.time*5)%8};
}
export function monsterAnimation(e,animations){
 const d=monsterById[e.type],walk=animations[e.type],attackName=e.type+'-attack',attack=animations[attackName];
 const phase=(e.walkDistance??0)/strides[e.type]+e.id*.137,atWall=e.y>=WORLD.wallY-e.radius-4;
 const result={name:e.type,frame:Math.floor(phase*walk.count)%walk.count,action:'walk'};
 if(!attack)return result;
 const release=attack.releaseFrame??(e.type==='skeleton'?3:4),recovery=Math.max(e.attackPose||0,e.specialPose||0);
 if(recovery>0)return {name:attackName,frame:release+Math.min(attack.count-release-1,Math.floor((1-recovery/.32)*(attack.count-release))),action:e.specialPose>e.attackPose?'summon':'attack'};
 const speed=e.speed*(e.slow>0?(d.boss?.7:.42):1)+(e.dashRemaining>0?35/.24:0);
 const threshold=d.ranged?300.01:WORLD.wallY-e.radius-4;
 const reach=e.y>=threshold?0:d.ranged?Infinity:speed>0?(threshold-e.y)/speed:Infinity;
 const nextHit=Math.max(e.attackClock,reach),nextSpecial=d.boss?e.special:Infinity,next=Math.min(nextHit,nextSpecial);
 if(next>=0&&next<=.24)return {name:attackName,frame:Math.min(release-1,Math.floor((1-next/.24)*release)),action:nextSpecial<nextHit?'summon-windup':'windup'};
 if(atWall)return {name:attackName,frame:0,action:'idle'};
 return result;
}

// A guardian stands in place. Locomotion sheets are never its resting pose.
export function guardianAnimation(b,animations){
 if(!(b.summonActive>0))return null;
 const id=b.summon==='golem'?'rock_golem':'dragon',name=id+'-attack',meta=animations[name];
 const elapsed=Math.max(0,b.time-(b.summonStartedAt??(b.time-(b.summon==='golem'?8:6)+b.summonActive)));
 const duration=meta.count*.08;
 return {name,action:elapsed<duration?'summon':'idle',frame:elapsed<duration?Math.floor(elapsed/.08):0};
}

export function rollingRockPose(p,reduced=false){
 const radius=p.r,travel=Math.hypot(p.x-(p.launchX??p.x),p.y-(p.launchY??WORLD.wallY));
 return {x:p.x,y:p.y,radius,angle:reduced?0:travel/radius,travel};
}

export class Scene {
 constructor(canvas){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.images={};this.actors={};this.time=0;this.scale=1;this.ox=0;this.oy=0;
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.heroState=null;this.poseState=new Map();this.poseRun=null;this.visual={hero:null,enemies:[]};
 }
 async load(){
  const response=await fetch('assets/art-v2/manifest.json',{cache:'no-cache'});if(!response.ok)throw Error('美术资源清单无法读取');
  this.art=await response.json();
  const sources={background:'art-v2/'+this.art.background,...Object.fromEntries(Object.keys(monsterById).map(id=>[id,id+'.webp']))};
  for(const[name,meta]of Object.entries(this.art.animations))sources['anim:'+name]='art-v2/'+meta.file;
  for(const name of ['projectiles','impacts','grounds'])sources['fx:'+name]='art-v2/'+this.art.atlases[name].file;
  for(const name of ART_ICONS)sources['icon:'+name]='art-v2/icon-'+name+'.png';
  const results=await Promise.all(Object.entries(sources).map(([id,file])=>new Promise(resolve=>{
   const img=new Image();img.onload=()=>{this.images[id]=img;resolve(true);};img.onerror=()=>resolve(false);img.src='assets/'+file+'?v='+PRESENTATION_BUILD;
  })));
  for(const[name,meta]of Object.entries(this.art.animations)){
   const image=this.images['anim:'+name];if(!image)continue;
   this.actors[name]=Array.from({length:meta.count},(_,i)=>{
    const frame=document.createElement('canvas');frame.width=frame.height=meta.cell;
    const ctx=frame.getContext('2d');ctx.drawImage(image,(i%meta.cols)*meta.cell,Math.floor(i/meta.cols)*meta.cell,meta.cell,meta.cell,0,0,meta.cell,meta.cell);
    const hit=document.createElement('canvas');hit.width=hit.height=meta.cell;const h=hit.getContext('2d');h.drawImage(frame,0,0);h.globalCompositeOperation='source-in';h.fillStyle='#fff3d4';h.fillRect(0,0,meta.cell,meta.cell);
    return {frame,hit};
   });
  }
  return results.every(Boolean);
 }
 resize(){const box=this.canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);this.canvas.width=Math.round(box.width*dpr);this.canvas.height=Math.round(box.height*dpr);this.dpr=dpr;this.scale=Math.min(box.width/WORLD.width,box.height/WORLD.height);this.ox=(box.width-WORLD.width*this.scale)/2;this.oy=(box.height-WORLD.height*this.scale)/2;}
 point(x,y){const r=this.canvas.getBoundingClientRect();return {x:(x-r.left-this.ox)/this.scale,y:(y-r.top-this.oy)/this.scale};}
 sprite(id,x,y,size){const img=this.images[id];if(!img)return;const s=size/Math.max(img.width,img.height);this.ctx.drawImage(img,x-img.width*s/2,y-img.height*s,img.width*s,img.height*s);}
 actor(name,frame,x,y,height,{flip=false,hit=0,compress=0}={}){
  const meta=this.art.animations[name],image=this.actors[name]?.[frame];if(!meta||!image)return;
  const c=this.ctx,s=height/meta.bodyHeight;c.save();c.translate(x,y);c.scale((flip?-1:1)*s*(1+compress),s*(1-compress));
  const[ax,ay]=meta.origin;c.drawImage(image.frame,-ax,-ay);
  if(hit>0){c.globalAlpha=Math.min(.38,hit*3);c.drawImage(image.hit,-ax,-ay);}c.restore();
 }
 tile(name,frame,x,y,width,height,angle=0,alpha=1,cropped=false,sourceBox=null){
  const meta=this.art.atlases[name],img=this.images['fx:'+name];if(!meta||!img)return;
  let bx=0,by=0,bw=meta.cell,bh=meta.cell;
  if(cropped||sourceBox){const box=sourceBox??meta.boxes[frame];[bx,by]=box;bw=box[2]-bx;bh=box[3]-by;}
  const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=alpha;
  const h=height??width*bh/bw;
  c.drawImage(img,(frame%meta.cols)*meta.cell+bx,Math.floor(frame/meta.cols)*meta.cell+by,bw,bh,-width/2,-h/2,width,h);c.restore();
 }
 shadow(x,y,rx,alpha=.34){const c=this.ctx;c.save();c.fillStyle='#081d22';c.globalAlpha=alpha;c.beginPath();c.ellipse(x,y+2,rx,Math.max(3,rx*.25),0,0,Math.PI*2);c.fill();c.restore();}
 hero(b){
  const time=b.time;
  if(this.heroState?.runId!==b.runId)this.heroState={runId:b.runId,facing:1,pending:1,pendingSince:time,lastTurn:-10};
  const h=this.heroState,targetX=b.aim?.x??b.heroTargetX??280,desired=targetX<215?-1:targetX>265?1:h.facing;
  if(desired!==h.pending){h.pending=desired;h.pendingSince=time;}
  const pose=heroAnimation(b,this.art.animations['hero-shoot'],this.reduced);
  // Turn only before a new action, never midway through its release/recovery.
  if((pose.action==='idle'||pose.phase==='windup'&&pose.frame===0)&&desired!==h.facing&&time-h.pendingSince>=.28&&time-h.lastTurn>=.85){h.facing=desired;h.lastTurn=time;}
  this.shadow(240,WORLD.heroY,27,.4);
  this.actor(pose.action==='shoot'?'hero-shoot':'hero-idle',pose.frame,240,WORLD.heroY,96,{flip:h.facing<0});
  this.visual.hero={...pose,facing:h.facing,x:240,y:WORLD.heroY,cycleStart:pose.cycleStart??(b.heroShotAt??-10)};
 }
 groundAreas(b){
  for(const a of b.areas){
   const phase=this.reduced?0:Math.floor(this.time*8+a.id)%4,fade=clamp(a.t/.35,0,1);
   if(a.kind==='fire'||a.kind==='snow')this.tile('grounds',(a.kind==='snow'?4:0)+phase,a.x,a.y,a.r*2.45,a.r*1.65,0,.48*fade);
   if(['gravity','ward','trap'].includes(a.kind)){
    const c=this.ctx;c.save();c.globalAlpha=.85*fade;
    if(a.kind==='gravity'){
     for(let i=0;i<24;i++){const angle=i*Math.PI/12,r=a.r*(this.reduced?.85:.75+.1*Math.sin(this.time*3-i*.5));c.fillStyle=i%3?'#a7dfcf':'#ffe7a3';c.fillRect(Math.round((a.x+Math.cos(angle)*r)/3)*3,Math.round((a.y+Math.sin(angle)*r*.65)/3)*3,5,5);}
     c.fillStyle='#355d68';c.fillRect(a.x-10,a.y-7,20,14);c.fillStyle='#d9f9df';c.fillRect(a.x-3,a.y-3,6,6);
    }else if(a.kind==='ward'){
     c.fillStyle='#274d5a';c.fillRect(a.x-a.r,a.y-12,a.r*2,24);
     c.fillStyle=a.charges>0?'#eddba7':'#738b87';for(let x=a.x-a.r;x<a.x+a.r;x+=18)c.fillRect(x,a.y-10,12,4);
     c.fillStyle='#90dfd2';for(let x=a.x-a.r+6;x<a.x+a.r;x+=18)c.fillRect(x,a.y+6,12,4);
     for(let i=0;i<3;i++){c.fillStyle=i<a.charges?'#fff0b0':'#4a6763';c.fillRect(a.x-19+i*14,a.y-4,10,8);}
    }else{
     const ready=a.armed<=0;c.fillStyle='#292d36';c.fillRect(a.x-14,a.y-9,28,18);c.fillRect(a.x-9,a.y-14,18,28);
     c.fillStyle=ready?'#ffcf7e':'#879c99';c.fillRect(a.x-9,a.y-6,18,12);c.fillStyle='#753c27';c.fillRect(a.x-3,a.y-3,6,6);
     for(let i=0;i<12;i++){const angle=i*Math.PI/6;c.fillStyle=ready?'#efb675':'#8bada9';c.fillRect(Math.round(a.x+Math.cos(angle)*a.r)-2,Math.round(a.y+Math.sin(angle)*a.r*.65)-2,4,4);}
     c.font='bold 11px Microsoft YaHei';c.textAlign='center';c.fillStyle='#fff2d9';c.strokeStyle='#24342f';c.lineWidth=3;const label=ready?'3 敌触发 · '+Math.ceil(a.t)+'s':'武装中';c.strokeText(label,a.x,a.y+26);c.fillText(label,a.x,a.y+26);
    }c.restore();
   }
   if(a.kind==='meteor'){
    const c=this.ctx,p=1-a.t/a.max;c.save();c.strokeStyle='#ffc781';c.lineWidth=2;c.globalAlpha=.55+.25*p;c.setLineDash([6,5]);c.beginPath();c.ellipse(a.x,a.y,a.r,a.r*.62,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
    c.globalAlpha=.3;c.beginPath();c.ellipse(a.x,a.y,a.r*(1-p),a.r*.62*(1-p),0,0,Math.PI*2);c.stroke();c.restore();
   }
  }
 }
 monsters(b){
  if(this.poseRun!==b.runId){this.poseState.clear();this.poseRun=b.runId;}
  this.visual.enemies=[];
  const alive=new Set();
  for(const e of [...b.enemies].sort((a,z)=>a.y-z.y)){
   alive.add(e.id);
   const d=monsterById[e.type],frozen=e.freeze>0||e.stun>0,height=actorHeight(e);
   let pose=monsterAnimation(e,this.art.animations);
   const held=e.frozenPose??this.poseState.get(e.id);
   if(frozen){
    if(held&&(held.name===e.type||held.name===e.type+'-attack')&&Number.isInteger(held.frame)&&held.frame>=0&&held.frame<this.art.animations[held.name]?.count)pose=held;
    // The spell lands after movement for this tick. Preserve the displayed pose
    // in the save as well as memory, so reloading cannot advance a frozen frame.
    e.frozenPose=pose;
   }else if(e.frozenPose)delete e.frozenPose;
   this.poseState.set(e.id,pose);
   this.shadow(e.x,e.y,e.radius*.86,d.boss?.42:.32);
   this.actor(pose.name,pose.frame,e.x,e.y,height,{hit:e.hit});
   this.visual.enemies.push({id:e.id,type:e.type,sheet:pose.name,frame:pose.frame,x:e.x,y:e.y,frozen,travel:e.walkDistance??0,action:frozen?'held':pose.action});
   const c=this.ctx;
   if(e.freeze>0){this.tile('grounds',4,e.x,e.y-e.radius*.25,e.radius*3.25,e.radius*1.85,0,.9);c.save();c.strokeStyle='#b9f6ff';c.globalAlpha=.75;c.lineWidth=1.5;c.beginPath();c.ellipse(e.x,e.y-height*.5,e.radius*.85,height*.52,0,0,Math.PI*2);c.stroke();c.restore();}
   else if(e.slow>0)this.tile('grounds',4,e.x,e.y,e.radius*2.9,e.radius*1.25,0,.5);
   if(e.burn>0)this.tile('grounds',this.reduced?0:Math.floor(this.time*9+e.id)%4,e.x,e.y-3,e.radius*2.7,e.radius*1.5,0,.5);
   if(e.stun>0)this.tile('impacts',12,e.x,e.y-height-3,18,18,0,.8);
   if(d.boss||d.elite||e.hp<e.maxHp){const w=d.boss?70:32,y=e.y-height-8;c.fillStyle='#12282ddd';c.fillRect(e.x-w/2-1,y-1,w+2,6);c.fillStyle=d.boss?'#efa17c':'#d9daa2';c.fillRect(e.x-w/2,y,w*clamp(e.hp/e.maxHp,0,1),4);if(d.boss){c.font='12px Microsoft YaHei';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#142127';c.strokeText(d.name,e.x,y-5);c.fillStyle='#ffe9c7';c.fillText(d.name,e.x,y-5);}}
  }
  for(const id of this.poseState.keys())if(!alive.has(id))this.poseState.delete(id);
 }
 trail(p,color){
  if(this.reduced)return;const c=this.ctx,len=Math.min(p.skill==='ice'?26:18,Math.hypot(p.vx,p.vy)*.07),angle=Math.atan2(p.vy,p.vx);
  c.save();c.translate(p.x,p.y);c.rotate(angle);c.globalAlpha=.38;c.strokeStyle=color;c.lineWidth=p.skill==='fire'?3:1.5;c.beginPath();c.moveTo(-len,0);c.lineTo(-4,0);c.stroke();c.restore();
 }
 projectiles(b){
  this.visual.enemyShots=[];
  this.visual.rocks=[];
  for(const shot of b.enemyShots||[]){
   const progress=clamp(1-shot.remaining/shot.duration,0,1),meta=this.art.animations[shot.type+'-attack'],radius=shot.radius??monsterById[shot.type].radius;
   const scale=radius*2.75/(meta?.bodyHeight||1),muzzle=meta?.emitter;
   const startX=muzzle?shot.x+(muzzle[0]-meta.origin[0])*scale:shot.x;
   const startY=muzzle?(shot.rootY??shot.y+radius*.65)+(muzzle[1]-meta.origin[1])*scale:shot.y;
   const x=startX+(shot.x-startX)*progress,y=startY+(WORLD.wallY-startY)*progress;
   this.visual.enemyShots.push({id:shot.id,type:shot.type,x,y,startX,startY,remaining:shot.remaining});
   this.tile('projectiles',shot.element==='ice'?2:1,x,y,shot.type==='dragon'?27:20,undefined,Math.atan2(WORLD.wallY-startY,shot.x-startX),1,true);
  }
  const frames={bolt:0,partner:0,fire:1,ice:2,rock:3,wind:4};
  for(const p of b.projectiles){const frame=frames[p.skill]??0,color=ELEMENTS[p.element].color;
   if(p.skill==='rock'){
    const pose=rollingRockPose(p,this.reduced),c=this.ctx,r=pose.radius;
    this.shadow(p.x,p.y+r*.62,r*.96,.42);
    // Crop only the round stone from the authored atlas; the attached flight
    // streak must not spin with it. Ground dust follows the actual travel.
    if(!this.reduced){c.save();c.fillStyle='#ceb68b';
     for(let i=0;i<3;i++){const age=(pose.travel/22+i/3)%1;c.globalAlpha=(1-age)*.32;const size=2+age*4;c.fillRect(p.x+(i-1)*r*.62-size/2,p.y+r*.62+age*18,size,size);}
     c.restore();}
    this.tile('projectiles',3,p.x,p.y,r*2,r*2,pose.angle,1,false,[61,42,103,86]);
    this.visual.rocks.push({...pose,id:p.id,grounded:true});continue;
   }
   // Connect the brief launch to the displayed bow during a settled turn.
   // Collision and the subsequent projectile path keep their original data.
   let shown=p;
   if(p.skill==='bolt'&&!p.secondary&&p.launchY===WORLD.heroY-82&&p.born!==undefined){
    const age=this.time-p.born,blend=clamp(1-age/.1,0,1),facing=this.heroState?.facing??1;
    if(blend>0){const dx=240+facing*43-p.launchX;shown={...p,x:p.x+dx*blend*blend,vx:p.vx-dx*20*blend};}
   }
   this.trail(shown,color);const angle=p.skill==='rock'?this.time*3:p.skill==='wind'?this.time*10:Math.atan2(shown.vy,shown.vx);
   const width=p.skill==='rock'?p.r*2.4:p.skill==='wind'?p.r*2.3:p.skill==='fire'?27:p.skill==='ice'?32:22;
   this.tile('projectiles',frame,shown.x,shown.y,width,undefined,angle,1,true);
  }
 }
 lightning(f){
  const c=this.ctx,toX=f.toX??240,toY=f.toY??10,dx=toX-f.x,dy=toY-f.y,len=Math.hypot(dx,dy),steps=Math.max(2,Math.ceil(len/22));
  const phase=this.reduced?0:Math.floor(this.time*12),points=[];
  for(let i=0;i<=steps;i++){const p=i/steps,wiggle=i===0||i===steps?0:Math.sin(i*2.73+phase*1.67+f.x)*5;points.push([f.x+dx*p-dy/(len||1)*wiggle,f.y+dy*p+dx/(len||1)*wiggle]);}
  c.save();c.lineCap='round';c.lineJoin='round';
  for(const[color,width,alpha]of [['#8771d6',6,.3],['#c1a0ff',3,.85],['#fff1ff',1.2,1]]){c.strokeStyle=color;c.lineWidth=width;c.globalAlpha=alpha*clamp(f.t/.08,0,1);c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}c.restore();
  this.tile('impacts',12+Math.min(3,Math.floor((1-f.t/f.max)*4)),toX,toY,25,25,0,.8);
 }
 airAreas(b){
  for(const a of b.areas){
   if(a.kind==='beam'){
    const c=this.ctx,root={x:240,y:WORLD.heroY-82};c.save();c.lineCap='round';c.globalAlpha=.35;c.strokeStyle='#477c69';c.lineWidth=9;c.beginPath();c.moveTo(root.x,root.y);c.lineTo(a.x,a.y);c.stroke();c.globalAlpha=.85;c.strokeStyle='#c9f2ad';c.lineWidth=2.5;c.stroke();c.restore();
    this.tile('impacts',Math.floor(this.time*12)%2,a.x,a.y,26,26,0,.6);
   }else if(a.kind==='familiar'){
    const angle=this.reduced?0:this.time*3+a.id,rx=a.x+Math.cos(angle)*16,ry=a.y-16+Math.sin(angle)*8;
    this.tile('projectiles',6,rx,ry,29,undefined,0,1,true);
   }else if(a.kind==='meteor'){
    const progress=1-a.t/a.max,ease=progress*progress;
    this.tile('projectiles',5,a.x-40*(1-ease),a.y-170*(1-ease),34,undefined,Math.atan2(170,40),.9,true);
   }
  }
 }
 effects(b){
  for(const f of b.effects){const t=f.t/f.max,p=1-t,c=this.ctx;
   if(f.kind==='line'){this.lightning(f);continue;}
   if(f.kind==='number'||f.kind==='crit'){if(this.showNumbers){c.save();c.globalAlpha=clamp(t*2,0,1);c.font=(f.kind==='crit'?'bold 15':'11')+'px Microsoft YaHei';c.textAlign='center';c.strokeStyle='#17202d';c.lineWidth=3;c.strokeText(f.r,f.x,f.y-25-p*20);c.fillStyle=f.color;c.fillText(f.r,f.x,f.y-25-p*20);c.restore();}continue;}
   if(f.kind==='enemyshot'){this.tile('projectiles',7,f.x,f.y+(WORLD.wallY-f.y)*p,19,undefined,0,.9,true);continue;}
   const element=f.element??(f.color?.startsWith('#c')?'ice':f.color?.startsWith('#ffb')?'fire':'physical');
   const row=element==='fire'?1:element==='ice'?2:element==='lightning'?3:0;
   const phase=clamp(Math.floor(p*4),0,3),frame=row*4+phase;
   if(f.kind==='muzzle'){const x=f.angle===undefined?f.x:240+(this.heroState?.facing??1)*43+Math.cos(f.angle)*20;this.tile('impacts',0,x,f.y,18,18,0,t);continue;}
   const width=f.kind==='spark'?21:f.kind==='burst'?f.r*2:f.kind==='wall'?30:Math.min(160,f.r*2.3);
   this.tile('impacts',frame,f.x,f.y-f.r*.25,width,width,0,Math.min(.68,t*1.5));
   if(f.kind==='ring'&&f.r>100){c.save();c.strokeStyle=f.color;c.lineWidth=1.5;c.globalAlpha=t*.5;c.beginPath();c.ellipse(f.x,f.y,Math.min(260,f.r)*(1-t*.25),Math.min(260,f.r)*.58*(1-t*.25),0,0,Math.PI*2);c.stroke();c.restore();}
  }
 }
 draw(b){
  const c=this.ctx;this.time=b?.time??0;c.setTransform(this.dpr,0,0,this.dpr,0,0);const width=this.canvas.width/this.dpr,height=this.canvas.height/this.dpr;c.clearRect(0,0,width,height);c.fillStyle='#192e31';c.fillRect(0,0,width,height);
  // Extend quiet scenery into wide-screen margins without stretching play space.
  if(this.images.background&&(this.ox>1||this.oy>1)){const cover=Math.max(width/WORLD.width,height/WORLD.height);c.globalAlpha=.32;c.drawImage(this.images.background,(width-WORLD.width*cover)/2,(height-WORLD.height*cover)/2,WORLD.width*cover,WORLD.height*cover);c.globalAlpha=1;}
  c.translate(this.ox,this.oy);c.scale(this.scale,this.scale);c.imageSmoothingEnabled=false;
  if(this.images.background)c.drawImage(this.images.background,0,0,WORLD.width,WORLD.height);
  if(!b){const shade=c.createLinearGradient(0,0,0,760);shade.addColorStop(0,'#152b2560');shade.addColorStop(.7,'#14282000');shade.addColorStop(1,'#152b25a0');c.fillStyle=shade;c.fillRect(0,0,480,760);return;}
  c.save();c.beginPath();c.rect(0,0,WORLD.width,WORLD.height);c.clip();
  // Scenery -> ground spells -> grounded bodies -> flying spells -> brief impacts.
  this.groundAreas(b);this.monsters(b);this.projectiles(b);this.hero(b);
  const guardian=guardianAnimation(b,this.art.animations);this.visual.guardian=guardian;
  if(guardian){c.save();c.globalAlpha=.86;this.shadow(335,WORLD.heroY-15,28,.3);this.actor(guardian.name,guardian.frame,335,WORLD.heroY-15,b.summon==='golem'?92:120);c.restore();}
  this.airAreas(b);this.effects(b);
  if(b.aim){const y=Math.min(b.aim.y,WORLD.wallY-20);c.save();c.strokeStyle='#e5f2cc77';c.lineWidth=1.2;c.setLineDash([4,7]);c.beginPath();c.moveTo(240,WORLD.heroY-82);c.lineTo(b.aim.x,y);c.stroke();c.setLineDash([]);c.strokeStyle='#fff1c2';c.beginPath();c.arc(b.aim.x,y,9,0,Math.PI*2);c.stroke();c.restore();}
  c.restore();
 }
}
