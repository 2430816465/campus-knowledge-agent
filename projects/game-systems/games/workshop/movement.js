// Feet positions in world coordinates. Axis-separated motion slides along fixtures.
export function createWalker(x,y){
 const p={x,y,facing:1,moving:false,distance:0};let target=null,bounds={left:20,right:700,top:300,bottom:550},obstacles=[];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const clear=()=>{target=null;p.moving=false;};
 function fits(x,y){return !obstacles.some(r=>x>r.left-11&&x<r.right+11&&y>r.top-9&&y<r.bottom+9);}
 function configure(b,boxes){bounds=b;obstacles=boxes;p.x=clamp(p.x,b.left,b.right);p.y=clamp(p.y,b.top,b.bottom);if(!fits(p.x,p.y)){p.y=b.bottom;if(!fits(p.x,p.y))p.x=b.left;}clear();}
 function step(dt,enabled=true){
  if(!enabled){clear();return;}let dx=0,dy=0;
  if(dx||dy)target=null;
  if(target&&!dx&&!dy){dx=target.x-p.x;dy=target.y-p.y;if(Math.hypot(dx,dy)<5){target=null;dx=dy=0;}}
  const len=Math.hypot(dx,dy),amount=Math.min(260*dt,target?len:Infinity);if(len>1){dx/=len;dy/=len;}
  const oldX=p.x,oldY=p.y,nx=clamp(p.x+dx*amount,bounds.left,bounds.right),ny=clamp(p.y+dy*amount,bounds.top,bounds.bottom);
  if(fits(nx,p.y))p.x=nx;if(fits(p.x,ny))p.y=ny;
  const distance=Math.hypot(p.x-oldX,p.y-oldY);p.moving=distance>.01;p.distance+=distance;if(dx)p.facing=dx<0?-1:1;
  if(target&&!p.moving)target=null;
 }
 return {p,clear,configure,step,go(x,y){target={x:clamp(x,bounds.left,bounds.right),y:clamp(y,bounds.top,bounds.bottom)};},get bounds(){return bounds;},get obstacles(){return obstacles;}};
}
