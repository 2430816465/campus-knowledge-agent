import {W,H,MAX_SQUAD,STAGES,CRATE_STAGES,cratePlan,PREVIOUS_STAGES,previousPlan,plan,legacyPlan,gateLabel,WEAPONS,MISTAKE_RESISTANCE,clamp} from './data.js';
const PLANS=STAGES.map(s=>plan(s.id));
const CRATE_PLANS=CRATE_STAGES.map(s=>cratePlan(s.id));
const PREVIOUS_PLANS=PREVIOUS_STAGES.map(s=>previousPlan(s.id));
const LEGACY_PLANS=STAGES.map(s=>legacyPlan(s.id));
export const COLUMN_GAP=26,ROW_GAP=34;
export function members(b){if(!b.count)return [];const cols=Math.min(8,b.count),rows=Math.ceil(b.count/cols),front=Math.min(640,770-(rows-1)*ROW_GAP);return Array.from({length:b.count},(_,i)=>({index:i,leader:i===Math.floor(cols/2),x:b.x+((i%cols)-(Math.min(cols,b.count-Math.floor(i/cols)*cols)-1)/2)*COLUMN_GAP,y:front+Math.floor(i/cols)*ROW_GAP}));}
export const castDelay=i=>(i%8)*.009+Math.floor(i/8)*.024;
export const fireInterval=b=>.52/((1+b.speed*.10)*(1+(b.modifiers?.haste||0)*.20));
export const shotRange=b=>b.layoutVersion>=3?450*(1+(b.modifiers?.range||0)*.20):Infinity;
export function createBattle(stage,upgrades={},id='rush-'+Date.now()){
 return {id,stage,layoutVersion:5,mistakes:0,gateHistory:[],failureReason:null,weaponType:'sword',modifiers:{haste:0,range:0,damage:0},crates:0,trapLoss:0,status:'playing',time:0,x:240,targetX:240,count:3+(upgrades.recruits||0),peak:3+(upgrades.recruits||0),weapon:0,power:upgrades.power||0,speed:upgrades.speed||0,kills:0,rescued:0,passed:0,shots:0,cursor:0,entities:[],bullets:[],enemyBullets:[],effects:[],notices:[],clock:0,fire:0,lastCast:-1,invulnerable:0,serial:0,bossSpawned:false,bossKilled:false,shake:0};
}
// 每关单独计算，旧战斗没有封印要求；所有伤害入口都通过此规则。
export function bossSeal(b){
 if(b.layoutVersion<4||!b.layoutVersion||b.stage<3)return 'inactive';
 if(b.layoutVersion<5&&b.mistakes>STAGES[b.stage-1].mistakeLimit)return 'broken';
 return b.passed<STAGES[b.stage-1].gates.length?'pending':'open';
}
export const bossDamageScale=b=>b.layoutVersion>=4&&b.stage>=3?Math.max(.76,1-(b.mistakes||0)*MISTAKE_RESISTANCE):1;
export function gateValue(count,op,value){const result=op==='×'?count*value:op==='÷'?(value>0?Math.floor(count/value):0):op==='−'||op==='-'?count-value:count+value;return clamp(result,0,MAX_SQUAD);}
export function notice(b,text,color='#ffdf95'){b.notices.push({text,color,life:2.2});if(b.notices.length>3)b.notices.shift();}
function particles(b,x,y,color,n=7){for(let i=0;i<n;i++){const angle=i*2.4;b.effects.push({x,y,vx:Math.cos(angle)*45,vy:Math.sin(angle)*45,life:.45,color});}if(b.effects.length>180)b.effects.splice(0,b.effects.length-180);}
export function spawn(b,event){const base={...event,id:++b.serial,y:-60,age:0,hit:false};delete base.time;
 if(event.kind==='gates')b.entities.push({...base,left:{...event.left,hits:0},right:{...event.right,hits:0}});
 else b.entities.push({...base,maxHp:event.hp||0,shoot:1.7});
 if(b.layoutVersion>=3&&event.kind==='chest'){b.learned??={};if(!b.learned[event.loot]){b.learned[event.loot]=true;const text=event.loot==='trap'?'红色爆裂箱：击破或撞上会减员，绕开它！':event.loot==='army'?'蓝色集结箱：击破即可召集 '+event.amount+' 位伙伴！':event.loot==='lightning'?'雷符箱：击破换装，命中会连锁魔物！':event.loot==='flame'?'炎符箱：击破换装，命中会灼伤周围魔物！':'补给箱：击破立即获得奖励！';notice(b,text);b.notices.at(-1).life=4;}}
 if(event.kind==='boss'){b.bossSpawned=true;notice(b,STAGES[b.stage-1].boss?'封印守卫出现！':'前方有魔物首领！','#ffa18b');}
}
function lose(b,amount,x,y){const n=Math.min(b.count,amount);b.count-=n;b.shake=.2;notice(b,'队员 −'+n,'#ffaaa0');particles(b,x,y,'#ff9477');if(b.count<=0){b.status='lost';b.failureReason='squad';}}
function grantCrate(b,e){
 if(e.hit)return;e.hit=true;e.dead=true;b.crates=(b.crates||0)+1;
 if(e.loot==='trap'){const n=Math.min(b.count,e.amount||4);b.trapLoss=(b.trapLoss||0)+n;lose(b,n,e.x,e.y);notice(b,'爆裂箱 · 队员 −'+n,'#ffaaa0');return;}
 if(['weapon','lightning','flame'].includes(e.loot)){
  if(e.loot!=='weapon')b.weaponType=e.loot;
  b.weapon=Math.min(3,b.weapon+1);notice(b,WEAPONS[b.weaponType||'sword']+' · 剑诀 '+(b.weapon+1)+' 阶'+(e.loot==='weapon'&&b.weapon===2?' · 穿透解锁':''));
 }else{const n=Math.min(e.amount||5,MAX_SQUAD-b.count);b.count+=n;b.rescued+=n;b.peak=Math.max(b.peak,b.count);notice(b,n?'伙伴 +'+n:'小队已满编');}
 particles(b,e.x,e.y,'#9bf1cf',12);
}
function hitEnemy(b,e,damage){if(e.dead||e.hp<=0)return;if(e.kind==='boss'){if(['broken','pending'].includes(bossSeal(b)))return;damage*=bossDamageScale(b);}e.hp-=damage;particles(b,e.x,e.y,'#f9d179',3);if(e.hp>0)return;
 e.dead=true;if(e.kind==='chest'){e.hp=0;if(e.delivery==='break')grantCrate(b,e);else{e.open=true;e.dead=false;notice(b,e.loot==='rescue'?'牢笼已破，接上伙伴！':'剑匣已打开，移动拾取！');}}
 else{b.kills++;if(e.kind==='boss'){b.bossKilled=true;notice(b,'道路打通！','#b5ffca');}particles(b,e.x,e.y,'#ffe6a8',10);}
}
// 符法仅波及魔物，不误伤补给或引爆危险箱；每枚符只触发一次。
function runeHit(b,p,e){
 if(!['enemy','boss'].includes(e.kind)||!['lightning','flame'].includes(p.weaponType))return;
 const radius=p.weaponType==='lightning'?95:60;
 const nearby=b.entities.filter(n=>n!==e&&!n.dead&&n.hp>0&&['enemy','boss'].includes(n.kind)&&n.y>0&&Math.hypot(n.x-e.x,n.y-e.y)<=radius).sort((a,c)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(c.x-e.x,c.y-e.y));
 if(p.weaponType==='lightning')for(const n of nearby.slice(0,2)){b.effects.push({kind:'arc',x:e.x,y:e.y,toX:n.x,toY:n.y,life:.18,color:'#a7efff'});hitEnemy(b,n,p.damage*.45);}
 else{b.effects.push({kind:'blast',x:e.x,y:e.y,radius,life:.25,color:'#ffbc73'});for(const n of nearby)hitEnemy(b,n,p.damage*.55);}
}
function shoot(b){b.lastCast=b.time;for(const m of members(b)){if(b.bullets.length>=240)break;b.bullets.push({x:m.x+10,y:m.y-3,oldY:m.y-3,originX:m.x+10,originY:m.y-3,laneX:m.x,owner:m.index,age:0,delay:castDelay(m.index),phase:'summon',weaponType:b.weaponType||'sword',maxRange:b.layoutVersion>=3?shotRange(b):null,distance:0,damage:(1+b.power*.22)*(1+b.weapon*.3)*(1+(b.modifiers?.damage||0)*.25),pierce:b.weapon>=2&&(!b.weaponType||b.weaponType==='sword')?1:0,hits:[]});b.shots++;}}
function collisions(b,e){
 if(e.kind==='gates'){
  if(!e.hit&&e.y>=(members(b)[0]?.y||640)-8){const side=b.x<(e.split||240)?'left':'right',g=e[side];const old=b.count;e.before=old;if(g.effect){b.modifiers??={haste:0,range:0,damage:0};const before=b.modifiers[g.effect]||0;b.modifiers[g.effect]=Math.min(3,before+g.value);notice(b,gateLabel(g)+(before===3?' · 已达上限':''),'#baffc9');}else b.count=gateValue(b.count,g.op,g.value);b.peak=Math.max(b.peak,b.count);b.passed++;e.hit=true;e.selectedSide=side;if(!g.effect)notice(b,`${gateLabel(g)} · ${old} → ${b.count}${b.count===MAX_SQUAD?'（满编）':''}`,b.count>=old?'#baffc9':'#ffaaa0');if(b.layoutVersion>=4&&e.correctSide){const other=e[side==='left'?'right':'left'];const wrong=b.layoutVersion>=5?(!g.effect&&!other.effect&&b.count<gateValue(old,other.op,other.value)):side!==e.correctSide;b.mistakes+=Number(wrong);b.gateHistory.push({index:e.gateIndex,side,correctSide:e.correctSide,wrong});if(wrong&&b.layoutVersion>=5)notice(b,'选门损失 · 首领抗性 '+Math.round((1-bossDamageScale(b))*100)+'%，仍可用补给和升级击败','#ffb99e');else if(wrong)notice(b,bossSeal(b)==='broken'?'选门失误 · 已超容错，首领封印无法破除':'选门失误 '+b.mistakes+' / '+STAGES[b.stage-1].mistakeLimit+' · 首领抗性 +'+Math.round(b.mistakes*MISTAKE_RESISTANCE*100)+'%','#ffb99e');else notice(b,'破阵符印已接通 · '+b.passed+' / '+STAGES[b.stage-1].gates.length,'#ffe6a0');if(bossSeal(b)==='open'&&b.passed===STAGES[b.stage-1].gates.length)notice(b,'符印齐备 · 首领封印已解除','#ffe6a0');}particles(b,b.x,e.y,'#b7f7e0',14);if(!b.count){b.status='lost';b.failureReason='squad';}}return;
 }
 const contacts=members(b).filter(m=>Math.hypot(m.x-e.x,m.y-e.y)<(e.radius||(e.kind==='boss'?45:e.kind==='chest'?30:21))+10);
 if(e.kind==='chest'&&contacts.length&&!e.hit){if(e.delivery==='break'){if(e.loot==='trap')grantCrate(b,e);else{e.hit=true;e.dead=true;notice(b,'补给未击破，错过奖励','#e6bb99');}return;}e.hit=true;if(e.open){if(e.loot==='weapon'){b.weapon=Math.min(3,b.weapon+1);notice(b,'剑诀强化 '+b.weapon+(b.weapon===2?' · 穿透解锁':''));}else{const n=Math.min(5,MAX_SQUAD-b.count);b.count+=n;b.rescued+=n;notice(b,'救援队员 +'+n);b.peak=Math.max(b.peak,b.count);}particles(b,e.x,e.y,'#9bf1cf',12);}else notice(b,'剑匣未打开，错过拾取','#e6bb99');e.dead=true;}
 if(e.kind==='rock'&&contacts.length&&!e.hit){e.hit=true;lose(b,contacts.length,e.x,e.y);}
 if(['enemy','boss'].includes(e.kind)&&contacts.length&&!e.hit){e.hit=true;lose(b,Math.min(contacts.length,e.damage),e.x,e.y);e.dead=true;if(e.kind==='boss'){b.status='lost';b.failureReason=bossSeal(b)==='broken'?'seal':'boss';}}
 if(e.kind==='boss'&&e.y>760&&!e.dead){b.status='lost';b.failureReason=bossSeal(b)==='broken'?'seal':'boss';}
}
export function step(b,dt,input=0){
 if(b.status!=='playing')return;
 dt=clamp(dt,0,1/30);b.time+=dt;b.clock+=dt;b.shake=Math.max(0,b.shake-dt);
 const half=(Math.min(8,b.count)-1)*COLUMN_GAP/2;
 if(input)b.targetX+=input*330*dt;b.targetX=clamp(b.targetX,42+half,W-42-half);b.x+=clamp(b.targetX-b.x,-400*dt,400*dt);
 const modern=b.layoutVersion>=2,s=(b.layoutVersion===2?PREVIOUS_STAGES:b.layoutVersion===3?CRATE_STAGES:STAGES)[b.stage-1],events=(b.layoutVersion>=4?PLANS:b.layoutVersion===3?CRATE_PLANS:b.layoutVersion===2?PREVIOUS_PLANS:LEGACY_PLANS)[b.stage-1];while(b.cursor<events.length&&events[b.cursor].time<=b.time)spawn(b,events[b.cursor++]);
 b.fire-=dt;if(b.fire<=0){shoot(b);b.fire+=fireInterval(b);}
 for(const e of b.entities){
  e.age+=dt;
  const speed=e.kind==='boss'?(modern?43+b.stage*.45:43):(modern?s.pace:92+s.chapter*7);
  e.y+=speed*dt;
  if(e.kind==='gates')e.split=modern?(e.baseSplit||240)+Math.sin(e.age*.8)*(e.drift||0):240+(b.stage>=7&&e.left.op==='×'?Math.sin(e.age*.8)*40:0);
  if(modern&&e.sway){e.baseX??=e.x;e.x=e.baseX+Math.sin(e.age*(e.kind==='boss'?.9:1.4))*e.sway;}
  if(!modern&&e.kind==='enemy'&&b.stage>=10){e.baseX??=e.x;e.x=e.baseX+Math.sin(e.age*1.4)*22;}
  if(e.kind==='boss'&&(modern?e.burst:s.boss)&&e.y>120&&e.y<560){e.shoot-=dt;if(modern&&e.shoot<=.65&&!e.warning){e.warning=true;e.aimX=b.x;}if(e.shoot<=0){const offsets=modern?(e.burst===3?[-55,0,55]:[-38,38]):[-55,0,55];for(const dx of offsets){const len=Math.hypot((modern?e.aimX:b.x)+dx-e.x,640-e.y),v=modern?e.bulletSpeed:130;b.enemyBullets.push({x:e.x,y:e.y,vx:((modern?e.aimX:b.x)+dx-e.x)/len*v,vy:(640-e.y)/len*v});}e.shoot=modern?e.shotInterval:3;e.warning=false;}}

  if(e.type==='mage'&&!e.dead){e.shoot-=dt;if(e.shoot<=0&&e.y>80&&e.y<540){const target=members(b)[Math.floor(b.serial%b.count)]||{x:b.x,y:640};const len=Math.hypot(target.x-e.x,target.y-e.y);b.enemyBullets.push({x:e.x,y:e.y,vx:(target.x-e.x)/len*150,vy:(target.y-e.y)/len*150});e.shoot=2.6;}}
 }
 for(const p of b.bullets){p.oldY=p.y;p.age=(p.age||0)+dt;
  if(p.phase==='summon'){const t=clamp((p.age-p.delay)/.12,0,1),ease=t*t*(3-2*t);p.x=p.originX+(p.laneX-p.originX)*ease;p.y=p.originY-24*ease;if(t<1)continue;p.phase='flight';p.oldY=p.y;}
  else{const travel=Math.min(740*dt,Math.max(0,(p.maxRange??Infinity)-(p.distance||0)));p.y-=travel;p.distance=(p.distance||0)+travel;}
  for(const e of b.entities){if(b.status!=='playing')break;if(p.dead||e.dead||(b.layoutVersion>=3&&e.y<0)||(e.loot==='trap'&&e.y<80))continue;
   if(e.kind==='gates'&&!e.hit&&Math.abs(p.y-e.y)<18){const g=p.x<(e.split||240)?e.left:e.right;if(g.shoot){g.hits++;if(g.hits%5===0)g.value=Math.min(12,g.value+1);p.dead=true;}continue;}
   const r=e.radius||(e.kind==='boss'?45:e.kind==='chest'?29:20);
   if(Math.abs(p.x-e.x)<r+4&&p.y-8<=e.y+r&&p.oldY+8>=e.y-r){
    if(e.kind==='rock'){p.dead=true;particles(b,p.x,p.y,'#b7b8ab',2);}
    else if(e.hp>0&&!(p.hits||[]).includes(e.id)){(p.hits??=[]).push(e.id);hitEnemy(b,e,p.damage);runeHit(b,p,e);if(p.pierce>0&&e.kind==='enemy')p.pierce--;else p.dead=true;}
   }
  }
  if((p.distance||0)>=(p.maxRange??Infinity))p.dead=true;
 }
 for(const e of b.entities){if(b.status!=='playing')break;if(!e.dead)collisions(b,e);}
 for(const p of b.enemyBullets){p.x+=p.vx*dt;p.y+=p.vy*dt;const m=members(b).find(m=>Math.hypot(m.x-p.x,m.y-p.y)<13);if(m&&!p.dead&&b.status==='playing'){p.dead=true;lose(b,1,m.x,m.y);}}
 b.entities=b.entities.filter(e=>!e.dead&&e.y<860);b.bullets=b.bullets.filter(p=>!p.dead&&p.y>-30);b.enemyBullets=b.enemyBullets.filter(p=>!p.dead&&p.y<820&&p.x>-20&&p.x<500);
 b.effects=b.effects.filter(p=>{p.life-=dt;p.x+=(p.vx||0)*dt;p.y+=(p.vy||0)*dt;return p.life>0;}).slice(-180);b.notices=b.notices.filter(p=>(p.life-=dt)>0);
 if(b.status==='playing'&&b.bossKilled&&b.cursor>=events.length&&!b.entities.some(e=>e.kind==='enemy'))b.status='won';
}
