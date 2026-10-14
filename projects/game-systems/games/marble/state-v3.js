import {MarbleGame as V2Game} from './state-v2.js';
import {ORIGIN,SPEED,RELICS,ENEMIES,relicChoices} from './data.js';
import {V3,ELEMENTS,V3_UPGRADES,V3_ROOMS,SAMPLE,v3Offers} from './data-v3.js';
import {nextCollision,reflect} from './physics.js';

const KEY='adventure-camp.marble.v1';
const clone=x=>structuredClone(x);
const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
const settings={
 minion:{hp:7,period:3,damage:2},guard:{hp:18,period:2,damage:3},
 shield:{hp:26,period:2,damage:3},statue:{hp:23,period:2,damage:4},
 priest:{hp:18,period:2,heal:6},elite:{hp:40,period:2,damage:5},
 boss:{hp:125,period:2,damage:7}
};
const value=(r,id)=>{const tier=r.relics?.find(x=>x.id===id)?.tier;return tier===undefined?0:RELICS.find(x=>x.id===id)?.values[tier]||0};
const alive=r=>r.room.enemies.filter(e=>e.hp>0);
const key=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
const segmentDistance=(x,y,p)=>{const dx=p.x2-p.x1,dy=p.y2-p.y1,t=cap(((x-p.x1)*dx+(y-p.y1)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(x-p.x1-dx*t,y-p.y1-dy*t)};
function scatterEnemies(run,wave,units,arena,occupied=[],salt=0){
 let seed=(run.seed^Math.imul(run.roomIndex+1,0x9e3779b1)^Math.imul(wave+1,0x85ebca6b)^salt)>>>0;
 const random=()=>{seed=(seed+0x6d2b79f5)>>>0;let z=seed;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296};
 const result=new Array(units.length),placed=[...occupied];
 const order=units.map((unit,i)=>({unit,i})).sort((a,b)=>b.unit.r-a.unit.r||a.i-b.i);
 for(const {unit,i} of order){
  const margin=Math.max(30,Math.ceil(unit.r*1.7)+12),minY=Math.max(72,Math.ceil(unit.r*1.8)+30),maxY=320-Math.ceil(unit.r);
  let chosen=null;
  for(const extra of [4,0,-3]){
   for(let attempt=0;attempt<1000;attempt++){
    const x=Math.round(margin+random()*(360-2*margin)),y=Math.round(minY+random()*(maxY-minY));
    if(placed.some(other=>Math.hypot(x-other.x,y-other.y)<Math.max(unit.r*1.55,17)+Math.max(other.r*1.55,17)+extra))continue;
    if(arena.clusters.some(q=>Math.hypot(x-q.x,y-q.y)<unit.r+q.r+9))continue;
    if(arena.springs.some(q=>Math.hypot(x-q.x,y-q.y)<unit.r+q.r+9))continue;
    if(arena.plates.some(q=>segmentDistance(x,y,q)<unit.r+16))continue;
    if(arena.target&&Math.hypot(x-arena.target.x,y-arena.target.y)<unit.r+arena.target.r+9)continue;
    chosen={...unit,x,y};break;
   }
   if(chosen)break;
  }
  if(!chosen)throw Error('No safe monster spawn position');
  result[i]=chosen;placed.push(chosen);
 }
 return result;
}

export class MarbleGame extends V2Game{
 isV3(){return this.run?.version===3}
 load(){
  const saved=this.read(KEY);
  if(saved?.version!==3)return super.load();
  this.meta={plays:0,best:0,bestNormal:0,bestChallenge:0,challengeUnlocked:false,pity:0,chestRuns:[],discovered:{},...this.meta};
  this.run=saved;const r=this.run;
  r.queue??=Array(6).fill('basic');r.relics??=[];r.upgrades??=[];r.shots??=[];
  r.help={freeUndo:0,adUndo:0,rescue:0,bonus:0,relic:0,used:0,records:[],...r.help};
  if(['flight','shotEnd','enemy'].includes(r.phase)&&r.shotSnapshot){
   const help=r.help;Object.assign(r,clone(r.shotSnapshot));r.help=help;r.phase='aim';this.notice='飞行中断，已恢复到发射前';
  }
  r.volley=null;this.ball=null;this.balls=[];this.strongSelected=false;this.persist();
 }
 newRun(seed=(Math.random()*2**32)>>>0,challenge=false,options={}){
  if(challenge&&!this.meta.challengeUnlocked)return false;
  this.meta.plays++;const sample=options.sample===true;
  this.run={version:3,id:'marble-'+key(),seed,challenge,debugSample:sample,
   sequence:sample?['SAMPLE']:V3_ROOMS.map((_,i)=>'V'+String(i+1).padStart(2,'0')),
   roomIndex:0,waveIndex:0,hp:70,maxHp:70,energy:0,bestCombo:0,
   queue:Array(V3.baseBalls).fill(options.element&&ELEMENTS[options.element]?options.element:'basic'),
   relics:[],upgrades:[],pending:{clear:0,chest:0,boss:0},phase:'aim',
   help:{freeUndo:0,adUndo:0,rescue:0,bonus:0,relic:0,used:0,records:[]},
   shotSnapshot:null,offer:null,offerType:null,chest:null,relicSelected:null,
   claimed:false,bonusClaimed:false,roomsCleared:0,shots:[],volley:null};
  this.strongSelected=false;this.enterRoom(0);
  this.log('run_start',{runId:this.run.id,version:3,challenge,sample});
  return this.run;
 }
 template(index=this.run.roomIndex){return this.run.debugSample?{name:'密集样板房',hint:'18 怪 · 六球 · 晶簇连锁',waves:[SAMPLE]}:V3_ROOMS[index]}
 loadWave(index){
  const r=this.run,t=this.template(),w=t.waves[index];r.waveIndex=index;
  const challengeExtra=r.challenge&&index===0&&[1,3].includes(r.roomIndex)?
   r.roomIndex===1?[{type:'shield',x:96,y:107,r:15},{type:'priest',x:263,y:107,r:15},{type:'elite',x:180,y:70,r:20}]:
   [{type:'elite',x:95,y:104,r:20},{type:'priest',x:265,y:104,r:15}]:[];
  const challenge=r.challenge?1.1:1;
  const scattered=scatterEnemies(r,index,[...w.enemies,...challengeExtra].slice(0,V3.enemyCap),w);
  r.room={id:r.sequence[r.roomIndex],name:t.name,hint:t.hint,wave:index+1,waves:t.waves.length,
   enemies:scattered.map((e,i)=>{const s=settings[e.type];const hp=Math.ceil(s.hp*challenge);
    return {...e,id:index*100+i+1,hp,maxHp:hp,clock:s.period,facing:Math.PI/2,frost:0,frozenOnce:false,barrier:e.type==='elite'?2:0};}),
   walls:[],columns:[],springs:clone(w.springs),plates:clone(w.plates),
   clusters:clone(w.clusters).map((c,i)=>({...c,id:i,broken:false})),
   door:null,doorOpen:false,switch:null,chest:null,chestOpen:false,crystal:null,target:clone(w.target)||null,
   deaths:[],seedUsed:false,bossSummoned:false,turn:0,locked:[]};
  this.selectAttackers();this.notice=t.hint;
 }
 enterRoom(index){
  if(!this.isV3())return super.enterRoom(index);
  const r=this.run;r.roomIndex=index;r.offer=null;r.offerType=null;r.chest=null;r.relicSelected=null;
  r.shotSnapshot=null;r.volley=null;r.phase='aim';
  const heal=(this.template(index).heal||0)+(index>0&&r.upgrades.includes('supply')?2:0);
  r.hp=cap(r.hp+heal,0,r.maxHp);this.ball=null;this.balls=[];this.strongSelected=false;
  this.loadWave(0);this.persist();
 }
 selectAttackers(){
  const r=this.run,room=r.room;
  const due=alive(r).filter(e=>e.clock<=1);
  const attackers=due.filter(e=>e.type!=='priest').sort((a,b)=>(b.type==='boss')-(a.type==='boss')||a.clock-b.clock||a.id-b.id)
   .slice(0,r.roomIndex>=8?V3.lateAttackerCap:V3.attackerCap);
  const supporters=due.filter(e=>e.type==='priest').slice(0,V3.supportCap);
  room.locked=[...attackers,...supporters].map(e=>e.id);
  room.projected=attackers.reduce((n,e)=>n+(settings[e.type].damage||0),0);
 }
 toggleStrong(){return this.isV3()?(this.run.phase==='aim'&&this.run.energy>=100?(this.strongSelected=!this.strongSelected,this.onChange(),true):false):super.toggleStrong()}
 shoot(angle){
  if(!this.isV3())return super.shoot(angle);
  const r=this.run;if(r.phase!=='aim'||this.paused)return false;
  r.shotSnapshot=clone({...r,shotSnapshot:null,volley:null,phase:'aim'});
  const strong=!!this.strongSelected&&r.energy>=100;if(strong)r.energy=0;
  this.strongSelected=false;
  r.volley={id:`${r.id}:${r.shots.length+1}`,angle,elapsed:0,nextAt:0,launched:0,balls:[],generated:0,
   combo:0,kills:0,direct:0,indirect:0,collisions:0,peakEffects:0,energyGained:0,refunds:0,strong,firstDone:false,
   burstUsed:false,echoMarkUsed:false,emberUsed:false,targetUsed:false,guardian:0,effects:[]};
  r.phase='flight';this.balls=r.volley.balls;this.ball=null;this.notice=strong?'强击齐射！':'六球齐射！';
  this.log('volley_start',{runId:r.id,room:r.room.id,strong,queue:r.queue});this.persist();return true;
 }
 spawnBall(element,angle,child=false,x=ORIGIN.x,y=ORIGIN.y){
  const r=this.run,v=r.volley;if(v.generated>=V3.maxBalls)return null;
  const ball={id:++v.generated,volleyId:v.id,element,x,y,r:child?4.2:6.2,
   vx:Math.sin(angle)*SPEED*(child?.84:1),vy:-Math.cos(angle)*SPEED*(child?.84:1),
   child,time:0,hits:0,limit:(child?V3.childHits:V3.ballHits)+(v.strong&&!child?V3.strongHits:0)
    +(r.upgrades.includes('elastic')&&!child?2:0),
   combo:0,kills:0,refunds:0,first:false,pierced:0,effects:0,hunterUses:0,
   springUsed:[],lastEnemy:null,lastEnemyTime:-1,echoReady:false,echoUsed:false,
   prismReady:false,prismUsed:false,targetCharge:false,trail:[],flash:null};
  v.balls.push(ball);this.ball=v.balls[0]||null;return ball;
 }
 damage(enemy,amount,source,ball=null){
  if(!enemy||enemy.hp<=0||amount<=0)return 0;
  const dealt=Math.min(enemy.hp,Math.max(1,Math.floor(amount)));enemy.hp-=dealt;
  const v=this.run.volley;if(v){
   if(source!=='direct')v.indirect++;
   const mark=v.effects.find(f=>f.x===enemy.x&&f.y===enemy.y&&f.t>.12);
   if(mark){mark.n+=dealt;mark.t=.4}
   else if(v.effects.length<18)v.effects.push({x:enemy.x,y:enemy.y,n:dealt,kind:source,t:.4});
   v.peakEffects=Math.max(v.peakEffects,v.effects.length);
  }
  if(enemy.hp<=0)this.onDeath(enemy,source,ball);
  return dealt;
 }
 onDeath(enemy,source,ball){
  if(!this.isV3())return super.onDeath(enemy,source,ball);
  const r=this.run,v=r.volley;if(r.room.deaths.includes(enemy.id))return;
  r.room.deaths.push(enemy.id);v.kills++;if(ball)ball.kills++;
  if(source==='direct'&&ball&&v.refunds<V3.killRefunds){ball.limit++;ball.refunds++;v.refunds++}
  if(value(r,'seed')&&!r.room.seedUsed){r.room.seedUsed=true;r.hp=cap(r.hp+value(r,'seed'),0,r.maxHp)}
  if(source==='direct'&&value(r,'ember')&&!v.emberUsed){
   v.emberUsed=true;for(const e of alive(r))if(e.id!==enemy.id&&Math.hypot(e.x-enemy.x,e.y-enemy.y)<72)this.damage(e,value(r,'ember'),'ember');
  }
  this.log('kill',{runId:r.id,room:r.room.id,enemy:enemy.id,source});
 }
 direct(enemy,b){
  const r=this.run,v=r.volley,el=ELEMENTS[b.element]||ELEMENTS.basic;
  const front=enemy.type==='shield'&&b.y>enemy.y+3;
  let amount=el.damage+(r.upgrades.includes('core')&&!b.child?2:0);
  if(!v.firstDone&&r.upgrades.includes('first'))amount+=5;
  if(b.echoReady&&!b.echoUsed){amount+=4;b.echoUsed=true}
  if(b.prismReady&&!b.prismUsed){amount+=value(r,'prism');b.prismUsed=true}
  if(v.combo===2&&!v.echoMarkUsed&&value(r,'echoMark')){amount+=value(r,'echoMark');v.echoMarkUsed=true}
  if(enemy.hp<=enemy.maxHp*.35&&value(r,'hunter')&&b.hunterUses<2){amount+=value(r,'hunter');b.hunterUses++}
  if(b.targetCharge){amount+=4;b.targetCharge=false}
  if(v.strong&&!b.child)amount=Math.floor(amount*V3.strongDamage);
  if(enemy.barrier){amount=Math.ceil(amount*.6);enemy.barrier--;this.notice='精英护甲破裂 · 再次命中伤害提高'}
  if(front)amount=Math.max(1,Math.floor(amount*.4));
  b.combo++;v.direct++;v.firstDone=true;
  if(!b.child){v.combo++;r.bestCombo=Math.max(r.bestCombo,v.combo)}
  if(!b.child&&!v.strong&&v.energyGained<V3.energyPerVolley){
   const n=Math.min(V3.energyHit,V3.energyPerVolley-v.energyGained,100-r.energy);
   r.energy+=n;v.energyGained+=n;
  }
  this.damage(enemy,b.child?Math.ceil(amount*.6):amount,'direct',b);
  if(!b.child&&[3,5,8,15,25].includes(v.combo))this.notice=v.combo>=8?'精彩连击！':v.combo+' 连击！';
  if(r.upgrades.includes('burst')&&!v.burstUsed){
   v.burstUsed=true;for(const e of alive(r))if(e!==enemy&&Math.hypot(e.x-enemy.x,e.y-enemy.y)<56)this.damage(e,3,'burst');
  }
  if(b.element==='fire'&&b.effects<3){
   b.effects++;for(const e of alive(r))if(e!==enemy&&Math.hypot(e.x-enemy.x,e.y-enemy.y)<52)this.damage(e,3,'fire');
  }else if(b.element==='lightning'&&b.effects<3){
   b.effects++;alive(r).filter(e=>e!==enemy&&Math.hypot(e.x-enemy.x,e.y-enemy.y)<78)
    .sort((a,c)=>Math.hypot(a.x-enemy.x,a.y-enemy.y)-Math.hypot(c.x-enemy.x,c.y-enemy.y)||a.id-c.id)
    .slice(0,2).forEach(e=>this.damage(e,3,'lightning'));
  }else if(b.element==='ice'){
   enemy.frost=(enemy.frost||0)+1;
   if(enemy.frost>=2&&!enemy.frozenOnce){enemy.frozenOnce=true;enemy.freeze=1;this.notice='寒冰冻结 · 下次行动取消'}
  }else if(b.element==='split'&&!b.child&&!b.splitDone&&v.generated+2+(r.queue.length-v.launched)<=V3.maxBalls){
   b.splitDone=true;const a=Math.atan2(b.vx,-b.vy);
   for(const offset of [-.22,.22]){const child=this.spawnBall('basic',a+offset,true,b.x,b.y);if(child)child.ignoreEnemyId=enemy.id}
  }
  b.first=true;
  return !front&&((b.element==='pierce'&&b.pierced++<2)||
   (r.upgrades.includes('pierce')&&!v.pierceUsed&&(v.pierceUsed=true)));
 }
 shatter(index){
  const r=this.run,v=r.volley,q=r.room.clusters,queue=[index];let done=0;
  while(queue.length&&done<V3.chainCap){
   const i=queue.shift(),c=q[i];if(!c||c.broken)continue;
   c.broken=true;done++;
   for(const e of alive(r))if(Math.hypot(e.x-c.x,e.y-c.y)<76){if(e.barrier)e.barrier=0;this.damage(e,4,'cluster')}
   q.forEach((other,j)=>{if(!other.broken&&Math.hypot(other.x-c.x,other.y-c.y)<80&&!queue.includes(j))queue.push(j)});
  }
  this.notice='晶簇连锁 ×'+done;
 }
 onBallHit(b,hit){
  const r=this.run,v=r.volley;b.hits++;v.collisions++;let pass=false;
  if(hit.kind==='enemy'){
   const e=r.room.enemies.find(x=>x.id===hit.id);
   if(e?.hp>0&&!(b.lastEnemy===e.id&&b.time-b.lastEnemyTime<.035)){
    pass=this.direct(e,b);b.lastEnemy=e.id;b.lastEnemyTime=b.time;
   }
  }else if(hit.kind==='cluster'){this.shatter(hit.id)}
  else if(hit.kind==='target'&&!v.targetUsed){v.targetUsed=true;b.targetCharge=true;this.notice='共鸣靶 · 下次直击 +4'}
  else if(hit.kind==='spring'&&!b.springUsed.length){
   b.springUsed.push(hit.id);b.limit++;this.notice='弹力柱 · 碰撞额度 +1';
  }
  if(['wall','rect','column','spring','plate'].includes(hit.kind)){
   if(r.upgrades.includes('echo'))b.echoReady=true;
   if(value(r,'prism'))b.prismReady=true;
  }
  if(!pass){const v2=reflect(b.vx,b.vy,hit.nx,hit.ny);b.vx=v2.vx;b.vy=v2.vy}
  const speed=Math.hypot(b.vx,b.vy)||1;b.x+=b.vx/speed*.12;b.y+=b.vy/speed*.12;
  if(b.hits>=b.limit||hit.kind==='bottom')b.dead=true;
 }
 step(dt){
  if(!this.isV3())return super.step(dt);
  const r=this.run;if(this.paused||r.phase!=='flight')return;
  const v=r.volley;v.elapsed+=dt;
  for(const f of v.effects)f.t-=dt;v.effects=v.effects.filter(f=>f.t>0);
  while(v.launched<r.queue.length&&v.launched<V3.maxMainBalls&&v.nextAt<=v.elapsed){
   this.spawnBall(r.queue[v.launched],v.angle);
   v.launched++;v.nextAt=v.launched*V3.launchGap;
  }
  for(let i=0;i<v.balls.length;i++){
   const b=v.balls[i];if(b.dead)continue;b.time+=dt;
   b.trail.push({x:b.x,y:b.y});if(b.trail.length>6)b.trail.shift();
   let left=dt,guard=0;
   while(left>1e-6&&guard++<12&&!b.dead){
    const hit=nextCollision(r.room,b,left);
    if(!hit){b.x+=b.vx*left;b.y+=b.vy*left;break}
    b.x=hit.x;b.y=hit.y;left-=hit.t;this.onBallHit(b,hit);
   }
  }
  v.balls=v.balls.filter(b=>!b.dead);this.balls=v.balls;this.ball=v.balls[0]||null;
  if(this.roomCleared()||v.elapsed>=V3.volleySeconds||
   (v.launched>=r.queue.length&&v.balls.length===0))this.endVolley();
 }
 advance(ms){if(!this.isV3())return super.advance(ms);this.acc+=Math.min(ms,250)/1000;let i=0;while(this.acc>=1/120&&i++<36){this.step(1/120);this.acc-=1/120}}
 earlyRecall(){return this.isV3()?this.run.phase==='flight'&&this.endVolley():super.earlyRecall()}
 roomCleared(){const r=this.run;return r.room.enemies.some(e=>e.type==='boss'&&e.hp<=0)||alive(r).length===0}
 endVolley(){
  const r=this.run;if(r.phase!=='flight')return false;
  const v=r.volley;r.shots.push({id:v.id,room:r.room.id,wave:r.waveIndex+1,hits:v.combo,kills:v.kills,time:+v.elapsed.toFixed(2),strong:v.strong,balls:v.launched,generated:v.generated,collisions:v.collisions,indirect:v.indirect});
  this.log('volley_end',{runId:r.id,room:r.room.id,wave:r.waveIndex+1,hits:v.combo,kills:v.kills,empty:v.combo===0,balls:v.launched});
  r.phase='shotEnd';v.effects=[];this.balls=[];this.ball=null;
  if(this.roomCleared()){this.afterWave();return true}
  const boss=alive(r).find(e=>e.type==='boss');
  if(boss&&boss.hp<boss.maxHp/2&&!r.room.bossSummoned){
   r.room.bossSummoned=true;
   const reinforcements=scatterEnemies(r,r.waveIndex,Array.from({length:6},()=>({type:'minion',r:9})),r.room,alive(r),0x41c6ce57);
   for(const unit of reinforcements){const id=200+r.room.enemies.length;r.room.enemies.push({...unit,id,hp:7,maxHp:7,clock:3,frost:0})}
   this.notice='守卫进入第二阶段 · 召唤 6 只杂兵';
  }
  this.enemyTurn();return true;
 }
 afterWave(){
  const r=this.run,t=this.template();
  if(r.waveIndex+1<t.waves.length){this.loadWave(r.waveIndex+1);r.phase='aim';r.shotSnapshot=null;this.notice='第 '+(r.waveIndex+1)+' 波出现！';this.persist()}
  else this.clearRoom();
 }
 enemyTurn(){
  if(!this.isV3())return super.enemyTurn();
  const r=this.run;if(r.phase!=='shotEnd')return;
  r.phase='enemy';let shield=(r.upgrades.includes('film')?2:0)+(r.volley?.combo>=10?value(r,'guardian'):0);
  let taken=0,heals=0;
  for(const id of r.room.locked){
   const e=r.room.enemies.find(x=>x.id===id);if(!e||e.hp<=0)continue;
   if(e.freeze){e.freeze=0;continue}
   if(e.type==='priest'){
    if(heals++>=V3.supportCap)continue;
    const target=alive(r).filter(x=>x!==e&&x.hp<x.maxHp).sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp)||a.id-b.id)[0];
    if(target)target.hp=Math.min(target.maxHp,target.hp+settings.priest.heal);
   }else{
    const dmg=settings[e.type].damage,blocked=Math.min(shield,dmg);shield-=blocked;taken+=dmg-blocked;
   }
  }
  r.hp=Math.max(0,r.hp-taken);r.room.turn++;
  const acted=new Set(r.room.locked);
  for(const e of alive(r))e.clock=acted.has(e.id)?settings[e.type].period:Math.max(1,e.clock-1);
  this.log('enemy_turn',{runId:r.id,room:r.room.id,taken,locked:r.room.locked});
  if(!r.hp){r.phase='failed';this.notice='生命耗尽 · 可以撤回或救援'}
  else{r.phase='aim';this.selectAttackers();this.notice=taken?'敌方行动 · 受到 '+taken+' 伤害':'敌方行动 · 成功压制'}
  this.persist();
 }
 clearRoom(){
  if(!this.isV3())return super.clearRoom();
  const r=this.run;if(r.phase!=='shotEnd')return;
  r.roomsCleared++;if(!r.debugSample)r.pending.clear+=V3.baseRoomCoins;
  const field=r.challenge?'bestChallenge':'bestNormal';this.meta[field]=Math.max(this.meta[field],r.roomsCleared);
  this.meta.best=Math.max(this.meta.best,r.roomsCleared);
  if(r.roomIndex===r.sequence.length-1){
   if(!r.debugSample){r.pending.boss+=V3.bossCoins;if(!r.challenge)this.meta.challengeUnlocked=true}
   this.finish(true);return;
  }
  r.phase='reward';r.shotSnapshot=null;
  if(r.roomIndex===2){
   r.offerType='relic';const offer=relicChoices(r.seed,this.meta.pity);
   r.chest={offer,opened:false,claimed:false,upgraded:false};r.offer=offer;
   if(!this.meta.chestRuns.includes(r.id)){this.meta.chestRuns.push(r.id);this.meta.pity=offer.some(x=>x.tier===2)?0:this.meta.pity+1}
  }else{r.offerType='upgrade';r.offer=v3Offers(r.seed,r.roomIndex,r.queue,r.upgrades)}
  this.notice='房间清空 · 免费选择一项强化';this.persist();
 }
 choose(id,slot=0){
  if(!this.isV3())return super.choose(id);
  const r=this.run;if(r.phase!=='reward'||r.offerType!=='upgrade'||!r.offer?.includes(id))return false;
  const [kind,name]=id.split(':');
  if(kind==='element'){
   if(!ELEMENTS[name])return false;
   const at=cap(Number(slot)||0,0,r.queue.length-1);r.queue[at]=name;
  }else if(kind==='upgrade'){
   if(!V3_UPGRADES[name]||name!=='extra'&&r.upgrades.includes(name))return false;
   if(!r.upgrades.includes(name))r.upgrades.push(name);
   if(name==='extra'&&r.queue.length<V3.maxMainBalls)r.queue.push('basic');
   if(name==='supply')r.hp=cap(r.hp+7,0,r.maxHp);
  }else return false;
  this.log('upgrade_selected',{runId:r.id,id,slot});this.enterRoom(r.roomIndex+1);return true;
 }
 canUndo(){return this.isV3()?!!this.run.shotSnapshot&&['aim','failed'].includes(this.run.phase):super.canUndo()}
 undo(ad=false,source='ad'){
  if(!this.isV3())return super.undo(ad,source);
  const r=this.run;if(!this.canUndo()||ad&&(!this.canAdHelp()||r.help.adUndo)||!ad&&r.help.freeUndo)return false;
  const help=r.help;this.run=clone(r.shotSnapshot);this.run.help=help;this.run.phase='aim';this.run.volley=null;
  if(ad)this.recordHelp('adUndo',source);else help.freeUndo=1;
  this.balls=[];this.ball=null;this.strongSelected=false;this.notice='已撤回最近一次齐射';this.persist();return true;
 }
 rescue(source='ad'){
  if(!this.isV3())return super.rescue(source);
  const r=this.run;if(r.phase!=='failed'||!this.canAdHelp()||r.help.rescue)return false;
  this.recordHelp('rescue',source);r.hp=Math.ceil(r.maxHp*.4);r.phase='aim';r.shotSnapshot=null;
  for(const e of alive(r))e.clock=settings[e.type].period;
  this.selectAttackers();this.notice='救援成功';this.persist();return true;
 }
 finish(win=false){if(!this.isV3())return super.finish(win);const r=this.run;if(r.phase==='result')return false;
  r.phase='result';r.win=win;r.shotSnapshot=null;r.volley=null;this.ball=null;this.balls=[];
  this.notice=win?(r.debugSample?'密集样板房通关':'十五房通关！'):'远征结束';
  this.log('run_finish',{runId:r.id,win,score:r.roomsCleared,challenge:r.challenge});this.persist();return true}
 reward(){if(!this.isV3())return super.reward();const p=this.run.pending,base=p.clear+p.chest+p.boss;return this.run.challenge?Math.min(V3.challengeCap,Math.round(base*V3.challengeMultiplier)):base}
 result(){if(!this.isV3())return super.result();const r=this.run;return {runId:r.id,win:!!r.win,score:r.roomsCleared,challenge:r.challenge,reward:{...r.pending,total:this.reward(),challenge:r.challenge}}}
 bonusValue(){if(!this.isV3())return super.bonusValue();const base=this.reward();return base>0?Math.min(12,Math.max(1,Math.floor(base*.3))):0}
 forecast(e){if(!this.isV3())return super.forecast(e);const s=settings[e.type];return e.freeze?'已冻结 · 下次行动取消':`${e.clock<=1?'下回合':e.clock+' 回合后'}${s.heal?'治疗 '+s.heal:'攻击 '+s.damage}`}
 describe(){if(!this.isV3())return super.describe();const r=this.run,v=r.volley;
  return {mode:r.phase,version:3,coordinate:'360×560；左上原点，y 向下',room:r.room.id,roomIndex:r.roomIndex+1,rooms:r.sequence.length,wave:r.waveIndex+1,waves:this.template().waves.length,
   hp:r.hp,maxHp:r.maxHp,energy:r.energy,pending:this.reward(),queue:r.queue,upgrades:r.upgrades,relics:r.relics,
   enemies:alive(r).map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,hp:e.hp,clock:e.clock,locked:r.room.locked.includes(e.id)})),
   facilities:{springs:r.room.springs.length,plates:r.room.plates.length,clusters:r.room.clusters.filter(x=>!x.broken).length},
   volley:v&&{id:v.id,launched:v.launched,active:v.balls.length,generated:v.generated,collisions:v.collisions,direct:v.direct,indirect:v.indirect,peakEffects:v.peakEffects,combo:v.combo,kills:v.kills,time:+v.elapsed.toFixed(2),balls:v.balls.map(b=>({id:b.id,volleyId:b.volleyId,element:b.element,x:Math.round(b.x),y:Math.round(b.y),hits:b.hits}))},
   offer:r.offer,offerType:r.offerType,help:r.help,notice:this.notice};
 }
}
