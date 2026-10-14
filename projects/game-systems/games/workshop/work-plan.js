import * as E from './active-state.js';
import * as J from './journey.js';
const rawIds=['wheat','cow','berries'];
const target=(text,room,station,panel)=>({text,room,station,panel});
function collect(s,k,q){if(s.raw[k]||E.total(s.raw)>=E.bagCapacity(s))return target('原料已采到 · 送仓后可加工','raw','depot');return target(`备 ${q} 份${E.RAW_NAMES[k]} · 采集后入仓`,'raw',rawIds[k]);}
function material(s,id){
 const k=id==='mill'?0:2,q=id==='mill'?1:2;
 if(s[id+'Ready'])return target('加工已完成 · 亲自取货','bake',id);
 if(s.jobs[id])return s.store[0]+s.flour+s.raw[0]<E.batchCapacity(s)*2?collect(s,0,E.batchCapacity(s)*2):target('加工中 · 原料已备妥，可查看其他订单','shop','counter','orders');
 if(s.store[k]<q)return collect(s,k,q);
 return target(`投料制作${id==='mill'?'面粉':'果酱'}`,'bake',id);
}
export function breadPlan(s,need){
 if(E.total(s.ovenReady))return target('面包已烤好 · 回烤箱取货','bake','oven');
 if(s.millReady)return target('面粉已磨好 · 取货可加快烘焙','bake','mill');
 if(s.jamReady)return target('果酱已完成 · 回锅旁取货','bake','jam');
 const i=need.findIndex((q,i)=>J.availableBread(s,i)<q);if(i<0)return null;
 const r=E.RECIPES[i],qty=Math.min(E.batchCapacity(s),need[i]-J.availableBread(s,i));
 if(!E.recipeUnlocked(s,i))return target(s.beacons<r.unlock?'先交当前订单 · 开放新口味':'先建果酱锅 · 开放第四种口味','shop','counter',s.beacons<r.unlock?'orders':'equipment');
 if(r.jam&&s.jam<qty)return material(s,'jam');
 for(let k=0;k<3;k++)if(s.store[k]+(k===0?s.flour:0)<r.need[k]*qty)return collect(s,k,r.need[k]*qty);
 if(s.jobs.oven){
  // Bounded preparation, then another real order. Never recommend endless harvesting.
  const next=need.findIndex((q,k)=>k!==i&&J.availableBread(s,k)<q);
  if(next>=0){const recipe=E.RECIPES[next];for(let k=0;k<3;k++)if(s.store[k]+(k===0?s.flour:0)<recipe.need[k]*E.batchCapacity(s))return collect(s,k,recipe.need[k]*E.batchCapacity(s));}
  return target('这批在烤 · 可查看其他订单或取加工料','shop','counter','orders');
 }
 return {...target(`制作${r.name} · 配方已建议`,'bake','oven','recipe'),recipe:i,qty};
}
function orderPlan(s){
 const o=s.orders.find(o=>E.readyToDeliver(s,o))||s.orders[0];
 if(E.readyToDeliver(s,o))return target('普通订单已备齐 · 柜台交单','shop','counter','orders');
 if(o.need.some((q,i)=>q>s.goods[i]&&s.shelf[i]))return target('订单面包在展示架 · 放回成品箱','shop','rack','shelf');
 return breadPlan(s,o.need)||target('普通订单已备齐 · 柜台交单','shop','counter','orders');
}
function servicePlan(s,kind){
 const ids=kind==='served'?['rack','table']:['pack','wagon'];
 for(const id of ids)if(!s.facilities[id])return s.coins<E.upgradeCost(s,id)?orderPlan(s):target('先建造'+E.FACILITIES.find(f=>f.id===id).name,'shop','counter','equipment');
 if(kind==='served'){
  if(E.total(s.shelf))return target('展示架已备货 · 长桌送餐','shop','table');
  if(E.total(s.goods))return target('成品箱有面包 · 展示架补货','shop','rack','shelf');
  const need=[0,0,0,0];need[E.dinerPreference(s)]=1;return breadPlan(s,need);
 }
 if(s.receipt||s.parcels.length)return target(s.receipt?'马车已返回 · 签收回款':'外卖篮已取 · 装车出发','delivery','wagon');
 if(s.packReady.length)return target('打包完成 · 亲自取篮','delivery','pack');
 if(s.jobs.pack||s.jobs.trip)return orderPlan(s);
 return breadPlan(s,[1,1,1,0])||target('三味齐备 · 打包一篮','delivery','pack');
}
function themePlan(s){
 const c=E.COMMISSIONS.find(c=>c.id===s.journal.active);
 if(!c||E.commissionReady(s))return target(c?'主题已完成 · 柜台领取纪念章':'选择下一个主题 · 工作可同步计入','shop','counter','commissions');
 const [key,n,label]=c.goals.find(([k,n])=>(s.journal.progress[c.id]?.[k]||0)<n);
 let p;
 if(key.startsWith('bread')){const i=Number(key.slice(-1)),need=[0,0,0,0];need[i]=J.availableBread(s,i)+n-(s.journal.progress[c.id]?.[key]||0);p=breadPlan(s,need);}
 else if(key==='flour'||key==='jam')p=material(s,key==='flour'?'mill':'jam');
 else p=key==='orders'?orderPlan(s):servicePlan(s,key);
 return {...p,text:`${label} ${s.journal.progress[c.id]?.[key]||0}/${n} · ${p.text}`};
}
export function workPlan(s){
 const e=J.eventSpec(s),j=s.journey;
 if(!e){
  if(E.completed(s))return target('王国总厨达成 · 自由经营','shop','counter','journey');
  if(s.beacons<6){return orderPlan(s);}
  if(s.journal.done.length<6)return themePlan(s);
  const f=E.FACILITIES.find(f=>!s.facilities[f.id]);if(f||!s.lineBuilt)return target('补齐基础设施 · 最终目标清单','raw','depot','equipment');
  return servicePlan(s,s.served<8?'served':'trips');
 }
 if(!J.eventUnlocked(s)){return orderPlan(s);}
 if(!j.engaged)return target('点击目标条 · 开展本章经营活动',null,null,'journey');
 const required=e.mode==='route'?['pack','wagon']:e.mode==='decorate'?[e.topping===0?'mill':e.topping===2?'jam':null].filter(Boolean):['rack','table'];
 for(const id of required)if(!s.facilities[id]){
  if(!E.facilityUnlocked(s,id)){return orderPlan(s);}
  if(s.coins<E.upgradeCost(s,id)){return orderPlan(s);}
  const t=E.constructionTarget(id);return target(`建造${E.FACILITIES.find(f=>f.id===id).name}`,t.room,t.id,'equipment');
 }
 if(j.phase==='prepare'){
  const p=breadPlan(s,J.eventNeed(s));if(p)return p;
  if(e.mode==='decorate'&&j.phase==='prepare'){
   if(e.topping===0&&s.flour<2)return material(s,'mill');
   if(e.topping===2&&s.jam<2)return material(s,'jam');
   if(e.topping===1&&s.store[1]<2)return collect(s,1,2);
  }
 }
 if(['packing','travel'].includes(j.phase)){
  // Prepare the following authored wave while the finite parcel is being processed.
  const next={...s,journey:{...j,wave:j.wave+1,phase:'prepare',served:[]}};
  const p=J.eventSpec(next)?.mode?breadPlan(s,J.eventNeed(next)):null;
  return p||target('本批处理中 · 可完成普通订单','shop','counter','orders');
 }
 const t=J.eventTarget(s),texts={prepare:`${J.MODE_NAMES[e.mode]} · 到工位按委托操作`,handoff:'餐品已备妥 · 亲自呈上',packed:'贴签已完成 · 打包台取篮',carried:'篮子已取 · 马车装车发出',sign:'马车已返回 · 核对地址签收',claim:'本章全部完成 · 柜台领取纪念牌'};
 return {...t,text:texts[j.phase]||'查看当前目标',panel:'journey'};
}
