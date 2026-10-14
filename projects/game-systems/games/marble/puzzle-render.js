const world=document.createElement('canvas');world.width=640;world.height=360;
function path(c,points,color,width=1,dash=[]){if(points.length<2)return;c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();c.setLineDash([]);}
function circle(c,x,y,r,color,stroke,width=2){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(color){c.fillStyle=color;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}}
export function drawPuzzle(g,canvas,angle,restAngle=0){
 const c=world.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#15232e';c.fillRect(0,0,640,360);
 c.fillStyle='#1c2b35';for(let x=32;x<640;x+=48)for(let y=64;y<300;y+=48)c.fillRect(x,y,2,2);
 c.fillStyle='#65818e';c.fillRect(12,12,616,3);c.fillRect(12,15,3,328);c.fillRect(625,15,3,328);c.fillStyle='#3f5564';c.fillRect(12,343,616,3);
 for(const q of g.room().walls){c.fillStyle='#0c1823';c.fillRect(q.x+3,q.y+4,q.w,q.h);c.fillStyle='#516b7a';c.fillRect(q.x,q.y,q.w,q.h);c.fillStyle='#9cb1b7';c.fillRect(q.x,q.y,q.w,3);c.fillRect(q.x,q.y,3,q.h);c.fillStyle='#354e5e';c.fillRect(q.x,q.y+q.h-3,q.w,3);}
 for(const n of g.level.nodes){const done=g.flags.includes(n.id);circle(c,n.x,n.y,n.r,done?'#25493f':'#245361',done?'#59897a':'#88e6d5',3);if(done){path(c,[{x:n.x-7,y:n.y},{x:n.x-1,y:n.y+6},{x:n.x+9,y:n.y-7}],'#9ed5b3',3)}else{c.fillStyle='#c4fff1';c.fillRect(n.x-5,n.y-5,10,10)}}
 const e=g.level.exit;circle(c,e.x,e.y,e.r,g.ready()?'#59482a':'#293940',g.ready()?'#ffdc82':'#778b91',4);circle(c,e.x,e.y,e.r-8,null,g.ready()?'#d4a957':'#50616a',2);
 if(!g.ready()){c.fillStyle='#becbc9';c.fillRect(e.x-5,e.y-2,10,10);c.strokeStyle='#becbc9';c.lineWidth=2;c.strokeRect(e.x-3,e.y-8,6,7)}
 for(const points of g.lastPaths||[])path(c,points,'#71859366',1,[3,5]);
 if(g.routeHint&&g.phase==='aim'){const route=g.route();if(route)for(const points of route.paths)path(c,points,'#9df0d8',2,[7,5])}
 if(angle!==null&&g.phase==='aim')path(c,g.preview(angle,g.longPreview?3:2),'#ffe3a0',2,[5,5]);
 const o=g.level.origin,a=angle??restAngle;c.save();c.translate(o.x,o.y);c.fillStyle='#334d5a';c.fillRect(-15,3,30,9);c.rotate(a);c.fillStyle='#93b1bd';c.fillRect(-5,-22,10,24);c.fillStyle='#d5ebeb';c.fillRect(-3,-22,6,4);c.restore();circle(c,o.x,o.y,6,'#f4edc9');
 const orbColor={rose:'#ffb7c4',mint:'#a2f1d3',comet:'#fff1ba',violet:'#d8bdff',amber:'#ffcf91',cyan:'#b4eff9'}[g.orbSkin]||'#fff6d7';
 for(const b of g.balls.filter(b=>!b.dead)){path(c,g.paths[b.id].slice(-2).concat([{x:b.x,y:b.y}]),orbColor+'70',2);circle(c,b.x,b.y,b.r,orbColor);c.fillStyle='#fff';c.fillRect(Math.round(b.x-2),Math.round(b.y-2),2,2)}
 if(g.campFlag){c.fillStyle='#8eaaaf';c.fillRect(610,316,2,22);c.fillStyle='#d6a763';c.fillRect(612,316,10,6)}
 for(const f of g.effects){c.globalAlpha=Math.max(0,f.life/.45);const spread=(1-f.life/.45)*17;c.fillStyle=f.kind==='switch'?'#8ee6cc':'#ffdf96';for(let i=0;i<5;i++){const a=i*Math.PI*2/5;c.fillRect(Math.round(f.x+Math.cos(a)*spread),Math.round(f.y+Math.sin(a)*spread),3,3)}}c.globalAlpha=1;
 const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}const out=canvas.getContext('2d');out.imageSmoothingEnabled=false;out.drawImage(world,0,0,w,h);
}
