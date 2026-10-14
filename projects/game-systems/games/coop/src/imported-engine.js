// Map adaptation: GPL-3.0; see third_party/slf/NOTICE.md and LICENSE.
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.RushImportedEngine=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Scoped to the imported campaign. Legacy physics and collisions stay unchanged.
  const P={speed:294,gravity:1652,jump:-403.2,holdJump:-336,doubleJump:-574,maxFall:1064,
    jumpHold:.35,coyote:.105,buffer:.13,dashSpeed:700,dashTime:.50,dashCooldown:.7,
    width:14,height:56,offset:11,carryHeight:56,enemyPause:2,boxDrag:280,boxGravity:1120};
  const clone=o=>JSON.parse(JSON.stringify(o));
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const body=p=>({x:p.x+(p.hitOffsetX==null?P.offset:p.hitOffsetX),y:p.y,w:p.hitW||P.width,h:56});
  const actor=(spawn,i)=>Object.assign({vx:0,vy:0,facing:1,grounded:false,coyote:0,jumpBuffer:0,jumps:0,hold:0,
    dash:0,cooldown:0,hurt:0,carriedByLift:null,carriedBy:null,input:{},joined:true,hitOffsetX:P.offset,hitW:P.width,role:i===0?'breaker':'scout'},spawn);
  const solids=(L,w,exclude)=>L.platforms.concat(w.lifts,w.boxes.filter(b=>!b.hidden)).filter(s=>s!==exclude);
  function checkpoint(w){
    return clone({players:w.players,boxes:w.boxes,lifts:w.lifts,enemies:w.enemies,pickups:w.pickups,
      checkpointTouched:w.checkpointTouched,checkpointId:w.checkpointId});
  }
  function create(L,index,run,safe){
    const w={levelIndex:index,roomIndex:0,run,phase:'playing',tick:0,elapsed:0,players:L.spawns.map(actor),flags:{},
      boxes:clone(L.boxes).map(b=>Object.assign(b,{vx:0,vy:0,hidden:false})),
      lifts:clone(L.lifts).map(l=>Object.assign(l,{pathIndex:l.movementType===2||l.movementType===4?l.path.length-1:1,pathDirection:l.movementType===2||l.movementType===4?-1:1})),
      enemies:clone(L.enemies).map(e=>Object.assign(e,{vx:e.speed,vy:0,direction:1,paused:0,grounded:false})),
      pickups:clone(L.pickups).map(p=>Object.assign(p,{collected:false})),
      checkpointTouched:{},checkpointId:'start',checkpointState:null,plates:{},sockets:{},charges:{},gateOpenStates:{},transits:[null,null],
      safeRun:safe!==false,memorialFound:false,memorialProgress:{},message:'',winnerId:null,settlementId:null,respawns:0};
    w.checkpointState=checkpoint(w);return w;
  }
  function respawn(w,reason){
    const saved=clone(w.checkpointState);const count=(w.respawns||0)+1;
    Object.assign(w,saved);w.safeRun=false;w.respawns=count;w.phase='playing';w.winnerId=null;w.settlementId=null;
    w.players.forEach(p=>{p.input={};p.vx=0;p.vy=0;p.dash=0;p.cooldown=0;p.hold=0;p.jumps=0;p.jumpBuffer=0;p.coyote=0;p.carriedBy=null;p.carriedByLift=null;p.grounded=false;p.hurt=.22;});
    w.message=reason||'两人一起回到共同检查点';
  }
  function unionBody(p,w){
    const b=body(p);
    if(p===w.players[0]&&w.players[1].carriedBy===0){b.y-=P.carryHeight;b.h+=P.carryHeight;}
    return b;
  }
  function push(box,delta,L,w,pusher,velocity){
    const pending=new Map();
    function check(b,seen){
      if(seen.has(b)||!b.movable||b.hidden)return false;seen.add(b);
      const next=Object.assign({},b,{x:b.x+delta});
      if(next.x<0||next.x+next.w>L.width||L.platforms.concat(w.lifts).some(s=>overlap(next,s)))return false;
      if(w.players.some(p=>p!==pusher&&p.carriedBy==null&&overlap(next,body(p))))return false;
      for(const o of w.boxes){if(o!==b&&!o.hidden&&overlap(next,o)&&!check(o,seen))return false;}
      pending.set(b,next.x);return true;
    }
    if(!check(box,new Set()))return false;
    pending.forEach((x,b)=>{b.x=x;b.vx=velocity==null?(pusher?pusher.vx:delta*60):velocity;if(pusher)b.pushedThisTick=true;});return true;
  }
  // Small swept steps prevent dash tunnelling through 14 px walls/spikes.
  function axis(p,amount,axisName,L,w,exclude){
    if(!amount)return false;
    const steps=Math.max(1,Math.ceil(Math.abs(amount)/4));const delta=amount/steps;let blocked=false;
    for(let k=0;k<steps;k++){
      const old=unionBody(p,w);p[axisName]+=delta;const next=unionBody(p,w);
      for(const s of solids(L,w,exclude)){
        if(!overlap(next,s))continue;
        if(axisName==='x'&&s.breakable&&p.role==='breaker'&&p.dash>0){s.hidden=true;w.message='冲刺破障 · 通路已打开';continue;}
        if(axisName==='x'&&s.movable&&p.role==='scout'&&push(s,delta,L,w,p))continue;
        if(axisName==='x')p.x=delta>0?s.x-old.w-(old.x-p.x+delta):s.x+s.w-(old.x-p.x+delta);
        else if(delta>0){p.y=s.y-56;p.vy=0;p.grounded=true;p.carriedByLift=w.lifts.includes(s)?s.id:null;}
        else {p.y=s.y+s.h+(old.h>56?P.carryHeight:0);p.vy=0;p.hold=P.jumpHold;}
        if(axisName==='x')p.vx=0;
        blocked=true;break;
      }
      if(blocked)break;
    }
    return blocked;
  }
  function syncCarry(w){
    if(w.players[1].carriedBy===0){const a=w.players[0],b=w.players[1];b.x=a.x;b.y=a.y-P.carryHeight;b.vx=a.vx;b.vy=a.vy;b.grounded=false;b.carriedByLift=null;}
  }
  function dismount(w,L,jump){
    const a=w.players[0],b=w.players[1];
    const candidates=[{x:a.x,y:a.y-P.carryHeight}, {x:a.x-a.facing*42,y:a.y}, {x:a.x+a.facing*42,y:a.y}];
    const spot=candidates.find(s=>!solids(L,w).some(o=>overlap(body(s),o))&&!L.hazards.some(h=>overlap(body(s),h)));
    if(!spot){w.message='这里太窄，移动到空处再离肩';return false;}
    Object.assign(b,spot,{carriedBy:null,vy:jump?P.jump:0,hold:jump?0:P.jumpHold,jumps:jump?1:0,grounded:false,coyote:0});
    w.message=jump?'队友离肩起跳':'队友已离肩';return true;
  }
  function interact(i,w,L){
    const p=w.players[i];
    if(i===0){if(p.cooldown<=0){p.dash=P.dashTime;p.cooldown=P.dashCooldown;w.message='1P 冲刺 · 击碎裂纹箱';}return;}
    if(p.carriedBy===0){dismount(w,L,false);return;}
    const e=w.enemies.find(e=>Math.abs(p.x+18-e.x-e.w/2)<85&&Math.abs(p.y+28-e.y-e.h/2)<85);
    if(e){e.paused=P.enemyPause;w.message='巡逻机关暂停两秒 · 趁机通过';return;}
    const a=w.players[0];
    if(Math.abs(p.x-a.x)<60&&Math.abs(p.y-a.y)<70){
      const spot={x:a.x,y:a.y-P.carryHeight};
      if(!solids(L,w).some(s=>overlap(body(spot),s))&&!L.hazards.some(h=>overlap(body(spot),h))){p.carriedBy=0;syncCarry(w);w.message='2P 已搭肩 · 跳跃离肩';return;}
    }
  }
  function movePaths(w,L,dt){
    for(const l of w.lifts){
      if(l.path.length<2||l.stopped)continue;
      const old={x:l.x,y:l.y,w:l.w,h:l.h};const target=l.path[l.pathIndex];
      const dx=target.x-l.x,dy=target.y-l.y,d=Math.hypot(dx,dy),step=l.speed*dt;
      if(d<=step){l.x=target.x;l.y=target.y;
        let n=l.pathIndex+l.pathDirection;
        if(n<0||n>=l.path.length){
          if(l.movementType===3||l.movementType===4)n=(n+l.path.length)%l.path.length;
          else if(l.movementType===1||l.movementType===2){l.stopped=true;n=l.pathIndex;}
          else{l.pathDirection*=-1;n=l.pathIndex+l.pathDirection;}
        }l.pathIndex=n;
      }else {l.x+=dx/d*step;l.y+=dy/d*step;}
      const mx=l.x-old.x,my=l.y-old.y;
      for(const p of w.players){
        if(p.carriedBy===0)continue;
        const b=body(p),riding=p.grounded&&Math.abs(b.y+b.h-old.y)<3&&b.x+b.w>old.x&&b.x<old.x+old.w;
        if(riding){axis(p,mx,'x',L,w,l);axis(p,my,'y',L,w,l);p.carriedByLift=l.id;}
        // Side or roof contact is resolved without teleporting the rider.
        if(overlap(unionBody(p,w),l)){respawn(w,'升降台挤压，两人回到检查点');return false;}
      }
      w.boxes.filter(b=>b.movable&&!b.hidden&&Math.abs(b.y+b.h-old.y)<3&&b.x+b.w>old.x&&b.x<old.x+old.w).forEach(b=>{const next={...b,x:b.x+mx,y:b.y+my};if(!solids(L,w,l).some(s=>s!==b&&overlap(next,s))){b.x=next.x;b.y=next.y;}});
      syncCarry(w);
    }return true;
  }
  function moveBoxes(w,L,dt){
    for(const b of w.boxes){
      if(b.hidden||!b.movable)continue;
      if(!b.pushedThisTick && Math.abs(b.vx)>0){
        b.vx=Math.sign(b.vx)*Math.max(0,Math.abs(b.vx)-P.boxDrag*dt);
        const count=Math.max(1,Math.ceil(Math.abs(b.vx*dt)/4)),dx=b.vx*dt/count;
        for(let k=0;k<count;k++)if(!push(b,dx,L,w,null,b.vx)){b.vx=0;break;}
      }
      b.pushedThisTick=false;
      b.vy=Math.min(P.maxFall,b.vy+P.boxGravity*dt);
      const steps=Math.max(1,Math.ceil(Math.abs(b.vy*dt)/4)),delta=b.vy*dt/steps;
      for(let k=0;k<steps;k++){
        const old=b.y;b.y+=delta;
        const s=solids(L,w,b).filter(s=>overlap(b,s)).sort((a,z)=>a.y-z.y)[0];
        if(s){b.y=delta>=0?s.y-b.h:s.y+s.h;b.vy=0;break;}
        if(w.players.some(p=>p.carriedBy==null&&overlap(b,body(p)))){b.y=old;b.vy=0;break;}
      }
      if(b.y>L.height+80){respawn(w,'箱子掉出遗迹，两人回到检查点');return false;}
    }return true;
  }
  function moveEnemies(w,L,dt){
    for(const e of w.enemies){
      e.paused=Math.max(0,e.paused-dt);
      const old=e.x;e.x+=e.paused?0:e.direction*e.speed*dt;
      if(e.x>e.maxX){e.x=e.maxX;e.direction=-1;}else if(e.x<e.minX){e.x=e.minX;e.direction=1;}
      if(solids(L,w).some(s=>overlap(e,s))){e.x=old;e.direction*=-1;}
      e.vy=Math.min(P.maxFall,e.vy+P.gravity*dt);e.y+=e.vy*dt;
      const floor=solids(L,w).filter(s=>overlap(e,s)).sort((a,b)=>a.y-b.y)[0];
      if(floor){e.y=floor.y-e.h;e.vy=0;}
      e.vx=e.paused?0:e.direction*e.speed;
    }
  }
  function updateCheckpoint(w,L){
    let changed=false;
    for(const cp of L.checkpoints){
      if(!w.checkpointTouched[cp.id]&&overlap(body(w.players[cp.slot]),cp)){w.checkpointTouched[cp.id]=true;changed=true;}
    }
    const ready=[0,1].every(i=>L.checkpoints.some(c=>c.slot===i&&w.checkpointTouched[c.id]));
    const nextId='shared-'+Object.keys(w.checkpointTouched).sort().join('-');
    if(ready && nextId!==w.checkpointId && w.players.every(p=>p.grounded&&p.carriedBy==null)){
      w.checkpointId=nextId;w.checkpointState=checkpoint(w);w.message='两位伙伴已激活共同检查点';
    }else if(changed)w.message='检查点已点亮 · 等待伙伴安全落地';
  }
  function step(w,inputs,dt,L){
    if(w.phase!=='playing')return;
    w.tick++;w.elapsed+=dt;
    if(!movePaths(w,L,dt))return;
    for(let i=0;i<2;i++){
      const p=w.players[i],input=inputs[i]||{},prev=p.input||{};
      let jump=!!input.jumpPressed||!!input.jump&&!prev.jump;
      const action=!!input.interactPressed||!!input.interact&&!prev.interact;
      p.input={left:!!input.left,right:!!input.right,jump:!!input.jump,interact:!!input.interact};
      p.hurt=Math.max(0,p.hurt-dt);p.cooldown=Math.max(0,p.cooldown-dt);p.dash=Math.max(0,p.dash-dt);
      if(action)interact(i,w,L);
      if(p.carriedBy===0){if(jump){if(!dismount(w,L,true))continue;jump=false;}else continue;}
      if(jump){
        p.jumpBuffer=P.buffer;
        if(i===1&&!p.grounded&&p.coyote<=0&&p.jumps===1){p.vy=P.doubleJump;p.jumps=2;p.hold=P.jumpHold;p.jumpBuffer=0;w.message='2P 二段跳';}
      }else p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);
      p.coyote=p.grounded?P.coyote:Math.max(0,p.coyote-dt);
      const dir=(input.right?1:0)-(input.left?1:0);if(dir)p.facing=dir;
      p.vx=p.dash>0?p.facing*P.dashSpeed:dir*P.speed;
      axis(p,p.vx*dt,'x',L,w);
      if(p.jumpBuffer>0&&p.coyote>0){p.vy=P.jump;p.hold=0;p.grounded=false;p.jumps=1;p.coyote=0;p.jumpBuffer=0;p.carriedByLift=null;}
      if(input.jump&&p.jumps===1&&p.hold<P.jumpHold&&p.vy<0){p.vy=p.hold<.1?P.jump:P.holdJump;p.hold+=dt;}else p.hold=P.jumpHold;
      p.vy=Math.min(P.maxFall,p.vy+P.gravity*dt);p.grounded=false;p.carriedByLift=null;
      axis(p,p.vy*dt,'y',L,w);
      if(p.grounded){p.jumps=0;p.hold=P.jumpHold;}
      syncCarry(w);
      const b=body(p);
      if(p.y>L.height+30||p.x<-60||p.x>L.width+60||L.hazards.some(h=>overlap(b,h))||w.enemies.some(e=>e.paused<=0&&overlap(b,e))){respawn(w,'有人失足，两人一起回到检查点');return;}
    }
    if(!moveBoxes(w,L,dt))return;
    moveEnemies(w,L,dt);
    if(w.players.some(p=>w.enemies.some(e=>e.paused<=0&&overlap(body(p),e)))){respawn(w,'碰到巡逻机关，两人回到检查点');return;}
    w.pickups.forEach(k=>{if(!k.collected&&w.players.some(p=>overlap(body(p),k))){k.collected=true;w.message='遗迹徽记已收集 · 不影响通关奖励';}});
    updateCheckpoint(w,L);
    if(w.players.every(p=>overlap(body(p),L.exit))){w.phase='intermission';w.winnerId='pair';w.finale=L.number===36;w.message='两位伙伴共同抵达';}
  }
  return {PHYSICS:P,create,step,respawn,body,interact};
});
