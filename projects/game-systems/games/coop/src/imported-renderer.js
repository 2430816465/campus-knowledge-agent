(function(){
  'use strict';
  const G=window.RushGame,C=window.RushArtConfig.colors;
  let overview=false,stamp='',camera={x:0,y:0,scale:1},follow=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function draw(c,state,own,now,dt,touch,h){
    const w=state.world,L=G.stageFor(w),key=state.code+':'+w.levelIndex+':'+w.run;
    const p=w.players[own<0?0:own];
    if(stamp!==key){stamp=key;overview=false;follow=null;}
    const usable={x:0,y:0,w:c.canvas.width,h:c.canvas.height};
    let scale=overview?Math.min(usable.w/L.width,usable.h/L.height):1;
    const vw=usable.w/scale,vh=usable.h/scale;
    let tx=clamp(p.x+18-vw*.5,0,Math.max(0,L.width-vw)),ty=clamp(p.y+28-vh*.58,0,Math.max(0,L.height-vh));
    // Keep a nearby partner and both nameplates in view when their full height fits.
    const partner=w.players[own===0?1:0];
    if(!overview&&Math.abs(partner.x-p.x)<vw-96&&Math.abs(partner.y-p.y)<vh-96){
      const low=Math.max(0,Math.max(partner.y,p.y)+56-vh+18);
      const high=Math.min(Math.max(0,L.height-vh),Math.max(0,Math.min(partner.y,p.y)-30));
      if(low<=high)ty=clamp(ty,low,high);
    }
    if(overview){tx=0;ty=0;}else{
      if(!follow||Math.abs(follow.x-tx)>600||Math.abs(follow.y-ty)>400)follow={x:tx,y:ty};
      const a=1-Math.exp(-12*dt);follow.x+=(tx-follow.x)*a;follow.y+=(ty-follow.y)*a;tx=follow.x;ty=follow.y;
    }
    const padX=Math.max(0,(usable.w-L.width*scale)/2),padY=overview?Math.max(0,(usable.h-L.height*scale)/2):0;
    camera={x:tx,y:ty,scale,overview,worldWidth:L.width,worldHeight:L.height,viewWidth:vw,viewHeight:vh};
    c.fillStyle='#0b1725';c.fillRect(0,0,usable.w,usable.h);
    // Quiet pixel hall, drawn independently of all collidable terrain.
    const grad=c.createLinearGradient(0,0,0,usable.h);grad.addColorStop(0,'#142c40');grad.addColorStop(1,'#0b1826');c.fillStyle=grad;c.fillRect(0,0,usable.w,usable.h);
    for(let i=-1;i<Math.ceil(usable.w/290)+1;i++){
      const x=Math.round(i*290-(tx*.12)%290);c.fillStyle='#192e40';c.fillRect(x,0,34,usable.h);
      c.fillStyle='#21394b';c.fillRect(x-4,0,42,9);c.fillStyle='#253d50';c.fillRect(x+70,26,122,105);
      c.fillStyle='#152a3c';c.fillRect(x+76,32,110,100);c.fillStyle='#284859';c.fillRect(x+123,32,7,94);c.fillRect(x+76,81,110,6);
      c.fillStyle='#1b3041';c.fillRect(x+57,148,155,5);
    }
    c.save();c.beginPath();c.rect(usable.x,usable.y,usable.w,usable.h);c.clip();
    c.translate(padX+usable.x-tx*scale,usable.y+padY-ty*scale);c.scale(scale,scale);h.bounds(tx,vw);
    // Low contrast decoration has no continuous top trim and cannot resemble a ledge.
    L.decor.forEach(d=>{c.fillStyle='#20374788';c.fillRect(d.x,d.y,d.w,d.h);c.fillStyle='#142a3a';c.fillRect(d.x+5,d.y+5,Math.max(1,d.w-10),Math.max(1,d.h-10));if(d.kind==='window'){c.fillStyle='#345568';c.fillRect(d.x+d.w/2-2,d.y+8,4,Math.max(1,d.h-16));}});
    const visible=o=>o.x+o.w>tx&&o.x<tx+vw&&o.y+o.h>ty&&o.y<ty+vh;
    for(const r of L.platforms.filter(visible)){
      c.save();c.beginPath();c.rect(r.x,r.y,r.w,r.h);c.clip();
      for(let y=r.y;y<r.y+r.h;y+=56)for(let x=r.x;x<r.x+r.w;x+=56)h.image(c,'ruinStone',x,y,56,56);
      c.fillStyle=r.mechanical?'#bba173':'#8caab0';c.fillRect(r.x,r.y,r.w,2);c.fillStyle='#10202d';c.fillRect(r.x,r.y+r.h-3,r.w,3);c.restore();
    }
    for(const l of w.lifts){
      c.strokeStyle='#566c6f66';c.lineWidth=3;c.setLineDash([4,8]);c.beginPath();l.path.forEach((n,i)=>i?c.lineTo(n.x+l.w/2,n.y+l.h/2):c.moveTo(n.x+l.w/2,n.y+l.h/2));c.stroke();c.setLineDash([]);
      for(const n of l.path){c.fillStyle='#6b7467';c.fillRect(n.x+l.w/2-3,n.y+l.h/2-3,6,6);}
    }
    h.displayLifts.filter(visible).forEach(l=>{h.image(c,'pathMover',l.x,l.y,l.w,l.h);c.fillStyle='#d3b47d';c.fillRect(l.x,l.y,l.w,2);});
    L.hazards.filter(visible).forEach(r=>{
      c.fillStyle='#24323b';c.fillRect(r.x,r.y,r.w,r.h);c.fillStyle='#cb8874';
      const vertical=r.direction===1||r.direction===3,len=vertical?r.h:r.w;
      for(let n=0;n<len;n+=14){const size=Math.min(14,len-n);c.beginPath();
        if(r.direction===0){c.moveTo(r.x+n,r.y+r.h);c.lineTo(r.x+n+size/2,r.y);c.lineTo(r.x+n+size,r.y+r.h);}
        else if(r.direction===2){c.moveTo(r.x+n,r.y);c.lineTo(r.x+n+size/2,r.y+r.h);c.lineTo(r.x+n+size,r.y);}
        else if(r.direction===1){c.moveTo(r.x,r.y+n);c.lineTo(r.x+r.w,r.y+n+size/2);c.lineTo(r.x,r.y+n+size);}
        else {c.moveTo(r.x+r.w,r.y+n);c.lineTo(r.x,r.y+n+size/2);c.lineTo(r.x+r.w,r.y+n+size);}
        c.closePath();c.fill();
      }
    });
    h.displayBoxes.filter(visible).forEach(b=>h.image(c,b.breakable?'breakBox':'pushBox',b.x,b.y,b.w,b.h));
    h.displayEnemies.filter(visible).forEach(e=>{
      c.save();c.translate(e.x+e.w/2,e.y+e.h);if(e.direction<0)c.scale(-1,1);
      const art=window.RushArt.images.patrol,sy=e.h/41,sx=34/24;
      // Articulated legs reuse the authored mechanical guard; collisions stay unchanged.
      const stride=e.paused>0||Math.abs(e.vy)>1?0:Math.sin(now/1000*11+e.x*.015)*.32;
      if(art){
        for(const [x,width,phase] of [[6,7,1],[13,6,-1]]){
          c.save();c.translate(-17+(x+width/2)*sx,-10*sy);c.rotate(stride*phase);
          c.drawImage(art,x,31,width,10,-width*sx/2,0,width*sx,10*sy);c.restore();
        }
        c.drawImage(art,0,0,24,31,-17,-e.h,34,31*sy);
      }else h.image(c,'patrol',-17,-e.h,34,e.h);
      c.restore();if(e.paused>0){c.fillStyle=C.gold;c.fillRect(e.x+2,e.y-8,3,5);c.fillRect(e.x+8,e.y-8,3,5);}
    });
    w.pickups.filter(k=>!k.collected&&visible(k)).forEach(k=>{c.fillStyle=k.kind==='relic'?'#a69975':'#9abbb5';c.beginPath();c.moveTo(k.x+k.w/2,k.y);c.lineTo(k.x+k.w,k.y+k.h/2);c.lineTo(k.x+k.w/2,k.y+k.h);c.lineTo(k.x,k.y+k.h/2);c.closePath();c.fill();c.fillStyle='#172b35';c.fillRect(k.x+k.w/2-2,k.y+k.h/2-2,4,4);});
    L.checkpoints.filter(visible).forEach(cp=>{const lit=w.checkpointTouched[cp.id],color=cp.slot===0?C.cyan:C.gold;c.fillStyle='#465965';c.fillRect(cp.x+3,cp.y+cp.h-45,5,45);c.fillStyle=lit?color:'#6d827f';c.fillRect(cp.x+8,cp.y+cp.h-43,18,12);h.label(c,cp.slot===0?'◆':'☾',cp.x+18,cp.y+cp.h-37,12,'#102332');});
    const ex=L.exit,count=w.players.filter(p=>G.rectsOverlap(G.bodyRect(p),ex)).length;
    h.image(c,'ruinExit',ex.x,ex.y,ex.w,ex.h);
    for(let i=0;i<2;i++){c.fillStyle=G.rectsOverlap(G.bodyRect(w.players[i]),ex)?(i?C.gold:C.cyan):'#506778';c.fillRect(ex.x+ex.w/2-20+i*28,ex.y+16,12,12);}
    if(visible(ex))h.label(c,count===2?'一起抵达':count===1?'等伙伴 · 1/2':'共同出口 · 0/2',ex.x+ex.w/2,ex.y-18,14,C.text);
    w.players.forEach((p,i)=>h.character(c,p,i,now,state.players[i]&&state.players[i].skin,dt,-1,w));h.particles();c.restore();h.bounds(0,usable.w);
    if(!overview){
      const other=w.players[own===0?1:0],sx=padX+(other.x+18-tx)*scale,sy=usable.y+(other.y+28-ty)*scale;
      if(sx<25||sx>usable.w-25||sy<22||sy>usable.h-22)h.label(c,(own===0?'2P ☾':'1P ◆')+(sx<0?' ←':sx>usable.w?' →':sy<0?' ↑':' ↓'),clamp(sx,56,usable.w-56),clamp(sy,24,usable.h-24),16,own===0?C.gold:C.cyan);
    }
    // Overview and minimap are visual only: no world state or input mutation.
    const mw=Math.min(208,usable.w*.23),mm={x:usable.w-mw-18,y:130,w:mw,h:Math.min(108,mw*L.height/L.width)},ms=mm.w/L.width;
    if(!overview){
      c.fillStyle='#07131ddd';c.fillRect(mm.x-5,mm.y-5,mm.w+10,mm.h+10);c.save();c.beginPath();c.rect(mm.x,mm.y,mm.w,mm.h);c.clip();
      c.fillStyle='#577680';L.platforms.forEach(o=>c.fillRect(mm.x+o.x*ms,mm.y+o.y*ms,o.w*ms,Math.max(1,o.h*ms)));
      c.fillStyle='#be826e';L.hazards.forEach(o=>c.fillRect(mm.x+o.x*ms,mm.y+o.y*ms,Math.max(2,o.w*ms),Math.max(2,o.h*ms)));
      c.fillStyle='#a6986c';c.fillRect(mm.x+ex.x*ms,mm.y+ex.y*ms,Math.max(3,ex.w*ms),ex.h*ms);
      w.players.forEach((o,i)=>{c.fillStyle=i?C.gold:C.cyan;c.fillRect(mm.x+(o.x+11)*ms-2,mm.y+o.y*ms-2,5,5);});
      c.strokeStyle='#ccddd9';c.strokeRect(mm.x+tx*ms,mm.y+ty*ms,vw*ms,vh*ms);c.restore();
    }
    if(overview)h.label(c,usable.w<600?'全图 · 菜单点地图返回':'全图总览 · 菜单点地图返回跟随',usable.w/2,usable.h-32,16,C.gold);
    else if(!touch)h.label(c,own===0?'1P ◆ 冲刺破障 · 帮伙伴搭肩':'2P ☾ 二段跳 · 推小箱 · 互动搭肩 / 暂停巡逻',usable.w/2,usable.h-35,15,own===0?C.cyan:C.gold);
    if(window.RushArt.failed.length)h.label(c,'部分素材加载失败 · 可继续操作',usable.w/2,usable.h-8,12,C.gold);
  }
  window.RushImportedRenderer={draw,toggleOverview:()=>{overview=!overview;return overview;},inspect:()=>({...camera})};
})();
