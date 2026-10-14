// Business state is saved with the bakery. Only an explicit player action can
// remove bread for a meal or a parcel; offline time never performs those actions.
export const FACILITIES=[
 {id:'mill',name:'磨坊',price:120,unlock:1,description:'麦子磨成面粉，烤面包更快。',tip:'磨坊会自动磨面粉；面粉可以代替麦子，烘烤速度提高 15%。'},
 {id:'rack',name:'面包展示架',price:180,unlock:1,description:'分出一部分新面包，供堂食和外卖使用。',tip:'每三个新面包分一个到展示架。走近展示架拿面包，再送到长桌。'},
 {id:'jam',name:'果酱锅',price:320,unlock:2,description:'莓果熬成果酱，解锁果酱面包。',tip:'每两份莓果熬一罐果酱。在配方页选择果酱面包。'},
 {id:'table',name:'勇者长桌',price:450,unlock:2,description:'拿一份面包送给等待的勇者，获得更高售价。',tip:'走近展示架拿面包，然后走近长桌送餐。勇者不会超时离开。'},
 {id:'pack',name:'打包台',price:700,unlock:3,description:'普通、牛奶、莓果面包各一个，打成外卖篮。',tip:'展示架有三种面包各一个时，走近打包台开始打包，六秒后拿篮子。'},
 {id:'wagon',name:'外卖马车站',price:1200,unlock:3,description:'把三篮面包装上车，出发后自动送货收款。',tip:'从打包台拿篮子，走到马车站装车。三篮满车，45 秒后收款。'}
];
const num=(v,max=1e6)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;
const int=(v,max=1e6)=>Math.floor(num(v,max));
export const freshShop=()=>({facilities:Object.fromEntries(FACILITIES.map(f=>[f.id,0])),stock:[0,0,0,0],flour:0,jam:0,millClock:0,jamClock:0,saleClock:0,guestClock:0,guests:0,served:0,packJob:null,parcels:[],load:[],trip:null,trips:0,carry:null,split:0,distribution:'balanced',completed:false});
export function restoreShop(raw){
 const b=freshShop();if(!raw)return b;
 FACILITIES.forEach(f=>b.facilities[f.id]=int(raw.facilities?.[f.id],3));
 b.stock=b.stock.map((_,i)=>int(raw.stock?.[i],10000));
 for(const k of ['flour','jam','guests','served','trips','split'])b[k]=int(raw[k],k==='guests'?3:k==='flour'||k==='jam'?40:1e6);
 for(const k of ['millClock','jamClock','saleClock','guestClock'])b[k]=num(raw[k],60);
 const parcel=p=>p&&Number.isFinite(p.value)&&p.value>0?{value:int(p.value,10000)}:null;
 b.parcels=(Array.isArray(raw.parcels)?raw.parcels:[]).slice(0,4).map(parcel).filter(Boolean);
 b.load=(Array.isArray(raw.load)?raw.load:[]).slice(0,2).map(parcel).filter(Boolean);
 if(raw.packJob&&parcel(raw.packJob))b.packJob={...parcel(raw.packJob),t:num(raw.packJob.t,6)};
 if(raw.trip&&parcel(raw.trip))b.trip={...parcel(raw.trip),t:num(raw.trip.t,45)};
 if(raw.carry?.kind==='bread'&&Number.isInteger(raw.carry.recipe)&&raw.carry.recipe>=0&&raw.carry.recipe<4)b.carry={kind:'bread',recipe:raw.carry.recipe};
 if(raw.carry?.kind==='parcel'&&parcel(raw.carry))b.carry={kind:'parcel',...parcel(raw.carry)};
 if(['balanced','orders','shop'].includes(raw.distribution))b.distribution=raw.distribution;
 b.completed=raw.completed===true;return b;
}
export const facilityCost=(s,id)=>{const f=FACILITIES.find(f=>f.id===id);return f?Math.ceil(f.price*2.1**s.shop.facilities[id]):Infinity;};
export const facilityUnlocked=(s,id)=>{const f=FACILITIES.find(f=>f.id===id);return !!f&&s.beacons>=f.unlock;};
export function buildFacility(s,id){if(s.paused||!facilityUnlocked(s,id)||s.shop.facilities[id]>=3||s.coins<facilityCost(s,id))return false;s.coins-=facilityCost(s,id);s.shop.facilities[id]++;if(id==='table'&&!s.shop.guests)s.shop.guests=1;return true;}
export const shopGoal=s=>s.lineBuilt&&s.beacons>=6&&FACILITIES.every(f=>s.shop.facilities[f.id]>0)&&s.shop.served>=8&&s.shop.trips>=3;
const income=(s,n)=>{n=Math.floor(n);s.coins+=n;s.earned+=n;return n;};
const breadPrice=(s,r)=>Math.floor(r.value*(1+.15*s.upgrades.polish)*(s.resonance?.type==='value'?1.6:1));
export function bakedBread(s,recipe){const b=s.shop,space=b.stock.reduce((a,n)=>a+n,0)<12+6*b.facilities.rack;b.split=(b.split+1)%3;if(b.facilities.rack&&space&&(b.distribution==='shop'||b.distribution==='balanced'&&b.split===0)){b.stock[recipe]++;}else s.goods[recipe]++;}
export function businessAction(s,id,recipes){
 if(s.paused)return {ok:false,message:'经营已暂停'};const b=s.shop;
 if(!b.facilities[id])return {ok:false,message:'先在设备页建造这项设施'};
 if(id==='rack'){
  if(b.carry)return {ok:false,message:'先送出手上的面包或篮子'};
  const i=b.stock.findLastIndex(n=>n>0);if(i<0)return {ok:false,message:'展示架还没有面包；在经营页补货或等待烘烤'};
  b.stock[i]--;b.carry={kind:'bread',recipe:i};return {ok:true,message:'拿到'+recipes[i].name+'，送到勇者长桌'};
 }
 if(id==='table'){
  if(!b.guests)return {ok:false,message:'下一位勇者正在来店的路上'};
  if(b.carry?.kind!=='bread')return {ok:false,message:'先到展示架拿一个面包'};
  const value=income(s,breadPrice(s,recipes[b.carry.recipe])*(1.8+.2*(b.facilities.table-1)));b.carry=null;b.guests--;b.served++;return {ok:true,message:`送餐成功 +${value} 金币`};
 }
 if(id==='pack'){
  if(b.carry)return {ok:false,message:'先送出手上的物品'};
  if(b.parcels.length){b.carry={kind:'parcel',...b.parcels.shift()};return {ok:true,message:'拿到外卖篮，送到马车站装车'};}
  if(b.packJob)return {ok:false,message:'正在打包，请稍等'};
  if([0,1,2].some(i=>b.stock[i]<1))return {ok:false,message:'展示架需要普通、牛奶、莓果面包各一个'};
  [0,1,2].forEach(i=>b.stock[i]--);b.packJob={value:Math.floor(recipes.slice(0,3).reduce((a,r)=>a+breadPrice(s,r),0)*1.35),t:6/(1+.3*(b.facilities.pack-1))};return {ok:true,message:'开始打包，稍后可以拿篮子'};
 }
 if(id==='wagon'){
  if(b.trip)return {ok:false,message:'马车送货中，返回后再装车'};
  if(b.carry?.kind!=='parcel')return {ok:false,message:'先到打包台拿一篮面包'};
  b.load.push({value:b.carry.value});b.carry=null;
  if(b.load.length===3){b.trip={value:Math.floor(b.load.reduce((a,p)=>a+p.value,0)*(1.25+.15*(b.facilities.wagon-1))),t:45};b.load=[];return {ok:true,message:'满车出发！45 秒后自动收款'};}
  return {ok:true,message:`已装车 ${b.load.length} / 3 篮`};
 }
 return {ok:false,message:'这项设施会自动工作'};
}
export function returnCarry(s){const b=s.shop;if(s.paused||!b.carry)return false;if(b.carry.kind==='bread'){if(b.stock.reduce((a,n)=>a+n,0)>=12+6*b.facilities.rack)s.goods[b.carry.recipe]++;else b.stock[b.carry.recipe]++;}else{if(b.parcels.length>=4)return false;b.parcels.push({value:b.carry.value});}b.carry=null;return true;}
export function stockShelf(s,recipe){if(s.paused||!s.shop.facilities.rack||!Number.isInteger(recipe)||recipe<0||recipe>3||s.goods[recipe]<1||s.shop.stock.reduce((a,n)=>a+n,0)>=12+6*s.shop.facilities.rack)return false;s.goods[recipe]--;s.shop.stock[recipe]++;return true;}
export function stepShop(s,dt,recipes){
 const b=s.shop;
 if(b.facilities.mill&&b.flour<40&&s.dust[0]>0){b.millClock+=dt;if(b.millClock>=1.8/b.facilities.mill){b.millClock=0;s.dust[0]--;b.flour++;}}
 if(b.facilities.jam&&b.jam<40&&s.dust[2]>=2+(recipes[s.recipe].need[2]||0)*2){b.jamClock+=dt;if(b.jamClock>=5/b.facilities.jam){b.jamClock=0;s.dust[2]-=2;b.jam++;}}
 if(b.facilities.table){b.guestClock+=dt;if(b.guests<Math.min(3,b.facilities.table+1)&&b.guestClock>=18){b.guestClock=0;b.guests++;}}
 // The shelf reserves stock for meals and parcels. Only actual excess is sold.
 if(b.facilities.rack){b.saleClock+=dt;if(b.saleClock>=12/b.facilities.rack){b.saleClock=0;const keep=b.facilities.pack?3:b.facilities.table?1:0,i=b.stock.findIndex(n=>n>keep);if(i>=0){b.stock[i]--;income(s,breadPrice(s,recipes[i])*1.15);}}}
 if(b.packJob){b.packJob.t-=dt;if(b.packJob.t<=0){b.parcels.push({value:b.packJob.value});b.packJob=null;}}
 if(b.trip){b.trip.t-=dt;if(b.trip.t<=0){income(s,b.trip.value);b.trip=null;b.trips++;}}
}
