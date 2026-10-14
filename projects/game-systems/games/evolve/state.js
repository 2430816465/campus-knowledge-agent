import {WORLD,MAX_LEVEL,POPULATION,MAX_ENTITIES,MAX_FOLLOWERS,MERGE_COUNT,PLAYER_SPEED,LEGACY_LEVELS,legacyRequired,radius,followerRadius,rewardFor,difficulty,wanderSpeed} from './data.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class EvolutionGame{
 constructor(saved=null){
  this.events=[];this.paused=false;this.target=null;this.keys={x:0,y:0};this.effects=[];this.visibleArea=null;
  this.run=this.validate(saved)?structuredClone(saved):null;
  if(!this.run)return;
  const r=this.run,legacy=r.version===1,oldVersion=r.version,oldLevel=r.level;
  if(r.worldVersion!==2){for(const point of [r.player,...r.followers,...r.entities]){point.x*=3;point.y*=3;}r.worldVersion=2;}
  if(legacy){
   if(r.phase==='result')r.legacyResult={level:oldLevel,eaten:r.eaten,win:r.win};
   r.level=LEGACY_LEVELS[oldLevel-1];
   for(const e of [...r.followers,...r.entities])e.level=LEGACY_LEVELS[e.level-1];
   if(r.killerLevel)r.killerLevel=LEGACY_LEVELS[r.killerLevel-1];
  }
  r.version=3;delete r.xp;r.foodClock??=0;r.sameEaten??=0;
  if(oldVersion<3){if(r.phase==='playing'){r.shield=Math.max(r.shield,2.8);this.mergeFollowers();}this.placeFollowers(1);const b=this.bounds();r.player.x=clamp(r.player.x,b.minX,b.maxX);r.player.y=clamp(r.player.y,b.minY,b.maxY);this.placeFollowers(1);}
 }
 validate(s){
  const legacy=s?.version===1,max=legacy?10:MAX_LEVEL,xpValid=s?.version===3?s.xp===undefined:Number.isFinite(s?.xp)&&s.xp>=0&&s.xp<legacyRequired(s.level,s.version);
  return !!s&&[1,2,3].includes(s.version)&&(s.worldVersion===undefined||s.worldVersion===2)&&typeof s.id==='string'&&['playing','fallen','result'].includes(s.phase)&&Number.isInteger(s.level)&&s.level>=1&&s.level<=max&&xpValid&&Number.isFinite(s.eaten)&&s.eaten>=0&&Number.isFinite(s.elapsed)&&s.elapsed>=0&&Number.isInteger(s.seed)&&Number.isFinite(s.player?.x)&&Number.isFinite(s.player?.y)&&Number.isFinite(s.player?.angle)&&s.player.x>=WORLD.margin&&s.player.x<=WORLD.width-WORLD.margin&&s.player.y>=WORLD.margin&&s.player.y<=WORLD.height-WORLD.margin&&Array.isArray(s.followers)&&s.followers.length<=MAX_FOLLOWERS&&s.followers.every(e=>Number.isInteger(e.level)&&e.level>=1&&(s.version===3?e.level<=s.level:e.level<s.level)&&Number.isFinite(e.x)&&Number.isFinite(e.y))&&Array.isArray(s.entities)&&s.entities.length<=MAX_ENTITIES&&s.entities.every(e=>Number.isInteger(e.level)&&e.level>=1&&e.level<=max&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.angle)&&Number.isFinite(e.age))&&typeof s.revived==='boolean'&&Number.isFinite(s.shield)&&Number.isFinite(s.spawnClock)&&Number.isFinite(s.serial)&&(!s.legacyResult||(s.phase==='result'&&Number.isInteger(s.legacyResult.level)&&s.legacyResult.level>=1&&s.legacyResult.level<=10&&Number.isFinite(s.legacyResult.eaten)&&s.legacyResult.eaten>=0&&typeof s.legacyResult.win==='boolean'))&&(s.foodClock===undefined||(Number.isFinite(s.foodClock)&&s.foodClock>=0));
 }
 newRun(seed=Date.now(),id){
  this.run={version:3,worldVersion:2,id:id||globalThis.crypto?.randomUUID?.()||`evolve-${Date.now()}-${Math.random().toString(36).slice(2)}`,seed:seed>>>0||1,phase:'playing',level:1,eaten:0,sameEaten:0,elapsed:0,player:{x:WORLD.width/2,y:WORLD.height/2,angle:0},followers:[],entities:[],revived:false,shield:2.8,spawnClock:0,foodClock:0,serial:0,win:false,claimed:false,cause:''};
  this.effects=[];this.events=[];this.stopInput();this.visibleArea=null;
  for(let i=0;i<3;i++)this.spawn(1,true);
  for(const level of [2,5,9,14,20])this.spawn(level);
  this.fillPopulation(POPULATION);this.events.push('new');return this.run;
 }
 random(){const r=this.run;r.seed=(Math.imul(r.seed,1664525)+1013904223)>>>0;return r.seed/4294967296;}
 speed(){return PLAYER_SPEED;}
 currentZones(){const t=this.run?.elapsed||0;return [{x:1350+Math.sin(t*.085)*330,y:1110+Math.cos(t*.11)*285,r:240,angle:.35+Math.sin(t*.12)*.5,force:50},{x:2925+Math.cos(t*.07)*270,y:2070+Math.sin(t*.1)*300,r:270,angle:Math.PI+Math.cos(t*.1)*.65,force:58}];}
 flowAt(x,y){let fx=0,fy=0;for(const z of this.currentZones()){const d=Math.hypot(x-z.x,y-z.y);if(d<z.r){const force=z.force*(1-d/z.r);fx+=Math.cos(z.angle)*force;fy+=Math.sin(z.angle)*force;}}return {x:fx,y:fy};}
 chooseLevel(){
  const r=this.run,d=difficulty(r.level),n=this.random(),threats=r.entities.filter(e=>e.level>r.level).length;
  if(n<d.same&&r.entities.filter(e=>e.level===r.level).length<d.sameCap)return r.level;
  if(n<d.same+d.threatShare&&threats<Math.ceil(POPULATION*d.threatShare))return this.threatLevel();
  return r.level===1?1:this.lowerLevel();
 }
 lowerLevel(){
  const max=Math.max(1,this.run.level-1),progress=clamp((this.run.level-5)/(MAX_LEVEL-6),0,1),early=.7-.4*progress,middle=.4*progress,n=this.random();
  if(n<early)return 1+Math.floor(this.random()*Math.min(4,max));
  if(n<early+middle){const min=Math.max(1,Math.floor(max*.45)),top=Math.max(min,max-1);return min+Math.floor(this.random()*(top-min+1));}
  return n<.93?1+Math.floor(this.random()*max):max;
 }
 threatLevel(){const lv=this.run.level,range=MAX_LEVEL-lv;if(range<=0)return MAX_LEVEL;return lv+1+Math.floor(this.random()*(this.random()<.7?Math.min(5,range):range));}
 spawn(forced=null,near=false,outsideView=false){
  const r=this.run;if(r.entities.length>=MAX_ENTITIES)return false;
  const level=clamp(forced??this.chooseLevel(),1,MAX_LEVEL),er=radius(level),p=r.player;
  const minDistance=Math.max(230,radius(r.level)+er+150)+Math.min(200,r.followers.length*15);
  const guarded=!near&&r.level>=9&&level<=r.level&&level>=r.level-1&&this.random()<.75;
  const guards=guarded?r.entities.filter(e=>e.level>r.level):[];let pos=null;
  for(let i=0;i<(level===r.level?640:80);i++){
   if(near){const a=this.random()*Math.PI*2,d=minDistance+this.random()*450;pos={x:p.x+Math.cos(a)*d,y:p.y+Math.sin(a)*d};}
   else if(guards.length&&i<55){const guard=guards[Math.floor(this.random()*guards.length)],a=this.random()*Math.PI*2,d=er+radius(guard.level)+100+this.random()*180;pos={x:guard.x+Math.cos(a)*d,y:guard.y+Math.sin(a)*d};}
   else pos={x:WORLD.margin+er+this.random()*(WORLD.width-2*(WORLD.margin+er)),y:WORLD.margin+er+this.random()*(WORLD.height-2*(WORLD.margin+er))};
   const c=this.visibleArea,inView=c&&pos.x>=c.x-er*1.6&&pos.x<=c.x+c.width+er*1.6&&pos.y>=c.y-er*1.6&&pos.y<=c.y+c.height+er*1.6;
   if((!outsideView||!inView)&&pos.x>=WORLD.margin+er&&pos.x<=WORLD.width-WORLD.margin-er&&pos.y>=WORLD.margin+er&&pos.y<=WORLD.height-WORLD.margin-er&&distance(pos,p)>=minDistance&&r.followers.every(f=>distance(pos,f)>er+radius(f.level)+100)&&r.entities.every(e=>distance(pos,e)>(er+radius(e.level))*.9))break;
   pos=null;
  }
  if(!pos)return false;r.entities.push({id:++r.serial,level,x:pos.x,y:pos.y,angle:this.random()*Math.PI*2,age:0,turn:this.random()*2,alert:false});return true;
 }
 fillPopulation(target){for(let i=0;this.run.entities.length<target&&i<target*2;i++)this.spawn();}
 setTarget(x,y){this.target={x,y};this.keys={x:0,y:0};}
 stopInput(){this.target=null;this.keys={x:0,y:0};}
 formation(){
  const r=this.run,offsets=Array(r.followers.length),gap=24,spacing=1.2;let index=0,ringRadius=radius(r.level)*spacing,previous=0,ring=0;
  // Fill concentric rings by occupied arc length, accounting for different body sizes.
  // World-fixed slots let the squad turn without sweeping every companion around the body.
  while(index<r.followers.length){
   const largest=Math.max(...r.followers.slice(index).map(f=>followerRadius(f.level,r.level)))*spacing;ringRadius+=previous+largest+gap;
   const members=[];let used=0;
   while(index<r.followers.length){const fr=followerRadius(r.followers[index].level,r.level),arc=2*Math.asin((fr*spacing+gap/2)/ringRadius);if(members.length&&used+arc>Math.PI*2)break;members.push({index,r:fr,arc});used+=arc;index++;}
   const spare=(Math.PI*2-used)/members.length;let angle=Math.PI+ring*Math.PI*(3-Math.sqrt(5))-members[0].arc/2;
   for(const member of members){const center=angle+member.arc/2;offsets[member.index]={x:Math.cos(center)*ringRadius,y:Math.sin(center)*ringRadius,r:member.r};angle+=member.arc+spare;}
   previous=largest;ring++;
  }
  return offsets;
 }
 placeFollowers(dt=1){const r=this.run,offsets=this.formation();for(let i=0;i<r.followers.length;i++){const f=r.followers[i],o=offsets[i],a=1-Math.exp(-dt*13);f.x+=(r.player.x+o.x-f.x)*a;f.y+=(r.player.y+o.y-f.y)*a;f.x=clamp(f.x,WORLD.margin+o.r,WORLD.width-WORLD.margin-o.r);f.y=clamp(f.y,WORLD.margin+o.r,WORLD.height-WORLD.margin-o.r);}}
 bounds(){const r=this.run,all=[{x:0,y:0,r:radius(r.level)},...this.formation()];return {minX:WORLD.margin-Math.min(...all.map(o=>o.x-o.r)),maxX:WORLD.width-WORLD.margin-Math.max(...all.map(o=>o.x+o.r)),minY:WORLD.margin-Math.min(...all.map(o=>o.y-o.r)),maxY:WORLD.height-WORLD.margin-Math.max(...all.map(o=>o.y+o.r))};}
 evolve(){const r=this.run;r.level++;r.foodClock=0;r.shield=Math.max(r.shield,.8);this.effects.push({type:'evolve',x:r.player.x,y:r.player.y,t:1.1,level:r.level});this.events.push('evolve');if(r.level===MAX_LEVEL)this.finish(true);}
 mergeFollowers(){const r=this.run;if(r.phase!=='playing')return;while(r.phase==='playing'){
  const same=r.followers.filter(f=>f.level===r.level);if(same.length>=MERGE_COUNT-1){const consumed=new Set(same.slice(0,MERGE_COUNT-1));r.followers=r.followers.filter(f=>!consumed.has(f));this.evolve();continue;}
  let merged=false;for(let level=1;level<r.level;level++){const group=r.followers.filter(f=>f.level===level).slice(0,MERGE_COUNT);if(group.length<MERGE_COUNT)continue;const consumed=new Set(group),x=group.reduce((n,f)=>n+f.x,0)/MERGE_COUNT,y=group.reduce((n,f)=>n+f.y,0)/MERGE_COUNT;r.followers=r.followers.filter(f=>!consumed.has(f));r.followers.push({level:level+1,x,y});this.effects.push({type:'merge',x,y,t:.7,level:level+1});this.events.push('merge');merged=true;break;}if(!merged)break;
 }r.followers.sort((a,b)=>b.level-a.level);this.placeFollowers(.08);}
 eat(e){const r=this.run;if(r.phase!=='playing'||e.level>r.level)return false;r.eaten++;if(e.level===r.level)r.sameEaten++;this.events.push('eat');this.effects.push({type:'eat',x:e.x,y:e.y,t:.5});r.followers.push({level:e.level,x:e.x,y:e.y});this.mergeFollowers();return true;}
 fall(enemy){const r=this.run;if(r.phase!=='playing'||r.shield>0)return false;r.phase='fallen';r.cause='主角碰到了高等级敌人';r.killerLevel=enemy.level;this.stopInput();this.events.push('fallen');return true;}
 revive(){const r=this.run;if(!r||r.phase!=='fallen'||r.revived)return false;r.revived=true;r.phase='playing';r.shield=4;this.mergeFollowers();const squad=[{...r.player,r:radius(r.level)},...r.followers.map(f=>({...f,r:followerRadius(f.level,r.level)}))];r.entities=r.entities.filter(e=>e.level<=r.level||squad.every(member=>distance(e,member)>radius(e.level)+member.r+180));this.stopInput();this.events.push('revive');return true;}
 finish(win=false){const r=this.run;if(!r||r.phase==='result')return false;r.phase='result';r.win=win;r.reward=rewardFor(r);r.claimed=false;this.stopInput();this.events.push(win?'win':'finish');return true;}
 result(){const r=this.run,source=r.legacyResult||r;return {runId:r.id,win:r.win,score:r.level,reward:{rulesVersion:r.legacyResult?1:2,total:rewardFor(r),eaten:source.eaten,level:source.level,elapsed:Math.floor(r.elapsed)}};}
 canRefresh(e){
  const r=this.run,squad=[{...r.player,r:radius(r.level)},...r.followers.map(f=>({...f,r:followerRadius(f.level,r.level)}))];
  if(!squad.every(m=>distance(e,m)>radius(e.level)+m.r+650))return false;
  const c=this.visibleArea,pad=radius(e.level)*1.6;
  return c?e.x<c.x-pad||e.x>c.x+c.width+pad||e.y<c.y-pad||e.y>c.y+c.height+pad:distance(e,r.player)>1250;
 }
 replaceRemote(e,level){const r=this.run;r.entities=r.entities.filter(member=>member!==e);if(this.spawn(level,false,true))return true;r.entities.push(e);return false;}
 refreshPopulation(){
  const r=this.run,target=POPULATION+Math.min(60,Math.floor(r.level/4)*10+Math.floor(r.elapsed/60)*3),d=difficulty(r.level);
  r.entities=r.entities.filter(e=>e.age<90||!this.canRefresh(e));this.fillPopulation(target);
  // Rebalance old crowded saves away from the camera, preserving abundant low-tier food.
  let excess=Math.max(0,r.entities.filter(e=>e.level>r.level).length-Math.ceil(target*d.threatShare)),sameExcess=Math.max(0,r.entities.filter(e=>e.level===r.level).length-d.sameCap),reduced=0;
  if(r.level>1)for(const e of [...r.entities]){
   if(reduced>=6||(excess<=0&&sameExcess<=0))break;
   const high=e.level>r.level&&excess>0,same=e.level===r.level&&sameExcess>0;
   if((!high&&!same)||!this.canRefresh(e))continue;
   if(this.replaceRemote(e,this.lowerLevel())){if(high)excess--;else sameExcess--;reduced++;}
  }
  // Rare threats replenish only remotely; the target is around 3.5%, not the previous 22–38%.
  let deficit=Math.ceil(target*d.threatShare)-r.entities.filter(e=>e.level>r.level).length,replaced=0;
  if(r.level<MAX_LEVEL&&deficit>0)for(const e of [...r.entities]){
   if(deficit<=0||replaced>=4)break;
   if(e.level>=r.level||e.age<12||!this.canRefresh(e))continue;
   if(this.replaceRemote(e,this.threatLevel())){deficit--;replaced++;}
  }
  if(r.foodClock>=d.foodInterval){
   r.foodClock=0;const same=r.entities.filter(e=>e.level===r.level);
   if(same.length<d.sameCap)this.spawn(r.level,false);
   if(r.level>1&&r.entities.filter(e=>e.level<r.level).length<20)for(let i=0;i<4;i++)this.spawn(this.lowerLevel());
  }
 }
 update(dt){
  const r=this.run;if(!r||this.paused||r.phase!=='playing')return;dt=Math.min(.04,Math.max(0,dt));r.elapsed+=dt;r.shield=Math.max(0,r.shield-dt);r.spawnClock+=dt;r.foodClock+=dt;
  const p=r.player;let dx=this.keys.x,dy=this.keys.y;if(this.target){dx=this.target.x-p.x;dy=this.target.y-p.y;const d=Math.hypot(dx,dy);if(d<5){dx=0;dy=0;this.target=null;}}
  const len=Math.hypot(dx,dy);if(len){const desired=Math.atan2(dy,dx),delta=Math.atan2(Math.sin(desired-p.angle),Math.cos(desired-p.angle));p.angle+=delta*Math.min(1,dt*7);dx/=len;dy/=len;}
  const flow=this.flowAt(p.x,p.y),b=this.bounds(),move=Math.min(this.speed()*dt,this.target?len:Infinity);p.x=clamp(p.x+dx*move+flow.x*dt,b.minX,b.maxX);p.y=clamp(p.y+dy*move+flow.y*dt,b.minY,b.maxY);this.placeFollowers(dt);
  for(const e of r.entities){e.age+=dt;const d=distance(e,p),danger=e.level>r.level;let angle=e.angle,speed=wanderSpeed(e.level);e.alert=false;
   if(!danger&&e.level<r.level&&d<radius(r.level)+radius(e.level)+65){angle=Math.atan2(e.y-p.y,e.x-p.x);speed=Math.max(105,speed);}
   else angle+=Math.sin(r.elapsed*.8+e.turn)*dt*.65;
   e.angle=angle;const ef=this.flowAt(e.x,e.y),er=radius(e.level);e.x+=(Math.cos(angle)*speed+ef.x)*dt;e.y+=(Math.sin(angle)*speed+ef.y)*dt;
   if(e.x<WORLD.margin+er||e.x>WORLD.width-WORLD.margin-er){e.angle=Math.PI-e.angle;e.x=clamp(e.x,WORLD.margin+er,WORLD.width-WORLD.margin-er);}
   if(e.y<WORLD.margin+er||e.y>WORLD.height-WORLD.margin-er){e.angle=-e.angle;e.y=clamp(e.y,WORLD.margin+er,WORLD.height-WORLD.margin-er);}
  }
  // Protect the body first. A predator only removes companions below its own level.
  for(const e of r.entities)if(e.level>r.level&&distance(e,p)<radius(e.level)+radius(r.level)-5){if(this.fall(e))return;}
  if(r.shield<=0)for(const e of r.entities)for(const f of [...r.followers])if(e.level>f.level&&distance(e,f)<radius(e.level)+followerRadius(f.level,r.level)-5){r.followers=r.followers.filter(member=>member!==f);this.effects.push({type:'lost',x:f.x,y:f.y,t:.6});this.events.push('companionLost');}
  for(const e of [...r.entities])if(e.level<=r.level&&distance(e,p)<radius(e.level)+radius(r.level)-7){r.entities=r.entities.filter(x=>x.id!==e.id);this.eat(e);if(r.phase!=='playing')break;}
  if(r.phase==='playing'&&r.spawnClock>1.5){r.spawnClock=0;this.refreshPopulation();}
  this.effects.forEach(f=>f.t-=dt);this.effects=this.effects.filter(f=>f.t>0);
 }
 snapshot(){return this.run?structuredClone(this.run):null;}
 describe(){const r=this.run;if(!r)return {phase:'title',world:WORLD,maxLevel:MAX_LEVEL};return {coordinates:'World pixels; origin top-left; +x right, +y down.',world:WORLD,maxLevel:MAX_LEVEL,mergeCount:MERGE_COUNT,bodyCountsAsOne:true,phase:r.phase,id:r.id,level:r.level,sameCollected:r.followers.filter(f=>f.level===r.level).length,player:{...r.player,r:radius(r.level),speed:this.speed()},followers:r.followers.map(f=>({...f,r:followerRadius(f.level,r.level)})),entities:r.entities.map(e=>({id:e.id,level:e.level,x:Math.round(e.x),y:Math.round(e.y),r:radius(e.level),danger:e.level>r.level,alert:e.alert})),currentZones:this.currentZones(),eaten:r.eaten,elapsed:Math.round(r.elapsed*10)/10,shield:r.shield,revived:r.revived,paused:this.paused,cause:r.cause,win:r.win,claimed:r.claimed,reward:rewardFor(r)};}
}
