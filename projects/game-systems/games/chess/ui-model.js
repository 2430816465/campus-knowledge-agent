import {analyzePlay,candidates,sortHand,strength,rankLabel,TYPE_NAMES,makePoker} from './cards.js';

export function playLabel(info){
 if(!info)return '';
 if(info.type==='AAAB')return info.len>4?'飞机带单':'三带一';
 if(info.type==='AAABB')return info.len>5?'飞机带对':'三带一对';
 return TYPE_NAMES[info.type]||info.type;
}
export function selectionInfo(g,ids){
 const cards=g.hand.filter(c=>ids.includes(c.id));
 if(g.settlement)return {valid:false,text:'本局已结束'};
 if(g.kind==='nanjing'){
  if(g.choices.claim)return {valid:false,text:'先选择碰、杠、胡或过'};
  if(!g.choices.discard)return {valid:false,text:'可以先选好要打的牌'};
  return {valid:cards.length===1&&g.choices.discard.includes(cards[0].id),text:cards.length===1?'点击出牌确认':'选一张牌，再点击出牌'};
 }
 if(g.phase==='bidding')return {valid:false,text:'先叫分，确定地主'};
 if(g.phase==='tribute')return {valid:cards.length===1&&g.choices.return?.includes(cards[0].id),text:cards.length===1?'确认还贡；红桃级牌不能还贡':'选择2至10的普通牌还贡'};
 if(!cards.length)return {valid:false,text:g.choices.play?g.last?'选牌压过上一手，或选择不出':'你先出，可以出任意合法牌型':'可提前选牌，等轮到你再出'};
 const shape=analyzePlay(cards,g.kind,g.level),legal=analyzePlay(cards,g.kind,g.level,g.last?.info);
 if(!shape)return {valid:false,text:`已选${cards.length}张 · 不是合法牌型`};
 const label=`${playLabel(shape)} · ${cards.length}张`;
 if(!g.choices.play)return {valid:false,text:label+' · 等待你的回合'};
 return {valid:!!legal,text:label+(legal?' · 可以出牌':' · 压不过上一手'),info:legal||shape};
}
export function rangeSelection(order,initial,start,end,add){
 const set=new Set(initial),a=order.indexOf(start),b=order.indexOf(end);
 if(a<0||b<0)return [...set];
 for(const id of order.slice(Math.min(a,b),Math.max(a,b)+1))add?set.add(id):set.delete(id);
 return order.filter(id=>set.has(id));
}
export function sameRankSelection(hand,initial,id){
 const rank=hand.find(c=>c.id===id)?.value,group=hand.filter(c=>c.value===rank).map(c=>c.id),set=new Set(initial),remove=group.every(id=>set.has(id));
 group.forEach(id=>remove?set.delete(id):set.add(id));return hand.filter(c=>set.has(c.id)).map(c=>c.id);
}
export function layoutHand(g,mode){
 if(g.kind==='nanjing')return [...g.hand].sort((a,b)=>(a.id===g.drawn)-(b.id===g.drawn)||a.value-b.value||a.id.localeCompare(b.id));
 const normal=sortHand(g.hand,g.kind==='guandan'?g.level:null);
 if(mode!=='shape'||g.kind==='nanjing'||g.phase==='tribute')return normal;
 const remaining=new Map(normal.map(c=>[c.id,c])),out=[];
 // Keep complete rank groups intact before trying runs; sorting never changes ownership.
 const groups=new Map();for(const c of normal){if(!groups.has(c.value))groups.set(c.value,[]);groups.get(c.value).push(c);}
 for(const group of [...groups.values()].sort((a,b)=>b.length-a.length||strength(b[0],g.kind==='guandan'?g.level:null)-strength(a[0],g.kind==='guandan'?g.level:null))){
  if(group.length>=2){out.push(...group);group.forEach(c=>remaining.delete(c.id));}
 }
 out.push(...normal.filter(c=>remaining.has(c.id)));return out;
}
export class HintCycle{
 constructor(){this.key='';this.index=0;this.list=[];}
 get(g){const key=[g.round,g.revision,g.kind,g.level,g.hand.map(c=>c.id).join(','),JSON.stringify(g.last?.info)].join(':');if(key!==this.key){this.key=key;this.index=0;this.list=candidates(g.hand,g.kind,g.level,g.last?.info);}return this.list;}
 next(g){const list=this.get(g);if(!list.length)return null;const index=this.index++%list.length;return {...list[index],index:index+1,total:list.length};}
}
export function remainingRanks(g){
 const counts=new Map();for(const c of makePoker(g.kind==='ddz3'?1:2))counts.set(c.value,(counts.get(c.value)||0)+1);
 const seen=new Set();for(const c of [...g.hand,...(g.played||[])])if(!seen.has(c.id)){seen.add(c.id);counts.set(c.value,Math.max(0,(counts.get(c.value)||0)-1));}
 return [...counts].sort((a,b)=>b[0]-a[0]).map(([value,count])=>({value,label:rankLabel(value),count}));
}
export function seatPosition(g,seat){const rel=(seat-g.seat+g.players.length)%g.players.length;return rel===0?'self':g.players.length===3?rel===1?'right':'left':rel===2?'top':rel===1?'right':'left';}
