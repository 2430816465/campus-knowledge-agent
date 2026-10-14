import {GAMES,CHARACTERS} from './cards.js';
import {MAHJONG_DEFAULTS,RULE_OPTIONS,createMahjong,actMahjong,publicMahjong,chooseMahjong} from './mahjong.js';
import {createPoker,actPoker,publicPoker,choosePoker} from './poker.js';
export function secureUUID(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
export function secureInt(max){const a=new Uint32Array(1),limit=Math.floor(4294967296/max)*max;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%max;}
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(id);
const cleanName=name=>String(name||'旅人').replace(/[\u0000-\u001f]/g,'').trim().slice(0,16)||'旅人';
export function normalizeOptions(kind,raw={}){
 if(!GAMES[kind])throw Error('请选择已有玩法');if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('房间选项无效');
 const o=kind==='nanjing'?{...MAHJONG_DEFAULTS}:{rounds:4,players:GAMES[kind].players};
 for(const key of ['rounds','players','cap','base',...RULE_OPTIONS.map(x=>x[0])])if(raw[key]!==undefined){if(key in o)o[key]=raw[key];}
 if(![4,8].includes(o.rounds)||!Number.isInteger(o.players)||!(kind==='nanjing'?[2,3,4]:[GAMES[kind].players]).includes(o.players))throw Error('局数或人数无效');
 if(kind==='nanjing'&&(![0,300,600].includes(o.cap)||![10,20].includes(o.base)||RULE_OPTIONS.some(([key])=>typeof o[key]!=='boolean')))throw Error('南京麻将规则选项无效');return o;
}
export class Rooms{
 constructor({randomInt=secureInt,uuid=secureUUID,now=()=>Date.now(),botDelay=850}={}){Object.assign(this,{randomInt,uuid,now,botDelay});this.rooms=new Map();this.peers=new Map();this.queue=new Map();this.metrics={joins:0,resumes:0,rejections:0,commands:0};}
 open(id,send,{host=false,phone=false}={}){if(this.peers.size>=128){send({type:'error',message:'服务器连接已满'});return;}this.peers.set(id,{id,send,host,phone,room:null,seat:null,rate:0,rateAt:this.now()});send({type:'hello',version:1});}
 send(p,data){try{p.send(data);}catch{this.close(p.id);}}
 newSlot(m){return {clientId:m.clientId,name:cleanName(m.name),character:CHARACTERS.some(c=>c.id===m.character)?m.character:'knight',ready:false,token:this.uuid(),peer:null,offlineAt:null,bot:false,auto:false,requests:[]};}
 room(peer){const r=this.rooms.get(peer.room);if(!r||!r.slots[peer.seat])throw Error('请先进入房间');return r;}
 snapshot(r,p){return {type:'snapshot',version:1,code:r.code,kind:r.kind,options:r.options,phase:r.game?r.game.phase:'lobby',matched:r.matched,serverTime:this.now(),seat:p.seat,host:r.host===p.seat,revision:r.revision,players:r.slots.map((s,i)=>s?{seat:i,name:s.name,character:s.character,ready:s.ready,bot:s.bot,auto:s.auto||!s.peer,connected:!!s.peer||s.bot}:null),game:r.game?(r.kind==='nanjing'?publicMahjong(r.game,p.seat):publicPoker(r.game,p.seat)):null};}
 broadcast(r){for(const s of r.slots){const p=s&&this.peers.get(s.peer);if(p)this.send(p,this.snapshot(r,p));}}
 joined(p,r,seat,resumed=false){const s=r.slots[seat];Object.assign(p,{room:r.code,seat});Object.assign(s,{peer:p.id,offlineAt:null});if(r.host<0)r.host=seat;this.metrics[resumed?'resumes':'joins']++;this.send(p,{type:'joined',code:r.code,token:s.token,resumed});this.broadcast(r);}
 createRoom(kind,options,matched=false){if(this.rooms.size>=100)throw Error('房间已满，请稍后重试');let code;do{code=String(100000+this.randomInt(900000));}while(this.rooms.has(code));const r={code,kind,options,matched,host:0,slots:Array(options.players).fill(null),game:null,revision:0,createdAt:this.now(),botAction:null};this.rooms.set(code,r);return r;}
 start(r){const humans=r.slots.filter(s=>s&&!s.bot);if(!humans.length||humans.some(s=>!s.peer||!s.ready))throw Error('所有在线玩家准备后才能开局');
  const used=new Set(r.slots.filter(Boolean).map(s=>s.character));for(let i=0;i<r.slots.length;i++)if(!r.slots[i]){const c=CHARACTERS.find(c=>!used.has(c.id))||CHARACTERS[i];used.add(c.id);r.slots[i]={...this.newSlot({clientId:'bot-'+this.uuid(),name:c.name,character:c.id}),bot:true,ready:true};}
  this.nextGame(r,null);}
 nextGame(r,previous){r.slots.forEach(s=>s.requests=[]);const profiles=r.slots.map(s=>({name:s.name,character:s.character}));r.game=r.kind==='nanjing'?createMahjong(profiles,r.options,this.randomInt,this.now(),previous):createPoker(r.kind,profiles,r.options,this.randomInt,this.now(),previous);r.botAction=null;r.revision++;}
 handle(id,m){const p=this.peers.get(id);if(!p)return;
  try{
   if(!m||typeof m!=='object'||Array.isArray(m)||m.v!==1)throw Error('协议版本不兼容，请更新游戏');const now=this.now();if(now-p.rateAt>=1000){p.rate=0;p.rateAt=now;}if(++p.rate>30)throw Error('操作太快，请稍后重试');
   if(m.type==='ping'){this.send(p,{type:'pong',at:m.at});return;}
   if(['create','practice','match','join'].includes(m.type)){
    if(p.room||this.queue.has(id))throw Error('请先离开当前房间或取消匹配');if(!validId(m.clientId))throw Error('玩家标识无效');
    if(m.type==='join'){
     const r=this.rooms.get(String(m.code));if(!r)throw Error('房间不存在或已关闭');
     if(m.token){const seat=r.slots.findIndex(s=>s?.token===m.token&&s.clientId===m.clientId&&!s.bot);if(seat<0)throw Error('重连凭证无效');const s=r.slots[seat];if(s.peer)throw Error('这个座位已在线');if(s.offlineAt!==null&&now-s.offlineAt>30000)throw Error('重连超过30秒，请重新加入');this.joined(p,r,seat,true);return;}
     if(r.game||r.matched)throw Error('牌局已开始，仅原玩家可以重连');if(r.slots.some(s=>s?.clientId===m.clientId))throw Error('该玩家已在房间，请使用独立设备');const seat=r.slots.indexOf(null);if(seat<0)throw Error('房间已满');r.slots[seat]=this.newSlot(m);r.slots.forEach(s=>{if(s)s.ready=false;});r.revision++;this.joined(p,r,seat);return;
    }
    if(p.phone&&!p.host)throw Error('手机局域网内只能由房主开房');const options=normalizeOptions(m.kind,m.options);
    if(m.type==='match'){if(this.queue.size>=128)throw Error('匹配队列已满');if([...this.peers.values()].some(other=>other.id!==id&&(other.room||this.queue.has(other.id))&&(other.room?this.rooms.get(other.room)?.slots[other.seat]?.clientId:this.queue.get(other.id)?.profile.clientId)===m.clientId))throw Error('你已在匹配或牌桌中');this.queue.set(id,{profile:{...m,options},at:now});this.send(p,{type:'queue',kind:m.kind,waitMs:8000});this.matchTick();return;}
    const r=this.createRoom(m.kind,options);r.slots[0]=this.newSlot(m);this.joined(p,r,0);if(m.type==='practice'){r.slots[0].ready=true;this.start(r);this.broadcast(r);}return;
   }
   if(m.type==='cancelMatch'){this.queue.delete(id);this.send(p,{type:'queueCanceled'});return;}
   const r=this.room(p),s=r.slots[p.seat];
   if(m.type==='leave'){this.leave(p,r);return;}
   if(m.type==='ready'){if(r.game)throw Error('牌局已开始');s.ready=m.value===true;r.revision++;}
   else if(m.type==='configure'){if(r.game||r.host!==p.seat)throw Error('只有房主可以在开局前改规则');const o=normalizeOptions(r.kind,m.options);if(o.players<r.slots.filter(Boolean).length)throw Error('人数小于已加入玩家数');r.slots.length=o.players;for(let i=0;i<o.players;i++)r.slots[i]??=null;r.options=o;r.slots.forEach(s=>{if(s)s.ready=false;});r.revision++;}
   else if(m.type==='start'){if(r.game||r.host!==p.seat)throw Error('请等待房主开局');this.start(r);}
   else if(m.type==='continue'||m.type==='next'){if(m.type==='next'&&r.host!==p.seat)throw Error('请使用继续下一局准备');if(!['roundEnd','finished'].includes(r.game?.phase))throw Error('请等本局结算后准备');s.ready=true;r.revision++;const humans=r.slots.filter(x=>!x.bot&&x.peer);if(humans.length&&humans.every(x=>x.ready))this.nextGame(r,r.game.phase==='finished'?null:r.game);}
   else if(m.type==='auto'){s.auto=m.value===true;r.botAction=null;}
   else if(m.type==='action'){
    if(!r.game||s.auto)throw Error(s.auto?'请先取消托管':'牌局尚未开始');if(!validId(m.requestId))throw Error('操作编号无效');if(s.requests.includes(m.requestId)){this.send(p,{type:'ack',requestId:m.requestId,duplicate:true});this.send(p,this.snapshot(r,p));return;}if(m.revision!==r.game.revision)throw Error('牌局已经更新，请重新操作');if(!m.action||typeof m.action!=='object'||Array.isArray(m.action))throw Error('操作内容无效');
    this.apply(r,p.seat,m.action);s.requests.push(m.requestId);s.requests=s.requests.slice(-64);this.send(p,{type:'ack',requestId:m.requestId});
   }else throw Error('未知操作');this.broadcast(r);
  }catch(e){this.metrics.rejections++;this.send(p,{type:'error',message:e.message});if(p.room){const r=this.rooms.get(p.room);if(r)this.send(p,this.snapshot(r,p));}}
 }
 apply(r,seat,a){if(r.kind==='nanjing')actMahjong(r.game,seat,a,this.randomInt,this.now());else actPoker(r.game,seat,a,this.randomInt,this.now());if(r.game.settlement)r.slots.forEach(s=>s.ready=s.bot||!s.peer);r.botAction=null;this.metrics.commands++;}
 matchTick(){const now=this.now(),byKind=new Map();for(const [id,e] of this.queue){const key=e.profile.kind;if(!byKind.has(key))byKind.set(key,[]);byKind.get(key).push({id,...e});}
  for(const [kind,group] of byKind){const size=GAMES[kind].players;if(group.length<size&&now-group[0].at<8000)continue;const batch=group.slice(0,size);try{const r=this.createRoom(kind,normalizeOptions(kind),true);batch.forEach((e,i)=>{this.queue.delete(e.id);r.slots[i]=this.newSlot(e.profile);r.slots[i].ready=true;});batch.forEach((e,i)=>this.joined(this.peers.get(e.id),r,i));this.start(r);this.broadcast(r);}catch(e){batch.forEach(({id})=>{this.queue.delete(id);const p=this.peers.get(id);if(p){this.send(p,{type:'queueCanceled'});this.send(p,{type:'error',message:e.message});}});}}
 }
 leave(p,r){const s=r.slots[p.seat];s.peer=null;s.token=null;if(r.game){s.bot=true;s.auto=true;}else r.slots[p.seat]=null;p.room=null;p.seat=null;this.send(p,{type:'closed',reason:'已离开牌桌'});if(!r.slots.some(s=>s&&!s.bot&&s.peer)){this.end(r,'玩家已离席');return;}this.transferOwner(r);r.revision++;this.broadcast(r);}
 transferOwner(r){if(r.slots[r.host]?.peer)return;r.host=r.slots.findIndex(s=>s&&!s.bot&&s.peer);}
 end(r,reason){for(const s of r.slots){const p=s&&this.peers.get(s.peer);if(p){p.room=null;p.seat=null;this.send(p,{type:'closed',reason});}}this.rooms.delete(r.code);}
 close(id){const p=this.peers.get(id);if(!p)return;this.queue.delete(id);if(p.room){const r=this.rooms.get(p.room),s=r?.slots[p.seat];if(s){s.peer=null;s.offlineAt=this.now();r.botAction=null;this.transferOwner(r);this.broadcast(r);}}this.peers.delete(id);}
 tick(){const now=this.now();this.matchTick();for(const r of [...this.rooms.values()]){
   let presenceChanged=false;for(let i=0;i<r.slots.length;i++){const s=r.slots[i];if(s&&!s.bot&&s.offlineAt!==null&&now-s.offlineAt>30000){presenceChanged=true;if(r.game){s.bot=true;s.token=null;}else r.slots[i]=null;}}
   if(!r.slots.some(s=>s&&!s.bot&&(s.peer||s.offlineAt!==null&&now-s.offlineAt<=30000))||now-r.createdAt>7200000){this.end(r,'房间已关闭');continue;}
   this.transferOwner(r);if(presenceChanged){r.revision++;this.broadcast(r);}const g=r.game;if(!g||['roundEnd','finished'].includes(g.phase))continue;
   const eligible=g.pending?Object.keys(g.pending.eligible).map(Number).filter(i=>!g.pending.responses[i]):[g.turn];
   const botSeat=eligible.find(i=>r.slots[i].bot||r.slots[i].auto||!r.slots[i].peer),timedOut=now>=g.deadline,seat=timedOut?eligible[0]:botSeat;
   if(seat===undefined)continue;if(!timedOut){if(r.botAction?.revision!==g.revision||r.botAction?.seat!==seat){r.botAction={revision:g.revision,seat,at:now+this.botDelay};continue;}if(now<r.botAction.at)continue;}
   const view=r.kind==='nanjing'?publicMahjong(g,seat):publicPoker(g,seat),a=r.kind==='nanjing'?chooseMahjong(view):choosePoker(view);if(a){try{this.apply(r,seat,a);this.broadcast(r);}catch(e){this.metrics.rejections++;r.botAction=null;g.deadline=now+1000;}}
  }}
}
