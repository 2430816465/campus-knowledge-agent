// Version 7 adds optional supplies, a manual burst, and attacks with locked warnings.
// The entire version 6 simulation remains frozen so saved event cursors stay valid.
import {MAX_SQUAD,clamp} from './data.js';
import {createBattle as legacyBattle,step as legacyStep,members,castDelay,notice} from './battle.js';
import {stepChoice as stepSix,choicePlan as planSix,choiceDamage as damageSix,choiceInterval as intervalSix,choiceRange,gateCount,applyGrowth,defenseOffers,selectOffer as offerSix,SWORDS,ARTS,REALMS,COLORS,BOSSES,ENEMIES,GROWTH} from './choice-v6.js';
export {choiceRange,gateCount,applyGrowth,defenseOffers,SWORDS,ARTS,REALMS,COLORS,BOSSES,ENEMIES,GROWTH};
export {choiceLabel} from './choice-v6.js';
const plans=new Map();
export function choicePlan(stage,version=7){
 if(version<7)return planSix(stage);
 if(!plans.has(stage)){
  const p=planSix(stage),gap=stage<=2?8:5.2;
  if(stage>=3)for(let i=1;i<p.count;i+=3)p.events.push({time:i*gap+gap*.45,kind:'supply',x:i%2?125:355,loot:i%2?'recruit':'shield'});
  p.events.sort((a,b)=>a.time-b.time);plans.set(stage,p);
 }
 return plans.get(stage);
}
export function createChoiceBattle(stage,upgrades={},id,mode='campaign'){
 const b=legacyBattle(stage,upgrades,id);
 Object.assign(b,{layoutVersion:7,mode,growth:{sword:0,art:0,realm:0,haste:0,damage:0,range:0,chain:0,blast:0},shield:0,core:100,wave:1,offers:null,choiceHistory:[],learned:{},waveClock:0,waveSpawned:0,aimLane:1,energy:0,burstTime:0,burstUses:0,supplies:0,hurtCooldown:0});
 if(mode==='defense'){b.count=6+(upgrades.recruits||0);b.peak=b.count;b.shield=12;}
 return b;
}
export const burstUnlocked=b=>b?.layoutVersion>=7&&(b.mode==='defense'||b.stage>=3);
export const choiceDamage=b=>Math.round(damageSix(b)*(b.burstTime>0?1.25:1));
export const choiceInterval=b=>intervalSix(b)*(b.burstTime>0?.60:1);
function charge(b,amount){if(!burstUnlocked(b)||b.burstTime>0)return;b.energy=Math.min(100,b.energy+amount);}
export function activateBurst(b){
 if(!burstUnlocked(b)||b.status!=='playing'||b.offers||b.energy<100||b.burstTime>0)return false;
 b.energy=0;b.burstTime=3;b.burstUses++;b.fire=Math.min(b.fire,.05);
 feedback(b,b.x,640,'#ffdfa0',16);notice(b,'齐射爆发！3 秒内射速与伤害提升','#ffdfa0');return true;
}
export function selectOffer(b,id){
 const picked=offerSix(b,id);if(picked&&b.layoutVersion>=7){b.waveSupply=false;b.entities=b.entities.filter(e=>e.kind!=='supply');}return picked;
}
function feedback(b,x,y,color,n=6){
 for(let i=0;i<n;i++){const a=i/n*Math.PI*2;b.effects.push({kind:'spark',x,y,vx:Math.cos(a)*65,vy:Math.sin(a)*65,life:.30,maxLife:.30,color});}
}
function add(b,event){
 const e={...event,id:++b.serial,y:-45,age:0,shoot:3,hit:false,distance:0};
 if(e.kind==='gates')e.choices=e.choices.map(g=>({...g}));
 if(e.kind==='supply')Object.assign(e,{hp:12+b.stage*2,maxHp:12+b.stage*2,speed:86,name:e.loot==='recruit'?'伙伴箱':'护盾箱'});
 if(e.kind==='enemy'){
  const d=ENEMIES[e.enemy||0],scale=b.mode==='defense'?1+(b.wave-1)*.12:1+(b.stage-1)*.07;
  Object.assign(e,d,{hp:Math.round(d.hp*scale),maxHp:Math.round(d.hp*scale)});
  if(!b.learned[d.role]){b.learned[d.role]=true;notice(b,d.name+'：'+({walk:'靠近后挥击，及时移开',dash:'移动更快，优先击破',armor:'正面减伤，成长后击破',caster:'红线锁定后发射弹幕',regen:'缓慢恢复生命',split:'击破后分成两只骨卒',brute:'漏过时伤害较高',healer:'施法治疗附近魔物'})[d.role]);}
 }
 if(e.kind==='boss'){
  const index=b.mode==='defense'?Math.min(17,Math.floor(b.wave/5)*3-1):b.stage-1,d=BOSSES[index];
  const hp=b.mode==='defense'?250+b.wave*65:100+b.stage*34+gateCount(b.stage)*16;
  Object.assign(e,d,{hp,maxHp:hp,speed:44,damage:12});b.bossSpawned=true;
  notice(b,d.name+' · '+({fan:'躲开红色射线',charge:'红色通道即将冲锋',summon:'召唤增援，及时击破',shield:'护甲亮起时减伤',aim:'红线锁定后可移开',quake:'红圈位置即将落石',storm:'连续弹阵，寻找空隙'})[d.skill]);
 }
 b.entities.push(e);
}
function harm(b,amount){
 if(b.hurtCooldown>0)return;b.hurtCooldown=.24;
 const blocked=Math.min(b.shield,amount);b.shield-=blocked;amount-=blocked;
 feedback(b,b.x,640,blocked?'#96e7df':'#ffc1a3',6);if(!amount)return;
 if(b.mode==='defense'){b.core=Math.max(0,b.core-amount);if(!b.core){b.status='lost';b.failureReason='core';}}
 else{b.count=Math.max(0,b.count-Math.max(1,Math.ceil(amount/6)));if(!b.count){b.status='lost';b.failureReason='squad';}}
 b.shake=.12;
}
function collect(b,e){
 if(e.dead)return;e.dead=true;b.supplies++;charge(b,12);
 if(e.loot==='recruit'){const n=Math.min(3,MAX_SQUAD-b.count);b.count+=n;b.rescued+=n;b.peak=Math.max(b.peak,b.count);if(!n)b.shield=Math.min(80,b.shield+8);notice(b,n?'伙伴 +'+n:'队伍已满 · 护盾 +8');}
 else{b.shield=Math.min(80,b.shield+10);notice(b,'补给护盾 +10');}
 feedback(b,e.x,e.y,'#ffe3a0',10);
}
function hit(b,e,damage,splash=false){
 if(e.dead||e.hp<=0)return;
 if(e.role==='armor'||(e.kind==='boss'&&e.skill==='shield'&&Math.floor(e.age)%6<2))damage*=.65;
 e.hp=Math.max(0,e.hp-Math.max(1,Math.round(damage)));e.flash=.08;
 if(!e.hp){
  if(e.kind==='supply'){collect(b,e);return;}
  e.dead=true;b.kills++;charge(b,e.kind==='boss'?20:3);feedback(b,e.x,e.y,e.kind==='boss'?'#ffe3a0':'#c5e4c6',e.kind==='boss'?18:5);
  if(e.kind==='boss'){b.bossKilled=true;notice(b,e.name+' 已击破');}
  if(e.role==='split'&&!splash)for(const dx of [-18,18]){add(b,{kind:'enemy',enemy:0,x:clamp(e.x+dx,60,420)});const child=b.entities.at(-1);child.y=e.y;child.hp=child.maxHp=Math.max(3,Math.round(e.maxHp*.22));}
 }
}
function fire(b){
 b.lastCast=b.time;
 const targets=b.entities.filter(e=>!e.dead&&e.hp>0&&e.y>0);
 for(const m of members(b)){
  if(b.bullets.length>=240)break;
  const ahead=targets.filter(e=>e.y<m.y);
  ahead.sort((a,c)=>b.mode==='defense'?((Math.abs(a.x-[110,240,370][b.aimLane])<90?-60:0)-a.y)-((Math.abs(c.x-[110,240,370][b.aimLane])<90?-60:0)-c.y):Math.abs(a.x-m.x)-Math.abs(c.x-m.x));
  const aim=(b.mode==='defense'||b.growth.art>=2)?ahead[Math.floor(m.index/3)%Math.max(1,Math.min(ahead.length,Math.ceil(b.count/3)))]:null,dx=aim?aim.x-m.x:0,dy=aim?aim.y-m.y:-400,len=Math.max(1,Math.hypot(dx,dy));
  b.bullets.push({x:m.x,y:m.y-20,oldY:m.y-20,target:aim?.id||null,vx:dx/len*660,vy:dy/len*660,age:0,delay:castDelay(m.index),phase:'flight',distance:0,maxRange:choiceRange(b),damage:choiceDamage(b),pierce:b.growth.sword>=2?1+Math.floor(b.growth.sword/3):0,hits:[],weaponType:'sword',burst:b.burstTime>0});b.shots++;
 }
}
function wave(b,dt){
 b.waveClock+=dt;const total=7+b.wave*2,interval=Math.max(.20,.62-b.wave*.012);
 if(b.waveSpawned<total&&b.waveClock>=b.waveSpawned*interval){const n=b.waveSpawned++;add(b,{kind:'enemy',enemy:(n+b.wave)%Math.min(8,2+Math.floor(b.wave/3)),x:80+(n*107+b.wave*31)%320});}
 if(!b.waveSupply&&b.wave%3===2&&b.waveSpawned>=Math.floor(total/2)){b.waveSupply=true;add(b,{kind:'supply',loot:b.wave%2?'recruit':'shield',x:b.wave%2?125:355});}
 if(b.wave%5===0&&b.waveSpawned>=total&&!b.bossSpawned)add(b,{kind:'boss',x:240});
 if(b.waveSpawned>=total&&!b.entities.some(e=>!e.dead&&['enemy','boss'].includes(e.kind))){
  b.enemyBullets=[];if(b.core>0){b.core=Math.min(100,b.core+8);b.shield=Math.min(80,b.shield+4);}
  if(b.wave>=30)b.status='won';else {b.offers=defenseOffers(b);if(!b.offers.length){b.wave++;b.waveClock=0;b.waveSpawned=0;b.waveSupply=false;b.bossSpawned=false;}notice(b,'第 '+b.wave+' 波守住了 · 选择一道机缘');}
 }
}
function lockAttack(b,e){
 const offsets=e.skill==='fan'||e.skill==='storm'?[-130,-65,0,65,130]:e.skill==='quake'?[-100,100]:[0];
 e.lock={x:b.x,y:b.mode==='defense'?600:members(b)[0]?.y||640,targets:offsets.map(dx=>clamp(b.x+dx,48,432))};e.attackElapsed=0;
}
function releaseBoss(b,e){
 if(e.skill==='summon')for(const x of [140,340]){add(b,{kind:'enemy',enemy:Math.floor(e.age)%4,x});b.entities.at(-1).y=e.y+40;}
 else if(e.skill==='quake'){
  for(const x of e.lock.targets){feedback(b,x,e.lock.y,'#f9af81',8);if(b.mode==='defense'||members(b).some(m=>Math.hypot(m.x-x,m.y-e.lock.y)<42))harm(b,8);}
 }else if(e.skill==='charge'){e.dashTime=1.6;e.dashStart=e.y;e.dashEnd=e.lock.y;e.aimX=e.lock.x;e.dashHit=false;}
 else for(const tx of e.lock.targets){const len=Math.max(1,Math.hypot(tx-e.x,e.lock.y-e.y));b.enemyBullets.push({x:e.x,y:e.y,vx:(tx-e.x)/len*150,vy:(e.lock.y-e.y)/len*150});}
 e.recover=.26;e.lock=null;e.warning=false;e.shoot=b.mode==='defense'?3.8:4.5;
}
function bossStep(b,e,dt){
 const oldY=e.y;
 if(e.dashTime>0){
  e.dashTime=Math.max(0,e.dashTime-dt);const t=1-e.dashTime/1.6;e.x=e.aimX;e.y=e.dashStart+(e.dashEnd-e.dashStart)*Math.sin(t*Math.PI);
  if(!e.dashHit&&(b.mode==='defense'?e.y>=575:members(b).some(m=>Math.hypot(m.x-e.x,m.y-e.y)<48))){e.dashHit=true;harm(b,e.damage);}
 }else {e.y=Math.min(230,e.y+44*dt);if(!e.lock)e.x=240+Math.sin(e.age*.6)*(60+b.stage*2);}
 e.distance=(e.distance||0)+Math.abs(e.y-oldY);
 if(e.y>=230&&b.arenaTime===undefined)b.arenaTime=b.time;
 if(e.recover>0){e.recover=Math.max(0,e.recover-dt);e.attackElapsed=(e.attackElapsed||0)+dt;}
 e.shoot=e.y<200&&!e.dashTime?Math.max(e.shoot,1.2):e.shoot-dt;
 if(e.shoot<=.9&&e.y>=200&&!e.lock&&!e.dashTime)lockAttack(b,e);
 e.warning=!!e.lock;
 if(e.lock){e.attackElapsed+=dt;if(e.shoot<=0)releaseBoss(b,e);}
}
function enemyStep(b,e,dt){
 const touching=()=>b.mode==='defense'?e.y>=575:members(b).some(m=>Math.hypot(m.x-e.x,m.y-e.y)<42);
 if(e.melee){e.attackElapsed+=dt;if(e.attackElapsed>=.28&&!e.strikeReleased){e.strikeReleased=true;if(touching())harm(b,e.damage);}if(e.attackElapsed>=.56)e.dead=true;return;}
 if(touching()){e.melee=true;e.lock=null;e.warning=false;e.attackElapsed=0;return;}
 e.y+=e.speed*dt;e.distance=(e.distance||0)+e.speed*dt;
 if(e.role==='regen')e.hp=Math.min(e.maxHp,e.hp+dt*.8);
 if(e.recover>0){e.recover=Math.max(0,e.recover-dt);e.attackElapsed=(e.attackElapsed||0)+dt;}
 e.shoot-=dt;
 if(['caster','healer'].includes(e.role)&&e.shoot<=.28&&e.y>60&&!e.lock){e.lock={x:b.x,y:b.mode==='defense'?600:640,targets:[b.x]};e.attackElapsed=0;}
 if(e.lock){e.attackElapsed+=dt;e.warning=e.role==='caster';
  if(e.shoot<=0){
   if(e.role==='caster'){const len=Math.max(1,Math.hypot(e.lock.x-e.x,e.lock.y-e.y));b.enemyBullets.push({x:e.x,y:e.y,vx:(e.lock.x-e.x)/len*140,vy:(e.lock.y-e.y)/len*140});}
   else for(const n of b.entities)if(n.kind==='enemy'&&!n.dead&&Math.hypot(n.x-e.x,n.y-e.y)<110)n.hp=Math.min(n.maxHp,n.hp+3);
   e.lock=null;e.warning=false;e.recover=.24;e.shoot=3.5;
  }
 }
 if(e.y>820)e.dead=true;
}
export function stepChoice(b,dt,input=0){
 if(b.layoutVersion<6)return legacyStep(b,dt,input);if(b.layoutVersion===6)return stepSix(b,dt,input);
 if(b.status!=='playing'||b.offers)return;
 dt=clamp(dt,0,1/30);b.time+=dt;b.shake=Math.max(0,b.shake-dt);b.hurtCooldown=Math.max(0,b.hurtCooldown-dt);b.burstTime=Math.max(0,b.burstTime-dt);
 if(b.mode==='defense'){b.x=b.targetX=240;wave(b,dt);if(b.offers||b.status!=='playing')return;}
 else{
  const half=(Math.min(8,b.count)-1)*13;
  if(input)b.targetX+=input*330*dt;b.targetX=clamp(b.targetX,42+half,438-half);b.x+=clamp(b.targetX-b.x,-400*dt,400*dt);
  const plan=choicePlan(b.stage);while(b.cursor<plan.events.length&&plan.events[b.cursor].time<=b.time)add(b,plan.events[b.cursor++]);
 }
 b.fire-=dt;if(b.fire<=0){fire(b);b.fire+=choiceInterval(b);}
 for(const e of [...b.entities]){
  if(b.status!=='playing')break;if(e.dead)continue;e.age+=dt;e.flash=Math.max(0,(e.flash||0)-dt);
  if(e.kind==='gates'){
   e.y+=96*dt;const front=members(b)[0]?.y||640;
   if(!e.hit&&e.y>=front-8){
    const index=clamp(Math.floor((b.x-42)/396*e.choices.length),0,e.choices.length-1),g=e.choices[index];
    if(g.upgrade){if(!applyGrowth(b,g.upgrade)){b.shield=Math.min(80,b.shield+6);notice(b,'此项已满阶 · 转化护盾 +6');}}
    else{const old=b.count;b.count=Math.min(48,g.op==='×'?b.count*g.value:b.count+g.value);b.peak=Math.max(b.peak,b.count);notice(b,(g.op+g.value)+' · '+old+' → '+b.count);}
    charge(b,22);feedback(b,b.x,front,'#f4dc9c',8);b.passed++;e.hit=true;b.gateHistory.push({index:e.gateIndex,choice:index});
   }continue;
  }
  if(e.kind==='supply'){e.y+=e.speed*dt;if(members(b).some(m=>Math.hypot(m.x-e.x,m.y-e.y)<35))collect(b,e);if(e.y>820)e.dead=true;continue;}
  e.kind==='boss'?bossStep(b,e,dt):enemyStep(b,e,dt);
 }
 for(const p of b.bullets){
  if(b.status!=='playing')break;p.age+=dt;if(p.age<p.delay)continue;
  const target=p.target&&b.entities.find(e=>e.id===p.target&&!e.dead);
  if(target){const len=Math.max(1,Math.hypot(target.x-p.x,target.y-p.y));p.vx=(target.x-p.x)/len*660;p.vy=(target.y-p.y)/len*660;}
  p.oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.distance+=660*dt;
  for(const e of b.entities){if(p.dead||e.dead||!e.hp||e.y<0||p.hits.includes(e.id))continue;const r=e.kind==='boss'?48:23;
   if(Math.hypot(p.x-e.x,p.y-e.y)<r){p.hits.push(e.id);hit(b,e,p.damage);
    for(const id of ['chain','blast'])if(b.growth[id]){const near=b.entities.filter(n=>n!==e&&!n.dead&&n.hp>0&&Math.hypot(n.x-e.x,n.y-e.y)<(id==='chain'?115:55+b.growth.blast*10));
     for(const n of near.slice(0,id==='chain'?b.growth.chain:8)){hit(b,n,p.damage*(id==='chain'?.35:.3),true);b.effects.push({kind:'arc',x:e.x,y:e.y,toX:n.x,toY:n.y,life:.12,color:id==='chain'?'#a5e3ff':'#ffd18f'});}
    }if(p.pierce>0){p.pierce--;p.target=null;p.vx=0;p.vy=-660;}else p.dead=true;
   }
  }if(p.distance>p.maxRange)p.dead=true;
 }
 for(const p of b.enemyBullets){
  if(b.status!=='playing')break;p.x+=p.vx*dt;p.y+=p.vy*dt;
  if(b.mode==='defense'?p.y>600:members(b).some(m=>Math.hypot(m.x-p.x,m.y-p.y)<14)){p.dead=true;harm(b,4);}
 }
 b.entities=b.entities.filter(e=>!e.dead&&e.y<860);b.bullets=b.bullets.filter(p=>!p.dead&&p.y>-40&&p.x>0&&p.x<480);b.enemyBullets=b.enemyBullets.filter(p=>!p.dead&&p.y<820&&p.x>0&&p.x<480).slice(-160);
 b.effects=b.effects.filter(p=>{p.life-=dt;if(p.kind==='spark'){p.x+=p.vx*dt;p.y+=p.vy*dt;}return p.life>0;}).slice(-100);b.notices=b.notices.filter(p=>(p.life-=dt)>0);
 if(b.mode!=='defense'&&b.status==='playing'&&b.bossKilled&&b.passed===gateCount(b.stage))b.status='won';
}
