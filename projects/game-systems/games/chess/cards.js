import landlordValidator from './vendor/landlord-validator.js';
import {analyze as guandanAnalyze,canBeat as guandanBeat} from './vendor/guandan-validator.js';
export const CHARACTERS=[{id:'knight',name:'苍蓝勇者',color:'#8cbfe7'},{id:'dwarf',name:'琥珀铁匠',color:'#e7b26a'},{id:'mage',name:'紫星法师',color:'#c5a3e8'},{id:'rogue',name:'林间游侠',color:'#84c9a6'}];
export const GAMES={ddz3:{name:'三人斗地主',players:3,subtitle:'一副牌 · 一对二'},ddz4:{name:'四人斗地主',players:4,subtitle:'两副牌 · 一对三'},guandan:{name:'掼蛋',players:4,subtitle:'隔座组队 · 从2打到A'},nanjing:{name:'南京麻将',players:4,subtitle:'碰杠不吃 · 花牌计分'}};
export const rankLabel=v=>({11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'}[v]||String(v));
export const SUITS=['♠','♣','♥','♦'];
export const strength=(c,level)=>c.value>=16?c.value+2:c.value===level?17:level&&c.value===15?2:c.value;
export const sortHand=(hand,level)=>hand.slice().sort((a,b)=>strength(b,level)-strength(a,level)||a.type-b.type||a.id.localeCompare(b.id));
export function shuffle(deck,randomInt){for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
export function makePoker(decks=1){const cards=[];for(let d=0;d<decks;d++){for(let v=3;v<=15;v++)for(let t=0;t<4;t++)cards.push({id:`p${d}-${v}-${t}`,value:v,type:t,deck:d});for(let v=16;v<=17;v++)cards.push({id:`p${d}-${v}`,value:v,type:0,deck:d});}return cards;}
const countValues=cards=>{const m=new Map();for(const c of cards){if(!m.has(c.value))m.set(c.value,[]);m.get(c.value).push(c);}return m;};
const consecutive=vs=>vs.every((v,i)=>v<15&&(!i||v===vs[i-1]+1));
export function analyzeLandlord(cards,four=false){
 if(!cards.length||cards.length>(four?33:20))return [];
 const n=cards.length,m=countValues(cards),vs=[...m.keys()].sort((a,b)=>a-b),out=[];
 const add=(type,key,bombPower)=>out.push({type,key,len:n,bomb:!!bombPower,bombPower:bombPower||0});
 if(n===(four?4:2)&&cards.every(c=>c.value>=16)&&(!four||m.get(16)?.length===2&&m.get(17)?.length===2)){add('KING',99,100);return out;}
 if(vs.length===1){if(n>=4&&vs[0]<16){add('AAAA',vs[0],n);return out;}if(n<=3){add(['','A','AA','AAA'][n],vs[0]);return out;}}
 // The MIT classifier handles the established single-deck shapes; the adapter extends long double-deck shapes.
 if(!four){const r=landlordValidator(cards.map(c=>c.value));if(r.status)for(const t of r.types)if((t.type==='AAAB'&&n===4||t.type==='AAABB'&&n===5||['AAAABC','AAAABBCC'].includes(t.type))&&!out.some(x=>x.type===t.type))add(t.type,t.key);}
 if(n>=5&&vs.length===n&&consecutive(vs))add('ABCDE',vs.at(-1));
 if(n>=6&&n%2===0&&m.size===n/2&&vs.every(v=>m.get(v).length===2)&&consecutive(vs))add('AABBCC',vs.at(-1));
 if(n===5){const triple=vs.find(v=>m.get(v).length===3),pair=vs.find(v=>m.get(v).length===2);if(triple&&pair)add('AAABB',triple);}
 if(n===4&&!four){const v=vs.find(v=>m.get(v).length===3);if(v)add('AAAB',v);}
 // Enumerating the body also accepts airplanes where a single wing has the same rank as another wing.
 for(let k=2;k<=Math.floor(n/3);k++)for(let start=3;start+k-1<=14;start++){
  if(!Array.from({length:k},(_,i)=>start+i).every(v=>(m.get(v)?.length||0)>=3))continue;
  const rest=[];for(const [v,cs] of m){const remaining=cs.length-(v>=start&&v<start+k?3:0);if(v>=start&&v<start+k&&remaining)rest.push(...Array(99).fill(v));else rest.push(...Array(remaining).fill(v));}
  if(!rest.length)add('AAABBB',start+k-1);
  if(!four&&rest.length===k)add('AAAB',start+k-1);
  if(rest.length===k*2){const rm=countValues(rest.map(value=>({value})));if(rm.size===k&&[...rm.values()].every(cs=>cs.length===2))add('AAABB',start+k-1);}
 }
 if(!four&&[6,8].includes(n)){const b=vs.find(v=>m.get(v).length===4);if(b){const rest=vs.filter(v=>v!==b);if(n===6)add('AAAABC',b);if(n===8&&rest.length===2&&rest.every(v=>m.get(v).length===2))add('AAAABBCC',b);}}
 return out.filter((x,i)=>out.findIndex(y=>y.type===x.type&&y.key===x.key)===i);
}
export function beats(a,b){if(!b)return true;if(a.bomb||b.bomb){if(!a.bomb)return false;if(!b.bomb)return true;return a.bombPower>b.bombPower||a.bombPower===b.bombPower&&a.key>b.key;}return a.type===b.type&&a.len===b.len&&a.key>b.key;}
export function analyzePlay(cards,kind,level,last=null){
 if(kind==='guandan'){const a=guandanAnalyze(cards,level);return a.status&&guandanBeat(a,last)?a:null;}
 return analyzeLandlord(cards,kind==='ddz4').find(a=>beats(a,last))||null;
}
export const TYPE_NAMES={A:'单张',AA:'对子',AAA:'三张',AAAB:'三带单 / 飞机带单',AAABB:'三带对 / 飞机带对',ABCDE:'顺子',AABBCC:'连对',AAABBB:'飞机',AAAABC:'四带二',AAAABBCC:'四带两对',AAAA:'炸弹',KING:'王炸',SINGLE:'单张',PAIR:'对子',TRIPLE:'三张',FULL_HOUSE:'三带对',STRAIGHT:'顺子',PAIRS_SEQ:'三连对',TRIPLES_SEQ:'钢板',BOMB:'炸弹',STRAIGHT_FLUSH:'同花顺',JOKER_BOMB:'四王炸'};
// Candidate generation uses only own cards and public last play. It never examines another hand or the wall.
export function candidates(hand,kind,level,last=null){
 const out=[],seen=new Set(),m=countValues(hand),groups=[...m.entries()].sort((a,b)=>a[0]-b[0]),wild=kind==='guandan'?hand.filter(c=>c.value===level&&c.type===2):[];
 const add=cs=>{if(!cs.length)return;const key=cs.map(c=>c.id).sort().join(',');if(seen.has(key))return;seen.add(key);const info=analyzePlay(cs,kind,level,last);if(info)out.push({cards:cs.map(c=>c.id),info});};
 for(const c of hand)add([c]);
 for(const [v,cs] of groups){for(let n=2;n<=cs.length;n++)add(cs.slice(0,n));if(wild.length&&v!==level){for(let w=1;w<=wild.length;w++)for(let n=1;n<=cs.length;n++)add([...cs.slice(0,n),...wild.slice(0,w)]);}}
 add(hand.filter(c=>c.value>=16));
 const same=(v,n,used=new Set())=>{const normal=(m.get(v)||[]).filter(c=>!used.has(c.id)&&!wild.includes(c)),ws=wild.filter(c=>!used.has(c.id));const natural=(m.get(v)||[]).filter(c=>!used.has(c.id));if(natural.length>=n)return natural.slice(0,n);return normal.length+ws.length>=n?[...normal,...ws.slice(0,n-normal.length)]:null;};
 const triples=[];
 for(let v=3;v<=15;v++){const cs=same(v,3);if(cs)triples.push(cs);}
 for(const cs of triples){const used=new Set(cs.map(c=>c.id));if(kind==='ddz3')for(const c of hand)if(!used.has(c.id))add([...cs,c]);for(const [v] of groups){const ps=same(v,2,used);if(ps)add([...cs,...ps]);}}
 for(const [v,cs] of groups)if(cs.length>=4&&kind==='ddz3'){
  const b=cs.slice(0,4),other=hand.filter(c=>!b.includes(c));if(other.length>=2)add([...b,...other.slice(0,2)]);
  const pairs=groups.filter(([w,x])=>w!==v&&x.length>=2);for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++)add([...b,...pairs[i][1].slice(0,2),...pairs[j][1].slice(0,2)]);
 }
 const seq=kind==='guandan'?[14,15,3,4,5,6,7,8,9,10,11,12,13,14]:[3,4,5,6,7,8,9,10,11,12,13,14];
 for(let unit=1;unit<=3;unit++)for(let len=unit===1?5:unit===2?3:2;len<=seq.length;len++){
  if(kind==='guandan'&&len!==(unit===1?5:unit===2?3:2))continue;
  for(let start=0;start+len<=seq.length;start++){
   const used=new Set(),body=[];for(const v of seq.slice(start,start+len)){const cs=same(v,unit,used);if(!cs){body.length=0;break;}body.push(...cs);cs.forEach(c=>used.add(c.id));}if(!body.length)continue;add(body);
   if(unit===1&&kind==='guandan')for(let suit=0;suit<4;suit++){const suited=[],u=new Set();for(const v of seq.slice(start,start+len)){let c=hand.find(c=>c.value===v&&c.type===suit&&!u.has(c.id));if(!c)c=wild.find(c=>!u.has(c.id));if(!c){suited.length=0;break;}suited.push(c);u.add(c.id);}add(suited);}
   if(unit===3&&kind!=='guandan'){
    const other=hand.filter(c=>!used.has(c.id)&&!seq.slice(start,start+len).includes(c.value));if(kind==='ddz3'&&other.length>=len)add([...body,...other.slice(0,len)]);
    const ps=groups.filter(([v])=>!seq.slice(start,start+len).includes(v)).map(([v])=>same(v,2,used)).filter(Boolean);if(ps.length>=len)add([...body,...ps.slice(0,len).flat()]);
   }
  }
 }
 return out.sort((a,b)=>Number(a.info.bomb)-Number(b.info.bomb)||b.cards.length-a.cards.length||a.info.bombPower-b.info.bombPower||a.info.key-b.info.key);
}
