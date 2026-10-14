import {freshJournal,restoreJournal,recordWork} from './commissions.js';
import {freshJourney,restoreJourney,tickJourney} from './journey.js';
export {COMMISSIONS,chooseCommission,claimCommission,commissionReady,journalHint} from './commissions.js';
// Active bakery v2: time can finish submitted batches, never submit or sell them.
// Legacy modules supply immutable art/recipe definitions and migration only.
import {RECIPES as BASE_RECIPES} from './economy.js';
import {FACILITIES} from './shop.js';
export {FACILITIES};
// Active-mode prices narrow the old high-tier monopoly without changing legacy games.
export const RECIPES=BASE_RECIPES.map((r,i)=>({...r,value:[22,38,64,78][i]}));
export const SAVE_KEY='starlight-workshop-v1';
export const BACKUP_KEY='starlight-workshop-v1-before-active-v2';
export const RAW_NAMES=['麦子','牛奶','莓果'];
export const QUOTAS=[1,3,4,5,6,7];
export const CREWS=['新手勇者队','巡逻骑士队','森林游侠队','山地探险队','城堡法师队','勇者远征队'];
const n=(v,max=1e9)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;
const int=(v,max=1e9)=>Math.floor(n(v,max));
const arr=(v,len)=>Array.from({length:len},(_,i)=>int(v?.[i]));
const list=v=>Array.isArray(v)?v:[];
export const total=a=>a.reduce((x,y)=>x+y,0);
export const bagCapacity=s=>12+4*s.upgrades.storage;
export const storeCapacity=s=>60+20*s.upgrades.storage;
export const batchCapacity=s=>Math.min(6,2+Math.floor(s.upgrades.polish/2)+Math.floor(s.journal.done.length/2));
export const harvestSeconds=(s,i)=>.65/(1+.06*Math.max(0,s.collectors[i]-(i===0?1:0)));
export const rawUnlocked=(s,i)=>Number.isInteger(i)&&i>=0&&i<3&&(i===0||s.beacons>=i);
export const recipeUnlocked=(s,i)=>!!RECIPES[i]&&s.beacons>=RECIPES[i].unlock&&(!RECIPES[i].jam||s.facilities.jam>0);
export const facilityUnlocked=(s,id)=>s.beacons>=(FACILITIES.find(f=>f.id===id)?.unlock??99);
export const constructionKey=(kind,index=0)=>kind==='collector'?`collector${index}`:kind;
export function constructionTarget(kind,index=0){
 if(kind==='collector')return {room:'raw',id:['wheat','cow','berries'][index]};
 const room=['mill','jam','polish'].includes(kind)?'bake':['rack','table'].includes(kind)?'shop':['pack','wagon'].includes(kind)?'delivery':'raw';
 return {room,id:kind==='polish'?'oven':['rail','storage'].includes(kind)?'depot':kind};
}
export const constructionAt=(s,id)=>Object.values(s.construction||{}).find(j=>constructionTarget(j.kind,j.index).id===id&&!j.applied);
const purchaseLevel=(s,kind,index)=>FACILITIES.some(f=>f.id===kind)?s.facilities[kind]:kind==='collector'?s.collectors[index]:kind==='rail'?(s.lineBuilt?s.upgrades.rail+1:0):s.upgrades[kind];
function applyPurchase(s,kind,index){if(FACILITIES.some(f=>f.id===kind))s.facilities[kind]++;else if(kind==='collector')s.collectors[index]++;else if(kind==='rail'&&!s.lineBuilt)s.lineBuilt=true;else s.upgrades[kind]++;}
export const readyToDeliver=(s,o)=>!!o&&o.need.every((v,i)=>s.goods[i]>=v);
export const completed=s=>s.completed||(s.journal.done.length>=6&&s.beacons>=6&&s.lineBuilt&&FACILITIES.every(f=>s.facilities[f.id]>0)&&s.served>=8&&s.trips>=3);
export function fresh(now=Date.now()){
 const s={version:3,journey:freshJourney(),guide:{done:[],hidden:false},journal:freshJournal(),coins:0,earned:0,beacons:0,stageDone:0,deliveries:0,crafted:0,served:0,trips:0,
  raw:[0,0,0],store:[0,0,0],goods:[0,0,0,0],shelf:[0,0,0,0],flour:0,jam:0,
  collectors:[1,0,0],upgrades:{rail:0,polish:0,storage:0},lineBuilt:false,construction:{},
  facilities:Object.fromEntries(FACILITIES.map(f=>[f.id,0])),jobs:{oven:null,mill:null,jam:null,transfer:null,pack:null,trip:null},
  ovenReady:[0,0,0,0],millReady:0,jamReady:0,parcels:[],packReady:[],receipt:0,
  orders:[],bonus:null,sequence:0,recipe:0,batch:2,elapsed:0,adActions:0,savedAt:now,paused:false,completed:false};
 refillOrders(s);return s;
}
function makeOrder(s,bonus=false){
 const serial=++s.sequence,need=[0,0,0,0],available=[0,1,2,3].filter(i=>recipeUnlocked(s,i));
 if(s.beacons===0)need[0]=3;
 else{
  const first=available[(serial-1)%available.length];need[first]=2+(serial+s.beacons)%3;
  if(available.length>1&&serial%3!==0)need[available[(available.indexOf(first)+1)%available.length]]=1+serial%2;
 }
 const base=s.beacons===0?90:Math.ceil(need.reduce((a,v,i)=>a+v*RECIPES[i].value,0)*1.7);
 return {id:serial,name:bonus?'加急赏金单':s.beacons<6?CREWS[s.beacons]:['森林补给','骑士午餐','法师茶会'][serial%3],need,reward:base,
  bonus:bonus?Math.ceil(base*.4):0,remaining:bonus?150:0,expired:false};
}
export function refillOrders(s){const count=s.beacons===0?1:s.beacons===1?2:3;while(s.orders.length<count)s.orders.push(makeOrder(s));}
function restoredOrder(o){
 if(!o||!Number.isInteger(o.id)||!Array.isArray(o.need)||o.need.length!==4||!total(arr(o.need,4)))return null;
 return {id:int(o.id),name:String(o.name||'勇者订单').slice(0,30),need:arr(o.need,4),reward:int(o.reward),bonus:int(o.bonus),remaining:n(o.remaining,150),expired:o.expired===true};
}
export function restore(raw,now=Date.now()){
 if(!raw||![1,2,3].includes(raw.version))return fresh(now);
 const s=fresh(now);s.orders=[];s.journal=restoreJournal(raw.journal);s.guide={done:list(raw.guide?.done).filter(id=>typeof id==='string').slice(0,12),hidden:raw.guide?.hidden===true};
 for(const k of ['coins','earned','deliveries','crafted','elapsed'])s[k]=n(raw[k]);
 s.beacons=int(raw.beacons,6);s.savedAt=n(raw.savedAt,now)||now;
 s.collectors=arr(raw.collectors,3).map((v,i)=>rawUnlocked(s,i)?Math.max(i===0?1:0,Math.min(v,8)):0);
 for(const k of ['rail','polish','storage'])s.upgrades[k]=int(raw.upgrades?.[k],8);
 s.lineBuilt=raw.lineBuilt===true;s.recipe=recipeUnlocked(s,int(raw.recipe,3))?int(raw.recipe,3):0;
 if(raw.version===1){
  s.lineBuilt=raw.lineBuilt!==false;
  s.raw=arr(raw.hand?.raw,3);s.store=arr(raw.dust,3).map((v,i)=>v+int(raw.buffer?.[i]));
  for(const c of list(raw.carts)){const i=['blue','gold','violet'].indexOf(c?.color);if(i>=0)s.store[i]++;}
  s.goods=arr(raw.goods,4).map((v,i)=>v+int(raw.hand?.ready?.[i]));
  const b=raw.shop||{};s.shelf=arr(b.stock,4);s.flour=int(b.flour);s.jam=int(b.jam);s.served=int(b.served);s.trips=int(b.trips);
  FACILITIES.forEach(f=>s.facilities[f.id]=int(b.facilities?.[f.id],3));
  if(b.carry?.kind==='bread'&&RECIPES[b.carry.recipe])s.goods[b.carry.recipe]++;
  const parcels=[...list(b.parcels),...list(b.load),...(b.carry?.kind==='parcel'?[b.carry]:[])];s.parcels=parcels.filter(p=>n(p?.value)>0).map(p=>({value:int(p.value)}));
  if(raw.job&&RECIPES[raw.job.recipe])s.jobs.oven={recipe:int(raw.job.recipe,3),qty:1,t:n(raw.job.t,20),duration:n(raw.job.duration,20)||5};
  if(n(b.packJob?.value))s.jobs.pack={value:int(b.packJob.value),t:n(b.packJob.t,6),duration:6};
  if(n(b.trip?.value))s.jobs.trip={value:int(b.trip.value),t:n(b.trip.t,45),duration:45};
  s.completed=b.completed===true;
 }else{
  for(const k of ['raw','store'])s[k]=arr(raw[k],3);
  for(const k of ['goods','shelf','ovenReady'])s[k]=arr(raw[k],4);
  for(const k of ['flour','jam','millReady','jamReady','served','trips','receipt'])s[k]=int(raw[k]);
  FACILITIES.forEach(f=>s.facilities[f.id]=int(raw.facilities?.[f.id],3));
  s.stageDone=int(raw.stageDone,QUOTAS[Math.min(5,s.beacons)]-1);s.sequence=int(raw.sequence);
  s.orders=list(raw.orders).slice(0,3).map(restoredOrder).filter(Boolean);s.bonus=restoredOrder(raw.bonus);
  s.sequence=Math.max(s.sequence,...s.orders.map(o=>o.id),s.bonus?.id||0);
  for(const key of ['parcels','packReady'])s[key]=list(raw[key]).filter(p=>n(p?.value)>0).slice(0,10000).map(p=>({value:int(p.value)}));
  for(const key of ['oven','mill','jam','transfer','pack','trip']){
   const j=raw.jobs?.[key];if(!j)continue;
   const t=n(j.t,60),duration=Math.max(.1,n(j.duration,60));
   if(key==='oven'&&RECIPES[j.recipe]&&int(j.qty,6))s.jobs[key]={recipe:int(j.recipe,3),qty:int(j.qty,6),t,duration};
   if(['mill','jam'].includes(key)&&int(j.qty,12))s.jobs[key]={qty:int(j.qty,12),t,duration};
   if(key==='transfer'&&Array.isArray(j.items))s.jobs[key]={items:arr(j.items,3),t,duration};
   if(['pack','trip'].includes(key)&&n(j.value))s.jobs[key]={value:int(j.value),t,duration};
  }
  s.batch=Math.max(1,int(raw.batch,batchCapacity(s)));s.adActions=int(raw.adActions,12);s.completed=raw.completed===true;
 }
 for(const j of Object.values(raw.construction||{})){
  if(!j||!['collector','rail','polish','storage',...FACILITIES.map(f=>f.id)].includes(j.kind))continue;
  const index=int(j.index,2),kind=j.kind,level=purchaseLevel(s,kind,index),applied=j.applied===true;
  const facility=FACILITIES.some(f=>f.id===kind),max=facility?3:kind==='rail'?9:8;
  if(!Number.isInteger(j.from)||j.from<0||j.from>=max||level!==j.from+(applied?1:0)||facility&&!facilityUnlocked(s,kind)||kind==='collector'&&!rawUnlocked(s,index))continue;
  const first=j.from===0&&(kind==='rail'||FACILITIES.some(f=>f.id===kind)),duration=first?3.65:2.05;
  s.construction[constructionKey(kind,index)]={kind,index,from:j.from,first,applied,duration,t:Math.max(.001,Math.min(duration,n(j.t,duration)))};
 }
 s.journey=restoreJourney(raw.journey);s.recipe=recipeUnlocked(s,int(raw.recipe,3))?int(raw.recipe,3):0;s.paused=raw.paused===true;refillOrders(s);return s;
}
const result=(ok,message)=>({ok,message});
const pay=(s,value)=>{value=Math.floor(value);s.coins+=value;s.earned+=value;return value;};
export function harvest(s,i){
 if(s.paused||!rawUnlocked(s,i))return result(false,'该原料尚未解锁');
 const qty=Math.min(bagCapacity(s)-total(s.raw),2+Math.floor((s.collectors[i]+(i===0?0:1))/2)+(s.adActions>0?1:0));
 if(qty<=0)return result(false,'原料背包已满，先送到原料仓');
 s.raw[i]+=qty;if(s.adActions>0)s.adActions--;return result(true,`采到 ${qty} 份${RAW_NAMES[i]}`);
}
export function deposit(s){
 if(s.paused||s.jobs.transfer)return result(false,'等待这批原料入仓');
 let room=storeCapacity(s)-total(s.store),limit=s.lineBuilt?bagCapacity(s):6,items=[0,0,0];
 s.raw.forEach((v,i)=>{const q=Math.max(0,Math.min(v,room,limit));items[i]=q;room-=q;limit-=q;});
 if(!total(items))return result(false,total(s.raw)?'原料仓已满；先投料加工':'先采集原料再入仓');
 items.forEach((v,i)=>s.raw[i]-=v);
 if(s.lineBuilt)s.jobs.transfer={items,t:2/(1+.25*s.upgrades.rail),duration:2/(1+.25*s.upgrades.rail)};
 else items.forEach((v,i)=>s.store[i]+=v);
 return result(true,s.lineBuilt?'已提交这批原料，传送带送仓后停止':`搬入 ${total(items)} 份原料`);
}
export function bake(s){
 if(s.paused)return result(false,'经营已暂停');
 if(total(s.ovenReady)){const q=total(s.ovenReady);s.ovenReady.forEach((v,i)=>{s.goods[i]+=v;recordWork(s,`bread${i}`,v);});s.ovenReady.fill(0);return result(true,`取出 ${q} 个面包，已放入共用成品箱`);}
 if(s.jobs.oven)return result(false,'这批正在烤，可去采集或处理订单');
 const r=RECIPES[s.recipe];if(!recipeUnlocked(s,s.recipe))return result(false,'先解锁该配方');
 let qty=Math.min(s.batch,batchCapacity(s));r.need.forEach((v,i)=>{if(v)qty=Math.min(qty,Math.floor((s.store[i]+(i===0?s.flour:0))/v));});if(r.jam)qty=Math.min(qty,Math.floor(s.jam/r.jam));
 if(!qty)return result(false,'仓库缺原料，查看配方后采集并入仓');
 let flourUsed=0;r.need.forEach((v,i)=>{let required=v*qty;if(i===0){flourUsed=Math.min(required,s.flour);s.flour-=flourUsed;required-=flourUsed;}s.store[i]-=required;});s.jam-=qty*(r.jam||0);
 const duration=(6+s.recipe*1.4)/(1+.18*s.upgrades.polish)*(flourUsed?.8:1);
 s.jobs.oven={recipe:s.recipe,qty,t:duration,duration};return result(true,`已投料 ${qty} 个${r.name}，烤好后需取货`);
}
export function process(s,id){
 if(!['mill','jam'].includes(id))return result(false,'请选择磨坊或果酱锅');
 if(s.paused)return result(false,'经营已暂停');
 if(!s.facilities[id])return result(false,'先在设备页建造');
 if(s[`${id}Ready`]>0){const q=s[`${id}Ready`];s[id==='mill'?'flour':'jam']+=q;recordWork(s,id==='mill'?'flour':'jam',q);s[`${id}Ready`]=0;return result(true,`取出 ${q} 份${id==='mill'?'面粉':'果酱'}`);}
 if(s.jobs[id])return result(false,'本批加工中，可去其他区域工作');
 const i=id==='mill'?0:2,unit=id==='mill'?1:2,qty=Math.min(2+s.facilities[id],Math.floor(s.store[i]/unit));
 if(!qty)return result(false,id==='mill'?'原料仓缺麦子':'原料仓缺莓果，每罐需 2 份');
 s.store[i]-=qty*unit;const duration=(id==='mill'?4:7)/(1+.3*(s.facilities[id]-1));s.jobs[id]={qty,t:duration,duration};return result(true,`投料加工 ${qty} 份，完成后手动取货`);
}
export function refillShelf(s,recipe=null,amount=Infinity){
 if(s.paused||!s.facilities.rack)return result(false,'先建造展示架');
 let room=Math.max(0,Math.min(amount,12+6*s.facilities.rack-total(s.shelf))),count=0;
 if(recipe!==null){if(!Number.isInteger(recipe)||recipe<0||recipe>3)return result(false,'请选择面包');const q=Math.min(s.goods[recipe],room);s.goods[recipe]-=q;s.shelf[recipe]+=q;return result(q>0,q?`补入 ${q} 个${RECIPES[recipe].name}`:'成品不足或展示架已满');}
 // Round-robin prevents one abundant flavour blocking all diner choices.
 while(room>0&&s.goods.some(v=>v>0)){for(let i=0;i<4&&room>0;i++){if(s.goods[i]){s.goods[i]--;s.shelf[i]++;room--;count++;}}}
 return result(count>0,count?`补货 ${count} 个，展示架只备货，不自动售卖`:'成品箱为空或展示架已满');
}
export function dinerPreference(s){const available=[0,1,2,3].filter(i=>recipeUnlocked(s,i));return available[(s.served+Math.floor(s.served/3))%available.length];}
export function serve(s){
 if(s.paused||!s.facilities.table)return result(false,'先建造勇者长桌');
 // Guests wait without punishment. Each explicit visit serves at most three.
 let count=0,value=0,favourites=0;while(count<Math.min(3,s.facilities.table)){
  const preferred=dinerPreference({...s,served:s.served+count}),i=s.shelf[preferred]>0?preferred:s.shelf.findLastIndex(v=>v>0);if(i<0)break;
  s.shelf[i]--;count++;const favourite=i===preferred;if(favourite)favourites++;value+=Math.floor(RECIPES[i].value*(1.85+.15*(s.facilities.table-1))*(favourite?1.2:1));
 }
 if(!count)return result(false,'先到展示架补货，再来长桌送餐');
 s.served+=count;recordWork(s,'served',count);pay(s,value);return result(true,`送餐 ${count} 份，收到 ${value} 金币${favourites?` · ${favourites} 位偏爱口味额外 +20%`:""}`);
}
export function pack(s){
 if(s.paused||!s.facilities.pack)return result(false,'先建造打包台');
 if(s.packReady.length){recordWork(s,'packed',s.packReady.length);s.parcels.push(...s.packReady);s.packReady=[];return result(true,'拿到外卖篮，去马车站装车');}
 if(s.jobs.pack)return result(false,'打包中，可继续烘焙或接单');
 if([0,1,2].some(i=>s.goods[i]+s.shelf[i]<1))return result(false,'需要普通、牛奶、莓果面包各 1 个');
 [0,1,2].forEach(i=>s.goods[i]>0?s.goods[i]--:s.shelf[i]--);
 const value=Math.floor(RECIPES.slice(0,3).reduce((a,r)=>a+r.value,0)*1.6),duration=5/(1+.3*(s.facilities.pack-1));s.jobs.pack={value,t:duration,duration};return result(true,'已提交一篮，完成后取篮');
}
export function wagon(s){
 if(s.paused||!s.facilities.wagon)return result(false,'先建造马车站');
 if(s.receipt){const value=pay(s,s.receipt);s.receipt=0;s.trips++;recordWork(s,'trips');return result(true,`签收外卖回款 ${value} 金币`);}
 if(s.jobs.trip)return result(false,'本趟配送中，可继续准备下一篮');
 if(!s.parcels.length)return result(false,'先到打包台打包并取篮');
 const count=Math.min(s.parcels.length,s.facilities.wagon),value=Math.floor(s.parcels.splice(0,count).reduce((a,p)=>a+p.value,0)*1.3),duration=12/(1+.2*(s.facilities.wagon-1));s.jobs.trip={value,t:duration,duration};return result(true,`已装车 ${count} 篮，返回后手动签收回款`);
}
export function deliver(s,id){
 if(s.paused)return result(false,'经营已暂停');
 const o=s.bonus?.id===id?s.bonus:s.orders.find(x=>x.id===id);if(!readyToDeliver(s,o))return result(false,'先准备订单所需的面包');
 o.need.forEach((v,i)=>s.goods[i]-=v);const value=pay(s,o.reward+(o.expired?0:o.bonus));s.deliveries++;
 if(o===s.bonus)s.bonus=null;
 else{ recordWork(s,'orders');s.orders=s.orders.filter(x=>x.id!==id);if(s.beacons<6&&++s.stageDone>=QUOTAS[s.beacons]){s.stageDone=0;s.beacons++;s.orders=[];}refillOrders(s); }
 return result(true,`交付成功，收到 ${value} 金币${o.expired?'（加成已过期，基础报酬保留）':''}`);
}
export function acceptBonus(s){if(s.paused||s.beacons<1||s.bonus)return false;s.bonus=makeOrder(s,true);return true;}
export function buy(s,kind,index=0){
 if(s.paused||s.construction[constructionKey(kind,index)])return false;const price=upgradeCost(s,kind,index);if(s.coins<price)return false;
 if(FACILITIES.some(f=>f.id===kind)){if(!facilityUnlocked(s,kind)||s.facilities[kind]>=3)return false;}
 else if(kind==='collector'){if(!rawUnlocked(s,index)||s.collectors[index]>=8)return false;}
 else if(['rail','polish','storage'].includes(kind)){if(s.upgrades[kind]>=8)return false;}
 else return false;
 const from=purchaseLevel(s,kind,index),first=from===0&&(kind==='rail'||FACILITIES.some(f=>f.id===kind)),duration=first?3.65:2.05;
 s.coins-=price;s.construction[constructionKey(kind,index)]={kind,index,from,first,duration,t:duration,applied:false};return true;
}
export function upgradeCost(s,kind,index=0){const f=FACILITIES.find(f=>f.id===kind);if(f)return Math.ceil(f.price*2.1**s.facilities[kind]);const lv=kind==='collector'?Math.max(0,s.collectors[index]-(index===0?1:0)):s.upgrades[kind];const base=kind==='collector'?[40,90,240][index]:{rail:50,polish:70,storage:45}[kind];return base===undefined?Infinity:Math.ceil(base*1.65**lv);}
export function tick(s,dt){
 if(s.paused||!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,7200);s.elapsed+=dt;
 tickJourney(s,dt);
 for(const [key,j] of Object.entries(s.construction)){
  j.t=Math.max(0,j.t-dt);
  if(j.t<=.65&&!j.applied){applyPurchase(s,j.kind,j.index);j.applied=true;}
  if(j.t===0)delete s.construction[key];
 }
 for(const [id,j] of Object.entries(s.jobs)){if(!j)continue;j.t=Math.max(0,j.t-dt);if(j.t>0)continue;
  if(id==='oven'){s.ovenReady[j.recipe]+=j.qty;s.crafted+=j.qty;}
  if(id==='mill'||id==='jam')s[`${id}Ready`]+=j.qty;
  if(id==='transfer')j.items.forEach((v,i)=>s.store[i]+=v);
  if(id==='pack')s.packReady.push({value:j.value});
  if(id==='trip')s.receipt+=j.value;
  s.jobs[id]=null;
 }
 if(s.bonus&&!s.bonus.expired){s.bonus.remaining=Math.max(0,s.bonus.remaining-dt);if(s.bonus.remaining===0)s.bonus.expired=true;}
}
export function offline(s,now=Date.now()){const seconds=Math.min(7200,Math.max(0,(now-s.savedAt)/1000));if(!s.paused)tick(s,seconds);s.savedAt=now;return {seconds,coins:0};}
