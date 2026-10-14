import {isTruth,CHARACTERS} from './rules.js';

export const characterName=character=>CHARACTERS.find(c=>c.id===character)?.name||'同桌角色';
// Project identity only in the UI. Player IDs, rules, dealt cards and RNG stay authoritative.
export function roleSnapshot(message){
 const players=message.players?.map(p=>p?{...p,name:characterName(p.character)}:null);
 const game=message.game?{...message.game,players:message.game.players.map(p=>({...p,name:characterName(p.character)})),history:[]}:null;
 const names=game?.players||players;
 return {...message,players,game,reason:message.phase==='paused'?'有角色连接中断，保留座位30秒':message.reason,
  chat:message.chat?.map(line=>({...line,name:names?.[line.seat]?.name||'同桌角色'}))};
}

export const SEAT_COLORS=['#80dacb','#efb076','#c3cb7c','#caa9ed'];
// Public counts establish ownership. Only the challenged last batch has faces.
export function tableSeats(game,viewer){
 const at=game.order.indexOf(viewer),others=game.order.slice(at+1).concat(game.order.slice(0,at));
 const plays=game.plays||[],lastIndex=plays.length-1;
 return [viewer,...others].map((seat,position)=>{
  const cards=[];
  plays.forEach((play,index)=>{
   if(play.seat!==seat)return;
   const latest=index===lastIndex,open=latest&&game.event&&game.phase!=='playing';
   for(let i=0;i<play.count;i++){
    const kind=open?game.event.cards[i]:null;
    cards.push({batch:index,latest,kind,truth:kind?isTruth(kind,game.event.target):null,faceIndex:i});
   }
  });
  const role=game.event&&game.phase!=='playing'?(seat===game.event.accused?'被开牌者':seat===game.event.caller?'质疑者':''):game.last?.seat===seat?'最新出牌者':game.turn===seat?'正在出牌':'';
  return {seat,position,self:seat===viewer,color:SEAT_COLORS[seat],cards,role,turn:game.phase==='playing'&&game.turn===seat};
 });
}

export const roundIntro=(game,now)=>game?.phase==='playing'&&!game.last&&now-game.roundAt<2400;

// One clock belongs to the seat that can act. Deadlines come from the authority.
export function seatCountdown(game,seat,now){
 if(!game?.deadline)return null;
 const owner=game.phase==='playing'?game.turn:null;
 if(owner==null||owner!==seat)return null;
 const remaining=Math.max(0,game.deadline-now);
 return {seconds:Math.ceil(remaining/1000),fraction:Math.min(1,remaining/30000),action:'出牌'};
}
