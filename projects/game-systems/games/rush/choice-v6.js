// Version 6 is isolated from saved version 1–5 battles and their event plans.
import {STAGES,MAX_SQUAD,clamp} from './data.js';
import {createBattle as legacyBattle,step as legacyStep,members,castDelay,notice} from './battle.js';
export const SWORDS=['凡铁剑','青锋剑','灵纹剑','玄霜剑','天罡剑','诛仙剑'];
export const ARTS=['御剑诀','疾风诀','分光诀','穿云诀','万剑诀','归一诀'];
export const REALMS=['凡修','筑基','金丹','元婴','飞升'];
export const COLORS=['#b3dacf','#6dcac1','#8dbeff','#d3a4fa','#ffe09b'];
export const BOSSES=[
 ['骨灯将军','skeleton_captain','fan'],['赤牙酋长','orc_warrior','charge'],['幽林妖后','vampire','summon'],
 ['荆棘甲王','knight_black','shield'],['缚魂巫师','mage','aim'],['古树石灵','rock_golem','quake'],
 ['矿井幽将','ghost_warrior','fan'],['熔火术士','mage_red','aim'],['晶甲守卫','guard_mid','shield'],
 ['双咒魔导师','mage_low','summon'],['碎岩暴君','rock_golem','charge'],['地火幼龙','dragon','quake'],
 ['城门黑骑','knight_black','charge'],['钟楼血伯','vampire','fan'],['白骨大祭司','skeleton_elite','summon'],
 ['牢狱镇魂使','ghost_warrior','shield'],['苍焰魔龙','dragon','aim'],['天劫魔君','skeleton_captain','storm']
].map(([name,type,skill],i)=>({name,type,skill,tint:['#89d3b0','#eaa068','#ac99ed','#87c5e1','#e4ba76','#e58493'][i%6],crown:i>=6?2:1}));
export const ENEMIES=[
 {name:'骨卒',type:'skeleton',hp:9,speed:66,damage:6,role:'walk'},
 {name:'疾行鬼',type:'ghost_warrior',hp:6,speed:100,damage:5,role:'dash'},
 {name:'铁甲卫',type:'guard_mid',hp:22,speed:44,damage:9,role:'armor'},
 {name:'赤咒师',type:'mage_red',hp:12,speed:48,damage:5,role:'caster'},
 {name:'再生妖',type:'vampire',hp:17,speed:58,damage:7,role:'regen'},
 {name:'裂骨怪',type:'skeleton_elite',hp:16,speed:55,damage:7,role:'split'},
 {name:'冲阵兽',type:'orc_warrior',hp:28,speed:73,damage:12,role:'brute'},
 {name:'护魂巫',type:'mage_low',hp:16,speed:43,damage:5,role:'healer'}
];
export const GROWTH={
 sword:{name:'飞剑升阶',desc:'飞剑伤害 +30%；三阶起额外穿透',color:'#64b6bf',max:5},
 art:{name:'剑诀升阶',desc:'射速 +12%；三阶起自动追踪',color:'#ada0e1',max:5},
 realm:{name:'全队飞升',desc:'全队伤害 +35%、护盾 +8，改变形态',color:'#dab167',max:4},
 haste:{name:'疾风符',desc:'射速 +15%',color:'#71a8c5',max:5},
 damage:{name:'破军符',desc:'伤害 +20%',color:'#d38d72',max:5},
 range:{name:'远游符',desc:'飞剑射程 +60',color:'#88b29a',max:4},
 chain:{name:'雷鸣诀',desc:'命中额外连锁目标，伤害 35%',color:'#8ca7e0',max:3},
 blast:{name:'赤炎诀',desc:'命中爆炸，邻近魔物受到 30% 伤害',color:'#d98b63',max:3},
 shield:{name:'护身符',desc:'护盾 +12，抵挡漏怪或弹幕伤害',color:'#7bbcab'},
 recruit:{name:'召集伙伴',desc:'队伍 +6 人，最多 48 人',color:'#8dc6a1'},
 heal:{name:'修复灵阵',desc:'守点灵阵恢复 25，最高 100',color:'#9db779'}
};
export const gateCount=stage=>stage<=2?4:stage+3;
export function choicePlan(stage){
 const events=[],count=gateCount(stage),gap=stage<=2?8:5.2;
 for(let i=0;i<count;i++){
  const special=['sword','art','realm','haste','damage','chain','blast','range'][(i+stage-3+8)%8];
  const choices=i===0?[{op:'+',value:5},{op:'×',value:2}]:[{op:'+',value:4+i%5},{upgrade:special}];
  // Mix wider two-way gates into later stages without changing event times or save cursors.
  if(stage>=3&&(i+stage)%3!==1){let third=i===0?{upgrade:'sword'}:i%3===0?{op:'×',value:2}:{upgrade:['recruit','shield','sword','art','realm'][i%5]};
   if(choices.some(g=>JSON.stringify(g)===JSON.stringify(third)))third={upgrade:['realm','sword','art','chain','blast'].find(id=>!choices.some(g=>g.upgrade===id))};choices.push(third);}
  if(i%2)choices.reverse();
  events.push({time:i*gap,kind:'gates',x:240,choices,gateIndex:i});
  if(i>0)for(let j=0;j<3+Math.floor(stage/4);j++)events.push({time:i*gap+2+j*.28,kind:'enemy',x:100+(j*91+i*47)%280,enemy:(i+j)%Math.min(8,2+Math.floor(stage/2))});
 }
 const bossTime=(count-1)*gap+8;
 events.push({time:bossTime,kind:'boss',x:240});
 return {events:events.sort((a,b)=>a.time-b.time),duration:bossTime+45,count};
}
export function createChoiceBattle(stage,upgrades={},id,mode='campaign'){
 const b=legacyBattle(stage,upgrades,id);Object.assign(b,{layoutVersion:6,mode,growth:{sword:0,art:0,realm:0,haste:0,damage:0,range:0,chain:0,blast:0},shield:0,core:100,wave:1,offers:null,choiceHistory:[],learned:{},waveClock:0,waveSpawned:0,aimLane:1});
 if(mode==='defense'){b.count=6+(upgrades.recruits||0);b.peak=b.count;b.shield=12;}
 return b;
}
export const choiceDamage=b=>Math.round(3*(1+b.power*.22)*(1+b.growth.sword*.30)*(1+b.growth.realm*.35)*(1+b.growth.damage*.20));
export const choiceInterval=b=>Math.max(.14,.58/(1+b.speed*.1+b.growth.art*.12+b.growth.haste*.15));
export const choiceRange=b=>440+b.growth.range*60;
export function choiceLabel(g){return g.upgrade?GROWTH[g.upgrade].name:g.op+g.value;}
export function applyGrowth(b,id){
 const c=GROWTH[id];if(!c)return false;
 if(c.max&&b.growth[id]>=c.max)return false;
 if(id==='recruit')b.count=Math.min(MAX_SQUAD,b.count+6);
 else if(id==='shield')b.shield=Math.min(80,b.shield+12);
 else if(id==='heal')b.core=Math.min(100,b.core+25);
 else {b.growth[id]++;if(id==='realm')b.shield=Math.min(80,b.shield+8);}
 b.weapon=b.growth.sword;b.peak=Math.max(b.peak,b.count);
 notice(b,id==='realm'?`全队 ${REALMS[b.growth.realm]}！属性与形态提升`:id==='sword'?SWORDS[b.growth.sword]:id==='art'?ARTS[b.growth.art]:c.name);
 return true;
}
export function defenseOffers(b){
 const eligible=Object.keys(GROWTH).filter(id=>!(GROWTH[id].max&&b.growth[id]>=GROWTH[id].max)&&!(id==='recruit'&&b.count>=48)&&!(id==='shield'&&b.shield>=80)&&!(id==='heal'&&b.core>=100));
 let seed=(b.wave*2654435761+b.kills*97)>>>0;
 for(let i=eligible.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
 return eligible.slice(0,4);
}
export function selectOffer(b,id){
 if(!b.offers?.includes(id)||!applyGrowth(b,id))return false;
 b.choiceHistory.push({wave:b.wave,upgrade:id});b.offers=null;b.wave++;b.waveClock=0;b.waveSpawned=0;b.bossSpawned=false;b.bossKilled=false;b.enemyBullets=[];
 return true;
}
function add(b,event){
 const e={...event,id:++b.serial,y:-45,age:0,shoot:3,hit:false};
 if(e.kind==='gates')e.choices=e.choices.map(g=>({...g}));
 if(e.kind==='enemy'){
  const d=ENEMIES[e.enemy||0],scale=b.mode==='defense'?1+(b.wave-1)*.12:1+(b.stage-1)*.07;
  Object.assign(e,d,{hp:Math.round(d.hp*scale),maxHp:Math.round(d.hp*scale)});
  if(!b.learned[d.role]){b.learned[d.role]=true;notice(b,d.name+'：'+({walk:'基础魔物',dash:'移动更快，优先击破',armor:'正面减伤，成长后击破',caster:'预警后发射弹幕',regen:'缓慢恢复生命',split:'击破后分成两只骨卒',brute:'漏过时伤害较高',healer:'治疗附近魔物'})[d.role]);}
 }
 if(e.kind==='boss'){
  const index=b.mode==='defense'?Math.min(17,Math.floor(b.wave/5)*3-1):b.stage-1,d=BOSSES[index];
  const hp=b.mode==='defense'?250+b.wave*65:100+b.stage*34+gateCount(b.stage)*16;
  Object.assign(e,d,{hp,maxHp:hp,speed:44,damage:25});b.bossSpawned=true;notice(b,d.name+' · '+({fan:'扇形弹幕',charge:'冲锋后返回',summon:'召唤增援',shield:'周期护甲',aim:'锁定点射',quake:'震地落石',storm:'天劫弹阵'})[d.skill]);
 }
 b.entities.push(e);
}
function harm(b,amount){
 const blocked=Math.min(b.shield,amount);b.shield-=blocked;amount-=blocked;if(!amount)return;
 if(b.mode==='defense'){b.core=Math.max(0,b.core-amount);if(!b.core){b.status='lost';b.failureReason='core';}}
 else{b.count=Math.max(0,b.count-Math.max(1,Math.ceil(amount/6)));if(!b.count){b.status='lost';b.failureReason='squad';}}
 b.shake=.16;
}
function hit(b,e,damage,splash=false){
 if(e.dead||e.hp<=0)return;
 if(e.role==='armor'||(e.kind==='boss'&&e.skill==='shield'&&Math.floor(e.age)%6<2))damage*=.65;
 e.hp=Math.max(0,e.hp-Math.max(1,Math.round(damage)));e.flash=.10;
 if(!e.hp){e.dead=true;b.kills++;if(e.kind==='boss'){b.bossKilled=true;notice(b,e.name+' 已击破');}
  if(e.role==='split'&&!splash)for(const dx of [-18,18]){add(b,{kind:'enemy',enemy:0,x:clamp(e.x+dx,60,420)});const child=b.entities.at(-1);child.y=e.y;child.hp=child.maxHp=Math.max(3,Math.round(e.maxHp*.22));}
 }
}
function fire(b){
 b.lastCast=b.time;
 for(const m of members(b)){
  if(b.bullets.length>=240)break;
  const targets=b.entities.filter(e=>!e.dead&&e.hp>0&&e.y>0&&e.y<m.y);
  targets.sort((a,c)=>b.mode==='defense'?((Math.abs(a.x-[110,240,370][b.aimLane])<90?-60:0)-a.y)-((Math.abs(c.x-[110,240,370][b.aimLane])<90?-60:0)-c.y):Math.abs(a.x-m.x)-Math.abs(c.x-m.x));
  const aim=(b.mode==='defense'||b.growth.art>=2)?targets[Math.floor(m.index/3)%Math.max(1,Math.min(targets.length,Math.ceil(b.count/3)))]:null,dx=aim?aim.x-m.x:0,dy=aim?aim.y-m.y:-400,len=Math.hypot(dx,dy);
  b.bullets.push({x:m.x,y:m.y-20,oldY:m.y-20,target:aim?.id||null,vx:dx/len*660,vy:dy/len*660,age:0,delay:castDelay(m.index),phase:'flight',distance:0,maxRange:choiceRange(b),damage:choiceDamage(b),pierce:b.growth.sword>=2?1+Math.floor(b.growth.sword/3):0,hits:[],weaponType:'sword'});b.shots++;
 }
}
function wave(b,dt){
 b.waveClock+=dt;const total=7+b.wave*2,interval=Math.max(.20,.62-b.wave*.012);
 if(b.waveSpawned<total&&b.waveClock>=b.waveSpawned*interval){const n=b.waveSpawned++;add(b,{kind:'enemy',enemy:(n+b.wave)%Math.min(8,2+Math.floor(b.wave/3)),x:80+(n*107+b.wave*31)%320});}
 if(b.wave%5===0&&b.waveSpawned>=total&&!b.bossSpawned)add(b,{kind:'boss',x:240});
 if(b.waveSpawned>=total&&!b.entities.some(e=>!e.dead&&['enemy','boss'].includes(e.kind))){
  b.enemyBullets=[];
  if(b.core>0){b.core=Math.min(100,b.core+8);b.shield=Math.min(80,b.shield+4);}
  if(b.wave>=30)b.status='won';else {b.offers=defenseOffers(b);if(!b.offers.length){b.wave++;b.waveClock=0;b.waveSpawned=0;b.bossSpawned=false;}notice(b,'第 '+b.wave+' 波守住了 · 选择一道机缘');}
 }
}
export function stepChoice(b,dt,input=0){
 if(b.layoutVersion<6)return legacyStep(b,dt,input);
 if(b.status!=='playing'||b.offers)return;
 dt=clamp(dt,0,1/30);b.time+=dt;b.shake=Math.max(0,b.shake-dt);
 if(b.mode==='defense'){b.x=b.targetX=240;wave(b,dt);if(b.offers||b.status!=='playing')return;}
 else{
  const half=(Math.min(8,b.count)-1)*13;
  if(input)b.targetX+=input*330*dt;b.targetX=clamp(b.targetX,42+half,438-half);b.x+=clamp(b.targetX-b.x,-400*dt,400*dt);
  const plan=choicePlan(b.stage);while(b.cursor<plan.events.length&&plan.events[b.cursor].time<=b.time)add(b,plan.events[b.cursor++]);
 }
 b.fire-=dt;if(b.fire<=0){fire(b);b.fire+=choiceInterval(b);}
 for(const e of [...b.entities]){
  if(e.dead)continue;e.age+=dt;e.flash=Math.max(0,(e.flash||0)-dt);
  if(e.kind==='gates'){
   e.y+=96*dt;const front=members(b)[0]?.y||640;
   if(!e.hit&&e.y>=front-8){
    const index=clamp(Math.floor((b.x-42)/396*e.choices.length),0,e.choices.length-1),g=e.choices[index];
    if(g.upgrade){if(!applyGrowth(b,g.upgrade)){b.shield=Math.min(80,b.shield+6);notice(b,'此项已满阶 · 转化护盾 +6');}}
    else {const old=b.count;b.count=Math.min(48,g.op==='×'?b.count*g.value:b.count+g.value);b.peak=Math.max(b.peak,b.count);notice(b,choiceLabel(g)+' · '+old+' → '+b.count);}
    b.passed++;e.hit=true;b.gateHistory.push({index:e.gateIndex,choice:index});
   }
   continue;
  }
  if(e.kind==='boss'){
   e.y=Math.min(230,e.y+44*dt);e.x=240+Math.sin(e.age*.6)*(60+b.stage*2);
   if(e.dashTime>0){e.dashTime=Math.max(0,e.dashTime-dt);e.x=e.aimX;e.y=230+Math.sin((1-e.dashTime/1.8)*Math.PI)*250;}
   e.shoot-=dt;e.warning=e.shoot<.8;
   if(e.shoot<=0&&e.y>80){
    if(e.skill==='summon')for(const x of [140,340]){add(b,{kind:'enemy',enemy:Math.floor(e.age)%4,x});b.entities.at(-1).y=e.y+40;}
    const offsets=e.skill==='fan'||e.skill==='storm'?[-130,-65,0,65,130]:e.skill==='quake'?[-100,100]:[0];
    for(const dx of offsets){const tx=clamp(b.x+dx,45,435),len=Math.hypot(tx-e.x,650-e.y),v=e.skill==='charge'?210:125;b.enemyBullets.push({x:e.x,y:e.y,vx:(tx-e.x)/len*v,vy:(650-e.y)/len*v});}
    if(e.skill==='charge'){e.dashTime=1.8;e.aimX=b.x;}
    e.shoot=b.mode==='defense'?3.8:4.5;
   }
  }else{
   e.y+=e.speed*dt;
   if(e.role==='regen')e.hp=Math.min(e.maxHp,e.hp+dt*.8);
   e.shoot-=dt;
   if(e.shoot<0&&e.y>60){
    if(e.role==='caster')b.enemyBullets.push({x:e.x,y:e.y,vx:(b.x-e.x)*.18,vy:140});
    if(e.role==='healer')for(const n of b.entities)if(n.kind==='enemy'&&!n.dead&&Math.hypot(n.x-e.x,n.y-e.y)<110)n.hp=Math.min(n.maxHp,n.hp+3);
    e.shoot=3.5;
   }
   if(b.mode==='defense'?e.y>600:members(b).some(m=>Math.hypot(m.x-e.x,m.y-e.y)<25)){e.dead=true;harm(b,e.damage);}
   if(e.y>800)e.dead=true;
  }
 }
 for(const p of b.bullets){
  p.age+=dt;if(p.age<p.delay)continue;
  const target=p.target&&b.entities.find(e=>e.id===p.target&&!e.dead);
  if(target){const len=Math.max(1,Math.hypot(target.x-p.x,target.y-p.y));p.vx=(target.x-p.x)/len*660;p.vy=(target.y-p.y)/len*660;}
  p.oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.distance+=660*dt;
  for(const e of b.entities){if(p.dead||e.dead||!e.hp||e.y<0||p.hits.includes(e.id))continue;const r=e.kind==='boss'?48:23;
   if(Math.hypot(p.x-e.x,p.y-e.y)<r){p.hits.push(e.id);hit(b,e,p.damage);
    for(const id of ['chain','blast'])if(b.growth[id]){const near=b.entities.filter(n=>n!==e&&!n.dead&&n.hp>0&&Math.hypot(n.x-e.x,n.y-e.y)<(id==='chain'?115:55+b.growth.blast*10));
     for(const n of near.slice(0,id==='chain'?b.growth.chain:8)){hit(b,n,p.damage*(id==='chain'?.35:.3),true);b.effects.push({kind:'arc',x:e.x,y:e.y,toX:n.x,toY:n.y,life:.12,color:id==='chain'?'#a5e3ff':'#ffd18f'});}
    }
    if(p.pierce>0){p.pierce--;p.target=null;p.vx=0;p.vy=-660;}else p.dead=true;
   }
  }
  if(p.distance>p.maxRange)p.dead=true;
 }
 for(const p of b.enemyBullets){p.x+=p.vx*dt;p.y+=p.vy*dt;if(b.mode==='defense'?p.y>600:members(b).some(m=>Math.hypot(m.x-p.x,m.y-p.y)<14)){p.dead=true;harm(b,4);}}
 b.entities=b.entities.filter(e=>!e.dead&&e.y<860);b.bullets=b.bullets.filter(p=>!p.dead&&p.y>-40&&p.x>0&&p.x<480);b.enemyBullets=b.enemyBullets.filter(p=>!p.dead&&p.y<820&&p.x>0&&p.x<480);
 b.effects=b.effects.filter(p=>(p.life-=dt)>0).slice(-100);b.notices=b.notices.filter(p=>(p.life-=dt)>0);
 if(b.mode!=='defense'&&b.status==='playing'&&b.bossKilled&&b.passed===gateCount(b.stage))b.status='won';
}
