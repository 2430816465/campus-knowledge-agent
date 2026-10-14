import {WORLD,STAGES,SKILLS,skillById,monsterById,UPGRADE_EXTRAS,CORES,BALANCE_VERSION} from './data.js';
import {stats,random} from './profile.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
export function abilityInterval(s,id){const a=s.abilities[id]||{cooldown:0};return Math.max(id==='bolt'?.14:.8,skillById[id].cooldown/(1+(id==='bolt'?s.stats.speed:0)+a.cooldown*(id==='bolt'?.12:.1))*(1-(id==='bolt'?0:s.stats.cooldown)));}
// Update old saves without resetting progress, loot or the current HP ratio.
export function migrateBattle(s,p){
 if(!s||s.balanceVersion===BALANCE_VERSION||s.settled)return false;
 const old={...s.stats},next=stats(p),ratio=next.attack/old.attack,stage=STAGES[s.stage-1];
 s.wall=cap(s.wall/old.health,0,1)*next.health;
 next.damage+=(s.upgrades['night-power']||0)*.05;next.speed+=(s.upgrades['night-speed']||0)*.05;next.critDamage+=(s.upgrades['night-critical']||0)*.1;s.stats=next;
 for(const e of s.enemies){const d=monsterById[e.type],hp=d.hp*stage.multiplier*(s.mode==='endless'?1+(s.wave-1)*.12:1)*(1+Math.max(0,s.wave-1)*.025);e.hp=cap(e.hp/e.maxHp,0,1)*hp;e.maxHp=hp;e.speed=d.speed*(1+Math.min(.35,(s.stage-1)*.012));e.attack=d.attack*stage.attackMultiplier*(s.mode==='endless'?1+(s.wave-1)*.06:1)*(1+Math.max(0,s.wave-1)*.018);e.burnPower*=ratio;e.born??=s.time;}
 for(const x of [...s.projectiles,...s.areas])x.damage*=ratio;
 s.balanceVersion=BALANCE_VERSION;s.balanceNotice=true;return true;
}
export function createBattle(p,mode='campaign'){
 const stage=cap(p.selected,1,p.frontier),core=CORES.find(c=>c.id===p.core),s=stats(p);
 return {balanceVersion:BALANCE_VERSION,runId:'night-'+Date.now().toString(36)+'-'+(++p.serial),seed:Math.floor(random(p)*4294967296)||8932,mode,stage,status:'playing',time:0,wave:0,waveTime:0,waveCount:0,spawned:0,spawnClock:0,waiting:1,wall:s.health,stats:s,kills:0,level:1,xp:0,xpNeed:7,points:Math.floor((stage-1)/10),abilities:{bolt:{level:1,damage:0,cooldown:0},[core.skill]:{level:1,damage:0,cooldown:0}},upgrades:{},cooldowns:{bolt:.2,[core.skill]:1},enemies:[],projectiles:[],areas:[],effects:[],damage:{},choices:[],entity:0,partner:p.partner,partnerLevel:p.partnerLevels[p.partner],partnerClock:2,summon:p.summon,summonCooldown:0,summonActive:0,wallKind:p.wall,wallClock:8,revived:false,heroShot:0,heroShotAt:-10,heroTargetX:280,aim:null,research:{...p.skills},paused:false};
}
export function availableCards(b,p){
 const cards=[];
 for(const skill of SKILLS){if(!b.abilities[skill.id]){if(skill.unlock<=p.frontier&&Object.keys(b.abilities).length<5)cards.push({id:'learn-'+skill.id,skill:skill.id,name:skill.name,desc:skill.desc,kind:'learn',element:skill.element});continue;}const a=b.abilities[skill.id];if(a.level<20){cards.push({id:skill.id+'-damage',skill:skill.id,name:skill.name+' · 威力',desc:'本技能基础伤害 +20%（同类强化相加）',kind:'damage',element:skill.element});if(a.cooldown<4)cards.push({id:skill.id+'-cooldown',skill:skill.id,name:skill.id==='bolt'?'快速复弩':'法术加速',desc:skill.id==='bolt'?'主武器射速 +12%（同类强化相加）':'本技能施法速度 +10%（同类强化相加）',kind:'cooldown',element:skill.element});}}
 for(const card of UPGRADE_EXTRAS){if(card.unlock>p.frontier)continue;if(card.skill&&!b.abilities[card.skill])continue;if((b.upgrades[card.id]||0)>=card.max)continue;if(card.requires?.some(id=>!b.upgrades[id]))continue;if(card.excludes?.some(id=>b.upgrades[id]))continue;if(card.requiresSkill&&!b.abilities[card.requiresSkill])continue;if(card.effect==='heal'&&b.wall>b.stats.health*.85)continue;cards.push({...card,kind:'extra',element:card.skill?skillById[card.skill].element:'arcane'});}
 if(cards.length<3)cards.push({id:'night-power',name:'百战之力',desc:'所有伤害 +5%',effect:'runPower',kind:'extra',element:'physical'},{id:'night-speed',name:'熟练复弩',desc:'主武器射速 +5%，最快每 0.14 秒一轮',effect:'runSpeed',kind:'extra',element:'physical'},{id:'night-critical',name:'破敌洞察',desc:'暴击伤害 +10%',effect:'runCritical',kind:'extra',element:'arcane'});
 return cards;
}
export function offerCards(b,p){let pool=availableCards(b,p),chosen=[];while(pool.length&&chosen.length<3){const i=Math.floor(random(b)*pool.length);chosen.push(pool.splice(i,1)[0]);}b.choices=chosen;b.status='choice';return chosen;}
export function selectCard(b,p,id){if(b.status!=='choice')return false;const card=b.choices.find(c=>c.id===id);if(!card)return false;if(card.kind==='learn'){b.abilities[card.skill]={level:1,damage:0,cooldown:0};b.cooldowns[card.skill]=.2;b.research[card.skill]??=p.skills[card.skill]||1;}else if(card.kind==='damage'){b.abilities[card.skill].damage++;b.abilities[card.skill].level++;}else if(card.kind==='cooldown'){b.abilities[card.skill].cooldown++;b.abilities[card.skill].level++;}else{b.upgrades[card.id]=(b.upgrades[card.id]||0)+1;if(card.effect==='heal')b.wall=Math.min(b.stats.health,b.wall+b.stats.health*.15);if(card.effect==='runPower')b.stats.damage+=.05;if(card.effect==='runSpeed')b.stats.speed+=.05;if(card.effect==='runCritical')b.stats.critDamage+=.1;}b.points=Math.max(0,b.points-1);b.choices=[];b.status='playing';if(b.points>0)offerCards(b,p);return true;}
export class Battle{
 constructor(state,profile,onEvent=()=>{}){this.s=state;this.profile=profile;this.onEvent=onEvent;state.enemyShots??=[];state.research??={};for(const id of Object.keys(state.abilities))state.research[id]??=profile.skills[id]||1;state.heroShotInterval=abilityInterval(state,'bolt');}
 wallHit(type,amount,x,element='physical'){const s=this.s;s.wallDamageByType??={};s.wallDamageByType[type]=(s.wallDamageByType[type]||0)+amount;s.wall=Math.max(0,s.wall-amount);this.fx('wall',x,WORLD.wallY,14,'#e99575',.3,{element});this.onEvent('wallhit');}
 fx(kind,x,y,r=15,color='#ffe2a0',time=.3,meta={}){const s=this.s;if(s.effects.length<160){const f={kind,x,y,r,color,t:time,max:time,...meta};s.effects.push(f);return f;}}
 spawn(id,x,y){const s=this.s,def=monsterById[id],stage=STAGES[s.stage-1],m=stage.multiplier*(s.mode==='endless'?1+(s.wave-1)*.12:1),hp=def.hp*m*(1+(s.wave-1)*.025);const e={born:s.time,walkDistance:0,attackPose:0,id:++s.entity,type:id,x:x??108+random(s)*264,y:y??-18-random(s)*24,hp,maxHp:hp,speed:def.speed*(1+Math.min(.35,(s.stage-1)*.012)),attack:def.attack*stage.attackMultiplier*(s.mode==='endless'?1+(s.wave-1)*.06:1)*(1+(s.wave-1)*.018),radius:def.radius,hit:0,slow:0,freeze:0,stun:0,burn:0,burnPower:0,expose:0,attackClock:1,special:7};s.enemies.push(e);if(def.boss){this.fx('ring',240,150,70,'#f2b6a0',1.2);this.onEvent('boss');}return e;}
 nearest(){return this.s.enemies.filter(e=>e.hp>0&&e.y>=0).sort((a,b)=>b.y-a.y)[0];}
 damage(e,amount,element,skill,status=true){if(e.hp<=0||e.y<0)return;const s=this.s,d=monsterById[e.type],wasFrozen=e.freeze>0,wasSlowed=e.slow>0;let multiplier=element==='physical'?1-(d.armor||0):1;if(d.resist===element)multiplier*=.3;if(d.weak===element)multiplier*=1.65;if(e.expose>0)multiplier*=1.25;if(e.slow>0||e.burn>0)multiplier*=1+s.stats.vulnerability;const crit=status&&random(s)<s.stats.crit,n=amount*multiplier*(crit?s.stats.critDamage:1),actual=Math.min(e.hp,n);e.hp-=n;e.hit=.12;s.damage[skill]=(s.damage[skill]||0)+actual;
  if(status){const duration=1+s.stats.duration;if(element==='ice'){e.slow=Math.max(e.slow,2.2*duration);if((skill==='ice'&&s.upgrades['ice-freeze']||skill==='blizzard'&&s.upgrades['blizzard-freeze']||skill==='summon')&&d.immune!=='freeze')e.freeze=Math.max(e.freeze,1.5*duration);}if(element==='fire'){e.burn=Math.max(e.burn,3*duration);e.burnPower=Math.max(e.burnPower,amount*.16);}if(element==='lightning')e.stun=Math.max(e.stun,Math.min(d.boss?.45:3,(s.upgrades['lightning-stun']?1.6:.35)*duration));}
  if(status&&element==='fire'&&wasFrozen&&s.upgrades['thermal-shock']&&(e.thermalReady??0)<=s.time){
   e.thermalReady=s.time+3;e.freeze=0;s.reactions??={};s.reactions.thermal=(s.reactions.thermal||0)+1;
   for(const other of [...s.enemies])if(other.hp>0&&distance(e,other)<65+other.radius)this.damage(other,this.power('fire')*.6,'arcane','thermal-shock',false);
   this.fx('ring',e.x,e.y,65,'#f6d9cb',.5,{element:'ice'});
  }
  if(status&&element==='lightning'&&wasSlowed&&s.upgrades['storm-conduct']&&(e.conductReady??0)<=s.time){
   e.conductReady=s.time+3;s.reactions??={};s.reactions.conduct=(s.reactions.conduct||0)+1;
   for(const other of s.enemies.filter(x=>x!==e&&x.hp>0&&x.y>=0&&distance(e,x)<105).sort((a,b)=>distance(a,e)-distance(b,e)).slice(0,2)){
    this.damage(other,this.power('lightning')*.45,'lightning','storm-conduct',false);this.fx('line',e.x,e.y,0,'#d9bdff',.3,{toX:other.x,toY:other.y});
   }
  }
  if(crit)this.fx('crit',e.x,e.y,Math.round(n),'#ffe5a1',.45);else if(s.effects.filter(f=>f.kind==='number').length<12)this.fx('number',e.x,e.y,Math.round(n),'#fbebcf',.35);
  if(e.hp<=0&&!e.dead){e.dead=true;s.kills++;s.xp+=(d.boss?10:d.elite?3:1)*(1+s.stats.experience);this.fx('burst',e.x,e.y,e.radius,element==='ice'?'#c9f4ff':'#e9ce91',.3,{element});if(s.kills%20===0)s.wall=Math.min(s.stats.health,s.wall+s.stats.health*s.stats.heal);if(e.freeze>0&&s.upgrades['ice-shatter'])for(let i=0;i<4;i++)this.projectile('ice',e.x,e.y,-Math.PI/2+i*Math.PI/2,.55,{speed:220,life:1.2,pierce:1,secondary:true});this.onEvent('kill');}
 }
 globalDamage(){const s=this.s;return s.stats.damage*(1+(s.upgrades['all-power']||0)*.08);}
 power(id){const s=this.s,a=s.abilities[id]||{damage:0},def=skillById[id]||skillById.bolt;return s.stats.attack*def.damage*(1+a.damage*.2)*(1+((s.research[id]||1)-1)*.06)*this.globalDamage()*(1+(s.stats[def.element]||0));}
 projectile(id,x,y,angle,mult=1,options={}){const s=this.s;if(s.projectiles.length>=240)return;const def=skillById[id]||skillById.bolt;let element=def.element;if(id==='bolt')for(const el of ['fire','ice','lightning'])if(s.upgrades['bolt-'+el])element=el;const speed=options.speed||420,elementBonus=element!==def.element?1+(s.stats[element]||0):1;s.projectiles.push({id:++s.entity,skill:id,x,y,px:x,py:y,born:s.time,launchX:x,launchY:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage:this.power(id)*mult*elementBonus,element,pierce:options.pierce??(id==='bolt'?s.stats.pierce+(s.upgrades['bolt-pierce']||0):id==='ice'?4:0),r:options.r||4,life:options.life||3,hits:[],...options});}
 splash(x,y,r,damage,element,skill){for(const e of [...this.s.enemies])if(e.hp>0&&Math.hypot(e.x-x,e.y-y)<r+e.radius)this.damage(e,damage,element,skill);this.fx('ring',x,y,r,element==='fire'?'#ffb470':element==='ice'?'#c5f4f7':'#ccabfa',.4,{element});}
 area(kind,x,y,r,time,damage,element,skill){const s=this.s;if(s.areas.length<24)s.areas.push({id:++s.entity,kind,x,y,r,t:time,max:time,clock:0,damage,element,skill,charges:kind==='ward'?3:0,armed:kind==='trap'?1:0});}
 cast(id){const s=this.s,target=this.nearest();if(!target)return;const facingX=s.aim?.x??target.x,origin={x:240+(facingX<240?-43:43),y:WORLD.heroY-82},angle=s.aim&&id==='bolt'?Math.atan2(Math.min(WORLD.wallY-20,s.aim.y)-origin.y,s.aim.x-origin.x):Math.atan2(target.y-origin.y,target.x-origin.x),extra=s.upgrades[id+'-multi']||0;
  if(id==='bolt'){s.heroShotInterval=abilityInterval(s,'bolt');s.heroReleaseInterval=s.heroShotInterval;s.heroShot=Math.min(.48,s.heroShotInterval)/2;s.heroShotAt=s.time;s.heroTargetX=facingX;this.onEvent('shot');const n=1+s.stats.multi+(s.upgrades['bolt-multi']||0);for(let i=0;i<n;i++)this.projectile(id,origin.x,origin.y,angle+(i-(n-1)/2)*.07,i===Math.floor(n/2)?1:.65);this.fx('muzzle',origin.x+Math.cos(angle)*20,origin.y+Math.sin(angle)*20,10,'#a9f6ff',.12,{angle});}
  else if(id==='fire'||id==='ice'){for(let i=0;i<=extra;i++)this.projectile(id,origin.x+(i-extra/2)*16,origin.y,angle+(i-extra/2)*.065,(s.upgrades['fire-super']&&id==='fire'?2:1)*(i===Math.floor(extra/2)?1:.7),{speed:id==='fire'?240:360,r:id==='fire'?8:5,splash:id==='fire'?38*(s.upgrades['fire-super']?1.4:1):0});}
  else if(id==='lightning'){const ax=target.x-origin.x,ay=target.y-origin.y,len=Math.hypot(ax,ay);for(const e of s.enemies)if(e.hp>0&&Math.abs((e.x-origin.x)*ay-(e.y-origin.y)*ax)/len<18+e.radius)this.damage(e,this.power(id),'lightning',id);this.fx('line',origin.x,origin.y,0,'#cfb5ff',.25);Object.assign(s.effects.at(-1)||{},{toX:origin.x+ax/len*720,toY:origin.y+ay/len*720});if(s.upgrades['lightning-chain'])for(const e of s.enemies.filter(e=>e!==target&&distance(e,target)<110).slice(0,3)){this.damage(e,this.power(id)*.5,'lightning',id);this.fx('line',target.x,target.y,0,'#cfb5ff',.2);Object.assign(s.effects.at(-1)||{},{toX:e.x,toY:e.y});}}
  else if(id==='beam')this.area('beam',target.x,target.y,9,2+(s.upgrades['beam-duration']||0),this.power(id),'arcane',id);
  else if(id==='rock'){for(let i=0;i<=extra;i++)this.projectile(id,cap(target.x+(i-extra/2)*55,100,380),WORLD.wallY,-Math.PI/2,s.upgrades['rock-crush']?1.6:1,{speed:150,r:s.upgrades['rock-crush']?32:24,pierce:99,life:4});}
  else if(id==='blizzard')this.area('snow',target.x,target.y,75,4,this.power(id),'ice',id);
  else if(id==='wind')this.projectile(id,origin.x,origin.y,angle,1,{speed:270,r:16,pierce:99,bounce:2+(s.upgrades['wind-return']||0)*2,life:4+(s.upgrades['wind-return']||0)*.8});
  else if(id==='meteor'){for(let i=0;i<=extra;i++)this.area('meteor',cap(target.x+(i-extra/2)*65,90,390),target.y,65,.8,this.power(id),'fire',id);}
  else if(id==='familiar'){for(let i=0;i<=(s.upgrades['familiar-extra']||0);i++)this.area('familiar',origin.x,origin.y,18,5,this.power(id),'arcane',id);}
  else if(id==='chain'){const list=s.enemies.filter(e=>e.hp>0).sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,4+(s.upgrades['chain-extra']||0)*3);let prev=origin;for(const e of list){this.damage(e,this.power(id),'lightning',id);this.fx('line',prev.x,prev.y,0,'#d9bdff',.35);Object.assign(s.effects.at(-1)||{},{toX:e.x,toY:e.y});prev=e;}}
  else if(id==='gravity')this.area('gravity',cap(s.aim?.x??target.x,100,380),cap(s.aim?.y??target.y,50,WORLD.wallY-45),100,3.5,this.power(id),'arcane',id);
  else if(id==='ward')this.area('ward',240,WORLD.wallY-62,165,4,this.power(id),'arcane',id);
  else if(id==='trap')this.area('trap',cap(s.aim?.x??target.x,100,380),cap(s.aim?.y??target.y,50,WORLD.wallY-55),62,6,this.power(id),'fire',id);
  else if(id==='flame')this.area('fire',target.x,target.y,80,4+(s.upgrades['flame-duration']||0)*2,this.power(id),'fire',id);
  return true;
 }
 summon(){const s=this.s;if(s.status!=='playing'||s.paused||s.summonCooldown>0)return false;s.summonCooldown=45;s.summonStartedAt=s.time;s.summonActive=s.summon==='golem'?8:6;this.splash(240,290,500,s.stats.attack*(s.summon==='golem'?4.2:5.5)*this.globalDamage()*(s.summon==='dragon'?1+s.stats.ice:1),s.summon==='golem'?'physical':'ice','summon');if(s.summon==='golem')for(const e of s.enemies)if(monsterById[e.type].immune!=='knock')e.y-=55;this.onEvent('summon');return true;}
 step(dt){const s=this.s,p=this.profile;if(s.paused||s.status!=='playing')return;
  s.time+=dt;s.heroShot=Math.max(0,s.heroShot-dt);s.summonCooldown=Math.max(0,s.summonCooldown-dt);s.summonActive=Math.max(0,s.summonActive-dt);
  const stage=STAGES[s.stage-1];
  if(s.waiting>0){s.waiting-=dt;if(s.waiting<=0){s.wave++;s.waveTime=0;s.spawned=0;s.spawnClock=0;s.waveCount=10+s.wave*2+Math.min(8,s.stage);this.onEvent('wave');}}
  else {s.waveTime+=dt;s.spawnClock-=dt;if(s.spawned<s.waveCount&&s.spawnClock<=0&&s.enemies.length<240){s.spawnClock=Math.max(.25,.5-(s.wave-1)*.018);const roster=stage.types.slice(0,Math.min(stage.types.length,2+s.wave-1));let type=roster[Math.floor(random(s)*roster.length)];const final=s.mode==='campaign'?s.wave===stage.waves:s.wave%5===0;if(final&&s.spawned===s.waveCount-1)type=stage.boss;else if(stage.elite&&s.wave%4===0&&s.spawned===s.waveCount-2)type='skeleton_elite';this.spawn(type);s.spawned++;}}
  for(const[id]of Object.entries(s.abilities)){s.cooldowns[id]=(s.cooldowns[id]??0)-dt;if(id==='bolt')s.heroShotInterval=abilityInterval(s,id);if(s.cooldowns[id]<=0&&this.nearest()){this.cast(id);s.cooldowns[id]=abilityInterval(s,id);}}
  // Launched enemy spells survive their caster and hit only on visual contact.
  // Resolve existing flights before new releases so a new spell never jumps ahead.
  s.enemyShots??=[];
  for(const shot of s.enemyShots){
   const oldY=shot.y+(WORLD.wallY-shot.y)*(1-shot.remaining/shot.duration);shot.remaining-=dt;
   const newY=shot.y+(WORLD.wallY-shot.y)*(1-Math.max(0,shot.remaining)/shot.duration);
   const ward=s.areas.find(a=>a.kind==='ward'&&a.t>0&&a.charges>0&&Math.abs(shot.x-a.x)<=a.r&&oldY<=a.y&&newY>=a.y);
   if(ward){shot.remaining=0;ward.charges--;s.intercepts=(s.intercepts||0)+1;
    const caster=s.enemies.find(e=>e.id===shot.caster&&e.hp>0)||s.enemies.filter(e=>e.type===shot.type&&e.hp>0).sort((a,b)=>Math.abs(a.x-shot.x)-Math.abs(b.x-shot.x))[0];
    if(caster){this.damage(caster,ward.damage,'arcane','ward');this.fx('line',shot.x,ward.y,0,'#f3e2a9',.3,{toX:caster.x,toY:caster.y});}
    if(s.upgrades['ward-mend'])s.wall=Math.min(s.stats.health,s.wall+s.stats.health*.01);
    this.fx('ring',shot.x,ward.y,20,'#f5dd92',.3);continue;
   }
   if(shot.remaining<=0)this.wallHit(shot.type,shot.damage,shot.x,shot.element);
  }
  s.enemyShots=s.enemyShots.filter(shot=>shot.remaining>0);
  for(const e of [...s.enemies]){if(e.hp<=0)continue;const d=monsterById[e.type],beforeY=e.y;
   const activeDt=Math.max(0,dt-Math.max(e.freeze||0,e.stun||0));
   for(const k of ['hit','slow','freeze','stun','burn','expose'])e[k]=Math.max(0,e[k]-dt);
   if(e.burn>0)this.damage(e,(e.burnPower+Math.min(e.maxHp*s.stats.burnPercent*this.globalDamage(),e.maxHp*(d.boss?.008:.03)))*dt,'fire','burn',false);if(e.hp<=0)continue;
   if(s.summonActive>0&&s.summon==='dragon'&&d.immune!=='freeze')e.freeze=.2;
   if(e.freeze<=0&&e.stun<=0){
    // Authored casting/summoning poses plant both feet. Pause locomotion during
    // anticipation and recovery, then resume normal speed without catching up.
    const planted=(d.ranged&&e.y>300&&e.attackClock<=.24)||(e.attackPose>0&&d.ranged)||
      (d.boss&&(e.special<=.24||e.specialPose>0));
    e.attackPose=Math.max(0,(e.attackPose||0)-activeDt);e.specialPose=Math.max(0,(e.specialPose||0)-activeDt);
    if(!planted)e.y+=e.speed*activeDt*(e.slow>0?(d.boss?.7:.42):1);
    // First contact with firing range begins a complete standing windup. Old
    // saves already inside range keep their existing cooldown and attack phase.
    if(d.ranged&&beforeY<=300&&e.y>300){e.y=300.01;e.attackClock=Math.max(e.attackClock,.24+activeDt);}
    e.special-=activeDt;
    if(d.elite&&e.special<=0){e.dashRemaining=.24;e.special=7;this.fx('ring',e.x,e.y,25,'#f49c87',.3);}
    if(e.dashRemaining>0){const dashDt=Math.min(activeDt,e.dashRemaining);e.y+=35*dashDt/.24;e.dashRemaining=Math.max(0,e.dashRemaining-dashDt);}
    if(d.boss&&e.special<=0){e.special=9;e.specialPose=.32;this.fx('ring',e.x,e.y,Math.min(45,e.radius*1.2),'#bf9ce1',.35);for(let i=0;i<3;i++)this.spawn(d.id==='dragon'?'mage_red':'skeleton',cap(e.x+(i-1)*35,95,385),Math.max(30,e.y-30));}
    e.attackClock-=activeDt;
    if((e.y>=WORLD.wallY-e.radius-4||d.ranged&&e.y>300)&&e.attackClock<=0){
     e.attackClock=d.ranged?3:1.25;e.attackPose=.32;
     const amount=e.attack*(1-s.stats.guard)*(s.summonActive>0&&s.summon==='golem'?.6:1);
     if(d.ranged){const launchY=e.y-e.radius*.65,duration=cap((WORLD.wallY-launchY)/520,.08,.45);s.enemyShots.push({id:++s.entity,type:e.type,caster:e.id,x:e.x,y:launchY,rootY:e.y,radius:e.radius,damage:amount,element:e.type==='mage_low'?'ice':'fire',duration,remaining:duration});}
     else this.wallHit(e.type,amount,e.x);
    }
   }
   if(e.y>WORLD.wallY-e.radius)e.y=WORLD.wallY-e.radius;
   e.walkDistance=(e.walkDistance||0)+Math.max(0,e.y-beforeY);
  }
  for(const bullet of s.projectiles){bullet.life-=dt;bullet.px=bullet.x;bullet.py=bullet.y;bullet.x+=bullet.vx*dt;bullet.y+=bullet.vy*dt;if(bullet.bounce>0&&(bullet.x<80||bullet.x>400)){bullet.x=cap(bullet.x,80,400);bullet.vx=-bullet.vx;bullet.bounce--;bullet.hits=[];}if(bullet.bounce>0&&bullet.skill==='wind'&&(bullet.y<70&&bullet.vy<0||bullet.y>WORLD.wallY-20&&bullet.vy>0)){bullet.y=cap(bullet.y,70,WORLD.wallY-20);bullet.vx=-bullet.vx;bullet.vy=-bullet.vy;bullet.bounce--;bullet.hits=[];}
   for(const e of [...s.enemies]){if(e.hp<=0||e.y<0||bullet.life<=0||bullet.hits.includes(e.id))continue;const dx=bullet.x-bullet.px,dy=bullet.y-bullet.py,t=cap(((e.x-bullet.px)*dx+(e.y-bullet.py)*dy)/(dx*dx+dy*dy||1),0,1);if(Math.hypot(e.x-bullet.px-dx*t,e.y-bullet.py-dy*t)>e.radius+bullet.r)continue;const beforeKills=s.kills;bullet.hits.push(e.id);this.damage(e,bullet.damage,bullet.element,bullet.skill);this.fx('spark',e.x,e.y,8,'#f7e8b7',.17,{element:bullet.element});
    if(bullet.splash){this.splash(e.x,e.y,bullet.splash,bullet.damage*.7,bullet.element,bullet.skill);if(s.upgrades['fire-ground'])this.area('fire',e.x,e.y,bullet.splash,3,bullet.damage*.22,'fire','fire');}
    if(bullet.skill==='bolt'&&!bullet.secondary&&s.upgrades['bolt-split'])for(const sign of [-1,1])this.projectile('bolt',e.x,e.y,Math.atan2(bullet.vy,bullet.vx)+sign*.65,.32,{speed:350,pierce:0,secondary:true,life:1.5});
    if(bullet.skill==='bolt'&&s.upgrades['bolt-explode'])this.splash(e.x,e.y,25,bullet.damage*.25,bullet.element,'bolt');
    if(bullet.skill==='wind'&&s.upgrades['wind-reap']&&s.kills>beforeKills&&(bullet.reaps||0)<3){bullet.reaps=(bullet.reaps||0)+1;bullet.life+=.5;bullet.bounce=(bullet.bounce||0)+1;}
    if(bullet.skill==='rock'&&dNotKnock(e))e.y-=18;
    bullet.damage*=.85;bullet.pierce--;if(bullet.pierce<0)bullet.life=0;
   }
  }
  s.projectiles=s.projectiles.filter(b=>b.life>0&&b.y>-100&&b.y<800&&b.x>-50&&b.x<530);
  for(const a of [...s.areas]){a.t-=dt;a.clock-=dt;
   if(a.kind==='ward')continue;
   if(a.kind==='gravity'){
    const inRange=s.enemies.filter(e=>e.hp>0&&e.y>=0&&distance(e,a)<a.r+e.radius);
    for(const e of inRange){const d=monsterById[e.type];e.slow=Math.max(e.slow,.6);if(!d.boss&&d.immune!=='knock'){
     const dx=a.x-e.x,dy=a.y-e.y,len=Math.hypot(dx,dy),move=Math.min(len,55*dt);if(len>0){e.x=cap(e.x+dx/len*move,85,395);e.y=cap(e.y+dy/len*move,0,WORLD.wallY-e.radius);}
    }}
    if(a.clock<=0){a.clock=.45;for(const e of inRange)this.damage(e,a.damage,a.element,a.skill);}
    if(a.t<=0&&s.upgrades['gravity-release'])for(const e of inRange)if(!monsterById[e.type].boss&&dNotKnock(e)){e.y=Math.max(0,e.y-45);this.fx('ring',e.x,e.y,18,'#adebcf',.4);}
    continue;
   }
   if(a.kind==='trap'){
    a.armed=Math.max(0,(a.armed||0)-dt);
    if(a.t<=0||a.armed<=0&&s.enemies.filter(e=>e.hp>0&&e.y>=0&&distance(e,a)<a.r+e.radius).length>=3){
     a.t=0;this.splash(a.x,a.y,a.r,a.damage,a.element,a.skill);s.detonations=(s.detonations||0)+1;
     if(s.upgrades['trap-frost'])this.area('snow',a.x,a.y,a.r,3,this.power('ice')*.25,'ice','trap');this.onEvent('impact');
    }continue;
   }
   if(a.kind==='meteor'){if(a.t<=0){this.splash(a.x,a.y,a.r,a.damage,a.element,a.skill);this.onEvent('impact');}continue;}if(a.kind==='beam'||a.kind==='familiar'){const target=this.nearest();if(target){a.x=target.x;a.y=target.y;if(a.kind==='beam'&&s.upgrades['beam-expose']||a.kind==='familiar')target.expose=1;}}
   if(a.clock<=0){a.clock=.45;if(a.kind==='beam'||a.kind==='familiar'){const t=this.nearest();if(t)this.damage(t,a.damage,a.element,a.skill);}else for(const e of [...s.enemies])if(e.hp>0&&distance(e,a)<a.r+e.radius)this.damage(e,a.damage,a.element,a.skill);}}
  s.areas=s.areas.filter(a=>a.t>0);
  s.partnerClock-=dt;if(s.partnerClock<=0){const target=this.nearest(),power=s.stats.attack*(1+Math.min(1.5,(s.partnerLevel-1)*.08))*this.globalDamage();if(s.partner==='ranger'){s.partnerClock=3;if(target)this.projectile('bolt',145,WORLD.heroY-24,Math.atan2(target.y-WORLD.heroY,target.x-145),.75,{pierce:1,secondary:true,skill:'partner',element:'physical',damage:power*.75});}else if(s.partner==='witch'){s.partnerClock=6;if(target){this.splash(target.x,target.y,60,power*1.25*(1+s.stats.ice),'ice','partner');for(const e of s.enemies)if(distance(e,target)<60&&monsterById[e.type].immune!=='freeze')e.freeze=1;}}else{s.partnerClock=9;s.wall=Math.min(s.stats.health,s.wall+s.stats.health*(.02+Math.min(.02,(s.partnerLevel-1)*.0015)));if(target)this.damage(target,power*2*(1+s.stats.arcane),'arcane','partner');}}
  s.wallClock-=dt;if(s.wallClock<=0){s.wallClock=s.wallKind==='frost'?12:8;if(s.wallKind!=='stone'){for(const e of [...s.enemies])if(e.y>400){this.damage(e,s.stats.attack*2*this.globalDamage()*(s.wallKind==='frost'?1+s.stats.ice:1),s.wallKind==='frost'?'ice':'physical','wall');if(s.wallKind==='frost'&&monsterById[e.type].immune!=='freeze')e.freeze=1.5;}this.fx('ring',240,540,110,s.wallKind==='frost'?'#ace3eb':'#a8c98d',.5);}}
  s.enemies=s.enemies.filter(e=>e.hp>0);for(const f of s.effects)f.t-=dt;s.effects=s.effects.filter(f=>f.t>0);
  if(s.wall<=0){s.status='defeated';this.onEvent('defeat');return;}
  while(s.xp>=s.xpNeed){s.xp-=s.xpNeed;s.level++;s.xpNeed=Math.round(s.xpNeed*1.12+1);s.points++;}
  if(s.points>0){offerCards(s,p);this.onEvent('choice');return;}
  if(s.waiting<=0&&s.spawned>=s.waveCount&&!s.enemies.length&&!s.enemyShots.length){if(s.mode==='campaign'&&s.wave>=stage.waves){s.status='result';this.onEvent('win');}else s.waiting=1.3;}
 }
}
function dNotKnock(e){return monsterById[e.type].immune!=='knock';}

