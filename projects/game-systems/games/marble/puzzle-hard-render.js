import {sprite,images,nodeArt,lamps,orbSprite} from './puzzle-art.js';
const world=document.createElement('canvas');world.width=640;world.height=360;
function path(c,points,color,width=1,dash=[]){
 if(points.length<2)return;c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();
 points.forEach((p,i)=>i&&!p.jump?c.lineTo(Math.round(p.x),Math.round(p.y)):c.moveTo(Math.round(p.x),Math.round(p.y)));c.stroke();c.setLineDash([]);
}
function tiled(c,name,x,y,w,h){
 const img=images[name];if(!img?.complete)return;c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 for(let py=y;py<y+h;py+=32)for(let px=x;px<x+w;px+=32)c.drawImage(img,px,py,32,32);c.restore();
}
function mirror(c,p){
 const length=Math.hypot(p.x2-p.x1,p.y2-p.y1),cx=(p.x1+p.x2)/2,cy=(p.y1+p.y2)/2;
 c.save();c.translate(cx,cy);c.rotate(Math.atan2(p.y2-p.y1,p.x2-p.x1));sprite(c,p.fragile?'mirror-fragile':'mirror',0,0,length+4,10);c.restore();
}
function arrow(c,x,y,direction){
 const a={up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2}[direction];c.save();c.translate(x,y);c.rotate(a);sprite(c,'direction',0,0,13,13);c.restore();
}
export function drawPuzzle(g,canvas,angle,restAngle=0){
 const c=world.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,640,360);tiled(c,'floor',0,0,640,360);
 // Quiet dungeon floor, bronze arena border; every object keeps its original collision size.
 c.fillStyle='#080f1970';c.fillRect(0,0,640,360);c.fillStyle='#080e19';c.fillRect(0,0,12,360);c.fillRect(628,0,12,360);c.fillRect(0,0,640,12);c.fillRect(0,343,640,17);
 c.fillStyle='#84673c';c.fillRect(12,12,616,2);c.fillRect(12,14,2,329);c.fillRect(626,14,2,329);c.fillRect(12,342,616,2);
 for(const x of [14,624])for(const y of [14,338]){c.fillStyle='#c7a76a';c.fillRect(x-2,y-2,5,5);c.fillStyle='#53452e';c.fillRect(x-1,y-1,2,2)}
 const room=g.room();
 for(const q of g.level.walls.filter(q=>q.active===false&&!g.activated.includes(q.id))){c.strokeStyle='#b0976855';c.setLineDash([3,3]);c.strokeRect(q.x,q.y,q.w,q.h);c.setLineDash([])}
 for(const q of room.walls){
  tiled(c,q.gate?'wall-gate':q.breakable?'wall-break':'wall',q.x,q.y,q.w,q.h);
  c.fillStyle=q.hazard?'#d45d62':q.breakable?'#d89855':'#7597aa';c.fillRect(q.x,q.y,q.w,2);c.fillRect(q.x,q.y,2,q.h);
  c.fillStyle='#0a111de0';c.fillRect(q.x+q.w-2,q.y,2,q.h);c.fillRect(q.x,q.y+q.h-2,q.w,2);
  if(q.hazard){
   for(let y=q.y+5;y<q.y+q.h-5;y+=12){c.save();c.translate(q.x+5,y);c.rotate(-Math.PI/2);sprite(c,'spikes',0,0,10,10);c.restore();c.save();c.translate(q.x+q.w-5,y);c.rotate(Math.PI/2);sprite(c,'spikes',0,0,10,10);c.restore()}
  }
 }
 for(const p of room.plates)mirror(c,p);
 for(const p of g.level.portals||[])sprite(c,p.label==='B'?'portal-violet':'portal-blue',p.x,p.y,p.r*2+2);
 for(const q of g.level.splitters||[]){c.globalAlpha=g.splitUsed.includes(q.id)?.5:1;sprite(c,'splitter',q.x,q.y,q.r*2+2);c.globalAlpha=1}
 for(const n of g.level.nodes){
  const done=g.flags.includes(n.id),locked=(n.needs||[]).some(id=>!g.flags.includes(id));
  c.globalAlpha=done?.48:locked?.66:1;
  if(n.direction&&!n.relay&&!n.minBounces){c.save();c.translate(n.x,n.y);c.rotate({up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2}[n.direction]);sprite(c,'direction',0,0,n.r*2,n.r*2);c.restore()}
  else sprite(c,nodeArt(n),n.x,n.y,n.r*2+2);
  c.globalAlpha=1;
  if(n.relay&&!n.forkOnly){const count=Number(n.label)||g.level.nodes.filter(p=>p.relay&&!p.forkOnly).indexOf(n)+1;lamps(c,n.x,n.y+n.r-3,count,done?count:0,'#cda2ff')}
  if(n.minBounces){lamps(c,n.x,n.y+n.r+3,n.minBounces,done?n.minBounces:Math.min(g.ball?.bounces||0,n.minBounces));if(n.relay)sprite(c,'charge',n.x-n.r+2,n.y-n.r+2,12)}
  if(n.direction&&n.relay)arrow(c,n.x+n.r-3,n.y-n.r+3,n.direction);
  if(done){c.fillStyle='#b8eb9b';c.fillRect(n.x-3,n.y+n.r+8,7,2)}
 }
 const e=g.level.exit;sprite(c,g.ready()?'exit-open':'exit-closed',e.x,e.y,e.r*2+2);
 if(e.minBounces)lamps(c,e.x,e.y+e.r+3,e.minBounces,Math.min(g.ball?.bounces||0,e.minBounces));
 const targets=g.level.nodes.filter(n=>g.level.requires.includes(n.id));
 if(targets.length){c.fillStyle='#0d1729e0';c.fillRect(282,36,76,14);c.fillStyle='#d2dce4';c.font='10px sans-serif';c.textAlign='center';c.fillText(`机关 ${targets.filter(n=>g.flags.includes(n.id)).length}/${targets.length}`,320,47)}
 for(const points of g.lastPaths||[])path(c,points,'#849ab84d',1,[2,4]);
 if(g.routeHint&&g.phase==='aim'){
  const route=g.route();if(route)for(const [i,points] of route.paths.entries()){path(c,points,'#081225',4,[6,4]);path(c,points,i===2?'#ffe39a':'#91f5eb',2,[6,4])}
 }
 if(angle!==null&&g.phase==='aim'){
  path(c,g.preview(angle,g.longPreview?3:1),'#ffe4a1',2,[4,4]);c.fillStyle='#e9d1a0';c.font='10px sans-serif';c.textAlign='center';c.fillText(`${(angle*180/Math.PI).toFixed(1)}°`,g.level.origin.x,g.level.origin.y-23);
 }
 const o=g.level.origin;sprite(c,'launcher',o.x,o.y,30);
 for(const b of g.balls.filter(b=>!b.dead)){path(c,g.paths[b.id].slice(-3).concat([{x:b.x,y:b.y}]),b.id===2?'#a3ffd07a':'#ffcd7c7a',2);if(b.id===2)sprite(c,'orb-mint',b.x,b.y,12);else orbSprite(c,g.orbSkin,b.x,b.y)}
 if(g.campFlag){c.fillStyle='#b3894e';c.fillRect(605,317,2,23);c.fillStyle='#d98149';c.fillRect(607,317,13,7);c.fillRect(607,324,8,3)}
 for(const f of g.effects){c.globalAlpha=Math.max(0,f.life/.45);const spread=(1-f.life/.45)*22;c.fillStyle=f.kind==='hurt'?'#ef808a':f.kind==='portal'?'#79caff':'#ffdf96';for(let i=0;i<6;i++){const a=i*Math.PI/3;c.fillRect(Math.round(f.x+Math.cos(a)*spread),Math.round(f.y+Math.sin(a)*spread),2,2)}}c.globalAlpha=1;
 const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const output=canvas.getContext('2d');output.imageSmoothingEnabled=false;output.clearRect(0,0,w,h);output.drawImage(world,0,0,w,h);
}
