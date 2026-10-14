import {isStandardWinning} from './vendor/mahjong-validator.js';
import {shuffle} from './cards.js';
export const MAHJONG_DEFAULTS={rounds:4,players:4,cap:0,base:10,flower2:true,gangDouble:true,sea:true,double7:true,multiHu:true,bi:true,bao:true,directMen:true,addedMen:true};
export const RULE_OPTIONS=[['flower2','花砸2','硬花与软花按2倍计花'],['gangDouble','兜翻底','杠后自摸将胡牌总花翻倍；关闭时改为加40花'],['sea','海底捞月','余墙不超过4张时自摸加20花'],['double7','双七对','七对含四张相同牌时，按双七对100花计'],['multiHu','一炮多响','同一弃牌可被多家胡；关闭时最近下家优先'],['bi','比下胡','大胡、连庄、花杠、罚分、包牌、多响或流局使下一局翻倍，不累乘'],['bao','包牌包三家','三嘴同源包牌、抢补杠或明杠后自摸，由责任家包付三份'],['directMen','直杠算门清','未碰牌时，直接明杠仍算门清'],['addedMen','补杠算门清','碰牌补成杠后，此副不再破坏门清']];
export const tileLabel=v=>v<27?`${v%9+1}${['万','条','筒'][Math.floor(v/9)]}`:['东','南','西','北','中','发','白','春','夏','秋','冬','梅','兰','竹','菊'][v-27];
export function makeTiles(){const out=[];for(let v=0;v<42;v++)for(let n=0;n<(v<34?4:1);n++)out.push({id:`t${v}-${n}`,value:v,type:0});return out;}
const counts=hand=>{const a=Array(31).fill(0);for(const c of hand)if(c.value<31)a[c.value]++;return a;};
const sorted=hand=>hand.slice().sort((a,b)=>a.value-b.value||a.id.localeCompare(b.id));
export function sevenPairs(hand,enabled=true){if(hand.length!==14)return false;const cs=counts(hand);return cs.every(n=>n%2===0)&&(!cs.includes(4)||enabled);}
export function winning(hand,melds=[],double7=true){return hand.every(c=>c.value<31)&&(isStandardWinning(hand,melds.length)||!melds.length&&sevenPairs(hand,double7));}
export function waitingValues(hand,melds=[],double7=true){const cs=counts([...hand,...melds.flatMap(m=>m.cards)]),out=[];for(let v=0;v<31;v++)if(cs[v]<4&&winning([...hand,{id:'probe',value:v}],melds,double7))out.push(v);return out;}
function decompositions(hand,melds){
 const out=[],cs=counts(hand),need=4-melds.length;
 function groups(left,list){if(list.length===need){if(left.every(n=>!n))out.push(list.map(x=>x.slice()));return;}const v=left.findIndex(n=>n);if(v<0)return;
  if(left[v]>=3){left[v]-=3;groups(left,[...list,[v,v,v]]);left[v]+=3;}
  if(v<27&&v%9<=6&&left[v+1]&&left[v+2]){left[v]--;left[v+1]--;left[v+2]--;groups(left,[...list,[v,v+1,v+2]]);left[v]++;left[v+1]++;left[v+2]++;}
 }
 for(let p=0;p<31;p++)if(cs[p]>=2){cs[p]-=2;const start=out.length;groups(cs,[]);for(let i=start;i<out.length;i++)out[i]={pair:p,groups:out[i]};cs[p]+=2;}
 return out;
}
function menqing(p,o){return p.melds.every(m=>m.type==='concealed'||m.type==='direct'&&o.directMen||m.type==='added'&&o.addedMen);}
export function scoreHand(g,seat,card,self=true,context={}){
 const p=g.players[seat],hand=self?p.hand:[...p.hand,card],o=g.options;if(!winning(hand,p.melds,o.double7))return null;
 const all=[...hand,...p.melds.flatMap(m=>m.cards)],cs=counts(hand),suits=new Set(all.filter(c=>c.value<27).map(c=>Math.floor(c.value/9))),honors=all.some(c=>c.value>=27),seven=!p.melds.length&&sevenPairs(hand,o.double7),closed=menqing(p,o),patterns=[];
 const add=(name,flowers,big=true)=>patterns.push({name,flowers,big});
 if(seven)add(cs.includes(4)?'双七对':'七对',cs.includes(4)?100:50);
 else if(decompositions(hand,p.melds).some(d=>d.groups.every(x=>x[0]===x[1])))add('碰碰胡',30);
 if(!suits.size)add('风一色',100);else if(suits.size===1)add(honors?'混一色':'清一色',honors?30:40);
 if(p.melds.length===4)add('全球独钓',50);
 if(!p.flowers.length&&(closed||patterns.length))add('无花果',30);
 if(self&&seat===g.dealer&&g.discardCount===0&&p.melds.length===0)add('天胡',50);
 if(p.earth&&p.melds.length===0)add('地胡',30);
 let soft=0;const softParts=[];
 const softAdd=(name,n)=>{soft+=n;softParts.push(`${name}${n}`);};
 for(const m of p.melds){if(m.type==='peng'){if(m.value>=27)softAdd('风刻',1);}else softAdd(m.type==='concealed'?'暗杠':'明杠',m.value>=27?(m.type==='concealed'?3:2):(m.type==='concealed'?2:1));}
 let bestSoft=-1,bestParts=[];
 for(const d of decompositions(hand,p.melds)){
  let s=d.pair>=27?1:0,parts=d.pair>=27?['风对1']:[];for(const group of d.groups)if(group[0]===group[1]&&group[0]>=27){s++;parts.push('风刻1');}
  if(!seven&&p.melds.length<4){if(d.pair===card.value){s++;parts.push('独占1');}else{const seq=d.groups.find(x=>x[0]!==x[1]&&(x[1]===card.value||x[0]%9===0&&x[2]===card.value||x[0]%9===6&&x[0]===card.value));if(seq){s++;parts.push(seq[1]===card.value?'压档1':'边枝1');}}}
  if(s>bestSoft){bestSoft=s;bestParts=parts;}
 }
 if(bestSoft>0){soft+=bestSoft;softParts.push(...bestParts);}if(suits.size===2)softAdd('缺一',1);
 const preHand=self?p.hand.filter(c=>c.id!==card.id):p.hand,waits=waitingValues(preHand,p.melds,o.double7);
 const absolute=p.melds.some(m=>m.type==='peng'&&m.value===card.value)&&waits.length===1&&decompositions(hand,p.melds).some(d=>d.groups.some(x=>x[0]!==x[1]&&(x[1]===card.value||x[0]%9===0&&x[2]===card.value||x[0]%9===6&&x[0]===card.value)));
 if(absolute){add('压绝',30);const pos=softParts.findIndex(s=>s.startsWith('压档')||s.startsWith('边枝'));if(pos>=0){soft--;softParts.splice(pos,1);}}
 if(self&&p.drawReason==='flower')add('花后开花',10);
 if(self&&p.drawReason==='gang'&&!o.gangDouble)add('杠后开花',40);
 if(self&&o.sea&&g.wall.length<=4)add('海底捞月',20);
 const big=patterns.some(p=>p.big);if(!closed&&p.flowers.length<4&&!big)return null;
 const base=o.base,flower=(p.flowers.length+soft)*(o.flower2?2:1),men=closed&&!seven?base:0;
 let total=base+flower+men+patterns.reduce((n,p)=>n+p.flowers,0),doubled=self&&p.drawReason==='gang'&&o.gangDouble;
 if(doubled)total*=2;total*=g.biMultiplier;if(o.cap)total=Math.min(o.cap,total);
 return {flowers:total,big,menqing:closed,patterns:patterns.map(p=>({name:p.name,flowers:p.flowers})),details:[`底花 ${base}`,`硬花 ${p.flowers.length}＋软花 ${soft}（${softParts.join('、')||'无'}）×${o.flower2?2:1}＝${flower}`,`门清 ${men}`,...patterns.map(p=>`${p.name} +${p.flowers}`),doubled?'兜翻底 ×2':'',g.biMultiplier===2?'比下胡 ×2':'',o.cap?`每份封顶 ${o.cap}`:''].filter(Boolean)};
}
function log(g,text){g.events.push(text);g.events=g.events.slice(-8);}
function payment(g,from,to,amount,reason){amount*=g.biMultiplier;g.players[from].score-=amount;g.players[to].score+=amount;g.payments.push({from,to,amount,reason});log(g,`${g.players[to].name}：${reason} +${amount}`);}
function flowerGangs(g,seat){const p=g.players[seat],vals=p.flowers.map(c=>c.value),sets=[[31,31,31,31],[32,32,32,32],[33,33,33,33],[34,35,36,37],[38,39,40,41]];sets.forEach((set,i)=>{if(p.flowerGangs.includes(i))return;if(set.every(v=>vals.filter(x=>x===v).length>=set.filter(x=>x===v).length)){p.flowerGangs.push(i);g.triggerBi=true;for(let s=0;s<g.players.length;s++)if(s!==seat)payment(g,s,seat,10,'花杠');}});}
function drawRaw(g,seat,tail=false,reason='draw'){
 const p=g.players[seat];let card;while(g.wall.length){card=tail?g.wall.pop():g.wall.shift();if(card.value<31){p.hand.push(card);p.hand=sorted(p.hand);p.drawn=card.id;p.drawReason=reason;return card;}p.flowers.push(card);flowerGangs(g,seat);tail=true;if(reason!=='gang')reason='flower';}return null;
}
export function createMahjong(players,options,randomInt,now,previous=null){
 const n=players.length,dealer=previous?.nextDealer??randomInt(n),g={kind:'nanjing',options,phase:'playing',revision:(previous?.revision||0)+1,round:(previous?.round||0)+1,dealer,turn:dealer,wall:shuffle(makeTiles(),randomInt),players:players.map((p,i)=>({...p,hand:[],flowers:[],flowerGangs:[],melds:[],river:[],score:previous?.players[i].score||0,startScore:previous?.players[i].score||0,drawn:null,drawReason:'draw',earth:false,blockedHu:false,blockedPeng:[]})),last:null,pending:null,deadline:now+30000,discardCount:0,events:[],payments:[],triggerBi:false,biMultiplier:options.bi&&previous?.nextBi?2:1,settlement:null,follow:[],lastDraw:null};
 for(let i=0;i<13;i++)for(let k=0;k<n;k++)drawRaw(g,(dealer+k)%n);
 drawRaw(g,dealer);log(g,'补花完成，庄家先出牌');return g;
}
function bump(g,now){g.revision++;g.deadline=now+(g.pending?10000:30000);}
function drawTurn(g,seat,now,reason='draw'){
 g.pending=null;g.turn=seat;const p=g.players[seat];p.blockedHu=false;p.blockedPeng=[];if(!drawRaw(g,seat,reason==='gang',reason)){settle(g,[],null,false);return;}g.lastDraw=seat;g.deadline=now+30000;
}
function getCard(g,seat,id){const c=g.players[seat].hand.find(c=>c.id===id);if(!c)throw Error('只能操作自己的手牌');return c;}
function claimOptions(g,seat,card,from,rob=false){const p=g.players[seat];if(seat===from)return [];const choices=[];if(!p.blockedHu&&scoreHand(g,seat,card,false,{rob}))choices.push('hu');if(!rob&&!p.earth&&!p.blockedPeng.includes(card.value)){const num=p.hand.filter(c=>c.value===card.value).length;if(num>=3&&g.wall.length)choices.push('gang');if(num>=2)choices.push('peng');}return choices;}
function setupPending(g,card,from,rob=false){const eligible={};for(let s=0;s<g.players.length;s++){const opts=claimOptions(g,s,card,from,rob);if(opts.length)eligible[s]=opts;}if(!Object.keys(eligible).length)return false;g.pending={card,from,rob,eligible,responses:{}};return true;}
function finishAddedGang(g,from,card,now){const p=g.players[from],m=p.melds.find(m=>m.type==='peng'&&m.value===card.value);if(!m)throw Error('无法补杠');p.hand=p.hand.filter(c=>c.id!==card.id);m.cards.push(card);m.type='added';payment(g,m.from,from,10,'补杠');p.gangSource=m.from;g.follow=[];drawTurn(g,from,now,'gang');}
function resolvePending(g,now){
 const q=g.pending;if(!q||Object.keys(q.responses).length<Object.keys(q.eligible).length)return;
 const winners=Object.keys(q.responses).map(Number).filter(s=>q.responses[s]==='hu').sort((a,b)=>(a-q.from+g.players.length)%g.players.length-(b-q.from+g.players.length)%g.players.length);
 if(winners.length){if(q.rob){g.players[q.from].hand=g.players[q.from].hand.filter(c=>c.id!==q.card.id);g.last={seat:q.from,card:q.card,rob:true};}settle(g,g.options.multiHu?winners:[winners[0]],q.card,false,q.from,q.rob);return;}
 if(q.rob){g.pending=null;finishAddedGang(g,q.from,q.card,now);return;}
 const claims=Object.keys(q.responses).map(Number).filter(s=>['peng','gang'].includes(q.responses[s])).sort((a,b)=>(q.responses[b]==='gang')-(q.responses[a]==='gang')||(a-q.from+g.players.length)%g.players.length-(b-q.from+g.players.length)%g.players.length);
 if(claims.length){const s=claims[0],type=q.responses[s],p=g.players[s],cards=p.hand.filter(c=>c.value===q.card.value).slice(0,type==='gang'?3:2);p.hand=p.hand.filter(c=>!cards.includes(c));p.melds.push({type:type==='gang'?'direct':'peng',value:q.card.value,cards:[...cards,q.card],from:q.from});g.players[q.from].river=g.players[q.from].river.filter(c=>c.id!==q.card.id);g.pending=null;g.follow=[];p.drawn=null;p.drawReason='claim';g.turn=s;if(type==='gang'){payment(g,q.from,s,10,'直杠');p.gangSource=q.from;drawTurn(g,s,now,'gang');}log(g,`${p.name}：${type==='gang'?'杠':'碰'}${tileLabel(q.card.value)}`);}
 else drawTurn(g,(q.from+1)%g.players.length,now);
}
export function actMahjong(g,seat,a,randomInt,now){
 if(g.phase!=='playing')throw Error('本局已经结算');const p=g.players[seat];
 if(g.pending){const q=g.pending,opts=q.eligible[seat];if(!opts||q.responses[seat])throw Error('当前无需响应');if(a.type!=='claim'||!['pass',...opts].includes(a.value))throw Error('请选择碰、杠、胡或过');q.responses[seat]=a.value;if(a.value!=='hu'&&opts.includes('hu'))p.blockedHu=true;if(a.value==='pass'&&opts.includes('peng'))p.blockedPeng.push(q.card.value);resolvePending(g,now);bump(g,now);return;}
 if(g.turn!==seat)throw Error('还没轮到你');
 if(a.type==='hu'){const card=p.hand.find(c=>c.id===p.drawn);if(!card||!scoreHand(g,seat,card,true))throw Error('尚未达到胡牌条件');settle(g,[seat],card,true);bump(g,now);return;}
 if(a.type==='gang'){
  if(p.earth)throw Error('报天听后保持听口，不可改变手牌');const card=getCard(g,seat,a.card),same=p.hand.filter(c=>c.value===card.value);if(!g.wall.length)throw Error('牌墙已空，不能杠');
  if(same.length===4){p.hand=p.hand.filter(c=>c.value!==card.value);p.melds.push({type:'concealed',value:card.value,cards:same,from:seat});for(let s=0;s<g.players.length;s++)if(s!==seat)payment(g,s,seat,5,'暗杠');p.gangSource=null;g.follow=[];drawTurn(g,seat,now,'gang');}
  else if(p.melds.some(m=>m.type==='peng'&&m.value===card.value)){if(!setupPending(g,card,seat,true))finishAddedGang(g,seat,card,now);}
  else throw Error('请选择可以暗杠或补杠的牌');bump(g,now);return;
 }
 if(!['discard','declare'].includes(a.type))throw Error('请选择出牌、杠或胡');const card=getCard(g,seat,a.card);if(p.earth&&a.card!==p.drawn)throw Error('报天听后只能摸切，不可换听');
 if(a.type==='declare'){if(p.river.length||p.melds.length||!waitingValues(p.hand.filter(c=>c.id!==card.id),p.melds,g.options.double7).length)throw Error('只可在首次出牌时报天听');p.earth=true;log(g,`${p.name}：报天听`);}
 p.hand=p.hand.filter(c=>c.id!==card.id);p.river.push(card);p.blockedHu=false;p.blockedPeng=[];p.drawn=null;p.drawReason='draw';p.gangSource=null;g.last={seat,card};g.discardCount++;g.follow.push({seat,value:card.value});g.follow=g.follow.slice(-g.players.length);log(g,`${p.name}：${tileLabel(card.value)}`);
 if(g.players.length===4&&g.follow.length===4&&new Set(g.follow.map(e=>e.seat)).size===4&&g.follow.every(e=>e.value===card.value)){const from=g.follow[0].seat;for(let s=0;s<4;s++)if(s!==from)payment(g,from,s,5,'四家跟牌');g.triggerBi=true;g.follow=[];}
 if(p.river.filter(c=>c.value===card.value).length===4){for(let s=0;s<g.players.length;s++)if(s!==seat)payment(g,seat,s,5,'四张同牌罚分');g.triggerBi=true;}
 if(!setupPending(g,card,seat))drawTurn(g,(seat+1)%g.players.length,now);bump(g,now);
}
function settle(g,winners,card,self,from=null,rob=false){
 const n=g.players.length,details=[],breakdowns=[];let anyBig=false,baoOccurred=false;
 for(const s of winners){const p=g.players[s],score=scoreHand(g,s,card,self),sourceCounts=new Map();if(!score)throw Error('胡牌计分失败');anyBig||=score.big;
  for(const m of p.melds)if(m.from!==s)sourceCounts.set(m.from,(sourceCounts.get(m.from)||0)+1);
  let responsible=null;if(g.options.bao){if(rob)responsible=from;else if(self&&p.drawReason==='gang'&&p.gangSource!==null&&p.gangSource!==undefined)responsible=p.gangSource;else responsible=[...sourceCounts].find(([,k])=>k>=3)?.[0]??null;}
  if(responsible!==null){const amount=score.flowers*(n-1);g.players[responsible].score-=amount;p.score+=amount;baoOccurred=true;details.push(`${g.players[responsible].name}包付${n-1}家：${amount}`);}
  else if(self){for(let k=0;k<n;k++)if(k!==s){g.players[k].score-=score.flowers;p.score+=score.flowers;}}
  else{g.players[from].score-=score.flowers;p.score+=score.flowers;}
  breakdowns.push({seat:s,name:p.name,flowers:score.flowers,patterns:score.patterns,details:score.details,bao:responsible});
 }
 const retain=!winners.length||winners.includes(g.dealer)||winners.length>1||anyBig;g.nextDealer=retain?g.dealer:(g.dealer+1)%n;g.nextBi=!!(g.options.bi&&(g.triggerBi||retain||anyBig||baoOccurred||winners.length>1||winners.some(s=>['flower','gang'].includes(g.players[s].drawReason))));
 const deltas=g.players.map(p=>p.score-p.startScore);g.settlement={title:!winners.length?'流局':winners.map(s=>g.players[s].name).join('、')+(self?'自摸':'胡牌'),winners,deltas,breakdowns,details:[...details,...g.payments.map(e=>`${g.players[e.from].name} → ${g.players[e.to].name} ${e.reason} ${e.amount}`),`下局${retain?'连庄':'换庄'}${g.nextBi?' · 比下胡 ×2':''}`],winningTile:card,from,rob,self};g.pending=null;g.phase=g.round>=g.options.rounds?'finished':'roundEnd';
}
export function mahjongChoices(g,seat){
 if(g.phase!=='playing')return {};
 if(g.pending)return g.pending.eligible[seat]&&!g.pending.responses[seat]?{claim:[...g.pending.eligible[seat],'pass'],card:g.pending.card}:{};
 if(g.turn!==seat)return {};const p=g.players[seat],card=p.hand.find(c=>c.id===p.drawn),gang=[];
 if(!p.earth&&g.wall.length)for(const c of p.hand)if(p.hand.filter(x=>x.value===c.value).length===4||p.melds.some(m=>m.type==='peng'&&m.value===c.value))if(!gang.some(id=>p.hand.find(c=>c.id===id).value===c.value))gang.push(c.id);
 const declare=!p.earth&&!p.river.length&&!p.melds.length?p.hand.filter(c=>waitingValues(p.hand.filter(x=>x.id!==c.id),p.melds,g.options.double7).length).map(c=>c.id):[];
 return {discard:p.earth?[p.drawn]:p.hand.map(c=>c.id),hu:!!(card&&scoreHand(g,seat,card,true)),gang,declare};
}
export function chooseMahjong(view){
 const c=view.choices;if(c.claim)return {type:'claim',value:c.claim.includes('hu')?'hu':c.claim.includes('gang')?'gang':c.claim.includes('peng')&&view.players[view.seat].flowers.length>=4?'peng':'pass'};
 if(c.hu)return {type:'hu'};if(c.gang?.length)return {type:'gang',card:c.gang[0]};if(!c.discard?.length)return null;
 const hand=view.hand,cs=counts(hand),visible=counts(view.players.flatMap(p=>[...p.river,...p.melds.flatMap(m=>m.cards)]));
 let choice=null,best=-Infinity;for(const id of c.discard){const card=hand.find(c=>c.id===id),v=card.value;let isolation=cs[v]===1?5:cs[v]===2?-4:-8;if(v>=27)isolation+=2;else for(const delta of [-2,-1,1,2])if(v+delta>=0&&v+delta<27&&Math.floor((v+delta)/9)===Math.floor(v/9))isolation-=cs[v+delta]*(Math.abs(delta)===1?2:1);isolation+=visible[v]*.7;if(c.declare?.includes(id))isolation+=20;if(isolation>best){best=isolation;choice=id;}}
 return {type:c.declare?.includes(choice)?'declare':'discard',card:choice};
}
export function publicMahjong(g,seat){const p=g.players[seat];return {kind:g.kind,phase:g.phase,options:g.options,revision:g.revision,round:g.round,seat,hand:sorted(p.hand),drawn:p.drawn,turn:g.turn,dealer:g.dealer,wallCount:g.wall.length,biMultiplier:g.biMultiplier,last:g.last,pending:g.pending?{from:g.pending.from,card:g.pending.card,rob:g.pending.rob,responded:Object.keys(g.pending.responses).map(Number)}:null,players:g.players.map((p,i)=>({seat:i,name:p.name,character:p.character,count:p.hand.length,score:p.score,flowers:p.flowers,melds:p.melds,river:p.river,earth:p.earth})),deadline:g.deadline,choices:mahjongChoices(g,seat),events:g.events,settlement:g.settlement};}
