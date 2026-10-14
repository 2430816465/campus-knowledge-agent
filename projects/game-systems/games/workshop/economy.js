import {assistedTime} from './effort.js';
import {freshShop,restoreShop,stepShop,bakedBread} from './shop.js';
export const SAVE_KEY='starlight-workshop-v1';
export const COLORS=['blue','gold','violet'];
export const COLOR_NAMES=['麦子','牛奶','莓果'];
export const RECIPES=[
 {id:'moon',name:'普通面包',need:[2,0,0],value:12,seconds:2.8,unlock:0},
 {id:'dawn',name:'牛奶面包',need:[1,2,0],value:32,seconds:3.6,unlock:1},
 {id:'prism',name:'莓果面包',need:[1,1,2],value:80,seconds:4.2,unlock:2},
 {id:'jam',name:'果酱面包',need:[1,1,0],jam:1,value:100,seconds:4.6,unlock:2}
];
export const ORDERS=[
 {name:'新手勇者队',story:'刚出发的勇者，想带三个面包当午饭。',need:[3,0,0],reward:90},
 {name:'巡逻骑士队',story:'骑士们喜欢普通面包，也想尝尝牛奶面包。',need:[5,3,0],reward:240},
 {name:'森林游侠队',story:'森林里还有伙伴在等，三种口味都带一些。买齐设备，开始为整队烤面包。',need:[15,20,15],reward:600},
 {name:'山地探险队',story:'探险队要翻过大山，给每位队员备好路上的面包。升级熔炉能更快完成。',need:[79,50,50],reward:2400},
 {name:'城堡法师队',story:'城堡里的勇者们也来订面包了！扩大生产，为大家准备一场面包宴。',need:[118,139,139],reward:7000},
 {name:'勇者远征队',story:'勇者们要一起出发了。最后一批远征口粮备齐，魔王面包房就名扬王国！',need:[205,262,262],reward:18000}
];
const finite=(v,fallback=0,max=1e9)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):fallback;
const integer=(v,fallback=0,max=1e9)=>Math.floor(finite(v,fallback,max));
export const capacity=s=>30+s.upgrades.storage*20;
export const stockTotal=s=>s.dust.reduce((a,b)=>a+b,0);
export const hasLine=s=>s.lineBuilt===true;
export const handTotal=s=>s.hand.raw.reduce((a,b)=>a+b,0);
export const currentOrder=s=>s.beacons<6?ORDERS[s.beacons]:{name:'回头客订单',story:'六支勇者队伍都已备好口粮，老顾客又来买面包了。',need:[6,4,3],reward:600};
export const collectorUnlocked=(s,i)=>i===0||s.beacons>=i;
export const recipeUnlocked=(s,i)=>!!RECIPES[i]&&s.beacons>=RECIPES[i].unlock&&(!RECIPES[i].jam||s.shop?.facilities.jam>0);
export function cost(s,kind,index=0){const level=kind==='collector'?s.collectors[index]:s.upgrades[kind];const base=kind==='collector'?[40,90,240][index]:{rail:50,polish:70,storage:45}[kind];return base===undefined?Infinity:Math.ceil(base*1.65**Math.max(0,level-(kind==='collector'&&index===0?1:0)));}
export function fresh(now=Date.now()){
 return {version:1,lineBuilt:false,hand:{raw:[0,0,0],ready:[0,0,0,0]},coins:0,earned:0,collectors:[1,0,0],clocks:[0,0,0],buffer:[0,0,0],dust:[0,0,0],goods:[0,0,0,0],shop:freshShop(),carts:[],job:null,recipe:0,upgrades:{rail:0,polish:0,storage:0},beacons:0,deliveries:0,autoSell:true,focus:0,resonance:null,adBoost:0,adCooldown:0,offlineBonus:0,sweepCooldown:0,elapsed:0,crafted:0,savedAt:now,paused:false};
}
export function restore(raw,now=Date.now()){
 if(!raw||raw.version!==1)return fresh(now);
 const s=fresh(now);
 // Saves from the previous automatic bakery keep their existing conveyor.
 s.lineBuilt=raw.lineBuilt!==false;
 let room=6;s.hand.raw=COLORS.map((_,i)=>{const n=integer(raw.hand?.raw?.[i],0,room);room-=n;return n;});
 s.hand.ready=RECIPES.map((_,i)=>integer(raw.hand?.ready?.[i],0,100000));
 for(const key of ['coins','earned','elapsed','crafted','deliveries','offlineBonus'])s[key]=finite(raw[key]);
 s.shop=restoreShop(raw.shop);s.beacons=integer(raw.beacons,0,6);s.recipe=integer(raw.recipe,0,3);if(!recipeUnlocked(s,s.recipe))s.recipe=0;
 for(const key of ['collectors','dust','buffer','clocks'])s[key]=COLORS.map((_,i)=>key==='clocks'?finite(raw[key]?.[i],0,3):integer(raw[key]?.[i],key==='collectors'&&i===0?1:0,key==='collectors'?8:key==='buffer'?24:100000));
 s.goods=RECIPES.map((_,i)=>integer(raw.goods?.[i],0,100000));
 s.collectors[0]=Math.max(1,s.collectors[0]);s.collectors=s.collectors.map((v,i)=>collectorUnlocked(s,i)?v:0);
 for(const k of ['rail','polish','storage'])s.upgrades[k]=integer(raw.upgrades?.[k],0,8);
 let remaining=capacity(s);s.dust=s.dust.map(v=>{const n=Math.min(remaining,v);remaining-=n;return n;});
 s.carts=(Array.isArray(raw.carts)?raw.carts:[]).slice(0,8+s.upgrades.rail*4).filter(c=>COLORS.includes(c.color)).map(c=>({color:c.color,t:finite(c.t,0,3)}));
 if(raw.job&&RECIPES[raw.job.recipe]&&recipeUnlocked(s,raw.job.recipe))s.job={recipe:raw.job.recipe,t:finite(raw.job.t,0,5),...(Number.isFinite(raw.job.duration)?{duration:finite(raw.job.duration,0,5)}:{})};
 if(raw.effort)s.effort={id:null,until:0,last:-1,taps:integer(raw.effort.taps)};
 s.autoSell=raw.autoSell!==false;s.focus=finite(raw.focus,0,30);
 for(const k of ['adBoost','adCooldown','sweepCooldown'])s[k]=finite(raw[k],0,k==='adCooldown'?120:30);
 if(['harvest','value'].includes(raw.resonance?.type))s.resonance={type:raw.resonance.type,t:finite(raw.resonance.t,0,30)};
 s.savedAt=finite(raw.savedAt,now,now);s.paused=raw.paused===true;return s;
}
export function upgrade(s,kind,index=0){
 if(!['collector','rail','polish','storage'].includes(kind))return false;
 if(kind==='collector'&&(!Number.isInteger(index)||index<0||index>2||!collectorUnlocked(s,index)))return false;
 const level=kind==='collector'?s.collectors[index]:s.upgrades[kind],price=cost(s,kind,index);
 if(s.paused||level>=8||s.coins<price)return false;s.coins-=price;
 if(kind==='rail'&&!hasLine(s))s.lineBuilt=true;
 else if(kind==='collector')s.collectors[index]++;else s.upgrades[kind]++;return true;
}
export function sweep(s,color=0){
 if(s.paused||s.sweepCooldown>0||!Number.isInteger(color)||color<0||color>2||!s.collectors[color])return 0;
 const room=hasLine(s)?capacity(s)-stockTotal(s):6-handTotal(s),n=Math.min(3,s.buffer[color],room);
 if(n<=0)return 0;s.buffer[color]-=n;(hasLine(s)?s.dust:s.hand.raw)[color]+=n;s.sweepCooldown=.35;s.focus=Math.min(30,s.focus+n);return n;
}
export function startBake(s){
 if(s.paused||s.job||(!hasLine(s)&&s.hand.ready.some(n=>n>0)))return false;
 const r=RECIPES[s.recipe];if(!r.need.every((n,i)=>s.dust[i]+(i===0?s.shop.flour:0)>=n)||s.shop.jam<(r.jam||0))return false;
 r.need.forEach((n,i)=>{const flour=i===0?Math.min(n,s.shop.flour):0;s.shop.flour-=flour;s.dust[i]-=n-flour;});s.shop.jam-=r.jam||0;const duration=r.seconds/(1+.2*s.upgrades.polish)*(s.shop.facilities.mill?.85:1);s.job={recipe:s.recipe,t:duration,duration};return true;
}
export function furnaceAction(s){
 if(s.paused)return {ok:false,message:'经营已暂停'};
 if(s.hand.ready.some(n=>n>0)){let count=0;s.hand.ready.forEach((n,i)=>{s.goods[i]+=n;count+=n;});s.hand.ready.fill(0);return {ok:true,action:'take',message:`取出 ${count} 个面包，带给勇者`};}
 if(hasLine(s))return {ok:false,message:'流水线已接管投料和取面包，可在配方页换口味'};
 if(s.job)return {ok:false,message:'面包正在烤，请稍等'};
 let count=0,room=capacity(s)-stockTotal(s);s.hand.raw.forEach((n,i)=>{const put=Math.min(n,room);s.dust[i]+=put;s.hand.raw[i]-=put;count+=put;room-=put;});
 const started=startBake(s);return {ok:count>0||started,action:started?'bake':'feed',message:started?'已投料，开始烤面包':count?'材料已放进熔炉，还缺配方材料':'带上麦子，走近熔炉再投料'};
}
export function sellDust(s){const count=stockTotal(s);if(!count)return 0;const n=count*3;s.dust=[0,0,0];s.coins+=n;s.earned+=n;return n;}
export function resonate(s,type){if(!['harvest','value'].includes(type)||s.focus<30||s.resonance)return false;s.focus-=30;s.resonance={type,t:30};return true;}
export function grantAd(s){if(s.adCooldown>0)return false;s.adBoost=30;s.adCooldown=120;return true;}
export function canDeliver(s){return currentOrder(s).need.every((n,i)=>s.goods[i]>=n);}
export function deliver(s){if(s.paused||!canDeliver(s))return null;const order=currentOrder(s);order.need.forEach((n,i)=>s.goods[i]-=n);s.coins+=order.reward;s.earned+=order.reward;s.deliveries++;if(s.beacons<6)s.beacons++;return {name:order.name,reward:order.reward,beacon:s.beacons};}
export function step(s,dt){
 if(s.paused||!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);const boost={oven:assistedTime(s,'oven',dt),collectors:['wheat','cow','berries'].map(id=>assistedTime(s,id,dt))};s.elapsed+=dt;
 const harvest=(s.resonance?.type==='harvest'?1.6:1)*(s.adBoost>0?2:1);
 for(const k of ['adBoost','adCooldown','sweepCooldown'])s[k]=Math.max(0,s[k]-dt);
 if(s.resonance){s.resonance.t-=dt;if(s.resonance.t<=0)s.resonance=null;}
 s.collectors.forEach((lv,i)=>{if(!lv)return;const period=3/(1+.45*(lv-1))/harvest;s.clocks[i]+=dt+boost.collectors[i];if(s.buffer[i]<(hasLine(s)?24:6)&&s.clocks[i]>=period){s.clocks[i]-=period;s.buffer[i]++;}s.clocks[i]=Math.min(s.clocks[i],period);});
 for(let i=s.carts.length-1;i>=0;i--){const c=s.carts[i];c.t=Math.max(0,c.t-dt);if(c.t===0&&stockTotal(s)<capacity(s)){s.dust[COLORS.indexOf(c.color)]++;s.focus=Math.min(30,s.focus+1);s.carts.splice(i,1);}}
 // Dispatch scarce recipe colours first. When full, sell one excess raw unit
 // so a surplus colour cannot permanently block all incoming ingredients.
 const need=RECIPES[s.recipe].need;
 if(hasLine(s)&&stockTotal(s)+s.carts.length>=capacity(s)&&s.buffer.some(n=>n>0)){
  const surplus=s.dust.map((n,i)=>n-need[i]*2),i=surplus.indexOf(Math.max(...surplus));
  if(surplus[i]>0){s.dust[i]--;s.coins+=3;s.earned+=3;}
 }
 const priority=[0,1,2].sort((a,b)=>(need[a]?s.dust[a]/need[a]:1e6)-(need[b]?s.dust[b]/need[b]:1e6));
 if(hasLine(s))for(const i of priority){if(s.buffer[i]>0&&s.carts.length<8+s.upgrades.rail*4&&stockTotal(s)+s.carts.length<capacity(s)){s.buffer[i]--;s.carts.push({color:COLORS[i],t:2.4/(1+.35*s.upgrades.rail)});}}
 if(hasLine(s)){
  s.hand.raw.forEach((n,i)=>{const put=Math.min(n,capacity(s)-stockTotal(s));s.dust[i]+=put;s.hand.raw[i]-=put;});
  s.hand.ready.forEach((n,i)=>{s.goods[i]+=n;s.hand.ready[i]=0;});
 }
 stepShop(s,dt,RECIPES);
 if(s.job){s.job.t-=dt+boost.oven;if(s.job.t<=0){if(hasLine(s))bakedBread(s,s.job.recipe);else s.hand.ready[s.job.recipe]++;s.crafted++;s.job=null;}}
 if(hasLine(s))startBake(s);
 if(hasLine(s)&&s.autoSell){const order=currentOrder(s);s.goods.forEach((g,i)=>{const extra=Math.max(0,g-(order.need[i]||0));if(extra){const value=Math.floor(RECIPES[i].value*(1+.15*s.upgrades.polish)*(s.resonance?.type==='value'?1.6:1));s.goods[i]-=extra;s.coins+=extra*value;s.earned+=extra*value;}});}
}
export function advance(s,seconds){const total=finite(seconds,0,7200);const count=Math.ceil(total/.1);for(let i=0;i<count;i++)step(s,Math.min(.1,total-i*.1));return total;}
export function offline(s,now=Date.now()){const seconds=Math.min(7200,Math.max(0,(now-s.savedAt)/1000)),before=s.coins;if(!s.paused)advance(s,seconds);s.savedAt=now;return {seconds:s.paused?0:seconds,coins:s.coins-before};}

