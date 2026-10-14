import {W,H,BALL_R} from './data.js';
const EPS=1e-7;
const rank={bottom:0,wall:1,rect:2,column:3,spring:4,plate:5,cluster:6,switch:7,chest:8,crystal:9,target:10,obstacle:10,enemy:11};
function circleHit(px,py,vx,vy,cx,cy,r,max){
 const dx=px-cx,dy=py-cy,a=vx*vx+vy*vy,b=2*(dx*vx+dy*vy),d=b*b-4*a*(dx*dx+dy*dy-r*r);
 if(d<0||a<EPS)return null;
 const t=(-b-Math.sqrt(d))/(2*a);if(t<EPS||t>max+EPS)return null;
 const x=px+vx*t,y=py+vy*t,l=Math.hypot(x-cx,y-cy)||1;return {t,nx:(x-cx)/l,ny:(y-cy)/l,x,y};
}
function rectHit(px,py,vx,vy,q,r,max){
 const found=[];const push=(t,nx,ny)=>{if(t<EPS||t>max+EPS)return;const x=px+vx*t,y=py+vy*t;if(nx&&y>=q.y-EPS&&y<=q.y+q.h+EPS||ny&&x>=q.x-EPS&&x<=q.x+q.w+EPS)found.push({t,nx,ny,x,y})};
 if(vx>EPS)push((q.x-r-px)/vx,-1,0);if(vx<-EPS)push((q.x+q.w+r-px)/vx,1,0);
 if(vy>EPS)push((q.y-r-py)/vy,0,-1);if(vy<-EPS)push((q.y+q.h+r-py)/vy,0,1);
 for(const x of [q.x,q.x+q.w])for(const y of [q.y,q.y+q.h]){
  const h=circleHit(px,py,vx,vy,x,y,r,max);if(h&&((x===q.x&&h.x<=x||x!==q.x&&h.x>=x)&&(y===q.y&&h.y<=y||y!==q.y&&h.y>=y)))found.push(h);
 }
 return found.sort((a,b)=>a.t-b.t)[0]||null;
}
// Swept circle against a finite segment expanded into a capsule. Side and end
// contacts use the same normal that the visible diagonal board implies.
export function capsuleHit(px,py,vx,vy,q,r,max){
 const sx=q.x2-q.x1,sy=q.y2-q.y1,len=Math.hypot(sx,sy),ux=sx/len,uy=sy/len,nx=-uy,ny=ux;
 const ds=(px-q.x1)*nx+(py-q.y1)*ny,vs=vx*nx+vy*ny,found=[];
 if(Math.abs(vs)>EPS)for(const side of [-1,1]){
  const t=(side*r-ds)/vs,x=px+vx*t,y=py+vy*t,projection=(x-q.x1)*ux+(y-q.y1)*uy;
  if(t>EPS&&t<=max+EPS&&projection>=-EPS&&projection<=len+EPS&&vs*side<0)found.push({t,x,y,nx:side*nx,ny:side*ny});
 }
 for(const [x,y] of [[q.x1,q.y1],[q.x2,q.y2]]){const h=circleHit(px,py,vx,vy,x,y,r,max);if(h)found.push(h)}
 return found.sort((a,b)=>a.t-b.t)[0]||null;
}
export function nextCollision(room,ball,max=Infinity){
 const {x,y,vx,vy}=ball,rad=ball.r??BALL_R,width=room.width??W,height=room.height??H;let best=null;
 const add=(hit,kind,id)=>{if(!hit||hit.t<EPS||hit.t>max+EPS)return;const c={...hit,kind,id};if(!best||c.t<best.t-1e-6||Math.abs(c.t-best.t)<1e-6&&(rank[kind]<rank[best.kind]||rank[kind]===rank[best.kind]&&String(id)<String(best.id)))best=c};
 if(vx<0)add({t:(rad+12-x)/vx,nx:1,ny:0,x:rad+12,y:y+vy*((rad+12-x)/vx)},'wall','left');
 if(vx>0)add({t:(width-12-rad-x)/vx,nx:-1,ny:0,x:width-12-rad,y:y+vy*((width-12-rad-x)/vx)},'wall','right');
 if(vy<0)add({t:(rad+12-y)/vy,nx:0,ny:1,x:x+vx*((rad+12-y)/vy),y:rad+12},'wall','top');
 if(vy>0)add({t:(height-6-y)/vy,nx:0,ny:-1,x:x+vx*((height-6-y)/vy),y:height-6},'bottom','bottom');
 room.walls.forEach((q,i)=>add(rectHit(x,y,vx,vy,q,rad,max),'rect','w'+i));
 if(room.door&&!room.doorOpen)add(rectHit(x,y,vx,vy,room.door,rad,max),'rect','door');
 room.columns.forEach((q,i)=>add(circleHit(x,y,vx,vy,q.x,q.y,q.r+rad,max),'column',i));
 room.obstacles?.forEach(q=>{if(q.hits>0)add(circleHit(x,y,vx,vy,q.x,q.y,q.r+rad,max),'obstacle',q.id)});
 room.springs?.forEach((q,i)=>add(circleHit(x,y,vx,vy,q.x,q.y,q.r+rad,max),'spring',i));
 room.plates?.forEach((q,i)=>add(capsuleHit(x,y,vx,vy,q,rad+3,max),'plate',i));
 room.clusters?.forEach((q,i)=>{if(!q.broken)add(circleHit(x,y,vx,vy,q.x,q.y,q.r+rad,max),'cluster',i)});
 if(room.switch&&!room.doorOpen)add(circleHit(x,y,vx,vy,room.switch.x,room.switch.y,room.switch.r+rad,max),'switch','switch');
 if(room.chest&&!room.chestOpen)add(circleHit(x,y,vx,vy,room.chest.x,room.chest.y,room.chest.r+rad,max),'chest','chest');
 if(room.crystal&&!room.crystalBroken)add(circleHit(x,y,vx,vy,room.crystal.x,room.crystal.y,room.crystal.r+rad,max),'crystal','crystal');
 if(room.target)add(circleHit(x,y,vx,vy,room.target.x,room.target.y,room.target.r+rad,max),'target','target');
 const minX=Math.min(x,x+vx*max)-rad-34,maxX=Math.max(x,x+vx*max)+rad+34,minY=Math.min(y,y+vy*max)-rad-34,maxY=Math.max(y,y+vy*max)+rad+34;
 room.enemies.forEach(enemy=>{if(!enemy.dead&&(enemy.type==='spirit'||enemy.hp>0)&&!(enemy.id===ball.ignoreEnemyId&&ball.time<(ball.ignoreUntil??.1))&&enemy.x>=minX&&enemy.x<=maxX&&enemy.y>=minY&&enemy.y<=maxY)add(circleHit(x,y,vx,vy,enemy.x,enemy.y,enemy.r+rad,max),'enemy',enemy.id)});
 return best&&best.t>=EPS&&best.t<=max+EPS?best:null;
}
export function reflect(vx,vy,nx,ny){const dot=vx*nx+vy*ny;return {vx:vx-2*dot*nx,vy:vy-2*dot*ny}}
export function preview(room,x,y,vx,vy,r=BALL_R){const b={x,y,vx,vy,r},hit=nextCollision(room,b,6);if(!hit)return null;const alters=hit.kind==='switch'||hit.kind==='chest'||hit.kind==='enemy';const v=reflect(vx,vy,hit.nx,hit.ny);return {hit,after:alters?null:{x:hit.x+v.vx/Math.hypot(v.vx,v.vy)*42,y:hit.y+v.vy/Math.hypot(v.vx,v.vy)*42}}}
