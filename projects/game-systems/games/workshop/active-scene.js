import {createSolidRenderer} from './solid-scene.js';
import {createNavigator} from './room-navigation.js';
import {PLANS,WORLD,SPAWNS,solids,stationArt} from './room-layouts.js';
import {total,rawUnlocked,facilityUnlocked,dinerPreference,RECIPES,constructionAt} from './active-state.js';
export const ROOMS={raw:{name:'原料区',purpose:'采集原料 → 搬到原料仓',stations:[['wheat','麦田','按住采麦子','wheat'],['cow','奶牛棚','按住取牛奶','cow'],['berries','莓果丛','按住摘莓果','berries'],['depot','原料仓','入仓后供工位投料','crate']]},bake:{name:'烘焙区',purpose:'选择配方 → 投一批 → 烤好取货',stations:[['oven','面包烤箱','投料 / 取面包','oven'],['mill','磨坊','麦子 → 面粉','mill'],['jam','果酱锅','莓果 → 果酱','jam']]},shop:{name:'门店区',purpose:'订单柜台交单 · 展示架补货 · 长桌送餐',stations:[['counter','订单柜台','选订单并交付','counter'],['rack','展示架','补入成品箱面包','rack'],['table','勇者长桌','从展示架送餐收款','table']]},delivery:{name:'外卖区',purpose:'三种面包打包 → 取篮 → 装车 → 签收',stations:[['pack','打包台','普通 / 牛奶 / 莓果各 1','pack'],['wagon','马车站','装车 / 签收回款','wagon']]}};
const names=['demon','demon-walk-1','demon-walk-2','berry-drop',...new Set(Object.values(ROOMS).flatMap(r=>r.stations.map(x=>x[3])))];
// Coordinates follow the actual use of each room; feet face the common foreground aisle.
export function stationLocked(s,id){const i=['wheat','cow','berries'].indexOf(id);if(i>=0)return !rawUnlocked(s,i);return ['mill','jam','rack','table','pack','wagon'].includes(id)&&(!facilityUnlocked(s,id)||!s.facilities[id]);}
export function stationAvailability(s,id){if(constructionAt(s,id))return 'constructing';if(!stationLocked(s,id))return 'available';return ['mill','jam','rack','table','pack','wagon'].includes(id)&&facilityUnlocked(s,id)?'buildable':'locked';}
export function stationStatus(s,id){
 const build=constructionAt(s,id);if(build)return `${build.first?'组装':'升级'}中 · ${Math.ceil(build.t-.65)} 秒${build.first?'':' · 原有功能可用'}`;
 const i=['wheat','cow','berries'].indexOf(id);if(i>=0)return rawUnlocked(s,i)?'走近后按住采集':`完成第 ${i} 队解锁`;
 if(id==='depot')return s.jobs.transfer?'这批入仓中':`仓内 ${total(s.store)} 份`;
 if(id==='counter')return `${s.orders.length} 张普通单${s.bonus?' · 有加急单':''}`;
 if(stationLocked(s,id))return facilityUnlocked(s,id)?'待建造 · 点此查看':`完成第 ${['mill','rack'].includes(id)?1:['jam','table'].includes(id)?2:3} 队解锁`;
 if(id==='oven')return total(s.ovenReady)?`烤好 ${total(s.ovenReady)} 个 · 待取`:s.jobs.oven?`烘烤中 ${Math.ceil(s.jobs.oven.t)} 秒`:'空闲 · 待投料';
 if(id==='mill'||id==='jam')return s[id+'Ready']?`完成 ${s[id+'Ready']} 份 · 待取`:s.jobs[id]?`加工中 ${Math.ceil(s.jobs[id].t)} 秒`:'空闲 · 待投料';
 if(id==='rack')return `${total(s.shelf)} 个面包 · 手动补货`;
 if(id==='table')return `客人想吃${RECIPES[dinerPreference(s)].name} · 对味多赚20%`;
 if(id==='pack')return s.packReady.length?`${s.packReady.length} 篮 · 待取`:s.jobs.pack?`打包中 ${Math.ceil(s.jobs.pack.t)} 秒`:'空闲 · 待打包';
 return s.receipt?'配送完成 · 待签收':s.jobs.trip?`配送中 ${Math.ceil(s.jobs.trip.t)} 秒`:`有 ${s.parcels.length} 篮 · 待装车`;
}
export function createScene({canvas,container,labels,read,onSelect}){
 const solid=createSolidRenderer(canvas),walker=createNavigator();let room='raw',selected=null,layout=[],ready=false;
 function arrange(){layout=ROOMS[room].stations.map(([id,name,purpose,art])=>{const [x,y,w,h,fx,fy]=PLANS[room].stations[id];return {id,name,purpose,art,x,y,w,h,foot:{x:fx,y:fy}};});walker.configure(solids(room));solid.build(room,layout,solids(room));
  labels.innerHTML=layout.map(p=>`<button class="station" data-station="${p.id}" aria-label="${p.name}，${p.purpose}"><strong>${p.name}</strong><span></span></button>`).join('');labels.querySelectorAll('button').forEach(b=>b.onclick=()=>select(b.dataset.station));positionLabels();update();
 }
 function positionLabels(){for(const p of layout){const b=labels.querySelector(`[data-station="${p.id}"]`),model=PLANS[room].objects.find(o=>o.id===p.id),tl=solid.project(model.l,model.t),br=solid.project(model.r,model.b);b.style.left=(tl.x+br.x)/2+'px';b.style.top=tl.y+'px';b.style.width=Math.max(44,br.x-tl.x-2)+'px';b.style.height=Math.max(44,br.y-tl.y-2)+'px';}}
 function resize(){const r=container.getBoundingClientRect();solid.resize(Math.max(1,r.width),Math.max(1,r.height));positionLabels();}
 function select(id){const p=layout.find(x=>x.id===id);if(!p||read().paused)return;selected=id;walker.go(p.foot.x,p.foot.y);onSelect(id);update();}
 function enter(id){room=id;selected=null;[walker.p.x,walker.p.y]=SPAWNS[id];arrange();walker.clear();}
 function pName(id){return layout.find(p=>p.id===id)?.name||id;}
 function update(){for(const b of labels.querySelectorAll('button')){const id=b.dataset.station,locked=stationLocked(read(),id),availability=stationAvailability(read(),id);b.classList.toggle('selected',id===selected);b.classList.toggle('locked',locked);b.classList.toggle('buildable',availability==='buildable');b.dataset.availability=availability;const s=read(),job=s.jobs[id]||(id==='wagon'?s.jobs.trip:null);b.querySelector('span').textContent=locked?'待解锁':job?`${Math.ceil(job.t)}秒` :stationStatus(s,id).includes('待取')?'● 待取':id==='rack'?`${total(s.shelf)}个待售`:id==='depot'?`${total(s.store)}份原料`:id===selected?'◆ 已选':'';b.removeAttribute('title');b.setAttribute('aria-label',pName(id)+'，'+stationStatus(read(),id));b.setAttribute('aria-pressed',String(id===selected));}}
 function nearby(){const p=layout.find(x=>x.id===selected);return p&&Math.hypot(walker.p.x-p.foot.x,walker.p.y-p.foot.y)<28?p:null;}
 function draw(){solid.draw(walker.p,selected,layout,read(),id=>stationAvailability(read(),id));}
 canvas.addEventListener('pointerdown',e=>{if(read().paused)return;const r=canvas.getBoundingClientRect(),p=solid.ground(e.clientX-r.left,e.clientY-r.top);if(!p)return;selected=null;walker.go(p.x,p.y);onSelect(null);update();});
 return {async load(){ready=await solid.load();return ready;},resize,draw,update,select,enter,nearby,stop(){walker.clear();},tick(dt){walker.step(dt,!read().paused);},snapshot(){return {room,selected,background:`projected-solid:${room}`,player:{...walker.p},world:WORLD,obstacles:walker.obstacles,route:walker.route,stations:layout.map(p=>({...p,locked:stationLocked(read(),p.id)})),nearby:nearby()?.id||null,assetsReady:ready,solid:solid.stats()};}};
}
