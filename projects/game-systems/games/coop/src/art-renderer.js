(function () {
  'use strict';
  const G = window.RushGame, A = window.RushArtConfig, C = A.colors;
  const images = {}, failed = [];
  const ready = Promise.all(Object.entries(A.files).map(([key,path]) => new Promise(resolve => {
    const img = new Image();
    // Prepared PNGs work on both HTTP and file:// without reading canvas pixels.
    img.onload = () => { images[key] = img; resolve(); };
    img.onerror = () => { failed.push(key); resolve(); };
    img.src = A.root + path;
  })));
  let previous = null, stamp = '', lastTime = 0, cues = {}, particles = [], poses = [], positions = [], objectPositions = {}, touchUI=false,labelLeft=0,labelRight=1280;
  function reset() { previous = null; cues = {}; particles = []; poses = []; positions = []; objectPositions = {}; lastTime = 0; }
  function displayedObject(object,kind,dt) {
    const key=kind+':'+object.id;let q=objectPositions[key];
    if(!q||Math.abs(q.x-object.x)>110||Math.abs(q.y-object.y)>130||q.socketId!==object.socketId)
      q=objectPositions[key]={x:object.x,y:object.y,socketId:object.socketId};
    const blend=1-Math.exp(-26*dt);
    q.x+=(object.x-q.x)*blend;q.y+=(object.y-q.y)*blend;
    if(Math.abs(q.x-object.x)<.05)q.x=object.x;if(Math.abs(q.y-object.y)<.05)q.y=object.y;
    return {...object,x:q.x,y:q.y};
  }
  function label(c,s,x,y,size=15,color=C.text) {
    if(touchUI)size=Math.round(size*1.3);
    c.font = '600 '+size+'px "Microsoft YaHei", sans-serif'; c.textAlign='center'; c.textBaseline='middle';
    const half=c.measureText(s).width/2;x=Math.max(labelLeft+half+8,Math.min(labelRight-8-half,x));
    c.lineWidth=4; c.strokeStyle=C.ink; c.strokeText(s,x,y); c.fillStyle=color; c.fillText(s,x,y);
  }
  function image(c,key,x,y,w,h) {
    if(images[key]) c.drawImage(images[key],Math.round(x),Math.round(y),Math.round(w),Math.round(h));
    else { c.fillStyle=C.stone; c.fillRect(x,y,w,h); c.strokeStyle=C.gold; c.strokeRect(x+.5,y+.5,w-1,h-1); }
  }
  function badge(c,s,x,y,on,color=C.cyan) {
    c.fillStyle=C.ink;c.fillRect(x-14,y-14,28,28);
    c.strokeStyle=on?color:'#998c76';c.lineWidth=2;c.strokeRect(x-13,y-13,26,26);
    label(c,s,x,y,15,color);
    if(on){c.fillStyle='#fff3ce';c.fillRect(x+11,y-14,4,4);}
  }
  function surface(c,p,mechanical=false) {
    c.save(); c.beginPath(); c.rect(p.x,p.y,p.w,p.h); c.clip();
    c.fillStyle='#49382e'; c.fillRect(p.x,p.y,p.w,p.h);
    const key=typeof mechanical==='string'?mechanical:mechanical?'bridge':p.oneWay?'leaf':'terrain';
    for(let x=p.x;x<p.x+p.w;x+=256)image(c,key,x,p.y,256,Math.min(18,p.h));
    c.fillStyle=p.oneWay?'#a2de82':'#f5deb1';c.fillRect(p.x,p.y,p.w,3);
    c.fillStyle=C.ink;c.fillRect(p.x,p.y+p.h-2,p.w,2); c.restore();
  }
  function wire(c,a,b,on,color,symbol,key,now) {
    const flash=Math.max(0,1-(now-(cues[key]||-9999))/420);
    c.save(); c.lineJoin='miter'; c.lineWidth=4; c.strokeStyle=C.ink;
    const mid=(a.x+b.x)/2;
    c.beginPath();c.moveTo(a.x,a.y);c.lineTo(mid,a.y);c.lineTo(mid,b.y);c.lineTo(b.x,b.y);c.stroke();
    c.globalAlpha=on?.6+flash*.3:.32;c.lineWidth=2;c.strokeStyle=color;if(!on)c.setLineDash([6,6]);c.stroke();c.restore();
  }
  function drawLinks(c,L,w,now) {
    const inputs=[];
    L.plates.forEach(p=>inputs.push({keys:[p.id,p.key].filter(Boolean),x:p.x+p.w/2,y:p.y,color:p.color,symbol:p.symbol}));
    (L.sockets||[]).forEach(s=>inputs.push({keys:[s.id,s.key],x:s.x+s.w/2,y:s.y,color:C.cyan,symbol:'⚡'}));
    L.switches.forEach(s=>inputs.push({keys:[s.key,s.opens].filter(Boolean),x:s.x+s.w/2,y:s.y+s.h/2,color:s.color||C.gold,symbol:s.symbol}));
    (L.charges||[]).forEach(n=>inputs.push({keys:[n.key],x:n.x+n.w/2,y:n.y+n.h/2,color:n.color||C.cyan,symbol:n.symbol}));
    const targetForGate=g=>({x:g.x+g.w/2,y:g.y+g.h/2});
    L.gates.forEach(g=>{
      const needed=[g.key,g.lockKey,...(g.any||[]),...(g.plates||[])].filter(Boolean);
      inputs.filter(item=>item.keys.some(key=>needed.includes(key))).forEach((item,i)=>{
        const on=item.keys.some(key=>!!w.flags[key]||!!w.plates[key]);
        wire(c,{x:item.x,y:item.y},{...targetForGate(g),y:targetForGate(g).y+i*3},on,item.color,item.symbol,item.keys[0],now);
      });
    });
    (L.charges||[]).forEach(n=>(n.poweredBy||[]).forEach(key=>{
      const item=inputs.find(entry=>entry.keys.includes(key));
      if(item)wire(c,{x:item.x,y:item.y},{x:n.x+n.w/2,y:n.y+n.h/2},!!w.flags[key],item.color,item.symbol,key,now);
    }));
    L.switches.forEach(s=>(s.requires||[]).forEach(key=>{const source=inputs.find(i=>i.keys.includes(key));if(source)wire(c,source,{x:s.x+s.w/2,y:s.y+s.h/2},!!w.flags[key],s.color,s.symbol,key,now);}));
    L.bridges.filter(b=>!b.group).forEach(b=>{const source=inputs.find(i=>i.keys.includes(b.key));if(source)wire(c,source,{x:b.x+b.w/2,y:b.y},G.bridgeIsActive(b,w),b.color,b.symbol,b.key,now);});
    L.bridges.filter(b=>b.group).forEach(b=>{
      const control=L.switches.find(s=>s.type==='bridgeToggle'&&s.group===b.group);
      if(control)wire(c,{x:control.x+control.w/2,y:control.y+control.h/2},{x:b.x+b.w/2,y:b.y},G.bridgeIsActive(b,w),b.color,b.symbol,b.id,now);
    });
  }
  function nearby(p,o,dx=82,dy=82) { return p && Math.abs(p.x+18-o.x-o.w/2)<=dx && Math.abs(p.y+56-o.y-o.h)<=dy; }
  function dust(x,y,now,count=4,color='#b9c6bd') {
    for(let i=0;i<count;i++) particles.push({x,y,t:now,vx:(i-(count-1)/2)*22,vy:-18-i%2*12,color});
  }
  function transitions(w,now) {
    if(previous && w.tick!==previous.tick) {
      if(w.message!==previous.message && /失足|回到共同检查点/.test(w.message)){
        objectPositions={};positions=[];
        w.players.forEach((p,i)=>{cues['respawn'+i]=now;dust(p.x+18,p.y+56,now,5,C.cyan);});
      }
      G.stageFor(w).gates.forEach(g=>{if(G.activeGate(g,previous)&&!G.activeGate(g,w))cues[g.id]=now;});
      if(w.phase==='intermission'&&previous.phase!=='intermission')cues.complete=now;
      Object.keys(w.flags).forEach(k=>{if(!!w.flags[k]!==!!previous.flags[k]) cues[k]=now;});
      w.players.forEach((p,i)=>{
        const old=previous.players[i]; if(!old)return;
        if(p.grounded&&!old.grounded && old.vy>80) {cues['land'+i]=now;dust(p.x+18,p.y+56,now);}
        if(Math.abs(p.x-old.x)>180 || Math.abs(p.y-old.y)>260) {cues['respawn'+i]=now;objectPositions={};dust(p.x+18,p.y+56,now,7,C.cyan);}
      });
      w.boxes.forEach((b,i)=>{const old=previous.boxes[i];if(old&&Math.abs(b.x-old.x)>.5&&now-(cues[b.id]||0)>170){cues[b.id]=now;dust(b.x+b.w/2,b.y+b.h,now,2,'#8c9b9e');}});
    }
    if(!previous || w.tick!==previous.tick) previous=JSON.parse(JSON.stringify(w));
  }
  function character(c,p,i,now,skin,dt,finaleAge,world) {
    let q=positions[i]; if(!q) q=positions[i]={x:p.x,y:p.y};
    if(Math.abs(q.x-p.x)>110||Math.abs(q.y-p.y)>130) {q.x=p.x;q.y=p.y;}
    const blend=1-Math.exp(-26*dt); q.x+=(p.x-q.x)*blend;q.y+=(p.y-q.y)*blend;
    // Feet follow authoritative landing immediately; no hovering after ground contact.
    if(p.grounded){
      q.y=p.y;
      const lift=world.lifts.find(l=>l.id===p.carriedByLift);
      const box=!lift&&world.boxes.find(b=>!b.hidden&&Math.abs(p.y+56-b.y)<2&&p.x+32>b.x&&p.x+4<b.x+b.w);
      const support=lift||box,display=support&&objectPositions[(lift?'lift:':'box:')+support.id];
      if(display)q.y+=display.y-support.y;
    }
    const respawn=now-(cues['respawn'+i]||-9999)<220;
    const finaleJump=finaleAge>=0&&finaleAge<1700;
    const jumpPhase=((finaleAge/720+i*.36)%1);
    const visualJump=finaleJump?Math.sin(jumpPhase*Math.PI)*18:0;
    const moving=Math.abs(p.vx)>15;
    // Movement consumes landing recovery; stopping must not resume an old landing pose.
    if(p.grounded&&moving)cues['land'+i]=-Infinity;
    // Only a fresh stationary landing can recover. Moving consumes that recovery.
    let action=p.falling?'fall':finaleJump?'jump':respawn?'hurt':!p.grounded?(p.vy<0?'jump':'fall'):moving?'run':now-(cues['land'+i]??-Infinity)<A.hero.landDuration?'land':'idle';
    let pose=poses[i];if(!pose||pose.action!==action)pose=poses[i]={action,start:now};
    let key=action==='fall'||action==='land'?'jump':action;
    const frames=A.hero[action]||[0];
    const fps=action==='idle'?2:action==='land'?1000/(A.hero.landDuration/frames.length):A.hero.fps;
    const step=Math.floor(Math.max(0,now-pose.start)/1000*fps);
    // Airborne poses hold their last frame until authoritative physics changes phase.
    const frame=frames[action==='idle'||action==='run'?step%frames.length:Math.min(step,frames.length-1)];
    if(G.stageFor(world).revision ? i===0 : i===1)key+='Gold';
    const x=Math.round(q.x+18),feet=Math.round(q.y+56-visualJump),img=images[key];
    if(G.stageFor(world).revision&&!p.falling){c.fillStyle=i?'#70d0dc':'#efbb64';c.fillRect(x-16,feet-2,32,3);}
    c.save();c.translate(x,feet);if(p.facing<0)c.scale(-1,1);
    if(p.falling){const t=Math.min(1,(world.fall?.elapsed||0)/(world.fall?.duration||.85));c.globalAlpha=1-t*.8;c.rotate(t*1.8);c.scale(1-t*.32,1-t*.32);}
    if(img){const h=A.hero;c.drawImage(img,frame*h.cell,0,h.cell,h.cell,-h.anchorX,-h.anchorY,h.cell,h.cell);}
    else {image(c,'crate',-17,-54,34,54);label(c,'!',0,-27,20,C.gold);}
    c.restore();
    if(skin==='ember-mark'){label(c,'✦',x+18,q.y+20,11,'#f4a479');}
    if(!p.falling)label(c,G.stageFor(world).revision?(i===0?'1P ◆':'2P ☾'):(i===0?'1P':'2P'),x,Math.min(q.y-13,feet-70),13,G.stageFor(world).revision?(i===0?'#efbb64':'#70d0dc'):(i===0?C.cyan:C.gold));
    if(action==='run' && now-(cues['dust'+i]||0)>190){cues['dust'+i]=now;dust(x,feet,now,2);}
  }
  function draw(c,state,own,now,touch) {
    touchUI=touch;
    const w=state.world,L=G.stageFor(w);
    const nextStamp=state.code+':'+w.levelIndex+':'+(w.roomIndex||0)+':'+w.run;
    if(stamp!==nextStamp || (previous&&w.tick<previous.tick)){reset();stamp=nextStamp;}
    const dt=Math.min(.05,lastTime?(now-lastTime)/1000:1/60);lastTime=now;
    transitions(w,now); c.imageSmoothingEnabled=false;
    const displayLifts=w.lifts.map(l=>displayedObject(l,'lift',dt));
    const displayBoxes=w.boxes.filter(b=>!b.hidden).map(b=>displayedObject(b,'box',dt));
    const displayEnemies=(w.enemies||[]).map(e=>displayedObject(e,'enemy',dt));
    labelLeft=0;labelRight=1280;
    window.RushImportedRenderer.draw(c,state,own,now,dt,touch,{image,label,character,displayLifts,displayBoxes,displayEnemies,cues,
      bounds:(x,width)=>{labelLeft=x;labelRight=x+width;},particles:()=>{particles=particles.filter(p=>now-p.t<260);particles.forEach(p=>{const t=(now-p.t)/1000;c.globalAlpha=1-t/.26;c.fillStyle=p.color;c.fillRect(p.x+p.vx*t,p.y+p.vy*t+36*t*t,3,2);});c.globalAlpha=1;}});
    return;
    c.fillStyle='#0b1725';c.fillRect(0,0,1280,720);
    const chapter=Math.max(0,Math.min(4,Math.floor(w.levelIndex/10)));
    const chapterBackdrop=(A.chapterBackdrops||[])[chapter]||'backdrop';
    image(c,images[chapterBackdrop]?chapterBackdrop:'backdrop',0,0,1280,720);
    drawLinks(c,L,w,now);
    L.hazards.filter(h=>!h.kind).forEach(h=>{c.fillStyle='rgba(3,9,17,.66)';c.fillRect(h.x,h.y,h.w,h.h);});
    L.platforms.forEach(p=>surface(c,p));
    if(L.revision){
      if(L.gallery){label(c,'↓ 安全落点',L.galleryLayout.gapX+L.galleryLayout.gapW/2,L.galleryLayout.height+120,13,'#aecb93');label(c,'↑ 叶阶',120,385,12,'#aecb93');label(c,'叶阶 ↑',1160,385,12,'#aecb93');}
    }
    L.hazards.filter(h=>h.kind).forEach(h=>{
      const color=h.kind==='sun'?'#f7ae56':h.kind==='moon'?'#5acddd':'#9dd85e';
      c.fillStyle='#182621';c.fillRect(h.x-3,h.y-3,h.w+6,h.h+6);c.fillStyle=color;c.fillRect(h.x,h.y,h.w,h.h);
      image(c,h.kind==='sun'?'poolSun':h.kind==='moon'?'poolMoon':'poolPoison',h.x,h.y,h.w,h.h);
      if(h.kind==='poison')image(c,'poisonSign',h.x+h.w/2-9,h.y+17,18,18);
      label(c,h.kind==='sun'?'◆ 1P 安全':h.kind==='moon'?'☾ 2P 安全':'× 两人危险',h.x+h.w/2,h.y+41,12,color);
    });
    (L.crystals||[]).forEach(g=>{if(w.flags[g.key])return;const x=g.x+g.w/2,y=g.y+g.h/2+Math.sin(now/330+g.x)*3;
      image(c,g.role?'crystalMoon':'crystalSun',x-12,y-16,24,32);label(c,(g.role+1)+'P',x,y-28,11,g.color);
    });
    L.bridges.forEach(b=>{
      const on=G.bridgeIsActive(b,w);if(on)surface(c,b,'bridge');
      else{c.save();c.strokeStyle=b.color;c.globalAlpha=.35;c.setLineDash([6,12]);c.lineWidth=2;c.beginPath();c.moveTo(b.x,b.y+12);c.lineTo(b.x+b.w,b.y+12);c.stroke();c.restore();}
      // No ghost walkable surface when bridge is absent: only the two sockets remain.
      for(const x of [b.x-5,b.x+b.w-1]){c.fillStyle='#987746';c.fillRect(x,b.y+3,6,14);}
      badge(c,b.symbol,b.x+b.w/2,b.y+38,on,b.color);label(c,on?'桥已铺好':'缺口 · 先开桥',b.x+b.w/2,b.y+65,12,on?C.text:b.color);
    });
    L.checkpoints.forEach(cp=>{
      image(c,'checkpoint',cp.x,cp.y+cp.h-48,24,48);
    });
    displayLifts.forEach(l=>{
      const on=!l.poweredBy||(Array.isArray(l.poweredBy)?l.poweredBy:[l.poweredBy]).every(k=>!!w.flags[k])||!!w.flags[l.lockKey];
      c.fillStyle='#182b38';c.fillRect(l.x+8,l.top-16,7,l.bottom-l.top+35);c.fillRect(l.x+l.w-15,l.top-16,7,l.bottom-l.top+35);
      for(const x of [l.x+11,l.x+l.w-12])for(let y=l.top-10+(l.y-l.top)%12;y<l.bottom+12;y+=12){c.fillStyle='#6a6251';c.fillRect(x,y,2,7);}
      surface(c,l,'lift');badge(c,'↕',l.x+l.w/2,l.y+29,on,C.gold);
      if(nearby(w.players[own],{...l,h:8},98,90))label(c,on?(touch?'互动 · 升降':'E · 升降'):'压住圆盘供电',l.x+l.w/2,l.y-23,15,on?C.gold:'#b7bbc0');
    });
    L.gates.forEach(g=>{
      const closed=G.activeGate(g,w),color=g.color||(g.key==='switch'?C.gold:C.cyan),symbol=g.symbol||(g.key==='switch'?'◆':'☾');
      // Door collision switches instantly. Opening panel retracts inside its overhead housing.
      c.fillStyle='#415564';c.fillRect(g.x-6,g.y-9,g.w+12,10);c.fillStyle='#a88955';c.fillRect(g.x-7,g.y-11,g.w+14,3);
      c.fillStyle='#273f50';c.fillRect(g.x-3,g.y,3,g.h);c.fillRect(g.x+g.w,g.y,3,g.h);
      if(closed)image(c,'gate',g.x,g.y,g.w,g.h);
      else {
        image(c,'gateOpen',g.x,g.y,g.w,g.h);
        const progress=Math.min(1,(now-(cues[g.id]||-9999))/120);
        if(progress<1){c.save();c.beginPath();c.rect(g.x,g.y,g.w,g.h);c.clip();c.globalAlpha=.45*(1-progress);image(c,'gate',g.x,g.y-g.h*progress,g.w,g.h);c.restore();}
        c.fillStyle='#79959d';c.fillRect(g.x,g.y,g.w,5);
      }
      badge(c,symbol,g.x+g.w/2,g.y-27,!closed,color);
      if(!closed){c.fillStyle=color;c.fillRect(g.x+g.w/2-2,g.y-4,4,3);}
    });
    (L.oneWayGates||[]).forEach(g=>{
      const open=!!w.flags[g.unlockKey];
      c.fillStyle='#2b4250';c.fillRect(g.x-4,g.y-9,g.w+8,9);c.fillStyle=C.gold;c.fillRect(g.x-6,g.y-11,g.w+12,3);
      if(!open){c.fillStyle='#365366';c.fillRect(g.x,g.y,g.w,g.h);c.fillStyle='#83cbd1';c.fillRect(g.x+6,g.y+8,g.w-12,g.h-16);}
      label(c,g.direction>0?'人 →':'← 人',g.x+g.w/2,g.y-25,13,open?C.gold:C.cyan);
      if(!open&&nearby(w.players[own],g,72,82))label(c,touch?'互动 · 通行':'E · 向右通行',g.x+g.w/2,g.y-48,14,C.text);
    });
    L.plates.forEach(p=>{
      const on=!!w.plates[p.id];
      // Plate is an overlap trigger, not a solid platform: inset tread into the actual floor.
      const tread=p.y+p.h-(on?2:6);
      image(c,p.symbol==='☾'||p.symbol==='月'?'plateMoon':'plateSun',p.x,tread,p.w,on?6:10);
      c.fillStyle=on?p.color:'#57707b';c.fillRect(p.x+7,tread,p.w-14,2);
      badge(c,p.symbol==='月'?'☾':p.symbol,p.x+p.w/2,p.y-19,on,p.color);
      if(on)label(c,'压住',p.x+p.w/2,p.y-45,12,p.color);
    });
    L.switches.forEach(s=>{
      const on=s.type==='bridgeToggle'?(w.flags['bridgePhase:'+(s.group||'main')]||w.flags.bridgePhase)==='diamond':s.type==='releaseSocket'?(w.sockets[s.socketId]!=null):!!w.flags[s.key];
      image(c,s.role==null?(on?'leverOn':'lever'):s.role?'runeMoon':'runeSun',s.x,s.y,s.w,s.h);
      const locked=!on&&s.requires?.some(k=>!w.flags[k]);
      badge(c,on?'✓':locked?'锁':s.symbol,s.x+s.w/2,s.y-20,on,s.color);
      if(!on&&nearby(w.players[own],s,L.revision?56:82,L.revision?65:82)){
        const prompt=s.role!=null&&s.role!==own?(state.solo?'切换至 ':'等待 ')+(s.role+1)+'P':s.requires?.some(k=>!w.flags[k])?'先点亮相连机关':s.role!=null?(s.role+1)+'P · '+(touch?'互动':'E'):(touch?'互动启动':'E · 启动');
        label(c,prompt,s.x+s.w/2,s.y-45,15,s.color);
      }
      if(now-(cues[s.key]||-9999)<420) {c.strokeStyle=s.color;c.lineWidth=2;c.strokeRect(s.x-3,s.y-3,s.w+6,s.h+6);}
    });
    (L.sockets||[]).forEach(s=>{
      const occupied=!!w.sockets[s.id];c.fillStyle=occupied?'#21515a':'#263846';c.fillRect(s.x,s.y,s.w,10);c.strokeStyle=occupied?C.cyan:'#a88955';c.lineWidth=2;c.strokeRect(s.x+.5,s.y+.5,s.w-1,9);label(c,occupied?'⚡':'○',s.x+s.w/2,s.y-10,13,occupied?C.cyan:C.gold);
    });
    (L.charges||[]).forEach(n=>{
      const charge=w.charges[n.id]||{progress:0,stable:false},p=Math.max(0,Math.min(1,charge.progress/n.seconds));
      c.fillStyle='#152a37';c.fillRect(n.x,n.y,n.w,n.h);c.strokeStyle=charge.stable?C.gold:C.cyan;c.lineWidth=2;c.strokeRect(n.x+.5,n.y+.5,n.w-1,n.h-1);
      c.beginPath();c.arc(n.x+n.w/2,n.y+n.h/2,14,-Math.PI/2,-Math.PI/2+Math.PI*2*(charge.stable?1:p));c.strokeStyle=charge.stable?C.gold:C.cyan;c.lineWidth=3;c.stroke();
      label(c,charge.stable?'✓':charge.started?'◌':'◉',n.x+n.w/2,n.y+n.h/2,15,charge.stable?C.gold:C.cyan);
    });
    (L.memorials||[]).forEach(mem=>{
      const progress=w.memorialProgress&&w.memorialProgress[mem.id]||[];
      const enabled=!mem.requires||mem.requires.every(key=>!!w.flags[key]);
      mem.targets.forEach((target,index)=>{
        const lit=!!w.memorialFound||!!progress[index];
        c.save();c.fillStyle=lit?'#634b27':enabled?'#263a45':'#1a2933';c.fillRect(target.x+3,target.y+13,target.w-6,target.h-13);
        c.strokeStyle=lit?C.gold:enabled?'#768895':'#485a63';c.lineWidth=2;c.strokeRect(target.x+3.5,target.y+13.5,target.w-7,target.h-14);
        c.fillStyle=lit?'#f2cc77':enabled?'#b8c6c5':'#73828a';c.beginPath();c.moveTo(target.x+target.w/2,target.y+2);c.lineTo(target.x+target.w-5,target.y+target.h/2);c.lineTo(target.x+target.w/2,target.y+target.h-4);c.lineTo(target.x+5,target.y+target.h/2);c.closePath();c.fill();
        label(c,lit?'✦':'◇',target.x+target.w/2,target.y+target.h/2,14,lit?C.gold:(enabled?C.cyan:'#98a3a4'));
        if(enabled&&!w.memorialFound&&nearby(w.players[own],target,54,78)) label(c,touch?'互动 · 留念':'E · 协作留念',target.x+target.w/2,target.y-9,12,C.gold);
      });
    });
    displayBoxes.forEach(b=>{image(c,'crate',b.x,b.y,b.w,b.h);if(b.energy||b.kind==='energy'){c.strokeStyle=C.cyan;c.lineWidth=2;c.strokeRect(b.x+6,b.y+6,b.w-12,b.h-12);label(c,'⚡',b.x+b.w/2,b.y+b.h/2,16,C.cyan);}else label(c,'↔',b.x+b.w/2,b.y+b.h/2,17,C.gold);});
    if(L.roleExits){
      const missing=L.exitRequires.filter(k=>!w.flags[k]).length;
      L.roleExits.forEach((ex,i)=>{const color=i?'#70d0dc':'#efbb64',cx=ex.x+ex.w/2,arrived=G.rectsOverlap(G.bodyRect(w.players[i]),ex);
        image(c,i?'exitMoon':'exitSun',ex.x,ex.y,ex.w,ex.h);label(c,(i+1)+'P'+(arrived?' ✓':missing?' 锁':' 开'),cx,ex.y-18,12,color);
      });
      const got=(L.crystals||[]).filter(g=>w.flags[g.key]).length,keys=L.switches.filter(k=>w.flags[k.key]).length;
      const hud=document.querySelector('#mechanismHud');if(hud)hud.textContent='晶石 '+got+'/'+L.crystals.length+' · 机关 '+keys+'/'+L.switches.length+(missing?'':' · 门已开');
    }else{
    const count=w.players.filter(p=>G.rectsOverlap(G.bodyRect(p),L.exit)).length,ex=L.exit,cx=ex.x+ex.w/2;
    const hud=document.querySelector('#mechanismHud');if(hud)hud.textContent='第 '+(w.levelIndex+1)+' 关 · 共同出口 '+count+'/2';
    image(c,'exitSun',ex.x,ex.y-22,ex.w,ex.h+22);
    image(c,'chest',cx-25,ex.y+ex.h-43,50,43);
    for(let i=0;i<2;i++)badge(c,i+1,cx-16+i*32,ex.y-32,G.rectsOverlap(G.bodyRect(w.players[i]),ex),i===0?C.cyan:C.gold);
    label(c,count===2?'共同抵达':count===1?'等待伙伴 · 1/2':'双人出口 · 0/2',cx,ex.y-56,14,count?C.gold:C.text);
    }
    const finaleAge=w.finale&&w.phase==='intermission'?now-(cues.complete||now):-1;
    w.players.forEach((p,i)=>character(c,p,i,now,state.players[i]&&state.players[i].skin,dt,finaleAge,w));
    const target=window.RushGuide?.target;
    if(target){c.save();c.strokeStyle='#fff0b2';c.lineWidth=3;c.setLineDash([8,6]);c.strokeRect(target.x-5,target.y-5,(target.w||36)+10,(target.h||56)+10);c.restore();label(c,'↓ 引导目标',target.x+(target.w||36)/2,Math.max(90,target.y-55),14,'#fff0b2');}
    particles=particles.filter(p=>now-p.t<260);particles.forEach(p=>{const t=(now-p.t)/1000;c.globalAlpha=1-t/.26;c.fillStyle=p.color;c.fillRect(p.x+p.vx*t,p.y+p.vy*t+36*t*t,3,2);});c.globalAlpha=1;
    const celebration=now-(cues.complete||-9999),celebrationExit=L.roleExits?.[0]||L.exit;
    if(celebration<550){c.globalAlpha=1-celebration/550;c.strokeStyle=C.gold;c.lineWidth=2;c.beginPath();c.arc(celebrationExit.x+celebrationExit.w/2,celebrationExit.y+25,35+celebration*.08,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
    if(w.finale&&w.phase==='intermission'){
      const age=Math.max(0,now-(cues.complete||now));
      for(let i=0;i<5;i++){
        const x=430+i*105,y=154+(i%2)*24,lit=Math.max(0,Math.min(1,(age-i*420)/300));
        if(!lit)continue;
        c.globalAlpha=.18+lit*.25;c.fillStyle='#e7a84e';c.beginPath();c.arc(x,y,25,0,Math.PI*2);c.fill();
        c.globalAlpha=lit;c.fillStyle='#ffd887';c.beginPath();c.arc(x,y,5+Math.sin(age/160+i)*1.3,0,Math.PI*2);c.fill();c.globalAlpha=1;
      }
      label(c,'伙伴归来 · 50 / 50',640,206,22,C.gold);
    }
    if(failed.length)label(c,'部分美术未加载 · 可继续操作',640,696,14,C.gold);
  }
  window.RushArt={draw,reset,ready,images,failed,inspect:()=>({revision:A.revision,heroPreserved:true,assets:Object.keys(images),failed,poses:poses.map(p=>p.action),particles:particles.length,stamp,objects:JSON.parse(JSON.stringify(objectPositions)),positions:positions.map(p=>({...p}))})};
})();
