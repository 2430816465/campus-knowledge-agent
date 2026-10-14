// Finite authored events. Idle can finish ONE submitted parcel, never sell or start work.
import {recordWork} from './commissions.js';
export const CHAPTERS=[
 {id:'opening',name:'开张回访',unlock:1,modes:['tasting','banquet','tasting'],qty:6,flavours:2,reward:240,story:'辨认口味，配好餐盘后亲自送到客人面前。'},
 {id:'forest',name:'林间野餐',unlock:2,modes:['banquet','route','tasting'],qty:8,flavours:3,reward:340,story:'野餐客人分席点餐，准备不同地址的补给篮。'},
 {id:'craft',name:'下午茶工艺',unlock:2,modes:['decorate','tasting','decorate'],qty:8,flavours:4,reward:420,story:'按委托搭配淋面与造型，交付手工装饰面包。'},
 {id:'rain',name:'雨天送暖',unlock:3,modes:['route','banquet','route','tasting'],qty:8,flavours:3,reward:500,story:'先核对地址再贴签；发车后备下一单，回车亲自签收。'},
 {id:'guilds',name:'三队宴会',unlock:4,modes:['banquet','decorate','banquet','route'],qty:10,flavours:4,reward:600,story:'宴会分轮开席，可自行决定先服务哪一席。'},
 {id:'artisan',name:'工匠交流会',unlock:4,modes:['decorate','tasting','decorate','banquet'],qty:10,flavours:4,reward:680,story:'淋面还要消耗加工料，提前把面粉、果酱与面包交错准备。'},
 {id:'tour',name:'城镇巡回',unlock:5,modes:['route','tasting','route','decorate','banquet'],qty:10,flavours:4,reward:760,story:'每站重新核对接收人，不能把上一站的签条照搬。'},
 {id:'victory',name:'骑士庆功宴',unlock:5,modes:['banquet','route','decorate','banquet'],qty:12,flavours:4,reward:840,story:'大席位与小委托交替，保留库存来安排出餐顺序。'},
 {id:'qualifier',name:'王国资格赛',unlock:6,modes:['tasting','decorate','route','banquet','decorate'],qty:12,flavours:4,reward:920,story:'四种工艺组合验收，所有规则都已在此前学过。'},
 {id:'finale',name:'面包节终章',unlock:6,modes:['decorate','banquet','route','tasting','banquet','route'],qty:12,flavours:4,reward:1200,story:'筹备、装饰、出餐、配送交替，补齐全部经营目标后获得王国总厨称号。'}
];
export const MODE_NAMES={tasting:'风味品鉴',banquet:'分席宴会',decorate:'手工装饰',route:'地址外卖'};
export const TOPPINGS=['麦香粉','牛奶霜','莓果淋面'];
export const SHAPES=['圆环','星纹','交叉纹'];
export const ADDRESSES=['森林营地','骑士驻所','法师书屋'];
const sum=a=>a.reduce((a,b)=>a+b,0),num=(v,max=1e9)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.floor(v))):0;
const result=(ok,message)=>({ok,message});
export const freshJourney=()=>({chapter:0,wave:0,done:[],served:[],picks:[],phase:'prepare',timer:0,learned:[],finished:false,engaged:false});
export function eventSpec(s){
 const j=s.journey,c=CHAPTERS[j.chapter];if(!c)return null;
 const mode=c.modes[j.wave];if(!mode)return {...c,mode:null,need:[0,0,0,0]};
 const need=[0,0,0,0];for(let q=0;q<c.qty;q++)need[(q+j.wave+j.chapter)%c.flavours]++;
 return {...c,mode,need,topping:(j.chapter+j.wave)%3,shape:(j.chapter+2*j.wave)%3,address:(j.chapter+j.wave)%3,
  seats:need.map((qty,recipe)=>({recipe,qty,name:['麦香骑士','牧场旅人','莓园游侠','果酱法师'][recipe]})).filter(x=>x.qty),
  tip:{tasting:'先按品鉴单依次选口味配盘，再到长桌呈上。选错不扣料。',banquet:'每席只收指定口味；展示架配盘，长桌上菜。可以选择先招待哪一席。',decorate:'烤箱台选择淋面与造型；装饰还需加工料。完成后到柜台验收。',route:'打包台核对地址贴签、取篮；马车发车后可继续备料，返回再亲自签收。'}[mode]};
}
export const journeyComplete=s=>s.journey.done.length===CHAPTERS.length;
export const eventUnlocked=s=>{const e=eventSpec(s);return !!e&&s.beacons>=e.unlock;};
export function restoreJourney(raw){
 const j=freshJourney();if(!raw)return j;
 // Completed chapters must form a prefix: arbitrary duplicated IDs cannot award the final title.
 for(const c of CHAPTERS){if(!raw.done?.includes(c.id))break;j.done.push(c.id);}j.chapter=j.done.length;
 if(j.chapter===CHAPTERS.length){j.finished=true;j.crowned=raw.crowned===true;return j;}
 j.wave=num(raw.wave,CHAPTERS[j.chapter].modes.length);j.phase=['prepare','handoff','packing','packed','carried','travel','sign','claim'].includes(raw.phase)?raw.phase:'prepare';
 j.engaged=raw.engaged===true;
 if(j.wave===CHAPTERS[j.chapter].modes.length)j.phase='claim';
 else if(j.phase==='claim')j.phase='prepare';
 j.served=[...new Set((Array.isArray(raw.served)?raw.served:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<4))];
 j.picks=(Array.isArray(raw.picks)?raw.picks:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<4).slice(0,4);
 j.timer=Math.min(12,Math.max(0,Number(raw.timer)||0));j.learned=['tasting','banquet','decorate','route'].filter(k=>raw.learned?.includes(k));
 if(j.phase!=='claim'){
  const e=eventSpec({journey:j});j.served=j.served.filter(i=>e.need[i]>0);
  if(e.mode!=='route'&&['packing','packed','carried','travel','sign'].includes(j.phase)){j.phase='prepare';j.timer=0;}
  if(e.mode==='banquet'&&j.phase==='handoff'&&(!e.need[j.picks[0]]||!j.served.includes(j.picks[0])))j.phase='prepare';
  if(e.mode==='tasting'){const sequence=e.seats.map(x=>x.recipe);if(j.picks.some((v,i)=>v!==sequence[i]))j.picks=[];if(j.phase==='handoff'&&j.picks.length!==sequence.length)j.phase='prepare';}
  if(e.mode==='decorate'&&j.picks[0]!==e.topping){j.picks=[];if(j.phase==='handoff')j.phase='prepare';}
 }
 return j;
}
export function eventNeed(s){const e=eventSpec(s),j=s.journey;if(!e||j.phase!=='prepare')return [0,0,0,0];return e.need.map((n,i)=>e.mode==='banquet'&&j.served.includes(i)?0:n);}
export const availableBread=(s,i)=>s.goods[i]+s.shelf[i];
export const eventStockReady=s=>eventNeed(s).every((q,i)=>availableBread(s,i)>=q);
export function startJourney(s){if(s.paused||!eventUnlocked(s)||journeyComplete(s))return false;s.journey.engaged=true;return true;}
const takeBread=(s,need)=>need.forEach((q,i)=>{const shelf=Math.min(q,s.shelf[i]);s.shelf[i]-=shelf;s.goods[i]-=q-shelf;});
function nextWave(s){const j=s.journey;j.wave++;j.phase=j.wave===CHAPTERS[j.chapter].modes.length?'claim':'prepare';j.served=[];j.picks=[];j.timer=0;}
function pay(s,value){s.coins+=value;s.earned+=value;}
export function eventTarget(s){
 const j=s.journey,e=eventSpec(s);if(!e||j.phase==='claim')return {room:'shop',station:'counter'};
 if(!eventUnlocked(s))return {room:'shop',station:'counter',panel:'orders'};
 const id=j.phase==='handoff'?(e.mode==='decorate'?'counter':'table'):['travel','sign','carried'].includes(j.phase)?'wagon':e.mode==='route'?'pack':e.mode==='decorate'?'oven':'rack';
 return {room:['counter','table','rack'].includes(id)?'shop':id==='oven'?'bake':'delivery',station:id};
}
export function eventAct(s,station,command,value){
 const j=s.journey,e=eventSpec(s);if(s.paused||!e||!eventUnlocked(s)||!j.engaged)return result(false,'先解锁并开展本章活动');
 const target=eventTarget(s);if(station!==target.station)return result(false,'请走到目标工位后操作');
 if(['rack','table','pack','wagon'].includes(station)&&!s.facilities[station])return result(false,'先建造目标设施');
 if(command==='claim'){
  if(j.phase!=='claim')return result(false,'先完成本章全部工作');
  pay(s,e.reward);j.done.push(e.id);j.chapter++;j.wave=0;j.phase='prepare';j.served=[];j.picks=[];j.timer=0;j.finished=journeyComplete(s);
  return result(true,j.finished?'十章纪念牌已集齐！查看最终目标清单，补齐基础经营目标':`获得 ${e.name} 纪念牌与 ${e.reward} 金币，可查看下一章的开放条件`);
 }
 if(command==='deliver'&&j.phase==='handoff'){
  const value=e.mode==='banquet'?e.need[j.picks[0]]*[22,38,64,78][j.picks[0]]:e.need.reduce((a,n,i)=>a+n*[22,38,64,78][i],0);pay(s,Math.ceil(value*1.75));
  if(e.mode==='banquet'||e.mode==='tasting'){const qty=e.mode==='banquet'?e.need[j.picks[0]]:sum(e.need);s.served+=qty;recordWork(s,'served',qty);}
  if(e.mode==='banquet'&&j.served.length<e.seats.length){j.phase='prepare';j.picks=[];}else nextWave(s);
  return result(true,'亲自交付成功，继续下一轮筹备');
 }
 if(e.mode==='route'){
  if(command==='address'&&j.phase==='prepare'){
   if(value!==e.address)return result(false,'地址不符，核对本站接收人；尚未消耗面包');
   if(!eventStockReady(s))return result(false,'外卖面包未备齐');takeBread(s,e.need);j.phase='packing';j.timer=5/(1+.3*(s.facilities.pack-1));
  }else if(command==='take'&&j.phase==='packed'){j.phase='carried';recordWork(s,'packed');}
  else if(command==='dispatch'&&j.phase==='carried'){j.phase='travel';j.timer=12/(1+.2*(s.facilities.wagon-1));}
  else if(command==='sign'&&j.phase==='sign'){
   if(value!==e.address)return result(false,'请核对回执上的地址，尚未结算');pay(s,e.need.reduce((a,n,i)=>a+n*[22,38,64,78][i],0)*2);s.trips++;recordWork(s,'trips');nextWave(s);
  }else return result(false,'本批尚未就绪，先去准备下一轮原料');
 }else if(j.phase==='prepare'){
  if(e.mode==='banquet'&&command==='plate'){
   const seat=e.seats.find(x=>x.recipe===value);if(!seat||j.served.includes(value))return result(false,'这一席已经上菜');
   if(availableBread(s,value)<seat.qty)return result(false,'该席口味的面包不足');
   const need=[0,0,0,0];need[value]=seat.qty;takeBread(s,need);j.served.push(value);j.phase='handoff';j.picks=[value];
  }else if(e.mode==='tasting'&&command==='flavour'){
   const sequence=e.seats.map(x=>x.recipe);if(value!==sequence[j.picks.length])return result(false,'品鉴单要求按顺序配入口味，选错不扣料');
   j.picks.push(value);
   if(j.picks.length===sequence.length){if(!eventStockReady(s)){j.picks=[];return result(false,'面包未备齐，先烘焙');}takeBread(s,e.need);j.phase='handoff';}
  }else if(e.mode==='decorate'&&command==='finish'){
   const expected=j.picks.length?e.shape:e.topping;if(value!==expected)return result(false,'与委托不符，可重新选择；尚未消耗原料');
   if(j.picks.length===0)j.picks=[value];
   else{
    const material=e.topping===0?'flour':e.topping===1?'store':'jam';const have=material==='store'?s.store[1]:s[material];
    if(!eventStockReady(s)||have<2)return result(false,'装饰需备齐面包，另需淋面材料 2 份');
    takeBread(s,e.need);if(material==='store')s.store[1]-=2;else s[material]-=2;j.phase='handoff';
   }
  }else return result(false,'请选择当前工序');
 }else return result(false,'先完成当前工序');
 if(!j.learned.includes(e.mode))j.learned.push(e.mode);
 return result(true,j.phase==='handoff'?'餐品已装盘，请亲自交付':j.phase==='travel'?'已发车，去备下一轮原料，返回后签收':'工序完成，按目标提示继续');
}
export function tickJourney(s,dt){const j=s.journey;if(!['packing','travel'].includes(j.phase))return;j.timer=Math.max(0,j.timer-dt);if(!j.timer)j.phase=j.phase==='packing'?'packed':'sign';}
export function journeyHint(s){const j=s.journey,e=eventSpec(s);if(!e)return '十章已完成 · 查看最终清单';if(!eventUnlocked(s))return `第${j.chapter+1}章待开 · 先完成第${e.unlock}队`;if(j.phase==='claim')return `第${j.chapter+1}章完成 · 柜台领纪念牌`;return `第${j.chapter+1}/10章 ${e.name} · ${j.wave+1}/${e.modes.length}轮`;} 
