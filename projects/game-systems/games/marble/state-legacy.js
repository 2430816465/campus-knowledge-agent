import {ROOMS,ENEMIES,UPGRADES,RELICS,TUNING,ORIGIN,SPEED,MAX_FLIGHT,sequence,choices,relicChoices} from './data.js';
import {nextCollision,reflect} from './physics.js';
const KEY='adventure-camp.marble.v1',META='adventure-camp.marble.meta.v1',EVENTS='adventure-camp.marble.events.v2';
const copy=x=>structuredClone(x),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const uuid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
export class MarbleGame{
 constructor(onChange=()=>{}){this.onChange=onChange;this.run=null;this.ball=null;this.notice='';this.acc=0;this.muted=false;this.paused=false;this.aim=null;this.meta=this.read(META)||{plays:0,best:0};this.load()}
 read(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
 persist(){if(this.run){localStorage.setItem(KEY,JSON.stringify(this.run));this.onChange()}}
 load(){const r=this.read(KEY);if(!r||r.version!==1||!Array.isArray(r.sequence)){this.run=null;return}this.run=r;if(['flight','shotEnd','enemy'].includes(r.phase)&&r.shotSnapshot){const keep=r.help;Object.assign(r,copy(r.shotSnapshot));r.help=keep;r.phase='aim';this.notice='已恢复至本回合开始'}this.persist()}
 newRun(seed=(Math.random()*2**32)>>>0){this.meta.plays++;localStorage.setItem(META,JSON.stringify(this.meta));const first=this.meta.best<5;this.run={version:1,id:'marble-'+uuid(),seed,sequence:sequence(seed,first),roomIndex:0,hp:30,maxHp:30,upgrades:[],pending:{clear:0,chest:0,boss:0},phase:'aim',help:{freeUndo:0,adUndo:0,rescue:0,bonus:0},shotSnapshot:null,offer:null,claimed:false,bonusClaimed:false,roomsCleared:0};this.enterRoom(0);this.notice='拖动瞄准，松手发射';return this.run}
 roomFrom(id){const t=ROOMS[id];return {id,name:t.name,hint:t.hint,enemies:t.enemies.map((e,i)=>({...e,id:i+1,hp:e.hp??ENEMIES[e.type].hp,maxHp:e.hp??ENEMIES[e.type].hp,clock:e.clock??ENEMIES[e.type].period,enraged:false})),walls:copy(t.walls||[]),columns:copy(t.columns||[]),door:t.door?copy(t.door):null,doorOpen:false,switch:t.switch?copy(t.switch):null,chest:t.chest?copy(t.chest):null,chestOpen:false}}
 enterRoom(index){const r=this.run;r.roomIndex=index;r.room=this.roomFrom(r.sequence[index]);r.phase='aim';r.shotSnapshot=null;r.offer=null;if(index>0&&r.upgrades.includes('supply'))r.hp=clamp(r.hp+2,0,r.maxHp);this.ball=null;this.notice=index===1?'弹珠回收后，存活敌人才推进行动倒计时':r.room.hint;this.persist()}
 startAim(x,y){if(!this.run||this.run.phase!=='aim'||this.paused)return false;this.aim={x,y,dx:0,dy:0};this.onChange();return true}
 moveAim(x,y){if(!this.aim)return;this.aim.dx=x-ORIGIN.x;this.aim.dy=y-ORIGIN.y;this.onChange()}
 cancelAim(){this.aim=null;this.onChange()}
 fire(x,y){if(!this.aim)return false;this.moveAim(x,y);const dx=this.aim.dx,dy=this.aim.dy;this.aim=null;if(Math.hypot(dx,dy)<22||dy>-25){this.onChange();return false}const angle=clamp(Math.atan2(dx,-dy),-1.12,1.12);this.shoot(angle);return true}
 shoot(angle){const r=this.run;if(!r||r.phase!=='aim'||this.paused)return false;r.shotSnapshot=copy({...r,shotSnapshot:null,phase:'aim'});r.phase='flight';this.ball={x:ORIGIN.x,y:ORIGIN.y,vx:Math.sin(angle)*SPEED,vy:-Math.cos(angle)*SPEED,time:0,hits:0,first:false,echoReady:false,echoUsed:false,pierced:false,burst:false,trail:[]};this.notice='';this.persist();return true}
 hitEnemy(enemy,b){const r=this.run,front=enemy.type==='shield'&&((b.x-enemy.x)*Math.cos(enemy.facing??Math.PI/2)+(b.y-enemy.y)*Math.sin(enemy.facing??Math.PI/2))/Math.hypot(b.x-enemy.x,b.y-enemy.y)>Math.cos(Math.PI*0.31);
  let amount=10+(r.upgrades.includes('core')?2:0);if(!b.first&&r.upgrades.includes('first'))amount+=5;if(b.echoReady&&!b.echoUsed){amount+=4;b.echoUsed=true}if(front)amount=Math.max(1,Math.floor(amount*.35));
  enemy.hp=Math.max(0,enemy.hp-amount);this.notice=`${enemy.name||ENEMIES[enemy.type].name} -${amount}${front?' · 盾挡':''}`;
  if(!b.first&&r.upgrades.includes('burst')){for(const other of r.room.enemies){if(other!==enemy&&other.hp>0&&Math.hypot(other.x-enemy.x,other.y-enemy.y)<=78)other.hp=Math.max(0,other.hp-3)}b.burst=true}
  b.first=true;return r.upgrades.includes('pierce')&&!b.pierced&&!front?(b.pierced=true,true):false;
 }
 onHit(hit){const r=this.run,b=this.ball;b.hits++;let passthrough=false;
  if(hit.kind==='enemy'){const enemy=r.room.enemies.find(x=>x.id===hit.id);if(enemy?.hp>0)passthrough=this.hitEnemy(enemy,b)}
  if(hit.kind==='switch'){r.room.doorOpen=true;this.notice='机关开启 · 门已打开'}
  if(hit.kind==='chest'){r.room.chestOpen=true;r.pending.chest+=3;this.notice='宝箱开启 · 待结算冒险币 +3'}
  if((hit.kind==='wall'||hit.kind==='rect'||hit.kind==='column')&&r.upgrades.includes('echo')&&!b.echoReady){b.echoReady=true;this.notice='回响已蓄能 +4'}
  if(!passthrough){const v=reflect(b.vx,b.vy,hit.nx,hit.ny);b.vx=v.vx;b.vy=v.vy}
  const len=Math.hypot(b.vx,b.vy);b.x+=b.vx/len*.04;b.y+=b.vy/len*.04;
  if(b.hits>=(r.upgrades.includes('elastic')?10:8))this.endShot();
 }
 step(dt){if(this.paused||!this.run||this.run.phase!=='flight'||!this.ball)return;let b=this.ball,remaining=dt,guard=0;
  while(remaining>1e-7&&this.run.phase==='flight'&&guard++<12){const hit=nextCollision(this.run.room,b,remaining);if(!hit){b.x+=b.vx*remaining;b.y+=b.vy*remaining;b.time+=remaining;break}b.x=hit.x;b.y=hit.y;b.time+=hit.t;remaining-=hit.t;if(hit.kind==='bottom'){this.endShot();break}this.onHit(hit)}
  if(this.run.phase==='flight'){b.trail.push({x:b.x,y:b.y});if(b.trail.length>12)b.trail.shift();if(b.time>=MAX_FLIGHT)this.endShot()}
  this.onChange();
 }
 advance(ms){const t=Math.min(ms,250);this.acc+=t/1000;let i=0;while(this.acc>=1/120&&i++<36){this.step(1/120);this.acc-=1/120}}
 earlyRecall(){if(this.run?.phase==='flight')this.endShot()}
 endShot(){const r=this.run;if(!r||r.phase!=='flight')return;r.phase='shotEnd';this.ball=null;if(r.room.enemies.every(x=>x.hp<=0)){this.clearRoom();return}this.enemyTurn()}
 enemyTurn(){const r=this.run;if(r.phase!=='shotEnd')return;r.phase='enemy';let shield=r.upgrades.includes('film')?2:0;const due=[];
  for(const e of r.room.enemies){if(e.hp<=0)continue;e.clock--;if(e.clock<=0){due.push(e);e.clock=ENEMIES[e.type].period}}
  due.sort((a,b)=>Number(b.type==='priest')-Number(a.type==='priest')||a.id-b.id);
  for(const e of due){if(r.hp<=0)break;if(e.type==='priest'){const targets=r.room.enemies.filter(x=>x!==e&&x.hp>0&&x.hp<x.maxHp).sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp)||a.id-b.id);if(targets.length){const target=targets[0],heal=Math.min(6,target.maxHp-target.hp);target.hp+=heal;this.notice=`祭司为 ${ENEMIES[target.type].name} 治疗 ${heal}`}}else{const dmg=e.type==='boss'&&e.enraged?8:ENEMIES[e.type].damage;const blocked=Math.min(shield,dmg);shield-=blocked;r.hp=Math.max(0,r.hp-dmg+blocked);this.notice=`${ENEMIES[e.type].name} 攻击 ${dmg}${blocked?' · 护盾抵挡 '+blocked:''}`}}
  if(r.hp<=0){r.phase='failed';this.persist();return}
  for(const e of r.room.enemies)if(e.type==='boss'&&e.hp>0&&e.hp<e.maxHp/2)e.enraged=true;
  r.phase='aim';this.persist();
 }
 clearRoom(){const r=this.run;if(r.phase!=='shotEnd')return;r.roomsCleared++;r.pending.clear+=4;this.meta.best=Math.max(this.meta.best,r.roomsCleared);localStorage.setItem(META,JSON.stringify(this.meta));if(r.roomIndex===4){r.pending.boss+=6;this.finish(true);return}r.phase='reward';r.offer=choices(r.seed,r.upgrades,r.roomIndex);r.shotSnapshot=null;this.notice='房间清空 · 免费选择一项强化';this.persist()}
 choose(id){const r=this.run;if(!r||r.phase!=='reward'||!r.offer?.includes(id))return false;r.upgrades.push(id);if(id==='supply')r.hp=clamp(r.hp+4,0,r.maxHp);this.enterRoom(r.roomIndex+1);return true}
 canUndo(){const r=this.run;return !!r?.shotSnapshot&&['aim','failed'].includes(r.phase)}
 undo(ad=false){const r=this.run;if(!this.canUndo())return false;if(ad){if(r.help.adUndo)return false;r.help.adUndo=1}else{if(r.help.freeUndo)return false;r.help.freeUndo=1}const help=r.help;this.run=copy(r.shotSnapshot);this.run.help=help;this.run.phase='aim';this.ball=null;this.aim=null;this.notice='已撤回最近一次发射';this.persist();return true}
 rescue(){const r=this.run;if(r?.phase!=='failed'||r.help.rescue)return false;r.help.rescue=1;r.hp=Math.ceil(r.maxHp*.4);r.room.enemies.filter(x=>x.hp>0).forEach(x=>x.clock=ENEMIES[x.type].period);r.shotSnapshot=null;r.phase='aim';this.notice='救援成功 · 行动倒计时已重置';this.persist();return true}
 finish(win=false){const r=this.run;if(!r||r.phase==='result')return false;r.phase='result';r.win=win;r.shotSnapshot=null;this.ball=null;this.notice=win?'五房通关 · 遗迹守卫已倒下':'远征结束 · 已得收益可以领取';this.persist();return true}
 reward(){const p=this.run.pending;return p.clear+p.chest+p.boss}
 result(){const r=this.run;return {runId:r.id,win:!!r.win,score:r.roomsCleared,reward:{...r.pending,total:this.reward()}}}
 claimed(){if(!this.run)return;this.run.claimed=true;this.persist()}
 bonusClaimed(){if(!this.run)return;this.run.bonusClaimed=true;this.persist()}
 bonusValue(){return Math.min(12,this.run.pending.clear+this.run.pending.chest)}
 has(id){return this.run?.upgrades.includes(id)}
 forecast(e){const config=ENEMIES[e.type];const amount=e.type==='boss'&&e.enraged?8:config.heal||config.damage;return `${e.clock===1?'下回合':e.clock+' 回合后'}${config.heal?'治疗':'攻击'} ${amount}`}
 describe(){const r=this.run;if(!r)return {mode:'title',best:this.meta.best};return {mode:r.phase,coordinate:'360×560，左上原点，y 向下',runId:r.id,room:r.sequence[r.roomIndex],roomIndex:r.roomIndex+1,hp:r.hp,pending:this.reward(),upgrades:r.upgrades,enemies:r.room.enemies.filter(e=>e.hp>0).map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,hp:e.hp,clock:e.clock,forecast:this.forecast(e)})),doorOpen:r.room.doorOpen,chestOpen:r.room.chestOpen,ball:this.ball&&{x:Math.round(this.ball.x),y:Math.round(this.ball.y),hits:this.ball.hits,time:+this.ball.time.toFixed(2)},offer:r.offer,help:r.help,notice:this.notice}}
}
