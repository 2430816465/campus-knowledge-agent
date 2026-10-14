import {createWalker} from './movement.js';
import {COLORS,RECIPES,stockTotal,capacity,hasLine,handTotal} from './economy.js';
import {conveyorNetwork,routePoint} from './conveyor.js';
import {FACILITIES,facilityUnlocked} from './shop.js';
const names=['background','wheat','cow','berries','oven','counter','crate','demon','demon-walk-1','demon-walk-2','knight','mage','ranger','bread','milk-bread','berry-bread','handcart','wheat-drop','milk-drop','berry-drop','mill','jam','rack','table','pack','wagon','jam-bread','parcel'];
const dropNames=['wheat-drop','milk-drop','berry-drop'];
const farmNames=['wheat','cow','berries'],breadNames=['bread','milk-bread','berry-bread','jam-bread'],tones=['#ffd663','#ecf8ff','#f65d8e'];
export function createBakeryScene({canvas,read,collect,open,blocked,closePanel,interact,assist,onMove}){
 const ctx=canvas.getContext('2d'),assets={},walker=createWalker(300,500),effects=[],notes=[];
 const groundCooldown=[0,0,0],groundAge=[0,0,0],flying=[];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let world={width:720,height:590,scale:1,offsetY:0},layout=null,ready=false,pointer=null,initialized=false;
 const breadTransits=[],beltCache=new WeakMap();
 function stop(){walker.clear();pointer=null;}
 function resize(){
  const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),old=world;
  canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);const scale=Math.min(canvas.width/720,canvas.height/590);
  world={width:canvas.width/scale,height:canvas.height/scale,scale,offsetY:0};const w=world.width,h=world.height,portrait=box.height>box.width,cssScale=scale/dpr;
  const fy=h*(portrait?.34:.42),farms=(portrait?[.17,.5,.83]:[.34,.49,.64]).map(x=>({x:w*x,y:fy,width:portrait?128:106}));
  const oven={x:w*(portrait?.48:.72),y:h*(portrait?.48:.49),width:portrait?132:116},counter={x:w*(portrait?.81:.90),y:oven.y,width:portrait?138:130},crate={x:w*(portrait?.12:.10),y:h*(portrait?.78:.70),width:64};
  const positions=portrait?{mill:[.16,.48],rack:[.17,.63],jam:[.5,.63],table:[.83,.63],pack:[.36,.78],wagon:[.75,.78]}:{mill:[.22,.49],rack:[.27,.74],jam:[.43,.74],table:[.59,.74],pack:[.75,.74],wagon:[.91,.74]};
  const facilities=FACILITIES.map(f=>({id:f.id,x:w*positions[f.id][0],y:h*positions[f.id][1],width:f.id==='table'||f.id==='wagon'?portrait?132:124:portrait?116:106}));
  const bounds={left:28,right:w-28,top:fy+14,bottom:h-((portrait?156:88)/cssScale)};
  const s=read(),fixtures=[...farms.filter((f,i)=>s.collectors[i]>0),oven,...(s.shop.facilities.rack?[counter]:[]),...(s.upgrades.storage?[crate]:[]),...facilities.filter(f=>s.shop.facilities[f.id])],boxes=fixtures.map(f=>({left:f.x-f.width*.36,right:f.x+f.width*.36,top:f.y-f.width*.2,bottom:f.y+3}));
  layout={portrait,farms,oven,counter,crate,facilities,bounds,boxes,pickups:farms.map((f,i)=>({x:f.x+(i===2?-42:42),y:fy+58,color:i}))};
  layout.conveyor=conveyorNetwork({...layout,active:s.collectors});
  if(!initialized){walker.p.x=w*.32;walker.p.y=bounds.bottom-20;initialized=true;}else{walker.p.x=walker.p.x/old.width*w;walker.p.y=walker.p.y/old.height*h;}walker.configure(bounds,boxes);stop();draw();
 }
 function sprite(name,x,y,width,alpha=1,flip=false){const img=assets[name];if(!img?.complete||!img.naturalWidth)return;ctx.save();ctx.globalAlpha=alpha;ctx.translate(Math.round(x),Math.round(y));if(flip)ctx.scale(-1,1);const height=width*img.height/img.width;ctx.drawImage(img,Math.round(-width/2),Math.round(-height),Math.round(width),Math.round(height));ctx.restore();}
 function pad(x,y,width,color,owned=true){ctx.save();ctx.strokeStyle=owned?color+'99':'#61574755';ctx.lineWidth=2;ctx.setLineDash(owned?[]:[5,5]);ctx.beginPath();ctx.ellipse(x,y+20,width*.45,6,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
 function shadow(x,y,size){ctx.fillStyle='#392b2544';ctx.beginPath();ctx.ellipse(x,y+1,size*.42,size*.12,0,0,Math.PI*2);ctx.fill();}
 function ingredient(i,x,y,size=30){sprite(dropNames[i],x,y,size);}
 function belt(network,t){
  let cached=beltCache.get(network);
  if(!cached){
   const unit=2,cells=new Map(),put=(x,y,h)=>{const key=x+','+y;if(!cells.has(key))cells.set(key,{x,y,h});};
   for(const [a,b] of network.edges){const horizontal=a.y===b.y;
    const x0=Math.floor((Math.min(a.x,b.x)-(horizontal?8:10))/unit),x1=Math.ceil((Math.max(a.x,b.x)+(horizontal?8:10))/unit);
    const y0=Math.floor((Math.min(a.y,b.y)-(horizontal?10:8))/unit),y1=Math.ceil((Math.max(a.y,b.y)+(horizontal?10:8))/unit);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)put(x,y,horizontal);
   }
   const list=[...cells.values()],x=Math.min(...list.map(p=>p.x))*unit,y=Math.min(...list.map(p=>p.y))*unit;
   const width=Math.max(...list.map(p=>p.x))*unit-x+unit,height=Math.max(...list.map(p=>p.y))*unit-y+unit;
   const has=(x,y)=>cells.has(x+','+y),inside=p=>has(p.x-1,p.y)&&has(p.x+1,p.y)&&has(p.x,p.y-1)&&has(p.x,p.y+1);
   const interior=list.filter(inside),frames=[];
   // Seven cached pixel frames replace thousands of paint calls per mobile frame.
   // The exposed edge mask is shared by all branches, corners and T junctions.
   for(let phase=0;phase<7;phase++){
    const frame=document.createElement('canvas');frame.width=width;frame.height=height;const c=frame.getContext('2d');c.translate(-x,-y);c.fillStyle='#3d3b34';
    for(const p of list)c.fillRect(p.x*unit,p.y*unit,unit,unit);
    for(const p of interior){c.fillStyle=(((p.h?p.x:p.y)-phase)%7+7)%7===0?'#c3b797':'#7f806b';c.fillRect(p.x*unit,p.y*unit,unit,unit);}frames.push(frame);
   }
   cached={frames,x,y};beltCache.set(network,cached);
  }
  ctx.drawImage(cached.frames[Math.floor(t*5)%7],cached.x,cached.y);
 }
 function pickups(){const s=read();return layout.pickups.filter(p=>s.collectors[p.color]>0&&s.buffer[p.color]>0&&groundCooldown[p.color]<=0&&groundAge[p.color]>=.3&&s.sweepCooldown<=0&&(hasLine(s)?stockTotal(s)<capacity(s):handTotal(s)<6));}
 function facilityVisible(s,id){return s.shop.facilities[id]>0||facilityUnlocked(s,id);}
 function draw(){
  if(!layout)return;const s=read(),w=world.width,h=world.height,t=s.elapsed,L=layout;
  ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);
  const bg=assets.background;if(bg?.naturalWidth)ctx.drawImage(bg,0,0,canvas.width,canvas.height);else{ctx.fillStyle='#d1b88d';ctx.fillRect(0,0,canvas.width,canvas.height);}
  ctx.setTransform(world.scale,0,0,world.scale,0,0);
  if(hasLine(s))belt(L.conveyor,t);
  s.carts.forEach(c=>{const color=COLORS.indexOf(c.color),travel=2.4/(1+.35*s.upgrades.rail),p=routePoint(L.conveyor.routes[color],1-c.t/travel);shadow(p.x,p.y,24);ingredient(color,p.x,p.y+4,25);});
  L.farms.forEach((f,i)=>{if(!s.collectors[i])return;pad(f.x,f.y,f.width,tones[i]);sprite(farmNames[i],f.x,f.y,f.width);});
  for(const [f,name,tone] of [[L.oven,'oven','#ffcf66'],...(s.shop.facilities.rack?[[L.counter,'counter','#fff0ae']]:[]),...(s.upgrades.storage?[[L.crate,'crate','#e3d56a']]:[])]){pad(f.x,f.y,f.width,tone);sprite(name,f.x,f.y,f.width);}
  for(const f of L.facilities){const owned=s.shop.facilities[f.id]>0;if(!facilityVisible(s,f.id))continue;pad(f.x,f.y,f.width,'#fff19a',owned);sprite(f.id,f.x,f.y,f.width,owned?1:.22);}
  if(globalThis.CampCosmetics?.includes('bakery-berry')){ctx.save();if(s.shop.facilities.rack){ctx.fillStyle='#bd6681';ctx.fillRect(L.counter.x-44,L.counter.y-12,88,13);ctx.fillStyle='#fff0d6';for(let i=0;i<8;i++)ctx.fillRect(L.counter.x-40+i*11,L.counter.y-12,5,13);}ctx.fillStyle='#aa4d75';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('莓果甜品屋',L.oven.x,L.oven.y-75);for(const p of [L.oven,...(s.shop.facilities.rack?[L.counter]:[])]){for(let i=0;i<3;i++){ctx.fillStyle='#b5577a';ctx.beginPath();ctx.arc(p.x-16+i*16,p.y-44,5,0,Math.PI*2);ctx.fill();}}ctx.restore();}
  const table=L.facilities.find(f=>f.id==='table');if(s.shop.facilities.table)for(let i=0;i<s.shop.guests;i++)sprite(['knight','ranger','mage'][i],table.x+(i-1)*32,table.y+18,38);
  const pack=L.facilities.find(f=>f.id==='pack');if(s.shop.parcels.length)sprite('parcel',pack.x,pack.y-20,34);
  const rack=L.facilities.find(f=>f.id==='rack');if(s.shop.facilities.rack)s.shop.stock.forEach((n,i)=>{if(n)sprite(breadNames[i],rack.x-30+i*20,rack.y-16,23);});
  const wagon=L.facilities.find(f=>f.id==='wagon');if(s.shop.trip){ctx.fillStyle='#fff1cfee';ctx.fillRect(wagon.x-46,wagon.y+8,92,18);ctx.fillStyle='#604128';ctx.font='12px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('送货 '+Math.ceil(s.shop.trip.t)+' 秒',wagon.x,wagon.y+21);}
  const serve=(Math.floor(t/4)%3),hero=['knight','mage','ranger'][serve];sprite(hero,L.counter.x+L.counter.width*.47,L.counter.y+40,55);
  if(s.job){const r=RECIPES[s.job.recipe],p=1-s.job.t/(r.seconds/(1+.2*s.upgrades.polish)*(s.shop.facilities.mill?.85:1));ctx.fillStyle='#493025';ctx.fillRect(L.oven.x-36,L.oven.y+21,72,8);ctx.fillStyle='#ffcd62';ctx.fillRect(L.oven.x-34,L.oven.y+23,68*Math.max(0,p),4);sprite(breadNames[s.job.recipe],L.oven.x,L.oven.y-20,36);}
  for(const item of breadTransits){const p=routePoint(L.conveyor.output,1-item.t/2);sprite(breadNames[item.recipe],p.x,p.y+4,35);}
  s.hand.ready.forEach((n,i)=>{if(n)sprite(breadNames[i],L.oven.x+28,L.oven.y+14,35);});
  for(const p of L.pickups){if(!s.collectors[p.color]||!s.buffer[p.color]||groundCooldown[p.color]>0)continue;const age=groundAge[p.color],fall=reduced?0:age<.3?(1-age/.3)*28:age<.6?Math.sin((age-.3)/.3*Math.PI)*7:0;for(const [dx,dy] of [[-17,1],[16,5],[0,-10]].slice(0,Math.min(3,s.buffer[p.color]))){shadow(p.x+dx,p.y+dy,30);ingredient(p.color,p.x+dx,p.y+dy-fall,31);}}
  for(const item of flying){const q=1-item.t/.45,x=item.x+(item.toX-item.x)*q,y=item.y+(item.toY-item.y)*q-Math.sin(q*Math.PI)*35;ingredient(item.color,x,y,30*(1-q*.4));}
  const p=walker.p;ctx.save();ctx.fillStyle='#35252155';ctx.beginPath();ctx.ellipse(p.x,p.y+2,21,7,0,0,Math.PI*2);ctx.fill();ctx.restore();
  const walking=p.moving&&!reduced,phase=p.distance/22;
  const demon=walking?(Math.floor(phase)%2?'demon-walk-1':'demon-walk-2'):p.distance>0?'demon-walk-1':'demon';
  // All poses share the same height and foot anchor, avoiding a size pop on movement.
  const pose=assets[demon],bodyHeight=L.portrait?84:70,bodyWidth=pose?.naturalHeight?bodyHeight*pose.naturalWidth/pose.naturalHeight:58;
  sprite(demon,p.x,p.y-(walking?Math.abs(Math.sin(phase*Math.PI))*1.6:0),bodyWidth,1,p.facing<0&&p.distance>0);
  if(s.shop.carry)sprite(s.shop.carry.kind==='bread'?breadNames[s.shop.carry.recipe]:'parcel',p.x,p.y-60,34);
  else if(!hasLine(s)&&s.goods.some(n=>n>0))sprite(breadNames[s.goods.findIndex(n=>n>0)],p.x,p.y-60,34);
  else if(handTotal(s))ingredient(s.hand.raw.findIndex(n=>n>0),p.x,p.y-60,32);
  effects.forEach(e=>{ctx.fillStyle=e.color;ctx.fillRect(e.x-2,e.y-2,4,4);});
  notes.forEach(n=>{ctx.font='bold 20px Microsoft YaHei';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#372921';ctx.strokeText(n.text,n.x??w/2,n.y??h*.34);ctx.fillStyle='#fff7c6';ctx.fillText(n.text,n.x??w/2,n.y??h*.34);});
  if(s.paused){ctx.fillStyle='#201e2455';ctx.fillRect(0,0,w,h);ctx.font='bold 23px Microsoft YaHei';ctx.textAlign='center';ctx.fillStyle='#fff1ce';ctx.fillText('面包房已暂停',w/2,h/2);}
 }
 function tick(dt){
  walker.step(dt,!blocked());const p=walker.p;
  if(!read().paused){for(let i=0;i<3;i++){groundCooldown[i]=Math.max(0,groundCooldown[i]-dt);groundAge[i]=groundCooldown[i]>0?0:groundAge[i]+dt;}for(let i=flying.length-1;i>=0;i--)if((flying[i].t-=dt)<=0)flying.splice(i,1);}
  if(!read().paused)for(let i=breadTransits.length-1;i>=0;i--)if((breadTransits[i].t-=dt)<=0)breadTransits.splice(i,1);
  if(!blocked())for(const item of pickups())if(Math.hypot(p.x-item.x,p.y-item.y)<34){collect(item.color);break;}
  for(let i=effects.length-1;i>=0;i--){effects[i].t-=dt;effects[i].y-=dt*32;if(effects[i].t<=0)effects.splice(i,1);}for(let i=notes.length-1;i>=0;i--)if((notes[i].t-=dt)<=0)notes.splice(i,1);
 }
 function nearby(){if(!layout)return null;const p=walker.p,s=read(),stations=[...layout.facilities.filter(f=>s.shop.facilities[f.id]&&['rack','table','pack','wagon'].includes(f.id)),{...layout.oven,id:'oven'},...(!hasLine(s)?[{...layout.counter,id:'customer'}]:[])];return stations.map(f=>({...f,distance:Math.hypot(p.x-f.x,p.y-(f.y+30))})).filter(f=>f.distance<80).sort((a,b)=>a.distance-b.distance)[0]||null;}
 function goTo(id){if(blocked())return false;const farm=['wheat','cow','berries'].indexOf(id),f=id==='oven'?layout.oven:id==='customer'?layout.counter:layout.pickups[farm>=0?farm:Number(id)];if(!f)return false;walker.go(f.x,f.y+(id==='oven'||id==='customer'?34:0));onMove?.();return true;}
 function act(){const f=nearby();if(f&&!blocked())interact(f.id);return f?.id;}
 function collectEffect(color,count=1){const p=walker.p,drop=layout.pickups[color];groundCooldown[color]=.4;groundAge[color]=0;for(const dx of [-17,0,16].slice(0,count))flying.push({color,x:drop.x+dx,y:drop.y,toX:p.x,toY:p.y-24,t:.45});for(let i=0;i<7;i++)effects.push({x:p.x+(i-3)*5,y:p.y-30,color:tones[color],t:.7});}
 addEventListener('blur',stop);
 canvas.addEventListener('pointerdown',e=>{
  if(closePanel())return;if(blocked())return;const box=canvas.getBoundingClientRect(),x=(e.clientX-box.left)*world.width/box.width,y=(e.clientY-box.top)*world.height/box.height;
  for(const [id,f] of [['oven',layout.oven],...layout.farms.map((f,i)=>[farmNames[i],f])]){
   if(id!=='oven'&&!read().collectors[farmNames.indexOf(id)])continue;
   if(Math.abs(x-f.x)<f.width*.55&&y<f.y+24&&y>f.y-f.width*.85){const distance=Math.hypot(walker.p.x-f.x,walker.p.y-(f.y+30));if(distance>=80){goTo(id);return;}stop();if(id==='oven'&&(read().hand.ready.some(n=>n)||!read().job&&!hasLine(read())))interact('oven');else assist?.(id,distance);return;}
  }
  const hit=layout.facilities.find(f=>facilityVisible(read(),f.id)&&Math.abs(x-f.x)<f.width*.45&&y<f.y+12&&y>f.y-f.width*.7);
  if(hit){if(!read().shop.facilities[hit.id]||['mill','jam'].includes(hit.id)){stop();open('production',hit.id);}else if(nearby()?.id===hit.id){act();}else walker.go(hit.x,hit.y+34);return;}
  if(!hasLine(read())||read().hand.ready.some(n=>n)){for(const [id,f] of [['oven',layout.oven],['customer',layout.counter]])if(Math.abs(x-f.x)<f.width*.55&&y<f.y+60&&y>f.y-f.width*.7){if(nearby()?.id===id)act();else goTo(id);return;}}
  const fixtures=[...layout.farms,layout.oven,layout.counter,layout.crate];let i=fixtures.findIndex((f,i)=>(i<3?read().collectors[i]>0:i===4?read().shop.facilities.rack>0:i===5?read().upgrades.storage>0:true)&&Math.abs(x-f.x)<f.width*.45&&y<f.y&&y>f.y-f.width*.65);
  if(i>=0){stop();open(i===3?'recipe':i===4?'orders':'production',i<3?i:i===5?5:null);return;}walker.go(x,y);onMove?.();
 });
 async function load(){await Promise.all(names.map(name=>new Promise(resolve=>{const img=new Image();assets[name]=img;img.onload=resolve;img.onerror=resolve;img.src='assets/bakery-'+name+'.webp';})));ready=names.every(n=>assets[n].naturalWidth>0);draw();return ready;}
 return {draw,resize,tick,stop,load,collectEffect,nearby,act,goTo,canAssist(id){const f=id==='oven'?layout.oven:layout.farms[farmNames.indexOf(id)];return !!f&&!blocked()&&Math.hypot(walker.p.x-f.x,walker.p.y-(f.y+30))<80;},assistEffect(id,text){const f=id==='oven'?layout.oven:layout.farms[farmNames.indexOf(id)];for(let i=0;i<8;i++)effects.push({x:f.x+(i-4)*6,y:f.y-20,color:'#ffcf66',t:.6});notes.length=0;notes.push({text,t:.65,x:f.x,y:f.y-70});},baked(recipe){if(hasLine(read()))breadTransits.push({recipe,t:2});},notice(text){notes.push({text,t:3});},reset(){walker.p.x=world.width*.32;walker.p.y=layout.bounds.bottom-20;breadTransits.length=0;groundCooldown.fill(0);groundAge.fill(0);flying.length=0;effects.length=0;notes.length=0;stop();resize();},snapshot(){return {ready,control:'click-to-move',world,player:{...walker.p},bounds:walker.bounds,obstacles:walker.obstacles,pickups:pickups(),visibleFacilities:['wheat','oven',...(read().collectors[1]?['cow']:[]),...(read().collectors[2]?['berries']:[]),...(hasLine(read())?['line']:[]),...(read().shop.facilities.rack?['counter']:[]),...(read().upgrades.storage?['crate']:[]),...layout.facilities.filter(f=>read().shop.facilities[f.id]).map(f=>f.id)],groundDrops:layout.pickups.filter(p=>read().collectors[p.color]>0&&read().buffer[p.color]>0&&groundCooldown[p.color]<=0).map(p=>({...p,count:Math.min(3,read().buffer[p.color]),phase:groundAge[p.color]<.6?'landing':'resting'})),flyingDrops:flying.length,breadTransits:breadTransits.map(b=>({...b,position:routePoint(layout.conveyor.output,1-b.t/2)})),layout,nearby:nearby()?.id||null};}};
}
