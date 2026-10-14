export const CARD_NAMES = { demon:'魔王', hero:'勇者', princess:'公主', thief:'小偷' };
export const TIMING = {reveal:6000, drink:1800, outcome:4800};
export const isTruth = (kind,target)=>kind===target||kind==='thief';
export const CHARACTERS = [
 {id:'hero',name:'流浪勇者',color:'#64bdb5',art:0},
 {id:'demon',name:'余烬魔王',color:'#d88663',art:1},
 {id:'goblin',name:'地精商人',color:'#b5bd76',art:2},
 {id:'rogue',name:'暮影盗贼',color:'#b49fc9',art:3}
];
// Preserve each distinct requested appearance before assigning the unused roles
// to duplicate choices. Cosmetic assignment never consumes the game RNG.
export function uniqueCharacters(players){
 if(players.length>CHARACTERS.length)throw Error('牌桌最多四个角色');
 const used=new Set(),assigned=players.map(p=>{
  if(CHARACTERS.some(c=>c.id===p.character)&&!used.has(p.character)){used.add(p.character);return p.character;}
  return null;
 }),free=CHARACTERS.filter(c=>!used.has(c.id)).map(c=>c.id);
 return players.map((p,i)=>({...p,character:assigned[i]||free.shift()}));
}
export const shuffle=(values,randomInt)=>{const a=values.slice();for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
export function createMatch(players,randomInt,now=Date.now(),id='match') {
 const game={id,phase:'playing',players:uniqueCharacters(players).map(p=>({...p,alive:true,hand:[],drinks:0,poisonAt:randomInt(6)+1})),order:shuffle(players.map((_,i)=>i),randomInt),round:0,revision:0,last:null,event:null,history:[],winner:null,deadline:null};
 beginRound(game,game.order[0],randomInt,now);return game;
}
function nextSeat(game,seat,predicate=p=>p.alive) {const at=game.order.indexOf(seat);for(let k=1;k<=game.order.length;k++){const s=game.order[(at+k)%game.order.length];if(predicate(game.players[s]))return s;}return null;}
function note(game,text){game.history.unshift(text);game.history=game.history.slice(0,8);}
export function beginRound(game,starter,randomInt,now=Date.now()) {
 game.round++;game.target=['demon','hero','princess'][randomInt(3)];
 const deck=shuffle(['demon','hero','princess'].flatMap(k=>Array(6).fill(k)).concat(['thief','thief']),randomInt);
 let n=0;for(const p of game.players)p.hand=p.alive?deck.splice(0,5).map(kind=>({id:`${game.round}-${n++}`,kind})):[];
 game.turn=game.players[starter]?.alive?starter:nextSeat(game,starter);game.phase='playing';game.phaseAt=now;game.roundAt=now;game.plays=[];game.last=null;game.event=null;game.deadline=now+30000;game.revision++;
 note(game,`第${game.round}轮 · ${CARD_NAMES[game.target]}桌`);
}
export function challenge(game,caller,now=Date.now()) {
 if(game.phase!=='playing'||game.turn!==caller||!game.last)throw Error('现在不能质疑');
 const accused=game.last.seat,cards=game.last.cards.map(c=>c.kind),target=game.last.target,lied=cards.some(c=>!isTruth(c,target)),loser=lied?accused:caller;
 if(game.last.round!==game.round)throw Error('上一手不属于本轮，请重新同步');
 game.event={kind:'challenge',caller,accused,loser,cards,target,round:game.last.round,source:game.last.source,lied,auto:false};game.phase='reveal';game.phaseAt=now;game.deadline=now+TIMING.reveal;game.revision++;
 note(game,`${game.players[caller].name}质疑${game.players[accused].name}的上一手（${CARD_NAMES[target]}桌：${cards.map(k=>CARD_NAMES[k]).join('、')}），${lied?'含假牌，出牌者':'全部为真，质疑者'}${game.players[loser].name}喝药`);
}
export function play(game,seat,ids,randomInt,now=Date.now(),source='manual') {
 if(game.phase!=='playing'||game.turn!==seat||!game.players[seat]?.alive)throw Error('请等待你的回合');
 if(!Array.isArray(ids)||ids.length<1||ids.length>3||new Set(ids).size!==ids.length)throw Error('请选择1至3张不同的牌');
 const p=game.players[seat],cards=ids.map(id=>p.hand.find(c=>c.id===id));if(cards.some(c=>!c))throw Error('只能出自己手中的牌');
 p.hand=p.hand.filter(c=>!ids.includes(c.id));game.last={seat,cards:cards.map(c=>({...c})),target:game.target,round:game.round,source,at:now};game.plays.push({seat,count:cards.length,target:game.target,round:game.round,source,at:now});game.turn=nextSeat(game,seat,p=>p.alive&&p.hand.length>0);game.phaseAt=now;game.deadline=now+30000;game.revision++;
 note(game,`${p.name}声称出了${cards.length}张${CARD_NAMES[game.target]}`);
 if(game.players.filter(p=>p.alive&&p.hand.length>0).length===1){challenge(game,game.turn,now);game.event.auto=true;}
}
export function drink(game,seat,now=Date.now()) {
 if(game.phase!=='potion'||game.event.loser!==seat)throw Error('现在不需要你喝药');
 const p=game.players[seat];p.drinks++;const eliminated=p.drinks===p.poisonAt;p.alive=!eliminated;
 game.event={...game.event,kind:'potion',eliminated,drink:p.drinks,effect:eliminated?'stone':['hiccup','smoke','spark'][((p.drinks+seat)%3)]};game.phase='outcome';game.phaseAt=now;game.deadline=now+TIMING.outcome;game.revision++;
 note(game,`${p.name}${eliminated?'喝下诅咒药，变成石像':'喝下安全药，还剩'+(6-p.drinks)+'瓶'}`);
}
export function step(game,randomInt,now=Date.now()) {
 if(!game.deadline||now<game.deadline)return false;
 if(game.phase==='playing'){const p=game.players[game.turn];note(game,`${p.name}超过30秒，自动扣下1张随机手牌`);play(game,game.turn,[p.hand[randomInt(p.hand.length)].id],randomInt,now,'timeout');}
 // Complete the verdict, then drink atomically. No player choice or extra wait.
 else if(game.phase==='reveal'){game.phase='potion';drink(game,game.event.loser,now);}
 else if(game.phase==='potion')drink(game,game.event.loser,now);
 else if(game.phase==='outcome'){
  const living=game.players.flatMap((p,i)=>p.alive?[i]:[]);
  if(living.length===1){game.winner=living[0];game.phase='finished';game.phaseAt=now;game.deadline=null;game.revision++;note(game,`${game.players[game.winner].name}成为最后的幸存者`);}
  else beginRound(game,game.players[game.event.loser].alive?game.event.loser:nextSeat(game,game.event.loser),randomInt,now);
 }
 return true;
}
export function publicMatch(game,seat) {
 if(!game)return null;
 return {id:game.id,phase:game.phase,phaseAt:game.phaseAt,roundAt:game.roundAt,plays:game.plays.map(p=>({...p})),round:game.round,revision:game.revision,target:game.target,turn:game.turn,order:game.order,deadline:game.deadline,winner:game.winner,event:game.event,history:game.history,last:game.last?{seat:game.last.seat,count:game.last.cards.length,target:game.last.target,round:game.last.round,source:game.last.source,at:game.last.at}:null,
 players:game.players.map(p=>({name:p.name,character:p.character,alive:p.alive,count:p.hand.length,drinks:p.drinks,remaining:6-p.drinks})),hand:game.players[seat]?.alive?game.players[seat].hand:[]};
}
