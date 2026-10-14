import {makePoker,shuffle,sortHand,analyzePlay,candidates,TYPE_NAMES,strength} from './cards.js';
const nextActive=(g,seat)=>{for(let n=1;n<=g.players.length;n++){const i=(seat+n)%g.players.length;if(g.players[i].hand.length)return i;}return seat;};
function returnCards(hand,level){const ordinary=hand.filter(c=>!(c.value===level&&c.type===2));const low=ordinary.filter(c=>c.value<=10||c.value===15);return low.length?low:ordinary.sort((a,b)=>strength(a,level)-strength(b,level)).slice(0,1);}
export function createPoker(kind,players,options,randomInt,now,previous=null){
 const g={kind,phase:'playing',revision:(previous?.revision||0)+1,round:(previous?.round||0)+1,options,players:players.map((p,i)=>({...p,hand:[],score:previous?.players[i].score||0,plays:0})),turn:0,last:null,passes:0,order:[],played:[],bottom:[],landlord:null,multiplier:1,bids:[],bidValue:0,bidWinner:null,teamLevels:previous?.teamLevels?.slice()||[15,15],level:previous?.nextLevel||15,deadline:now+30000,events:[],settlement:null,previousOrder:previous?.order?.slice()||[],tribute:null};
 const deck=shuffle(makePoker(kind==='ddz3'?1:2),randomInt),bottom=kind==='ddz3'?3:kind==='ddz4'?8:0;
 g.bottom=deck.splice(deck.length-bottom,bottom);deck.forEach((c,i)=>g.players[i%players.length].hand.push(c));g.players.forEach(p=>p.hand=sortHand(p.hand,g.kind==='guandan'?g.level:null));
 if(kind.startsWith('ddz')){g.phase='bidding';g.turn=randomInt(players.length);g.bidStart=g.turn;g.bids=Array(players.length).fill(null);}
 else{g.turn=g.previousOrder[0]??randomInt(4);if(previous)prepareTribute(g,randomInt,now);}
 g.actionLog=[];g.tablePlays=Array(players.length).fill(null);g.trick=0;
 return g;
}
function record(g,seat,type,now,extra={}){const item={id:g.revision+1,seat,type,at:now,...extra};g.actionLog??=[];g.actionLog.push(item);g.actionLog=g.actionLog.slice(-160);g.tablePlays??=Array(g.players.length).fill(null);g.tablePlays[seat]=item;}
function log(g,text){g.events.push(text);g.events=g.events.slice(-8);}
function bump(g,now){g.revision++;g.deadline=now+30000;}
function ownership(g,seat,ids){if(!Array.isArray(ids)||!ids.length||ids.length>33||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw Error('请选择不同的手牌');const cs=ids.map(id=>g.players[seat].hand.find(c=>c.id===id));if(cs.some(c=>!c))throw Error('只能操作自己的手牌');return cs;}
function transfer(g,from,to,card){g.players[from].hand=g.players[from].hand.filter(c=>c.id!==card.id);g.players[to].hand.push(card);g.players[to].hand=sortHand(g.players[to].hand,g.level);}
function prepareTribute(g,randomInt,now){
 const order=g.previousOrder;if(order.length!==4)return;
 const losers=order[0]%2===order[1]%2?[order[2],order[3]]:[order[3]];
 if(losers.reduce((n,s)=>n+g.players[s].hand.filter(c=>c.value===17).length,0)===2){log(g,'双大王抗贡，头游先出');return;}
 const entries=losers.map(from=>({from,card:g.players[from].hand.filter(c=>!(c.value===g.level&&c.type===2)).sort((a,b)=>strength(b,g.level)-strength(a,g.level))[0]}));
 entries.sort((a,b)=>strength(b.card,g.level)-strength(a.card,g.level));
 // Equal double tribute: the previous head receives the right-hand opponent's tribute.
 if(entries.length===2&&strength(entries[0].card,g.level)===strength(entries[1].card,g.level)&&entries[1].from===(order[0]+1)%4)entries.reverse();
 entries.forEach((e,i)=>{e.to=order[i];e.returned=false;transfer(g,e.from,e.to,e.card);log(g,`${g.players[e.from].name}向${g.players[e.to].name}进贡`);});
 const strongest=entries[0];g.tribute={entries,lead:strongest.from};g.phase='tribute';g.turn=entries[0].to;g.deadline=now+30000;
}
export function actPoker(g,seat,a,randomInt,now){
 if(g.phase==='roundEnd'||g.phase==='finished')throw Error('本局已结算');if(seat!==g.turn)throw Error('还没轮到你');
 if(g.phase==='bidding'){
  const value=a.value;if(a.type!=='bid'||!Number.isInteger(value)||value<0||value>3||value!==0&&value<=g.bidValue)throw Error('请选择更高的叫分，或不叫');
  g.bids[seat]=value;if(value){g.bidValue=value;g.bidWinner=seat;}log(g,`${g.players[seat].name}：${value?value+'分':'不叫'}`);record(g,seat,'bid',now,{value});
  if(value===3||g.bids.every(v=>v!==null)){
   if(g.bidWinner===null){g.bidWinner=g.bidStart;g.bidValue=1;log(g,'全员不叫，本轮由首位叫牌者担任地主');}
   g.landlord=g.bidWinner;g.multiplier=g.bidValue;g.players[g.landlord].hand=sortHand([...g.players[g.landlord].hand,...g.bottom]);g.phase='playing';g.turn=g.landlord;
  }else g.turn=(seat+1)%g.players.length;
  bump(g,now);return;
 }
 if(g.phase==='tribute'){
  if(a.type!=='return'||a.cards?.length!==1)throw Error('请选择一张2至10的普通牌还贡');const card=ownership(g,seat,a.cards)[0];if(!returnCards(g.players[seat].hand,g.level).some(c=>c.id===card.id))throw Error('还贡牌须为2至10，不能是红桃级牌');
  const e=g.tribute.entries.find(e=>!e.returned&&e.to===seat);if(!e)throw Error('当前无需还贡');transfer(g,seat,e.from,card);e.returned=true;log(g,`${g.players[seat].name}已还贡`);
  const next=g.tribute.entries.find(e=>!e.returned);if(next)g.turn=next.to;else{g.phase='playing';g.turn=g.tribute.lead;}
  bump(g,now);return;
 }
 if(a.type==='pass'){
  if(!g.last)throw Error('新一轮必须出牌');g.passes++;log(g,`${g.players[seat].name}：不出`);record(g,seat,'pass',now);
  const active=g.players.filter(p=>p.hand.length).length,leaderActive=g.players[g.last.seat].hand.length>0;
  if(g.passes>=(leaderActive?active-1:active)){
   const leader=g.last.seat;g.last=null;g.passes=0;
   // Guandan 接风: when nobody beats a finished leader, their partner leads if still active.
   g.turn=g.kind==='guandan'&&!leaderActive&&g.players[(leader+2)%4].hand.length?(leader+2)%4:leaderActive?leader:nextActive(g,leader);
  }else g.turn=nextActive(g,seat);
  bump(g,now);return;
 }
 if(a.type!=='play')throw Error('当前只能出牌或不出');const cs=ownership(g,seat,a.cards),info=analyzePlay(cs,g.kind,g.level,g.last?.info);if(!info)throw Error(g.last?'牌型不符或没有压过上一手':'这组牌不是合法牌型');
 if(!g.last){g.trick=(g.trick||0)+1;g.tablePlays=Array(g.players.length).fill(null);}record(g,seat,'play',now,{cards:sortHand(cs,g.kind==='guandan'?g.level:null),info});
 g.players[seat].hand=g.players[seat].hand.filter(c=>!a.cards.includes(c.id));g.players[seat].plays++;g.played.push(...cs);g.last={seat,cards:cs,info};g.passes=0;if(info.bomb&&g.kind!=='guandan')g.multiplier=Math.min(4096,g.multiplier*(g.kind==='ddz3'?2:info.bombPower>=8?3:info.bombPower>=6?2:1));
 log(g,`${g.players[seat].name}：${TYPE_NAMES[info.type]||info.type} ${cs.length}张`);
 if(!g.players[seat].hand.length){g.order.push(seat);if(g.kind!=='guandan'){settleLandlord(g,seat);bump(g,now);return;}
  if(g.order.length>=3){g.order.push(g.players.findIndex(p=>p.hand.length));settleGuandan(g);bump(g,now);return;}
  if(g.order.length===2&&g.order[0]%2===g.order[1]%2){g.order.push(...g.players.map((_,i)=>i).filter(i=>!g.order.includes(i)));settleGuandan(g);bump(g,now);return;}
 }
 g.turn=nextActive(g,seat);bump(g,now);
}
function settleLandlord(g,winner){
 const n=g.players.length,landlordWin=winner===g.landlord,spring=landlordWin?g.players.every((p,i)=>i===g.landlord||p.plays===0):g.players[g.landlord].plays===1;
 if(spring)g.multiplier=Math.min(4096,g.multiplier*2);
 const deltas=g.players.map((_,i)=>i===g.landlord?(landlordWin?1:-1)*g.multiplier*(n-1):(landlordWin?-1:1)*g.multiplier);g.players.forEach((p,i)=>p.score+=deltas[i]);
 g.settlement={title:landlordWin?'地主获胜':'农民获胜',winners:g.players.map((_,i)=>i).filter(i=>landlordWin?i===g.landlord:i!==g.landlord),deltas,details:[`叫分、炸弹及春天结算：${g.multiplier}倍`,spring?'春天 / 反春天 ×2':'无春天加倍']};g.phase=g.round>=g.options.rounds?'finished':'roundEnd';
}
const LEVELS=[15,3,4,5,6,7,8,9,10,11,12,13,14];
function settleGuandan(g){
 const team=g.order[0]%2,partner=g.order.indexOf((g.order[0]+2)%4),delta=partner===1?3:partner===2?2:1,level=g.teamLevels[team];
 const cleared=level===14&&partner<3,idx=LEVELS.indexOf(level);g.teamLevels[team]=LEVELS[Math.min(12,idx+delta)];g.nextLevel=g.teamLevels[team];
 const deltas=g.players.map((_,i)=>i%2===team?delta:-delta);g.players.forEach((p,i)=>p.score+=deltas[i]);g.settlement={title:cleared?'成功过A，搭档获胜':`第${team+1}队升${delta}级`,winners:[team,team+2],deltas,details:[`出完顺序：${g.order.map(s=>g.players[s].name).join(' → ')}`,`下一局打${({15:'2',14:'A',11:'J',12:'Q',13:'K'}[g.nextLevel]||g.nextLevel)}`,partner===3?'头游搭档末游，只升1级；打A时不能过A':'头游搭档非末游，打A即可过A']};g.phase=cleared?'finished':'roundEnd';
}
export function pokerChoices(g,seat){
 if(seat!==g.turn||!['playing','bidding','tribute'].includes(g.phase))return {};
 if(g.phase==='bidding')return {bid:[0,1,2,3].filter(v=>v===0||v>g.bidValue)};
 if(g.phase==='tribute')return {return:returnCards(g.players[seat].hand,g.level).map(c=>c.id)};
 return {play:true,pass:!!g.last};
}
export function choosePoker(view){
 const g=view,seat=g.seat,hand=g.hand;if(g.phase==='bidding'){const high=hand.filter(c=>c.value>=14).length;return {type:'bid',value:high>=7?3:high>=5&&g.bidValue<2?2:high>=3&&g.bidValue<1?1:0};}
 if(g.phase==='tribute'){const c=returnCards(hand,g.level).sort((a,b)=>strength(a,g.level)-strength(b,g.level))[0];return c?{type:'return',cards:[c.id]}:null;}
 const list=candidates(hand,g.kind,g.level,g.last?.info);if(!list.length)return {type:'pass'};
 if(g.last&&g.last.seat!==seat){const friend=g.kind==='guandan'?g.last.seat%2===seat%2:g.landlord!==seat&&g.last.seat!==g.landlord;if(friend&&!list.some(x=>x.cards.length===hand.length))return {type:'pass'};}
 const candidate=list.find(x=>x.cards.length===hand.length)||list[0];return {type:'play',cards:candidate.cards};
}
export function publicPoker(g,seat){return {kind:g.kind,phase:g.phase,revision:g.revision,round:g.round,options:g.options,seat,hand:sortHand(g.players[seat].hand,g.kind==='guandan'?g.level:null),players:g.players.map((p,i)=>({seat:i,name:p.name,character:p.character,count:p.hand.length,score:p.score,plays:p.plays,finished:g.order.includes(i),...(g.settlement?{remaining:sortHand(p.hand,g.kind==='guandan'?g.level:null)}:{})})),turn:g.turn,last:g.last,played:g.played,tablePlays:g.tablePlays||[],actionLog:g.actionLog||[],trick:g.trick||0,bottom:g.landlord===null?[]:g.bottom,landlord:g.landlord,bids:g.bids,bidValue:g.bidValue,multiplier:g.multiplier,level:g.level,teamLevels:g.teamLevels,order:g.order,deadline:g.deadline,events:g.events,choices:pokerChoices(g,seat),settlement:g.settlement,tribute:g.tribute?{entries:g.tribute.entries.map(e=>({from:e.from,to:e.to,card:e.card,returned:e.returned})),lead:g.tribute.lead}:null};}
