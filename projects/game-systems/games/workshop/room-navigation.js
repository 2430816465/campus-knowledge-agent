// Grid routing finds a way around furniture; clear sightlines remove needless turns.
export function createNavigator(obstacles=[]){
 const p={x:500,y:425,facing:1,direction:'down',moving:false,distance:0};let route=[],blocks=obstacles;
 const EPS=1e-6,GRID=20;
 const free=(x,y)=>x>=24&&x<=976&&y>=45&&y<=525&&!blocks.some(b=>x>b.left-12&&x<b.right+12&&y>b.top-12&&y<b.bottom+12);
 const key=c=>c.x+','+c.y;
 // Test the whole segment, including its connection from a mid-step position.
 // A tangent to the padded edge is safe; entering the rectangle is not.
 function clearLine(a,b){
  if(!free(a.x,a.y)||!free(b.x,b.y))return false;
  const dx=b.x-a.x,dy=b.y-a.y;
  return !blocks.some(o=>{
   let enter=0,leave=1;
   for(const [value,delta,min,max] of [[a.x,dx,o.left-12,o.right+12],[a.y,dy,o.top-12,o.bottom+12]]){
    if(Math.abs(delta)<EPS){if(value<=min||value>=max)return false;}
    else{const t0=(min-value)/delta,t1=(max-value)/delta;enter=Math.max(enter,Math.min(t0,t1));leave=Math.min(leave,Math.max(t0,t1));}
   }
   return enter<leave-EPS;
  });
 }
 function smooth(points){
  const result=[];let from=p,index=0;
  while(index<points.length){let next=points.length-1;while(next>index&&!clearLine(from,points[next]))next--;if(Math.hypot(points[next].x-from.x,points[next].y-from.y)>EPS)result.push(points[next]);from=points[next];index=next+1;}
  return result;
 }
 function go(x,y){
  const target={x,y};route=[];p.moving=false;
  if(!Number.isFinite(x)||!Number.isFinite(y)||!free(p.x,p.y))return false;
  if(clearLine(p,target)){route=smooth([target]);p.moving=route.length>0;return true;}
  // Keep the actual position connected to a reachable grid point. Rounding and
  // omitting this connection lets a retarget cut diagonally through table corners.
  const anchors=[];
  for(let gx=40;gx<=960;gx+=GRID)for(let gy=60;gy<=520;gy+=GRID)if(free(gx,gy))anchors.push({x:gx,y:gy});
  anchors.sort((a,b)=>(a.x-p.x)**2+(a.y-p.y)**2-((b.x-p.x)**2+(b.y-p.y)**2));
  const start=anchors.find(a=>clearLine(p,a));if(!start)return false;
  const queue=[start],seen=new Map([[key(start),null]]);let closest=start,dist=Infinity,reached=false;
  for(let head=0;head<queue.length;head++){
   const c=queue[head],d=(c.x-x)**2+(c.y-y)**2;
   if(d<dist){dist=d;closest=c;}
   if(clearLine(c,target)){closest=c;reached=true;break;}
   for(const [dx,dy] of [[GRID,0],[-GRID,0],[0,GRID],[0,-GRID]]){
    const v={x:c.x+dx,y:c.y+dy};if(seen.has(key(v))||!clearLine(c,v))continue;seen.set(key(v),c);queue.push(v);
   }
  }
  const points=[];for(let c=closest;c;c=seen.get(key(c)))points.unshift(c);if(reached)points.push(target);
  route=smooth(points);p.moving=route.length>0;return reached;
 }
 function step(dt,enabled=true){
  if(!enabled)return;let budget=240*Math.max(0,dt);
  while(route.length&&budget>0){
   const t=route[0],dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy),move=Math.min(d,budget);
   if(d>EPS){
    if(Math.abs(dx)>EPS)p.facing=Math.sign(dx);
    p.direction=Math.abs(dx)>=Math.abs(dy)-EPS?(dx<0?'left':'right'):(dy<0?'up':'down');
    p.x+=dx/d*move;p.y+=dy/d*move;p.distance+=move;
   }
   budget-=move;if(d<=move+EPS){p.x=t.x;p.y=t.y;route.shift();}
  }
  p.moving=route.length>0;
 }
 return {p,go,step,free,clear(){route=[];p.moving=false;},configure(o){blocks=o;route=[];p.moving=false;},get route(){return route;},get obstacles(){return blocks;}};
}
