import {CHARACTERS,createMatch,play,challenge,step,publicMatch} from './rules.js';
import {Matchmaker} from './matchmaker.js';
import {chooseAction,adaptiveStrength,QUICK_PHRASES,responseDelay} from './bots.js';
export function secureInt(max){const a=new Uint32Array(1),limit=Math.floor(4294967296/max)*max;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%max;}
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(id);
const cleanName=v=>String(v||'旅人').trim().slice(0,16)||'旅人';
export class Rooms {
 constructor({randomInt=secureInt,uuid=()=>crypto.randomUUID(),now=()=>Date.now(),records={},saveRecords=()=>{}}={}){this.randomInt=randomInt;this.uuid=uuid;this.now=now;this.rooms=new Map();this.peers=new Map();this.records=Object.create(null);for(const [id,r] of Object.entries(records||{}).slice(-10000))if(validId(id)&&Array.isArray(r?.outcomes))this.records[id]={outcomes:r.outcomes.filter(v=>typeof v==='boolean').slice(-20),at:Number(r.at)||0};this.saveRecords=saveRecords;this.matchmaker=new Matchmaker({now,form:group=>this.formMatch(group),send:(id,m)=>{const p=this.peers.get(id);if(p)this.send(p,m);}});}
 open(id,send,{host=false,phone=false}={}){this.peers.set(id,{id,send,host,phone,room:null,slot:null,rateAt:this.now(),rate:0});send({type:'hello',version:1});}
 send(peer,data){try{peer.send(data);}catch{this.close(peer.id);}}
 snapshot(room,peer){const slot=room.slots[peer.slot];return {type:'snapshot',version:1,code:room.code,roomId:room.id,matched:!!room.matched,serverTime:this.now(),chat:room.chat||[],host:room.host===peer.slot,seat:room.game?slot?.gameSeat:peer.slot,phase:room.phase,reason:room.reason||'',players:room.slots.map((p,i)=>p?{seat:i,name:p.name,character:p.character,ready:p.ready,connected:!!p.peer||!!p.bot}:null),game:publicMatch(room.game,slot?.gameSeat),reward:room.game?.phase==='finished'?{id:room.game.id,win:slot?.gameSeat===room.game.winner,amount:slot?.gameSeat===room.game.winner?30:0}:null};}
 broadcast(room){for(const p of room.slots){const peer=p&&this.peers.get(p.peer);if(peer)this.send(peer,this.snapshot(room,peer));}}
 room(peer){const r=this.rooms.get(peer.room);if(!r||!r.slots[peer.slot])throw Error('请先创建或加入房间');return r;}
 joined(peer,room,index,resumed=false){peer.room=room.code;peer.slot=index;const slot=room.slots[index];peer.playerId=slot.playerId||null;slot.peer=peer.id;slot.offlineAt=null;this.send(peer,{type:'joined',code:room.code,token:slot.token,clientId:slot.clientId,resumed});
  if(room.phase==='paused'&&room.slots.every(p=>!p||p.bot||p.peer||room.game&&!room.game.players[p.gameSeat].alive)){room.phase='match';const pause=this.now()-room.pausedAt;if(room.game.deadline)room.game.deadline=this.now()+room.remainingDeadline;room.game.phaseAt+=pause;room.game.roundAt+=pause;room.botAction=null;room.reason='';}
  this.broadcast(room);
 }
 handle(id,message){const peer=this.peers.get(id);if(!peer)return;
  try{
   if(!message||typeof message!=='object'||Array.isArray(message)||message.v!==1)throw Error('协议版本不兼容，请更新游戏');
   const now=this.now();if(now-peer.rateAt>=1000){peer.rate=0;peer.rateAt=now;}if(++peer.rate>30)throw Error('操作太快，请稍后重试');
   const m=message;
   if(m.type==='match'){
    if(peer.room)throw Error('请先离开当前牌桌');if(!validId(m.clientId)||!validId(m.playerId))throw Error('玩家标识无效');if(peer.phone&&!peer.host)throw Error('请使用匹配服务器或自己的测试入口');
    if(this.rooms.size>=100)throw Error('牌桌已满，请稍后重试');if([...this.peers.values()].some(p=>p.id!==id&&p.playerId===m.playerId&&(p.room||p.queued)))throw Error('这个玩家已在匹配或牌桌中');
    peer.playerId=m.playerId;this.matchmaker.add(peer,m);peer.queued=!peer.room;return;
   }
   if(m.type==='cancelMatch'){if(peer.room){const r=this.room(peer);if(r.matched)this.leave(peer,r);else throw Error('当前为好友房间');}this.matchmaker.remove(id);peer.queued=false;this.send(peer,{type:'queueCanceled'});return;}
   if(m.type==='create'){
    if(peer.room||peer.queued)throw Error('请先离开当前房间或取消匹配');if(peer.phone&&!peer.host)throw Error('仅房主手机可以创建房间');if(this.rooms.size>=100)throw Error('房间数量已满');
    if(!validId(m.clientId))throw Error('玩家标识无效');
    let code;do{code=String(100000+this.randomInt(900000));}while(this.rooms.has(code));
    const room={id:this.uuid(),code,host:0,slots:Array(4).fill(null),phase:'lobby',game:null,reason:'',createdAt:now};
    room.slots[0]=this.newSlot(m);this.rooms.set(code,room);this.joined(peer,room,0);return;
   }
   if(m.type==='join'){
    if(peer.room||peer.queued)throw Error('你已经在房间内或匹配中');const room=this.rooms.get(String(m.code));if(!room||room.phase==='closed')throw Error('房间不存在或已关闭');
    if(!validId(m.clientId))throw Error('玩家标识无效');
    if(m.token){const i=room.slots.findIndex(p=>p?.token===m.token&&p.clientId===m.clientId);if(i<0)throw Error('重连凭证无效，请重新开房');if(room.slots[i].peer)throw Error('这个玩家已在线');if(room.slots[i].offlineAt!==null&&now-room.slots[i].offlineAt>30000)throw Error('重连时间已过');this.joined(peer,room,i,true);return;}
    if(room.matched)throw Error('匹配牌桌只能通过队列进入');
    if(room.phase!=='lobby')throw Error('牌局已经开始，只允许原玩家重连');if(room.slots.some(p=>p?.clientId===m.clientId))throw Error('你已在这个房间，请使用另一台设备或独立浏览器');const i=room.slots.indexOf(null);if(i<0)throw Error('房间已满，最多四人');room.slots[i]=this.newSlot(m);room.slots.forEach(p=>{if(p)p.ready=false;});this.joined(peer,room,i);return;
   }
   if(m.type==='ping'){this.send(peer,{type:'pong',at:m.at});return;}
   const room=this.room(peer),slot=room.slots[peer.slot];
   if(m.type==='leave'){this.leave(peer,room);return;}
   if(m.type==='quickChat'){if(!Number.isInteger(m.phrase)||!QUICK_PHRASES[m.phrase])throw Error('请选择已有快捷语');if(slot.chatAt!==undefined&&now-slot.chatAt<4000)throw Error('说话太快，请稍等');slot.chatAt=now;this.say(room,peer.slot,m.phrase);this.broadcast(room);return;}
   if(m.type==='profile'){
    if(room.phase!=='lobby')throw Error('开局后不能更换人物');if(!CHARACTERS.some(c=>c.id===m.character))throw Error('人物不存在');slot.character=m.character;slot.name=cleanName(m.name);slot.ready=false;
   }else if(m.type==='ready'){if(room.phase!=='lobby')throw Error('现在不能准备');slot.ready=m.value===true;}
   else if(m.type==='start'){
    if(room.matched||room.host!==peer.slot||room.phase!=='lobby')throw Error('请等待房主开局');const players=room.slots.filter(Boolean);if(players.length<2||players.some(p=>!p.peer||!p.ready))throw Error('至少两位玩家加入，且所有人都已准备');
    this.start(room,now);
   }else if(m.type==='rematch'){
    if(room.matched)throw Error('匹配牌桌请重新匹配');if(room.host!==peer.slot||room.game?.phase!=='finished')throw Error('请等待房主开始下一局');room.game=null;room.phase='lobby';room.slots.forEach(p=>{if(p)p.ready=false;});
   }else if(['play','challenge'].includes(m.type)){
    if(room.phase!=='match'||!room.game)throw Error('牌局未开始或正在等待重连');
    if(!validId(m.requestId)||slot.requests.includes(m.requestId))throw Error('重复操作已忽略');if(m.revision!==room.game.revision)throw Error('牌局已经更新，请重试');
    if(m.type==='play')play(room.game,slot.gameSeat,m.cards,this.randomInt,now);else challenge(room.game,slot.gameSeat,now);
    slot.requests.push(m.requestId);slot.requests=slot.requests.slice(-64);
   }else throw Error('未知操作');
   this.broadcast(room);
  }catch(error){this.send(peer,{type:'error',message:error.message});}
 }
 newSlot(m){return {clientId:m.clientId,name:cleanName(m.name),character:CHARACTERS.some(c=>c.id===m.character)?m.character:'hero',ready:false,token:this.uuid().replaceAll('-',''),peer:null,offlineAt:null,requests:[]};}
 start(room,now=this.now()){const players=room.slots.filter(Boolean);players.forEach((p,i)=>{p.gameSeat=i;p.requests=[];});room.game=createMatch(players.map(p=>({name:p.name,character:p.character})),this.randomInt,now,this.uuid());players.forEach((p,i)=>{p.character=room.game.players[i].character;});room.phase='match';room.recorded=false;room.botAction=null;}
 formMatch(entries){
  entries=entries.filter(e=>this.peers.has(e.peer));if(!entries.length)return;if(this.rooms.size>=100){for(const e of entries){const p=this.peers.get(e.peer);p.queued=false;this.send(p,{type:'queueCanceled'});this.send(p,{type:'error',message:'牌桌已满，请重新匹配'});}return;}
  let code;do{code=String(100000+this.randomInt(900000));}while(this.rooms.has(code));
  const humans=entries.length,room={id:this.uuid(),code,host:0,slots:Array(4).fill(null),phase:'lobby',matched:true,chat:[],createdAt:this.now(),humanCount:humans};
  room.strength=humans===1?adaptiveStrength(this.records[entries[0].profile.playerId]):.65;
  entries.forEach((e,i)=>{const p=this.newSlot(e.profile);p.playerId=e.profile.playerId;p.ready=true;room.slots[i]=p;const peer=this.peers.get(e.peer);peer.queued=false;});
  const used=new Set(room.slots.filter(Boolean).map(p=>p.name));
  for(let i=humans;i<4;i++){let name;do{name='旅人'+String(this.randomInt(100000000)).padStart(8,'0');}while(used.has(name));used.add(name);room.slots[i]={...this.newSlot({clientId:'bot-'+this.uuid(),name,character:CHARACTERS[this.randomInt(4)].id}),bot:true,ready:true};}
  this.rooms.set(code,room);entries.forEach((e,i)=>this.joined(this.peers.get(e.peer),room,i));this.start(room);room.greetingAt=this.now()+1500;this.broadcast(room);
 }
 say(room,slot,phrase){room.chat??=[];room.chat.push({id:this.uuid(),seat:room.slots[slot].gameSeat??slot,name:room.slots[slot].name,phrase,text:QUICK_PHRASES[phrase],at:this.now()});room.chat=room.chat.slice(-12);}
 botTick(room,now){const g=room.game;if(!g||g.phase==='finished')return false;
  if(room.greetingAt&&now>=room.greetingAt){const i=room.slots.findIndex(p=>p?.bot);if(i>=0)this.say(room,i,5);room.greetingAt=null;this.broadcast(room);}
  const seat=g.phase==='playing'?g.turn:null,slot=room.slots.find(p=>p?.gameSeat===seat);if(!slot?.bot){room.botAction=null;return false;}
  if(room.botAction?.revision!==g.revision){const delay=responseDelay(this.randomInt);room.botAction={revision:g.revision,at:now+Math.min(delay,Math.max(0,g.deadline-now-100))};return false;}if(now<room.botAction.at)return false;
  const action=chooseAction(publicMatch(g,seat),room.strength,this.randomInt,{protectedSeat:room.humanCount===1?room.slots.find(p=>!p.bot).gameSeat:null});room.botAction=null;if(!action)return false;
  if(action.type==='challenge')challenge(g,seat,now);else play(g,seat,action.cards,this.randomInt,now);
  if(now-(slot.chatAt||0)>6000&&this.randomInt(100)<28){slot.chatAt=now;this.say(room,room.slots.indexOf(slot),action.type==='challenge'?1:this.randomInt(3));}return true;
 }
 recordResult(room){if(!room.matched||room.recorded||room.game?.phase!=='finished')return;room.recorded=true;
  if(room.humanCount!==1)return;const human=room.slots.find(p=>p&&!p.bot);const old=this.records[human.playerId]||{outcomes:[]};this.records[human.playerId]={outcomes:[...old.outcomes,human.gameSeat===room.game.winner].slice(-20),at:this.now()};
  const ids=Object.keys(this.records);if(ids.length>10000){ids.sort((a,b)=>this.records[a].at-this.records[b].at);for(const id of ids.slice(0,ids.length-10000))delete this.records[id];}try{this.saveRecords(this.records);}catch{}
 }
 leave(peer,room){if(room.host===peer.slot||room.phase!=='lobby'){this.end(room,room.host===peer.slot?'房主离开，房间已关闭':'玩家离开，牌局已结束；未完成的对局不发奖励');}else{room.slots[peer.slot]=null;peer.room=null;peer.slot=null;room.slots.forEach(p=>{if(p)p.ready=false;});this.broadcast(room);}}
 end(room,reason){for(const p of room.slots){const peer=p&&this.peers.get(p.peer);if(peer){this.send(peer,{type:'closed',reason});peer.room=null;peer.slot=null;}}this.rooms.delete(room.code);}
 close(id){const peer=this.peers.get(id);if(!peer)return;this.matchmaker.remove(id);if(peer.room){const room=this.rooms.get(peer.room),slot=room?.slots[peer.slot];if(slot){slot.peer=null;slot.offlineAt=this.now();if(room.phase==='match'&&room.game.phase!=='finished'&&room.game.players[slot.gameSeat].alive){room.phase='paused';room.pausedAt=this.now();room.reason=`${slot.name}连接中断，保留座位30秒`;room.remainingDeadline=Math.max(0,(room.game.deadline||this.now())-this.now());}this.broadcast(room);}}this.peers.delete(id);}
 tick(){const now=this.now();this.matchmaker.tick();for(const room of this.rooms.values()){
   if(room.slots.some((p,i)=>p&&p.offlineAt!==null&&now-p.offlineAt>30000&&(room.phase==='lobby'||i===room.host||room.game?.players[p.gameSeat]?.alive))){if(room.phase==='lobby'){for(let i=0;i<4;i++){const p=room.slots[i];if(p&&p.offlineAt!==null&&now-p.offlineAt>30000){if(i===room.host){this.end(room,'房主断线超过30秒，房间已关闭');break;}room.slots[i]=null;}}this.broadcast(room);}else if(room.game?.phase!=='finished')this.end(room,'重连等待结束，本局取消，不发奖励');}
   else if(room.phase==='match'&&room.game){if(step(room.game,this.randomInt,now)||this.botTick(room,now)){this.recordResult(room);this.broadcast(room);}}
   if(now-room.createdAt>3600000)this.end(room,'房间已过期，请重新创建');
  }}
}
