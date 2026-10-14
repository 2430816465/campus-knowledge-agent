import {RECIPES,RAW_NAMES,bagCapacity} from './active-state.js';
// Tutorial observes real work; navigation never awards progress or resources.
export function guideStep(s){
 const g=s.guide||=( {done:[],hidden:false} );
 const total=a=>a.reduce((a,b)=>a+b,0),mark=(id,ok)=>{if(ok&&!g.done.includes(id))g.done.push(id);};
 mark('harvest',total(s.raw)>=6||total(s.store)>=4||!!s.jobs.oven||s.crafted>0);
 mark('deposit',total(s.store)>=4||!!s.jobs.oven||s.crafted>0);
 mark('bake',!!s.jobs.oven||s.crafted>0);
 mark('take',total(s.goods)>0||s.deliveries>0||s.served>0);
 mark('order',s.deliveries>0);
 mark('theme',!!s.journal.active||s.journal.done.length>0);
 mark('mill',s.flour>0||s.journal.done.includes('forest')||(s.journal.progress.forest?.flour||0)>0);
 mark('jam',s.jam>0||s.goods[3]>0||s.journal.done.includes('tea')||(s.journal.progress.tea?.jam||0)>0);
 mark('serve',s.served>0);
 mark('pack',s.parcels.length>0||!!s.jobs.trip||s.receipt>0||s.trips>0);
 mark('trip',s.trips>0);
 mark('claim',s.journal.done.length>0);
 const steps=[
 ['harvest','采集第一批原料','走近麦田，短按住采集，带上 6 份麦子。','raw','wheat'],
 ['deposit','原料入仓','到原料仓点一次入仓；背包原料不能直接烘焙。','raw','depot'],
 ['bake','投下第一批面包','到烤箱选普通面包，再确认投料。','bake','oven'],
 ['take','取货后才能交单','回烤箱取货；首单要 3 个，可分两批制作。','bake','oven'],
 ['order','完成第一张订单','备齐 3 个普通面包，到门店柜台交付。','shop','counter','orders'],
 ['theme','接取主题委托','在主题手册开展早餐周，之后的工作才计入主题。',null,null,'commissions'],
 ['mill','学习加工路线','建磨坊，投麦子并取面粉，面粉能加快烘焙。','bake','mill'],
 ['jam','解锁果酱路线','建果酱锅，投莓果并取货，解锁第四种面包。','bake','jam'],
 ['serve','亲自招待顾客','先给展示架补货，再到长桌送餐赚金币。','shop','table'],
 ['pack','准备第一篮外卖','普通、牛奶、莓果各 1 个，打包后亲自取篮。','delivery','pack'],
 ['trip','签收第一趟外卖','装车后继续备料；马车返回要亲自签收。','delivery','wagon'],
 ['claim','领取主题纪念章','完成当前主题，到柜台领取；每两章增加批量。','shop','counter','commissions']
 ];
 const index=steps.findIndex(([id])=>!g.done.includes(id));
 if(index<0)return null;
 let [id,title,text,room,station,panel]=steps[index];
 const need=s.orders.find(o=>!o.need.every((n,i)=>s.goods[i]>=n))||s.orders[0];
 const work=(order=need)=>{
  if(total(s.ovenReady))return ['面包已烤好，先到烤箱取货。','bake','oven'];
  if(s.jobs.oven)return ['烘烤中，去备下一批原料，不必守着烤箱。','raw','wheat'];
  const i=Math.max(0,order?.need.findIndex((n,i)=>s.goods[i]<n)??0),r=RECIPES[i];
  if(r.jam&&!s.jam){if(s.store[2]<2)return s.raw[2]>0?['把莓果送到原料仓。','raw','depot']:['先采莓果，入仓后加工果酱。','raw','berries'];return ['果酱不足，先投莓果加工并取出果酱。','bake','jam'];}
  const k=r.need.findIndex((n,k)=>s.store[k]+(k===0?s.flour:0)<n);
  if(k>=0){if(s.raw[k]>0||total(s.raw)>=bagCapacity(s))return ['把背包中的原料送到原料仓。','raw','depot'];return [`缺${RAW_NAMES[k]}，先采集再入仓。`,'raw',['wheat','cow','berries'][k]];}
  return [`到烤箱制作${r.name}，取货后再交单。`,'bake','oven'];
 };
 if(id==='take'&&s.jobs.oven){[text,room,station]=work();title='利用烘烤间隙';}
 if(id==='order'&&!s.orders.some(o=>o.need.every((n,i)=>s.goods[i]>=n))){[text,room,station]=work();panel=null;}
 if(['mill','jam','serve','pack','trip'].includes(id)){
  const facility=id==='serve'&&!s.facilities.rack?'rack':{mill:'mill',jam:'jam',serve:'table',pack:'pack',trip:'wagon'}[id];
  const unlock={mill:1,jam:2,serve:2,pack:3,trip:3}[id];
  if(s.beacons<unlock){text=`先完成当前订单，推进到第 ${unlock} 队解锁新工位。`;room='shop';station='counter';panel='orders';}
  else if(!s.facilities[facility]){text='先在设备页建造该设施；金币不足就继续交单。';panel='equipment';}
  if(id==='serve'&&s.facilities.table&&s.facilities.rack&&!total(s.shelf)){text='先到展示架补入成品面包，再给长桌送餐。';station='rack';panel=null;}
  if(id==='trip'&&s.jobs.trip){text='配送中，先准备下一批面包；返回后到马车签收。';room='raw';station='wheat';}
  if(s.beacons>=unlock&&s.facilities[facility]){
   if(id==='mill'||id==='jam'){
    const k=id==='mill'?0:2,unit=id==='mill'?1:2;
    if(s[id+'Ready'])text='本批加工完成，回工位点一次取货。';
    else if(s.jobs[id]){text='加工中，先采下一批原料，完成后回来取货。';room='raw';station=['wheat','cow','berries'][k];}
    else if(s.store[k]<unit){text=`先准备${RAW_NAMES[k]}，入仓后才能投料。`;room='raw';station=s.raw[k]>0||total(s.raw)>=bagCapacity(s)?'depot':['wheat','cow','berries'][k];}
   }
   if(id==='serve'&&s.facilities.rack&&!total(s.shelf)&&!total(s.goods)){[text,room,station]=work();panel=null;}
   if(id==='pack'&&!s.packReady.length&&!s.jobs.pack&&[0,1,2].some(i=>s.goods[i]+s.shelf[i]<1)){[text,room,station]=work({need:[0,1,2,3].map(i=>i<3&&s.goods[i]+s.shelf[i]<1?1:0)});panel=null;}
   if(id==='pack'&&s.jobs.pack){text='打包中，先备下一批原料，完成后回来取篮。';room='raw';station='wheat';}
  }
 }
 if(id==='claim'&&!s.journal.active){text='选择下一个主题继续工作，完成后到柜台领奖。';room=null;station=null;}
 return {id,index:index+1,total:steps.length,title,text,room,station,panel,hidden:g.hidden};
}
