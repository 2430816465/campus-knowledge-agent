import {GAMES,CHARACTERS,SUITS,rankLabel,candidates,analyzePlay,TYPE_NAMES} from './cards.js';
import {MAHJONG_DEFAULTS,RULE_OPTIONS,tileLabel} from './mahjong.js';
import {secureUUID} from './rooms.js';
import {Connection} from './network.js';
import {RULES_HTML} from './rules-text.js';
import {playLabel,selectionInfo,rangeSelection,sameRankSelection,layoutHand,HintCycle,remainingRanks,seatPosition} from './ui-model.js';
import {Feedback} from './feedback.js';
import {pokerFace,mahjongFace} from './faces.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('chess-'+key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem('chess-'+key,JSON.stringify(value));}catch{}};
const identifier=secureUUID;
const state={kind:read('kind','ddz3'),character:read('character','knight'),name:read('name','旅人'),clientId:read('clientId',null)||identifier(),realm:read('realm','lan'),serverUrl:read('serverUrl',''),address:read('address',''),screen:'home',room:null,queue:null,status:'欢迎来到勇者酒馆',options:{...MAHJONG_DEFAULTS},selected:[],hintIndex:0,sound:true,connected:false,pending:null,sort:read('sort','rank'),resultTab:'score',resultPage:0,resultSeat:0,prefs:{sound:true,effects:true,voice:false,haptic:false,...read('prefs',{})}};
if(!GAMES[state.kind])state.kind='ddz3';if(!CHARACTERS.some(c=>c.id===state.character))state.character='knight';save('clientId',state.clientId);
const conn=new Connection(message,status=>{state.status=status;const el=$('#connection-status');if(el)el.textContent=status;});
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3600);}
const hints=new HintCycle(),feedback=new Feedback(state.prefs);
function sound(kind='select',text=''){feedback.master=state.sound;feedback.play(kind,text);}
function reduced(){return !state.prefs.effects||matchMedia('(prefers-reduced-motion: reduce)').matches;}
function effect(label,kind='play'){if(reduced())return;const el=document.createElement('div');el.className='table-effect effect-'+kind;el.textContent=label;$('#effects').replaceChildren(el);clearTimeout(effect.timer);effect.timer=setTimeout(()=>el.remove(),950);}
const btn=(label,action,cls='',extra='')=>`<button class="btn ${cls}" data-do="${action}" ${extra}>${label}</button>`;
const portrait=(id,cls='')=>`<img class="portrait ${cls}" src="assets/${id}.webp" alt="${esc(CHARACTERS.find(c=>c.id===id)?.name||'勇者')}" draggable="false">`;
function card(c,{small=false,select=false,kind=state.kind,disabled=false}={}){
 const isMj=kind==='nanjing',label=isMj?tileLabel(c.value):`${c.value<16?SUITS[c.type]:''}${rankLabel(c.value)}`,red=!isMj&&(c.type>=2&&c.value<16||c.value===17),picked=state.selected.includes(c.id),wild=kind==='guandan'&&c.value===state.room?.game?.level&&c.type===2;
 const face=(isMj?mahjongFace(c):pokerFace(c))+(wild?'<i class="wild-badge">配</i>':'');
 return select?`<button class="card ${isMj?'tile':''} ${small?'small':''} ${red?'red':''} ${picked?'selected':''} ${wild?'wild':''}" data-card="${c.id}" aria-label="${esc(label)}${wild?'逢人配':''}" aria-pressed="${picked}" ${disabled?'disabled':''}>${face}</button>`:`<span class="card ${isMj?'tile':''} ${small?'small':''} ${red?'red':''}" aria-label="${esc(label)}">${face}</span>`;
}
function topbar(title,subtitle=''){return `<header class="topbar">${btn('‹','back','icon-btn','aria-label="返回"')}<div class="brand"><b>${title}</b>${subtitle?`<span>${esc(subtitle)}</span>`:''}</div><div class="top-actions">${btn(state.prefs.sound?'♪':'♩','audio','quiet','aria-label="声音与动效"')}${btn('规则','rules','quiet')}${state.screen==='table'?btn('牌局','table-menu','quiet'):btn('联机设置','settings','quiet')}${btn('⛶','fullscreen','icon-btn','aria-label="全屏"')}</div></header>`;}
function home(){const game=GAMES[state.kind];return `${topbar('勇者棋牌','围桌，再来一局')}<div class="chess-home-content"><section class="home-games"><h1>今天玩哪一桌？</h1><div class="game-grid">${Object.entries(GAMES).map(([id,g],i)=>`<button class="game-choice ${id===state.kind?'active':''}" data-do="kind:${id}" aria-pressed="${id===state.kind}"><span class="game-symbol">${['♠','♣','♦','東'][i]}</span><span><b>${g.name}</b><small>${g.subtitle.replace(' · ','<br>')}</small></span></button>`).join('')}</div><div class="selected-game-info"><span>${game.players}人桌 · 机器人补位</span>${btn('房间规则','options','text-btn')}</div></section><section class="home-play"><p class="home-win-hint"><b>本桌目标</b>${({ddz3:'地主独战两位农民，己方先出完手牌获胜。',ddz4:'地主独战三位农民，己方先出完手牌获胜。',guandan:'与隔座搭档配合，争取先出完手牌并升级。',nanjing:'摸牌、碰杠组成胡牌，按本桌规则计分。'})[state.kind]}</p><div class="home-hero-art">${portrait(state.character)}</div>${btn(`${portrait(state.character)}<span><b>${esc(state.name)}</b><small>更换人物 / 名字 ›</small></span>`,'profile','profile-entry')}<div class="play-primary">${btn('开始练习','practice','primary')}${btn('同网匹配','match','secondary')}</div><div class="friend-actions">${btn('创建好友房','create','ghost')}${btn('加入房间','join','ghost')}</div><p class="connection-label" id="connection-status">${esc(state.status)}</p></section></div>`;}
function queue(){return `${topbar('寻找同桌旅人',GAMES[state.kind].name)}<div class="queue-view"><div class="queue-orbit">${portrait(state.character)}<span></span></div><h1>给老友留个座。</h1><p>同一服务器、同一玩法优先入桌<br>最多等待8秒，空位由机器人补上</p>${btn('取消匹配','cancel','secondary')}<p class="connection-label" id="connection-status">${esc(state.status)}</p></div>`;}
function optionsSummary(o,kind){return kind==='nanjing'?`${o.rounds}局 · ${o.players}人 · 门${o.base/10}跑${o.base/10} · ${o.cap?o.cap+'封顶':'不封顶'}${o.bi?' · 比下胡':''}`:kind==='guandan'?'两副牌 · 隔座组队 · 打2到A':`${o.rounds}局 · ${o.players}人 · ${kind==='ddz4'?'两副牌 / 8张底牌':'一副牌 / 3张底牌'}`;}
function lobby(){const r=state.room;return `${topbar(GAMES[r.kind].name,'好友房')}<section class="lobby-view"><div class="room-heading"><div class="room-code"><span>房间号</span><b>${r.code}</b>${btn('复制邀请','invite','secondary')}</div><p>${esc(optionsSummary(r.options,r.kind))}</p></div><div class="lobby-seats">${r.players.map((p,i)=>`<article class="lobby-seat ${p?'occupied':''}">${p?portrait(p.character):'<span class="empty-seat">＋</span>'}<b>${p?esc(p.name):'机器人空座'}</b><span>${p?p.bot?'机器人':p.ready?'✓ 已准备':'等待准备':'开局自动补位'}</span><small>${i===r.seat?'你在这里':''}${r.host&&i===r.seat?' · 房主':''}</small></article>`).join('')}</div><div class="lobby-controls">${btn(r.players[r.seat]?.ready?'取消准备':'准备','ready',r.players[r.seat]?.ready?'secondary':'primary')}${r.host?btn('开始牌局','start','primary',r.players.some(p=>p&&!p.ready)?'disabled':''):''}${r.host?btn('修改规则','options','quiet'):btn('查看规则','options','quiet')}</div><p class="connection-label" id="connection-status">${esc(state.status)}</p><p class="muted">${window.CampLan?'手机房主请保持前台':'真人准备后即可开局'} · 空位由机器人补上</p></section>`;}
function role(g,seat){if(g.kind==='nanjing')return ['东','南','西','北'][(seat-g.dealer+g.players.length)%g.players.length]+'位'+(seat===g.dealer?' · 庄家':'');if(g.kind==='guandan')return seat%2===g.seat%2?'你的搭档队':'对手队';return g.landlord===null?'等待叫分':seat===g.landlord?'地主':'农民';}
function seatHTML(g,p){
 const pos=seatPosition(g,p.seat),rp=state.room.players[p.seat],active=!g.settlement&&(g.pending?!!(g.choices.claim&&p.seat===g.seat):g.turn===p.seat),isLand=p.seat===g.landlord,friend=g.kind==='guandan'?p.seat%2===g.seat%2:g.landlord!==null&&g.seat!==g.landlord&&!isLand,low=g.kind!=='nanjing'&&g.phase==='playing'&&p.count>0&&p.count<=2;
 return `<div class="seat ${pos} ${active?'active-turn':''} ${low?'low-cards':''}"><div class="avatar-wrap">${portrait(p.character)}${active?`<span class="seat-clock timer" data-deadline="${g.deadline}"></span>`:''}${g.kind!=='nanjing'?`<span class="remaining-count" aria-label="剩余${p.count}张">${p.finished?'✓':p.count}</span>`:''}</div><div class="seat-copy"><b>${esc(p.name)}${p.seat===g.seat?' · 你':''}</b><span class="role ${isLand?'landlord':friend?'teammate':''}">${isLand?'♛ ':friend?'◆ ':''}${role(g,p.seat)}</span><div class="seat-stats"><strong>${p.score>=0?'+':''}${p.score}</strong>${g.kind==='nanjing'?`<small>${p.flowers.length}花 · ${p.melds.length}副</small>`:''}</div><small class="presence">${rp.bot?'机器人':!rp.connected?'断线代打':rp.auto?'托管中':'在线'}</small></div>${g.kind==='nanjing'&&p.earth?'<i class="earth-badge">天听</i>':''}</div>`;
}
function playCenter(g){
 if(g.kind==='nanjing')return `<div class="mahjong-rivers">${g.players.map(p=>`<div class="river river-${(p.seat-g.seat+g.players.length)%g.players.length}"><small>${esc(p.name)}</small><div>${p.river.slice(-12).map(c=>card(c,{small:true,kind:g.kind})).join('')}</div></div>`).join('')}</div><div class="last-tile">${g.last?card(g.last.card,{kind:g.kind}):'<span>東</span>'}<small>${g.pending?g.pending.rob?'抢杠机会':'请选择碰 / 杠 / 胡':'余牌 '+g.wallCount+' 张'}</small></div>`;
 if(g.phase==='tribute')return `<div class="poker-center"><b>还贡</b><p>请选择2至10的普通牌</p><div class="played-cards">${g.tribute.entries.map(e=>card(e.card,{small:true,kind:g.kind})).join('')}</div></div>`;
 const zones=g.players.map(p=>{const item=g.tablePlays?.[p.seat],pos=seatPosition(g,p.seat),isLast=item?.type==='play'&&g.last?.seat===p.seat,rel=(p.seat-g.seat+g.players.length)%g.players.length;
  return `<div class="play-zone play-${pos} ${isLast?'lead-play':''}" data-seat-play="${p.seat}">${item?.type==='play'?publicPlay(item,g,isLast):item?.type==='pass'?'<span class="pass-bubble">不出</span>':g.phase==='bidding'&&g.bids[p.seat]!==null?`<span class="bid-bubble">${g.bids[p.seat]?g.bids[p.seat]+'分':'不叫'}</span>`:''}</div>`;
 }).join('');
 return `${zones}<div class="poker-center table-guidance">${g.phase==='bidding'?'<b>叫分抢地主</b>':!g.last?`<b>${g.trick?'新一轮 · 自由出牌':'好牌开局'}</b>`:''}</div>`;
}
function publicPlay(item,g,isLast){
 const groups=[];for(const c of item.cards){const prev=groups.at(-1);if(item.cards.length>12&&prev?.card.value===c.value)prev.count++;else groups.push({card:c,count:1});}
 return `<button class="play-preview" data-do="public-play:${item.seat}" aria-label="查看${esc(g.players[item.seat].name)}出的${item.cards.length}张牌"><span class="play-type">${playLabel(item.info)} · ${item.cards.length}张${isLast?' · 待压':''} ↗</span><span class="zone-cards" style="--played-count:${groups.length}">${groups.map(x=>`<span class="public-card-group">${card(x.card,{small:true,kind:g.kind})}${x.count>1?`<i class="group-count">×${x.count}</i>`:''}</span>`).join('')}</span></button>`;
}
function selectionStatus(g){
 if(state.pending)return {valid:false,text:'正在确认操作…'};
 if(!state.connected)return {valid:false,text:'连接中断，正在恢复牌桌…'};
 if(state.room.players[g.seat].auto)return {valid:false,text:'托管中 · 点击取消托管即可接手'};
 if(g.kind!=='nanjing'&&g.choices.play&&g.last&&!state.selected.length&&!hints.get(g).length)return {valid:false,text:'没有能压过的牌 · 点击不出'};
 return selectionInfo(g,state.selected);
}
function controls(g){
 const c=g.choices,sel=state.selected,blocked=!!state.pending||!state.connected,chosen=g.hand.filter(c=>sel.includes(c.id)),info=selectionStatus(g),disable=blocked?'disabled':'';
 if(g.kind==='nanjing'){
  if(c.claim)return c.claim.map(v=>btn({hu:'胡',peng:'碰',gang:'杠',pass:'过'}[v],'claim:'+v,v==='hu'?'primary':v==='pass'?'quiet':'secondary',disable)).join('');
  return `${c.hu?btn('自摸胡牌','hu','primary',disable):''}${c.gang?.length?btn('杠','gang','secondary',blocked||!c.gang.some(id=>sel.includes(id))?'disabled':''):''}${c.declare?.length?btn('报天听','declare','secondary',blocked||!sel.some(id=>c.declare.includes(id))?'disabled':''):''}${c.discard?btn('出牌','discard','primary',!info.valid||blocked?'disabled':''):''}${c.discard?btn('提示','hint','quiet',disable):''}`;
 }
 if(c.bid)return c.bid.map(v=>btn(v?v+'分':'不叫','bid:'+v,v===3?'primary':'secondary',disable)).join('');
 if(c.return)return btn('还贡','return','primary',!info.valid||blocked?'disabled':'');
 if(!c.play)return '';
 const all=analyzePlay(g.hand,g.kind,g.level,g.last?.info);
 return `${c.pass?btn('不出','pass','secondary',disable):''}${btn('提示','hint','quiet',disable)}${btn('出牌','play','primary',!info.valid||blocked?'disabled':'')}${all&&g.hand.length>1?btn('一手出完','finish-hand','secondary',disable):''}`;
}
function actionBar(g){const self=state.room.players[g.seat];return !g.settlement&&!self.auto?controls(g):'';}
function handHTML(g){const hand=layoutHand(g,state.sort);return hand.map((c,i)=>card(c,{select:true,kind:g.kind,disabled:!!g.settlement||!!state.pending||state.room.players[g.seat].auto}).replace('class="card ',`style="--deal-index:${i}" class="card ${g.kind==='nanjing'&&c.id===g.drawn?'drawn ':''}`)).join('');}
function turnText(g){if(g.settlement)return '本局结束';if(state.pending)return '正在确认操作…';if(state.room.players[g.seat].auto)return '托管中';if(g.pending)return g.choices.claim?'碰 / 杠 / 胡，请选择':'等待同桌响应';return g.turn===g.seat?g.phase==='bidding'?'轮到你叫分':g.phase==='tribute'?'轮到你还贡':'轮到你出牌':`等待 ${esc(g.players[g.turn].name)}`;}
function table(){
 const r=state.room,g=r.game,mj=g.kind==='nanjing',info=selectionStatus(g);return `<section class="table-view ${mj?'mahjong':'poker'} ${state.prefs.effects?'':'no-effects'}">${topbar(GAMES[g.kind].name,`第${g.round}${g.kind==='guandan'?'局':' / '+g.options.rounds+'局'} · 房号${r.code}`)}<aside class="table-portrait-prompt" aria-labelledby="table-rotate-title"><div class="rotate-table-icon" aria-hidden="true"><span>♠</span><span>♥</span><span>♣</span></div><h2 id="table-rotate-title">横屏入座</h2><p>将手机横过来，<br>完整手牌和操作区会自动展开。</p><small>无法转向时，请先关闭手机方向锁定。</small>${btn('返回选桌','back','secondary')}</aside><div class="table-meta"><span>${mj?`余牌${g.wallCount}张 · ${g.biMultiplier===2?'比下胡 ×2':'普通局'}`:g.kind==='guandan'?`打${rankLabel(g.level)} · 两队 ${g.teamLevels.map(rankLabel).join(' / ')}`:`底分1 · <b class="multiplier">${g.multiplier}倍</b>`}</span>${!mj&&g.bottom?.length?`<div class="bottom-cards"><small>底牌</small>${g.bottom.map(c=>card(c,{small:true,kind:g.kind})).join('')}</div>`:''}<span id="connection-status">${esc(state.status)}</span></div><div class="felt"><div class="felt-inner"></div>${g.players.map(p=>seatHTML(g,p)).join('')}${playCenter(g)}${mj?`<div class="meld-display">${g.players[g.seat].melds.map(m=>`<span class="meld-group">${m.cards.map(c=>card(c,{small:true,kind:g.kind})).join('')}</span>`).join('')}<span class="flower-count">${g.players[g.seat].flowers.length}花</span></div>`:''}<div class="turn-notice ${g.turn===g.seat||g.choices.claim?'your-turn':''}">${turnText(g)}</div><div class="selection-message ${info.valid?'valid':''}" aria-live="polite">${esc(info.text)}</div><div class="action-bar">${actionBar(g)}</div><div class="hand-wrap ${g.hand.length>20?'long-hand':''}"><div class="hand-cards" style="--count:${g.hand.length}">${handHTML(g)}</div></div><div class="hand-peek" aria-hidden="true"></div><div class="hand-caption"><div class="hand-tools">${btn('取消选牌','clear','text-btn',!state.selected.length?'disabled':'')}${!mj?btn(state.sort==='rank'?'按牌型理牌':'按点数理牌','sort','text-btn'):''}${!g.settlement?btn(r.players[g.seat].auto?'取消托管':'托管','auto','text-btn '+(r.players[g.seat].auto?'auto-active':''),state.pending?'disabled':''):''}</div><span class="selection-count">${g.hand.length}张 · 已选${state.selected.length}张</span><small>${mj?'摸到的牌有金边 · 单击选牌':'滑过手牌可连选 · 双击选同点数'}</small></div></div>${g.settlement?settlement(g):''}</section>`;
}
function resultLines(g){return [...g.settlement.details,...(g.settlement.breakdowns||[]).flatMap(b=>[`${b.name}：${b.flowers}花${b.bao!==null?' · 包牌':''}`,...b.details])];}
function settlement(g){
 const s=g.settlement,victory=s.winners.includes(g.seat),delta=s.deltas[g.seat],ready=state.room.players[g.seat].ready,humans=state.room.players.filter(p=>!p.bot&&p.connected),count=humans.filter(p=>p.ready).length,perPage=Math.max(2,Math.min(6,Math.floor((innerHeight-195)/22))),lines=resultLines(g),pages=Math.max(1,Math.ceil(lines.length/perPage));state.resultPage=Math.min(state.resultPage,pages-1);
 const score=`<div class="result-players">${g.players.map((p,i)=>`<div class="result-player ${s.winners.includes(i)?'winner':''}">${portrait(p.character)}<b>${esc(p.name)}</b><strong>${s.deltas[i]>0?'+':''}${s.deltas[i]}</strong><small>${role(g,i)} · 总分${p.score}</small></div>`).join('')}</div>`;
 const detail=`<div class="result-detail-lines">${lines.slice(state.resultPage*perPage,(state.resultPage+1)*perPage).map(l=>`<p>${esc(l)}</p>`).join('')}</div><div class="result-pager">${btn('上一页','result-prev','quiet',!state.resultPage?'disabled':'')}<span>${state.resultPage+1} / ${pages}</span>${btn('下一页','result-next','quiet',state.resultPage===pages-1?'disabled':'')}</div>`;
 const p=g.players[state.resultSeat]||g.players[0],rest=`<div class="result-seat-picker">${g.players.map(p=>btn(p.seat===g.seat?'你':esc(p.name),'result-seat:'+p.seat,p.seat===state.resultSeat?'secondary':'quiet')).join('')}</div><div class="result-remaining" style="--played-count:${p.remaining?.length||1}">${(p.remaining||[]).map(c=>card(c,{small:true,kind:g.kind})).join('')||'<p>已出完</p>'}</div>`;
 return `<div class="settlement-backdrop"><section class="settlement-panel ${victory?'victory':'defeat'}" aria-label="牌局结算"><div class="result-heading"><h2>${victory?'胜利！':s.winners.length?'下局再战':'流局'}</h2><span>${esc(s.title)} · 你${delta>=0?'+':''}${delta}分</span></div><div class="result-tabs" role="tablist">${[['score','本局比分'],['details','计分明细'],...(!g.kind.startsWith('nanjing')?[['cards','剩余手牌']]:[])].map(([id,label])=>btn(label,'result-tab:'+id,state.resultTab===id?'secondary':'quiet',`role="tab" aria-selected="${state.resultTab===id}"`)).join('')}</div><div class="result-content">${state.resultTab==='score'?score:state.resultTab==='details'?detail:rest}</div><div class="result-actions">${btn(ready?`已准备 · ${count}/${humans.length}`:g.phase==='finished'?'再开一桌':'继续下一局',state.room.host?'next':'rematch','primary',ready?'disabled':'')}${btn('返回大厅','leave','secondary')}</div><small>${humans.length===1?'点击继续直接开局':'真人全部准备后自动开局'} · 本桌积分</small></section></div>`;
}
function patchSelection(){
 const g=state.room?.game;if(state.screen!=='table'||!g)return;
 const selected=new Set(state.selected);for(const el of document.querySelectorAll('.hand-cards [data-card]')){const picked=selected.has(el.dataset.card);el.classList.toggle('selected',picked);el.setAttribute('aria-pressed',String(picked));el.disabled=!!g.settlement||!!state.pending||state.room.players[g.seat].auto;}
 const info=selectionStatus(g),message=$('.selection-message');if(message){message.textContent=info.text;message.classList.toggle('valid',!!info.valid);}if($('.selection-count'))$('.selection-count').textContent=`${g.hand.length}张 · 已选${state.selected.length}张`;
 const clear=$('[data-do="clear"]');if(clear)clear.disabled=!state.selected.length;
 const auto=$('.hand-tools [data-do="auto"]');if(auto)auto.disabled=!!state.pending||!state.connected;
 const focus=document.activeElement?.dataset.do,bar=$('.action-bar');if(bar)bar.innerHTML=actionBar(g);if(focus)bar?.querySelector(`[data-do="${focus}"]:not(:disabled)`)?.focus({preventScroll:true});if($('.turn-notice'))$('.turn-notice').textContent=turnText(g);
}
function render(){document.body.dataset.screen=state.screen==='table'?'table':'chess-'+state.screen;$('#app').innerHTML=state.screen==='home'?home():state.screen==='queue'?queue():state.screen==='lobby'?lobby():table();updateTimer();}
function snapshotFeedback(previous,g){
 if(!g)return;const fresh=!previous||previous.round!==g.round||previous.kind!==g.kind;
 if(fresh){state.resultTab='score';state.resultPage=0;state.resultSeat=g.seat;if(!reduced())$('.hand-cards')?.classList.add('dealing');return;}
 const item=g.actionLog?.at(-1),oldItem=previous.actionLog?.at(-1);
 if(item&&item.id!==oldItem?.id){
  if(item.type==='play'){const label=playLabel(item.info);sound(item.info.bomb||item.info.type==='STRAIGHT_FLUSH'?'bomb':'play',label);const zone=$(`[data-seat-play="${item.seat}"]`);if(!reduced())zone?.classList.add('new-play');if(item.info.bomb||['STRAIGHT','ABCDE','AAABBB','TRIPLES_SEQ','STRAIGHT_FLUSH','KING','JOKER_BOMB'].includes(item.info.type))effect(label,item.info.bomb?'bomb':'play');}
  else sound(item.type,item.type==='pass'?'不出':item.value?item.value+'分':'不叫');
 }
 if(g.landlord!==null&&previous.landlord===null){effect(`${g.players[g.landlord].name} 当地主`,'role');sound('bid','地主确定');}
 for(const p of g.players){const old=previous.players[p.seat];if(g.kind!=='nanjing'&&g.phase==='playing'&&p.count>0&&p.count<=2&&old.count>p.count){sound('warning',`只剩${p.count}张牌`);}}
 if(!g.settlement&&g.turn===g.seat&&(previous.turn!==g.seat||previous.phase!==g.phase)&&!state.room.players[g.seat].auto)sound('turn','轮到你了');
 if(g.settlement&&!previous.settlement){state.resultTab='score';state.resultPage=0;state.resultSeat=g.seat;sound(g.settlement.winners.includes(g.seat)?'win':'lose');}
 if(g.kind==='nanjing'&&g.last?.card?.id!==previous.last?.card?.id)sound('play');
}
function message(m){
 if(m.type==='snapshot'){
  const previous=state.room?.code===m.code?state.room.game:null,focus=document.activeElement?.dataset?.do;
  if(drag&&previous?.hand.map(c=>c.id).join(',')!==m.game?.hand.map(c=>c.id).join(','))drag=null;
  state.room=m;state.clockOffset=m.serverTime-Date.now();state.connected=true;state.kind=m.kind;state.screen=m.game?'table':'lobby';
  if(state.pending&&(!m.game||m.game.round!==state.pending.round||m.game.revision>state.pending.revision)){state.pending=null;clearTimeout(act.timer);}
  const ids=new Set(m.game?.hand.map(c=>c.id)||[]);state.selected=state.selected.filter(id=>ids.has(id));render();
  if(focus&&!drag){const target=[...document.querySelectorAll('[data-do]')].find(el=>el.dataset.do===focus&&!el.disabled);target?.focus({preventScroll:true});}
  snapshotFeedback(previous,m.game);
 }else if(m.type==='ack'){if(state.pending?.requestId===m.requestId)state.pending.acked=true;}
 else if(m.type==='queue'){state.screen='queue';state.queue=Date.now();render();}
 else if(m.type==='joined'){state.connected=true;}
 else if(m.type==='queueCanceled'){state.screen='home';render();}
 else if(m.type==='error'){state.pending=null;clearTimeout(act.timer);patchSelection();toast(m.message);}
 else if(m.type==='closed'){conn.stop();state.room=null;state.pending=null;state.selected=[];state.screen='home';state.connected=false;$('#effects').replaceChildren();render();toast(m.reason);}
 else if(m.type==='reconnecting'){state.connected=false;state.pending=null;clearTimeout(act.timer);patchSelection();toast('连接中断，机器人暂时代打，正在重连…');}
 else if(m.type==='disconnected'){state.connected=false;state.pending=null;clearTimeout(act.timer);toast('连接已断开，请检查网络后重新加入');if(!state.room){state.screen='home';render();}else patchSelection();}
}
function profile(){const input=$('#name');if(input)state.name=input.value.trim().slice(0,16)||'旅人';save('name',state.name);save('character',state.character);}
async function connect(type,code){profile();state.selected=[];try{await conn.connect({realm:state.realm,serverUrl:state.serverUrl,address:state.address,type,code,kind:state.kind,options:state.kind==='nanjing'?state.options:{rounds:state.options.rounds},name:state.name,character:state.character,clientId:state.clientId});}catch(e){conn.stop();toast(e.message);}}
function act(a){
 const g=state.room?.game;if(!g||g.settlement||state.pending||!state.connected||state.room.players[g.seat].auto)return;
 const allowed=a.type==='bid'?g.choices.bid?.includes(a.value):a.type==='claim'?g.choices.claim?.includes(a.value):a.type==='hu'?g.choices.hu:a.type==='pass'?g.choices.pass:a.type==='play'?g.choices.play&&!!analyzePlay(g.hand.filter(c=>a.cards.includes(c.id)),g.kind,g.level,g.last?.info):a.type==='return'?a.cards.length===1&&g.choices.return?.includes(a.cards[0]):a.type==='gang'?g.choices.gang?.includes(a.card):a.type==='declare'?g.choices.declare?.includes(a.card):g.choices.discard?.includes(a.card);
 if(!allowed){toast(selectionStatus(g).text);return;}
 const request={type:'action',requestId:identifier(),revision:g.revision,action:a};state.pending={...request,round:g.round};patchSelection();
 if(!conn.send(request)){state.pending=null;patchSelection();toast('连接尚未恢复，手牌已保留');return;}
 clearTimeout(act.timer);act.timer=setTimeout(()=>{if(state.pending?.requestId!==request.requestId)return;state.pending=null;patchSelection();toast('操作尚未确认，手牌已保留；请检查网络');},6500);
}
function modal(title,body){if($('#dialog').open)$('#dialog').close();$('#dialog').innerHTML=`<div class="dialog-top"><h2>${title}</h2>${btn('×','close-dialog','icon-btn','aria-label="关闭"')}</div><div class="dialog-body">${body}</div>`;$('#dialog').showModal();}
function optionsDialog(){const r=state.room,kind=r?.kind||state.kind,o=r?.options||state.options,editable=!r||r.host&&!r.game;modal('房间规则 · '+GAMES[kind].name,`<form id="options-form"><fieldset ${editable?'':'disabled'}><label class="option-row">局数<select name="rounds"><option value="4" ${o.rounds===4?'selected':''}>4局</option><option value="8" ${o.rounds===8?'selected':''}>8局</option></select></label>${kind==='nanjing'?`<label class="option-row">人数<select name="players">${[4,3,2].map(n=>`<option value="${n}" ${o.players===n?'selected':''}>${n}人</option>`).join('')}</select></label><label class="option-row">封顶<select name="cap">${[0,300,600].map(n=>`<option value="${n}" ${o.cap===n?'selected':''}>${n?n+'封顶':'不封顶'}</option>`).join('')}</select></label><label class="option-row">底花 / 门清<select name="base"><option value="10" ${o.base===10?'selected':''}>门一跑一</option><option value="20" ${o.base===20?'selected':''}>门二跑二</option></select></label><div class="rule-checks">${RULE_OPTIONS.map(([key,label,help])=>`<label><input name="${key}" type="checkbox" ${o[key]?'checked':''}><span><b>${label}</b><small>${help}</small></span></label>`).join('')}</div>`:`<p>固定${GAMES[kind].players}人；${GAMES[kind].subtitle}。${kind==='guandan'?'掼蛋以过A结束，局数选项不适用。':''}</p>`}</fieldset>${editable?`<div class="dialog-actions">${btn('重置默认','reset-options','secondary')}${btn('保存规则','save-options','primary')}</div>`:''}</form>${btn('查看完整番型与计分','rules','text-btn')}`);}
function settingsDialog(){modal('联机设置',`<form id="settings-form"><p>好友使用同一服务器；人机练习无需设置。</p><label class="field">联机范围<select name="realm"><option value="lan" ${state.realm==='lan'?'selected':''}>同一Wi-Fi / 局域网</option><option value="internet" ${state.realm==='internet'?'selected':''}>互联网</option></select></label><label class="field" data-network-field="internet" ${state.realm==='internet'?'':'hidden'}>公网服务器地址<input name="serverUrl" type="url" placeholder="https://你的服务器域名" value="${esc(state.serverUrl)}"></label><label class="field" data-network-field="lan" ${state.realm==='lan'?'':'hidden'}>房主IP（加入局域网好友房时填）<input name="address" inputmode="decimal" placeholder="例如 192.168.1.10" value="${esc(state.address)}"></label><p class="muted">局域网开房可留空IP。尚无默认公网服务；手机跨城市联机须填写已部署的HTTPS地址。</p>${btn('保存设置','save-settings','primary full')}</form>`);}
function historyDialog(page){const g=state.room.game,items=[...(g.actionLog||[])].reverse(),size=innerHeight<450?3:7,total=Math.max(1,Math.ceil(items.length/size));page=Math.max(0,Math.min(page,total-1));modal('公开出牌记录',`<div class="history-list">${items.slice(page*size,(page+1)*size).map(x=>`<div><b>${esc(g.players[x.seat].name)}</b><span>${x.type==='pass'?'不出':x.type==='bid'?x.value?x.value+'分':'不叫':playLabel(x.info)}</span><small>${(x.cards||[]).map(c=>(c.value<16?SUITS[c.type]:'')+rankLabel(c.value)).join(' ')}</small></div>`).join('')||'<p>还没有出牌</p>'}</div><div class="dialog-actions">${btn('上一页','history-page:'+(page-1),'quiet',!page?'disabled':'')}<span>${page+1}/${total}</span>${btn('下一页','history-page:'+(page+1),'quiet',page===total-1?'disabled':'')}</div>`);}
function riversDialog(seat){const g=state.room.game,p=g.players[seat];modal('牌河与副露',`<div class="result-seat-picker">${g.players.map(p=>btn(esc(p.name),'rivers:'+p.seat,p.seat===seat?'secondary':'quiet')).join('')}</div><div class="river-detail"><b>已出牌</b><div>${p.river.map(c=>card(c,{small:true,kind:g.kind})).join('')||'暂无'}</div><b>碰 / 杠</b><div>${p.melds.map(m=>m.cards.map(c=>card(c,{small:true,kind:g.kind})).join('')).join('')||'暂无'}</div></div>`);}
async function invite(){const r=state.room,txt=`勇者棋牌 · ${GAMES[r.kind].name}\n房间号：${r.code}\n${state.realm==='internet'?'服务器：'+(state.serverUrl||location.origin):'同一Wi-Fi，房主地址：'+conn.address}`;try{await navigator.clipboard.writeText(txt);toast('房间邀请已复制');}catch{modal('房间邀请',`<textarea readonly rows="5">${esc(txt)}</textarea><p>长按选择并复制，发送给朋友。</p>`);}}
async function action(name){const [type,id]=name.split(':');switch(type){
 case 'profile':modal('你的勇者',`<div class="character-picker profile-characters">${CHARACTERS.map(c=>`<button class="character-choice ${c.id===state.character?'active':''}" data-do="character:${c.id}" aria-label="选择${c.name}">${portrait(c.id)}</button>`).join('')}</div><label class="field">名字<input id="name" maxlength="16" value="${esc(state.name)}"></label>${btn('保存人物','save-profile','primary full')}`);break;
 case 'save-profile':profile();$('#dialog').close();render();break;
 case 'kind':profile();state.kind=id;save('kind',id);render();break;
 case 'character':profile();state.character=id;save('character',id);if($('#dialog').open){for(const el of document.querySelectorAll('.profile-characters [data-do]'))el.classList.toggle('active',el.dataset.do==='character:'+id);}else render();break;
 case 'practice':case 'create':case 'match':await connect(type);break;
 case 'join':profile();modal('加入好友房',`<p>先在“联机设置”中选择与你朋友一致的服务器或房主地址。</p><label class="field">6位房间号<input id="room-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="输入房间号"></label>${btn('加入牌桌','join-confirm','primary full')}`);break;
 case 'join-confirm':{const code=$('#room-code').value.trim();if(!/^\d{6}$/.test(code)){toast('请输入6位房间号');break;}$('#dialog').close();await connect('join',code);break;}
 case 'cancel':conn.send({type:'cancelMatch'});conn.stop();state.screen='home';render();break;
 case 'ready':conn.send({type:'ready',value:!state.room.players[state.room.seat].ready});break;
 case 'start':conn.send({type});break;
 case 'next':case 'rematch':conn.send({type:'continue'});break;
 case 'play':case 'return':act({type,cards:state.selected.slice()});break;
 case 'pass':case 'hu':act({type});break;
 case 'discard':case 'declare':act({type,card:state.selected[0]});break;
 case 'gang':act({type,card:state.selected[0]});break;
 case 'bid':act({type,value:Number(id)});break;
 case 'claim':act({type:'claim',value:id});break;
 case 'auto':conn.send({type:'auto',value:!state.room.players[state.room.seat].auto});break;
 case 'hint':{const g=state.room.game;if(state.pending)break;if(g.kind==='nanjing'){const {chooseMahjong}=await import('./mahjong.js');const a=chooseMahjong(g);if(a?.card)state.selected=[a.card];}else if(g.choices.play){const suggestion=hints.next(g);if(suggestion){state.selected=suggestion.cards;toast(`建议${suggestion.index}/${suggestion.total} · ${playLabel(suggestion.info)}，再次提示可换一组`);}else toast('没有能压过的牌，可以不出');}patchSelection();sound();break;}
 case 'clear':state.selected=[];patchSelection();sound('clear');break;
 case 'sort':state.sort=state.sort==='rank'?'shape':'rank';save('sort',state.sort);$('.hand-cards').innerHTML=handHTML(state.room.game);patchSelection();break;
 case 'finish-hand':state.selected=state.room.game.hand.map(c=>c.id);act({type:'play',cards:state.selected.slice()});break;
 case 'result-tab':state.resultTab=id;state.resultPage=0;render();break;
 case 'result-prev':state.resultPage=Math.max(0,state.resultPage-1);render();break;
 case 'result-next':state.resultPage++;render();break;
 case 'result-seat':state.resultSeat=Number(id);render();break;
 case 'audio':modal('声音与动效',`<div class="feedback-options">${[['sound','游戏音效'],['effects','发牌与牌型动效'],['voice','中文语音播报'],['haptic','轻触震动']].map(([key,label])=>`<label class="option-row"><span>${label}</span><input data-pref="${key}" type="checkbox" ${state.prefs[key]?'checked':''}></label>`).join('')}</div><p>语音与震动依赖设备支持；系统减少动态效果时自动关闭动画。</p>`);break;
 case 'public-play':{const g=state.room.game,item=g.tablePlays?.[Number(id)];if(item?.type==='play')modal(esc(g.players[Number(id)].name)+' · '+playLabel(item.info)+' · '+item.cards.length+'张',`<div class="full-public-cards">${item.cards.map(c=>card(c,{small:true,kind:g.kind})).join('')}</div>`);break;}
 case 'table-menu':modal('牌桌工具',`<div class="table-menu">${btn('本桌比分','score','secondary')}${state.kind==='nanjing'?btn('牌河与副露','rivers','secondary'):btn('公开记牌','recorder','secondary')}${state.kind!=='nanjing'?btn('出牌记录','history','secondary'):''}${btn('声音与动效','audio','secondary')}${btn('玩法与计分','rules','secondary')}</div>`);break;
 case 'recorder':{const g=state.room.game;modal('对手尚未出过的牌',`<div class="rank-recorder">${remainingRanks(g).map(x=>`<div class="${x.count?'':'empty-rank'}"><b>${x.label}</b><span>${x.count}</span></div>`).join('')}</div><p>牌组减去你的手牌与全桌已出牌；不会读取对手手牌。叫地主前包括尚未分配的底牌。</p>`);break;}
 case 'history':historyDialog(0);break;
 case 'history-page':historyDialog(Number(id));break;
 case 'rivers':riversDialog(Number(id)||0);break;
 case 'invite':await invite();break;
 case 'score':{const g=state.room.game;modal('本桌记分',`<div class="score-list">${g.players.map(p=>`<p><span>${esc(p.name)}</span><b>${p.score}</b></p>`).join('')}</div><p>分数由牌局自动结算，不兑换冒险币。</p>`);break;}
 case 'options':optionsDialog();break;
 case 'settings':settingsDialog();break;
 case 'reset-options':{if(state.room){const r=state.room;conn.send({type:'configure',options:r.kind==='nanjing'?MAHJONG_DEFAULTS:{rounds:4}});}else state.options={...MAHJONG_DEFAULTS};$('#dialog').close();optionsDialog();break;}
 case 'save-options':{const f=new FormData($('#options-form')),o={rounds:Number(f.get('rounds'))};if((state.room?.kind||state.kind)==='nanjing'){for(const k of ['players','cap','base'])o[k]=Number(f.get(k));for(const [k] of RULE_OPTIONS)o[k]=f.has(k);}if(state.room)conn.send({type:'configure',options:o});else state.options={...state.options,...o};$('#dialog').close();render();break;}
 case 'save-settings':{const f=new FormData($('#settings-form'));state.realm=f.get('realm');state.serverUrl=String(f.get('serverUrl')).trim();state.address=String(f.get('address')).trim();for(const k of ['realm','serverUrl','address'])save(k,state[k]);$('#dialog').close();render();break;}
 case 'rules':if($('#dialog').open)$('#dialog').close();modal('玩法与计分',RULES_HTML);break;
 case 'close-dialog':$('#dialog').close();break;
 case 'fullscreen':try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前设备请使用横屏游玩');}break;
 case 'back':if(state.screen==='home'){profile();exitCamp();}else if(state.screen==='queue')await action('cancel');else modal('离开牌桌？',`<p>离席后机器人接替你的座位，房主转交给其他在线玩家。手机局域网房主退出将关闭整桌。</p><div class="dialog-actions">${btn('留在桌边','close-dialog','secondary')}${btn('确认离开','leave','primary')}</div>`);break;
 case 'leave':$('#dialog').close();conn.leave();state.room=null;state.screen='home';render();break;
}}
let drag=null,suppressClickUntil=0;
function pick(id){const g=state.room?.game;if(!g||state.pending||g.settlement||state.room.players[g.seat].auto)return;
 if(g.kind==='nanjing'||g.phase==='tribute')state.selected=state.selected.includes(id)?[]:[id];else state.selected=state.selected.includes(id)?state.selected.filter(x=>x!==id):[...state.selected,id];patchSelection();sound();}
function peekCard(id,x){const g=state.room?.game,c=g?.hand.find(c=>c.id===id),el=$('.hand-peek');if(!c||!el)return;el.innerHTML=card(c,{kind:g.kind});el.style.left=Math.max(8,Math.min(innerWidth-84,x+14))+'px';el.style.top=Math.max(72,$('.hand-cards').getBoundingClientRect().top-111)+'px';el.classList.add('show');}
function hidePeek(){$('.hand-peek')?.classList.remove('show');}
$('#app').addEventListener('pointerdown',e=>{feedback.unlock();const el=e.target.closest('.hand-cards [data-card]'),g=state.room?.game;if(!el||el.disabled||e.button!==0||!g||$('#dialog').open)return;
 const id=el.dataset.card;drag={pointer:e.pointerId,start:id,end:id,x:e.clientX,y:e.clientY,initial:state.selected.slice(),order:[...document.querySelectorAll('.hand-cards [data-card]')].map(c=>c.dataset.card),add:!state.selected.includes(id),moved:false,single:g.kind==='nanjing'||g.phase==='tribute'};peekCard(id,e.clientX);e.preventDefault();});
document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('.hand-cards [data-card]');if(!el||el.disabled)return;const id=el.dataset.card;if(id!==drag.end||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6){drag.moved=true;drag.end=id;peekCard(id,e.clientX);state.selected=drag.single?[id]:rangeSelection(drag.order,drag.initial,drag.start,id,drag.add);patchSelection();}e.preventDefault();},{passive:false});
document.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;const d=drag;drag=null;hidePeek();suppressClickUntil=Date.now()+500;if(!d.moved)pick(d.start);else sound();});
function cancelDrag(){hidePeek();if(drag){state.selected=drag.initial;drag=null;patchSelection();}}
document.addEventListener('pointercancel',cancelDrag);window.addEventListener('blur',cancelDrag);
$('#app').addEventListener('dblclick',e=>{const el=e.target.closest('.hand-cards [data-card]'),g=state.room?.game;if(!el||el.disabled||!g||g.kind==='nanjing'||g.phase==='tribute')return;state.selected=sameRankSelection(g.hand,[],el.dataset.card);patchSelection();sound();});
$('#app').addEventListener('click',e=>{const c=e.target.closest('[data-card]');if(c&&!c.disabled){if(e.detail===0||Date.now()>suppressClickUntil)pick(c.dataset.card);return;}const b=e.target.closest('[data-do]');if(b&&!b.disabled){feedback.unlock();action(b.dataset.do).catch(e=>toast(e.message));}});
$('#dialog').addEventListener('change',e=>{if(e.target.name==='realm')for(const field of document.querySelectorAll('[data-network-field]'))field.hidden=field.dataset.networkField!==e.target.value;const key=e.target.dataset.pref;if(key in state.prefs){state.prefs[key]=e.target.checked;save('prefs',state.prefs);document.body.classList.toggle('reduce-effects',!state.prefs.effects);$('.table-view')?.classList.toggle('no-effects',!state.prefs.effects);}});
$('#dialog').addEventListener('click',e=>{const b=e.target.closest('[data-do]');if(b&&!b.disabled)action(b.dataset.do).catch(e=>toast(e.message));});
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target;if(f.id==='options-form')action('save-options');if(f.id==='settings-form')action('save-settings');});
function updateTimer(){const el=$('[data-deadline]');if(el){const left=Math.max(0,Math.ceil((Number(el.dataset.deadline)-(Date.now()+(state.room?.serverTime?state.clockOffset||0:0)))/1000));el.textContent=left+'s';el.classList.toggle('urgent',left<=5);}}
setInterval(updateTimer,250);
function exitCamp(){conn.stop();if(parent!==window&&new URLSearchParams(location.search).has('camp'))parent.postMessage({source:'camp-game',mode:'chess',type:'exit'},location.origin);else location.href='../../index.html';}
window.CampBridge={control(command,data={}){if(command==='exit')conn.leave();if(command==='sound'){state.sound=!!data.enabled;feedback.master=state.sound;}},exitToCamp:exitCamp};
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.source==='camp-host')window.CampBridge.control(e.data.command,e.data);});
window.addEventListener('beforeunload',()=>conn.stop());
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.key==='f')action('fullscreen');if(e.key==='Escape'&&state.screen!=='home'&&!$('#dialog').open){if(state.selected.length){state.selected=[];patchSelection();}else action('back');}if(e.key==='Enter'&&state.screen==='table'&&!$('#dialog').open){const b=$('.action-bar [data-do="play"]')||$('.action-bar [data-do="discard"]')||$('.action-bar [data-do="return"]');if(b&&!b.disabled){e.preventDefault();action(b.dataset.do);}}if(e.key===' '&&state.screen==='table'&&!$('#dialog').open){const b=$('.action-bar [data-do="pass"]');if(b&&!b.disabled){e.preventDefault();action('pass');}}});
window.addEventListener('resize',()=>{if(state.room?.game?.settlement)render();});
window.render_game_to_text=()=>JSON.stringify({screen:state.screen,kind:state.kind,status:state.status,room:state.room?.code,seat:state.room?.seat,selected:state.selected,game:state.room?.game||null,ux:{pending:!!state.pending,sort:state.sort,selection:state.room?.game?selectionStatus(state.room.game).text:'',hintIndex:hints.index,resultTab:state.resultTab,feedbackTones:feedback.count,voiceAvailable:feedback.voiceAvailable},coordinates:'DOM layout: origin top-left; x right, y down. Only own hand and public table state.'});
window.advanceTime=ms=>new Promise(resolve=>setTimeout(resolve,Math.min(ms,50)));
render();if(parent!==window&&new URLSearchParams(location.search).has('camp'))parent.postMessage({source:'camp-game',mode:'chess',type:'ready'},location.origin);
