import {CARD_NAMES,CHARACTERS,isTruth,TIMING} from './rules.js';
import {Feedback,actionState} from './feedback.js';
import {Connection} from './network.js';
import {drawTable} from './render.js';
import {tableSeats,roundIntro,characterName,roleSnapshot,seatCountdown} from './presentation.js';
import {actorPose,seatActionLabel,preloadAnimations} from './animations.js';
const actionImages=preloadAnimations();
import {createServices} from '../../services.js';
import {platform} from '../../platform.js';
import {QUICK_PHRASES} from './bots.js';
const screen=document.querySelector('#screen'),canvas=document.querySelector('#table'),dialog=document.querySelector('#dialog'),inCamp=parent!==window&&new URLSearchParams(location.search).has('camp');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let snapshot=null,queueInfo=null,selected=new Set(),character='hero',joining=false,address='',code='',busy=false,soundOn=true,visualTime=0,raf,toastTimer,balance=0,receipt=null,pendingReward=null,seenRevision=-1,closedReason='',clockOffset=0;
let reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches,hapticsOn=true,audit=[];
let orientationBlocked=false;
function syncOrientation(){orientationBlocked=matchMedia('(pointer:coarse) and (orientation:portrait)').matches;document.querySelector('#orientation-prompt').hidden=!orientationBlocked;}
async function requestLandscape(){try{if(window.CampOrientation){CampOrientation.setLandscape(true);return;}const owner=inCamp?parent.document:document;if(!owner.fullscreenElement)await owner.documentElement.requestFullscreen();await (inCamp?parent:window).screen.orientation?.lock?.('landscape');}catch{}if(orientationBlocked)document.querySelector('#orientation-message').textContent='请关闭手机方向锁定，再横过手机。联机牌局计时仍会继续。';}
try{reducedMotion=JSON.parse(localStorage.getItem('liars-reduced-motion')??JSON.stringify(reducedMotion));hapticsOn=JSON.parse(localStorage.getItem('liars-haptics')??'true');}catch{}
const feedback=new Feedback({sound:()=>soundOn,haptics:()=>hapticsOn,reduced:()=>reducedMotion,vibrate:pattern=>window.CampHaptics?CampHaptics.pulse(pattern.length===1?'soft':pattern[0]>=60?'stone':'reveal'):navigator.vibrate?.(pattern)});
const serverNow=()=>Date.now()+clockOffset;
const actionNow=()=>snapshot?.phase==='paused'?snapshot.serverTime:serverNow();
const who=(g,seat)=>`${esc(g.players[seat]?.name)}${seat===snapshot.seat?' · 你':''}`;
const seatWho=(g,seat)=>who(g,seat);
function seatSpeech(seat,g){const line=snapshot.chat?.findLast(m=>m.seat===seat);return g.phase==='playing'&&line&&serverNow()-line.at<6500?`<small class="seat-speech" data-until="${line.at+6500}">${esc(line.text)}</small>`:'';}
function ownedSeats(g){
 const age=Math.max(0,actionNow()-g.phaseAt),scene=actionState(g,actionNow());
 return `<div class="table-seats">${tableSeats(g,snapshot.seat).map(s=>{
  const p=g.players[s.seat],open=s.cards.some(c=>c.kind),current=g.last?.seat===s.seat;
  const drinker=g.phase==='outcome'&&s.seat===g.event.loser,role=seatActionLabel(g,s.seat,actionNow())||s.role,cls=drinker?'drinker':g.phase==='reveal'?(s.seat===g.event.caller?'challenger':s.seat===g.event.accused?'accused':''):'';
  return `<div class="table-seat ${s.self?'self-seat':'other-seat'} ${current?'latest-seat':''} ${g.phase==='playing'&&scene?.beat==='play'&&scene.actor===s.seat?'play-actor':''} ${!p.alive&&!(drinker&&scene.beat==='drinking')?'stone-seat':''} ${g.phase==='reveal'&&scene.beat==='verdict'&&s.seat===g.event.loser?'focus-loser':''} ${s.turn?'turn-seat':''} ${drinker?'seat-'+g.phase+' effect-'+g.event.effect:''}" data-beat="${scene?.beat||''}" data-owner="${s.seat}" data-position="${s.position}" style="--seat-color:${s.color};--age:-${age}ms;--play-age:-${age}ms">
   <div class="seat-role" aria-live="polite">${role||(!p.alive?'石化':'等待')}</div>${actor(g,s.seat,`${p.count}张 · 药${p.remaining}/6`,cls)}<div class="seat-timer" data-owner="${s.seat}" role="timer" hidden><b></b></div>
   <div style="--age:-${g.phase==='reveal'?age:5000}ms" class="owned-pile ${open?'opened-pile':''}" aria-label="${seatWho(g,s.seat)}打出的牌"><div class="pile-cards">${s.cards.map(c=>`<div class="pile-card ${c.latest?'latest-card':'older-card'} ${c.kind?(c.truth?'true-card':'false-card'):''}" data-batch="${c.batch}" style="--card:${c.faceIndex}">${c.kind?`<div class="card-flipper"><span class="card-back">?</span><img src="assets/card-${c.kind}.webp" alt="${CARD_NAMES[c.kind]}"></div><small>${c.kind==='thief'?'万能':CARD_NAMES[c.kind]}<b>${c.truth?'真':'假'}</b></small>`:'<span class="pile-back">?</span>'}</div>`).join('')}</div>
   <div class="pile-label">${open?'被开的牌':current&&g.phase==='playing'?`刚出${g.last.count}张`:s.cards.length?'已出':''}</div></div>${seatSpeech(s.seat,g)}</div>`;
 }).join('')}</div>`;
}
function actor(g,seat,label,cls=''){
 const pose=actorPose(g,seat,actionNow(),reducedMotion),p=g.players[seat];
 return `<div class="action-actor ${cls}" data-seat="${seat}"><div class="actor-art"><img class="actor-body" data-character="${p.character}" data-action="${pose?.action||''}" data-frame="${pose?.frame??''}" src="${pose?.path||'assets/'+p.character+'.webp'}" alt="${esc(p.name)}"><div class="pixel-burst" aria-hidden="true">${Array.from({length:10},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div></div><strong>${seatWho(g,seat)}</strong><small>${label}</small></div>`;
}
function sceneHeading(g,scene){
 const e=g.event;
 if(g.phase==='reveal')return scene.beat==='challenge'?characterName(g.players[e.caller].character)+' 开牌':scene.beat==='flip'?'翻牌中':characterName(g.players[e.loser].character)+' 喝药';
 return scene.beat==='drinking'?characterName(g.players[e.loser].character)+' 喝药中':characterName(g.players[e.loser].character)+' · '+outcomeTitle(e);
}
function centerReveal(g){
 if(g.phase!=='reveal')return '';
 const e=g.event,age=Math.max(0,actionNow()-g.phaseAt),scene=actionState(g,actionNow());
 return `<div class="center-reveal" data-owner="${e.accused}" data-owner-position="${tableSeats(g,snapshot.seat).find(s=>s.seat===e.accused).position}" data-beat="${scene.beat}" style="--age:-${age}ms"><div class="reveal-focus"><strong>${characterName(g.players[e.accused].character)}的牌 <small>· ${CARD_NAMES[e.target]}桌</small></strong><div class="focus-cards">${e.cards.map((kind,i)=>`<div class="focus-card ${isTruth(kind,e.target)?'true-card':'false-card'}" style="--card:${i}"><div class="card-flipper"><span class="card-back">?</span><img src="assets/card-${kind}.webp" alt="${CARD_NAMES[kind]}"></div><span>${CARD_NAMES[kind]}<b>${isTruth(kind,e.target)?'真':'假'}</b></span></div>`).join('')}</div></div></div>`;
}
function traceView(g){return g.phase==='reveal'?`<svg class="challenge-trace" aria-hidden="true"><defs><marker id="trace-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#ffe2a0"/></marker></defs><line marker-end="url(#trace-arrow)"/></svg>`:'';}
function syncTrace(){
 const g=snapshot?.game,svg=document.querySelector('.challenge-trace'),stage=document.querySelector('.stage-space');if(!svg||!g)return;
 const a=document.querySelector(`.table-seat[data-owner="${g.event.caller}"] .actor-art`).getBoundingClientRect(),b=document.querySelector(`.table-seat[data-owner="${g.event.accused}"] .owned-pile`).getBoundingClientRect(),r=stage.getBoundingClientRect();
 const x=a.x+a.width/2,y=a.y+a.height/2,tx=b.x+b.width/2,ty=b.y+b.height/2,length=Math.hypot(tx-x,ty-y)||1,margin=a.width*.55;
 const line=svg.querySelector('line');for(const [key,value] of Object.entries({x1:x-r.x+(tx-x)*margin/length,y1:y-r.y+(ty-y)*margin/length,x2:tx-r.x,y2:ty-r.y}))line.setAttribute(key,value);
 const focus=document.querySelector('.center-reveal');if(focus){
  // Keep the enlarged copy in the free middle gap even when other piles grow.
  const left=r.x+(r.width-focus.offsetWidth)/2,right=left+focus.offsetWidth;
  let top=r.y+1,bottom=r.bottom-1;
  for(const seat of document.querySelectorAll('.table-seat')){
   const boxes=[...seat.querySelectorAll('.pile-card,.actor-art')].map(n=>n.getBoundingClientRect());
   const range=document.createRange();range.selectNodeContents(seat.querySelector('.pile-label'));boxes.push(range.getBoundingClientRect());
   for(const b of boxes)if(b.width&&Math.min(right,b.right)-Math.max(left,b.x)>2){if(Number(seat.dataset.position)>=2)top=Math.max(top,b.bottom+1);else bottom=Math.min(bottom,b.y-1);}
  }
  const y=Math.max(top+focus.offsetHeight/2,Math.min(r.y+r.height/2,bottom-focus.offsetHeight/2));
  focus.style.top=`${y-r.y}px`;focus.style.setProperty('--from-x',`${tx-r.x-r.width/2}px`);focus.style.setProperty('--from-y',`${ty-y}px`);
 }
}
const outcomeTitle=e=>e.eliminated?'石化':{hiccup:'安全 · 打嗝',smoke:'安全 · 冒烟',spark:'安全 · 火花'}[e.effect];
let clientId;try{clientId=sessionStorage.getItem('liars-client')||crypto.randomUUID();sessionStorage.setItem('liars-client',clientId);}catch{clientId=crypto.randomUUID();}
let playerId;try{playerId=localStorage.getItem('liars-player-id')||crypto.randomUUID();localStorage.setItem('liars-player-id',playerId);}catch{playerId=clientId;}
const connection=new Connection(receive,text=>document.querySelector('#status').textContent=text.includes('保留座位30秒')?'有角色断线，等待重连':text);
const emit=(type,data={})=>{if(inCamp)parent.postMessage({source:'camp-game',mode:'liars',type,...data},location.origin);};
function toast(message){clearTimeout(toastTimer);document.querySelector('#toast').textContent=message;document.querySelector('#toast').classList.add('show');toastTimer=setTimeout(()=>document.querySelector('#toast').classList.remove('show'),3000);}
function tone(hz=440){feedback.note(hz,.08,0,'triangle',.025);}
function button(label,action,cls='',disabled=false){return `<button data-do="${action}" class="${cls}" ${disabled?'disabled':''}>${label}</button>`;}
function readForm(){address=document.querySelector('#address')?.value.trim()||address;code=document.querySelector('#code')?.value.trim()||code;}
function matchmaking(){screen.innerHTML=`<section class="welcome queue-screen"><div class="panel"><div class="eyebrow">FIND YOUR TABLE</div><h1>寻找同桌旅人</h1><img class="queue-portrait" src="assets/${character}.webp" alt="你的角色"><p>已加入牌桌队列<br>同桌人数：${queueInfo?.waiting||1} / 4</p><p id="match-countdown"></p><small>优先匹配同一服务器上的玩家，短时等待后自动入桌。</small><p>${button('取消匹配','cancel-match','quiet')}</p></div></section>`;}
function welcome(){screen.innerHTML=`<section class="welcome"><div class="eyebrow">THE POTION TABLE</div><h1>再骗一杯</h1><p class="intro">经典牌局 · 六瓶魔药 · 同网好友 / 机器人练习</p><div class="panel"><div class="profile-editor"><p class="role-name-note">局内使用角色名 · 选择你的形象</p><small>四席角色各不相同 · 重复选择时自动分配</small><div class="characters">${CHARACTERS.map(ch=>`<button class="character ${character===ch.id?'selected':''}" data-do="character:${ch.id}" aria-pressed="${character===ch.id}"><img src="assets/${ch.id}.webp" alt="${ch.name}">${ch.name}</button>`).join('')}</div></div><div class="connect-form"><div class="match-entry">${button(busy?'连接中…':'快速入桌 · 可补机器人','match','primary',busy)}</div><div class="mode-tabs">${button('我是房主','host',joining?'':'selected')}${button('加入好友','guest',joining?'selected':'')}</div>${joining?`${window.CampLan?`<div class="field"><label for="address">房主的 Wi-Fi 地址</label><input id="address" inputmode="decimal" placeholder="例如 192.168.1.8" value="${esc(address)}"></div>`:''}<div class="field"><label for="code">六位房间码</label><input id="code" inputmode="numeric" maxlength="6" placeholder="输入好友的房间码" value="${esc(code)}"></div>`:`<p class="room-note">2—4 人真实牌局<br>${window.CampLan?'两部或更多安卓手机连接同一 Wi-Fi，房主保持游戏前台。':'好友打开与你相同的营地局域网网址，再输入房间码。'}</p>`}${button(busy?'连接中…':joining?'推门入座':'开一桌新牌','connect','primary',busy)}<small class="match-boundary">当前测试：同一服务器玩家可互相匹配。互联网匹配待公共服务器配置。</small></div></div><p class="room-note">最后一位幸存者获胜 · 不收入场费</p>${closedReason?`<p class="error">${esc(closedReason)}</p>`:''}</section>`;}
function lobby(){const own=snapshot.players[snapshot.seat],players=snapshot.players.filter(Boolean),canStart=players.length>=2&&players.every(p=>p.connected&&p.ready);screen.innerHTML=`<section class="welcome"><div class="panel room-panel"><div class="room-head"><small>桌号 · 请把房间码告诉好友</small><strong>${snapshot.code}</strong><p>${esc(connection.address||location.host)}</p>${button('复制邀请','invite','quiet')}</div><div class="seats">${snapshot.players.map((p,i)=>p?`<div class="seat ${p.ready?'ready':''}"><img src="assets/${p.character}.webp" alt="${CHARACTERS.find(c=>c.id===p.character)?.name||'角色'}"><b>${esc(p.name)}${i===snapshot.seat?' · 你':''}</b><small>${p.bot?'机器人':!p.connected?'等待重连':p.ready?'已准备':'尚未准备'}${i===0?' · 房主':''}</small></div>`:'<div class="seat empty"><b>空位</b><small>等一位冒险者</small></div>').join('')}</div><div class="row">${button(own?.ready?'取消准备':'我已准备','ready','primary')}${snapshot.host?button(canStart?'开始牌局':'等待大家准备','start','',!canStart):'<small>准备后等待房主开局</small>'}</div><p class="room-note">魔王 / 勇者 / 公主各 6 张，小偷 2 张。<br>每人 5 张手牌，每次出 1—3 张。</p>${button('离开房间','leave','quiet')}</div></section>`;}
function eventView(g){if(snapshot.phase==='paused')return `<div class="event-layer"><div class="event-box"><h2>等待重连</h2><small>已暂停 · 超时取消本局</small></div></div>`;
 if(g.phase==='playing')return roundIntro(g,serverNow())?`<div class="round-intro" style="--round-age:-${Math.max(0,serverNow()-g.roundAt)}ms"><small>第 ${g.round} 小局</small><h2>${CARD_NAMES[g.target]}桌</h2><img src="assets/card-${g.target}.webp" alt="${CARD_NAMES[g.target]}"><p>小偷万能</p></div>`:'';
 const e=g.event,p=g.players[e?.loser],name=esc(p?.name),cards=e?.cards||[],age=Math.max(0,actionNow()-g.phaseAt),scene=actionState(g,actionNow()),delay=`style="--age:-${age}ms"`;
 const reason=e?(e.lied?'有假牌':'全真 · 质疑失败'):'';
 if(g.phase==='reveal')return `<div class="event-layer reveal-layer"><div class="event-box action-scene reveal-scene ownership-verdict" data-beat="${scene.beat}" ${delay}><div class="eyebrow">${e.auto?'强制开牌':'开牌'}</div><div class="challenge-route"><span>${seatWho(g,e.caller)}<small>开牌</small></span><b>→</b><span>${seatWho(g,e.accused)}<small>被开</small></span></div><h2 class="scene-heading" aria-live="polite">${sceneHeading(g,scene)}</h2><p class="verdict-line">${reason}</p>${e.source==='timeout'?'<small class="timeout-note">超时代出</small>':''}</div></div>`;
 if(g.phase==='outcome')return `<div class="event-layer"><div class="event-box action-scene outcome-scene effect-${e.effect}" data-beat="${scene.beat}" ${delay}><div class="eyebrow">第 ${e.drink} 瓶</div><h2 class="scene-heading" aria-live="polite">${sceneHeading(g,scene)}</h2><p class="result-line">${e.eliminated?'已淘汰':'剩'+p.remaining+'瓶'}</p></div></div>`;
 return `<div class="event-layer finish-layer"><div class="event-box finish-scene"><div class="eyebrow">本局结束</div><div class="finish-winner"><div class="result-name">${esc(g.players[g.winner].name)}</div><h2>获胜</h2></div><p id="receipt-state">${receipt?.id===g.id?'已记录 · '+balance+' 币':'正在记录本局…'}</p><div class="row">${snapshot.matched?button('再匹配一局','match-again','primary',receipt?.id!==g.id):snapshot.host?button('再开一局','rematch','primary',receipt?.id!==g.id):'<small>等待房主再开一局</small>'}${button('返回营地','return','quiet')}</div><ul class="history">${g.players.map(p=>`<li>${esc(p.name)} · ${p.drinks}瓶 · ${p.alive?'幸存':'石化'}</li>`).join('')}</ul></div></div>`;
}
function playView(){const g=snapshot.game,own=g.players[snapshot.seat],active=snapshot.phase==='match'&&g.phase==='playing'&&g.turn===snapshot.seat&&own.alive;const live=g.players.filter(p=>p.alive).length;
 screen.innerHTML=`<section class="play phase-${g.phase}"><div class="play-top"><img class="table-emblem" src="assets/card-${g.target}.webp" alt=""><span>第 ${g.round} 局</span><span class="target">${CARD_NAMES[g.target]}桌</span><span class="table-number">桌号 ${snapshot.code}</span></div><div class="table-status"><span class="turn-note">${!own.alive?'你已石化，留桌观战':g.phase==='playing'?active?'轮到你 · 出牌或质疑':`轮到 ${seatWho(g,g.turn)}`:''}</span><span class="last-play">${g.last?`最新：${seatWho(g,g.last.seat)} 出了 <b>${g.last.count}张</b>，声称是${CARD_NAMES[g.last.target]}${g.last.source==='timeout'?'（超时随机代出）':''}`:'牌只放在各自面前 · 只能质疑最新一手'}</span></div><div class="stage-space">${traceView(g)}${ownedSeats(g)}${centerReveal(g)}</div><div class="hand-zone"><div class="hand-title"><span><img class="self-portrait" src="assets/${own.character}.webp" alt="">${esc(own.name)} · ${own.alive?'你的手牌':'石像观战'}</span><span>药 ${own.remaining}/6${own.alive?' · 风险 1/'+own.remaining:''}</span></div><div class="hand">${g.hand.map(card=>`<button data-do="card:${card.id}" data-card="${card.id}" class="card ${card.kind==='thief'?'thief':''} ${selected.has(card.id)?'selected':''}" aria-label="${CARD_NAMES[card.kind]}${card.kind==='thief'?' 万能牌':''}" aria-pressed="${selected.has(card.id)}" ${active?'':'disabled'}><img src="assets/card-${card.kind}.webp" alt=""><span>${CARD_NAMES[card.kind]}</span></button>`).join('')||'<small>本轮手牌已出完</small>'}</div><div class="selection-note">${selected.size?g.hand.filter(c=>selected.has(c.id)).map(c=>CARD_NAMES[c.kind]).join('、')+' · '+(g.hand.filter(c=>selected.has(c.id)).every(c=>isTruth(c.kind,g.target))?'全真':'有假牌'):active?'选1—3张':!own.alive?'已石化 · 留桌观战':g.phase==='playing'?`轮到${seatWho(g,g.turn)}`:'开牌中'}</div><div class="actions">${button('出牌 · '+selected.size+'张','play','primary',!active||selected.size<1)}${button(g.last?'质疑 '+characterName(g.players[g.last.seat].character):'质疑上一手','challenge','danger',!active||!g.last)}</div></div>${eventView(g)}</section>`;}
function render(){document.body.classList.toggle('reduced-motion',reducedMotion);document.body.classList.toggle('paused-actions',snapshot?.phase==='paused');document.body.classList.toggle('at-table',!!snapshot?.game);syncOrientation();if(queueInfo)matchmaking();else if(!snapshot)welcome();else if(!snapshot.game)lobby();else playView();drawTable(canvas,snapshot,visualTime,serverNow());syncTrace();}
function settle(reward){if(!reward||pendingReward?.runId===reward.id||receipt?.id===reward.id)return;pendingReward={runId:reward.id,win:reward.win,score:snapshot.game.round};if(inCamp)emit('finish',{result:pendingReward});else{try{const api=createServices(platform);api.finish(reward.id,'liars',reward.win,snapshot.game.round);balance=api.get().coins;receipt={id:reward.id};pendingReward=null;}catch(error){toast('结算未保存：'+error.message);}}}
function receive(m){if(m.type==='queue'){queueInfo=m;clockOffset=(m.serverTime??Date.now())-Date.now();busy=false;render();return;}if(m.type==='queueCanceled'){connection.stop();queueInfo=null;snapshot=null;busy=false;render();return;}if(m.type==='error'){busy=false;toast(m.message);if(!snapshot&&!queueInfo){connection.stop();welcome();}return;}if(m.type==='snapshot'){m=roleSnapshot(m);const previous=snapshot;queueInfo=null;snapshot=m;clockOffset=(m.serverTime??Date.now())-Date.now();busy=false;if(m.game?.revision!==seenRevision){selected.clear();seenRevision=m.game?.revision??-1;}const g=m.game;if(g&&previous?.game?.id!==g.id&&g.players[m.seat].character!==character)toast('本局角色：'+CHARACTERS.find(c=>c.id===g.players[m.seat].character).name);if(g?.event&&g.phase==='reveal'&&!audit.some(a=>a.id===g.id&&a.round===g.round)){audit.push({id:g.id,round:g.round,event:structuredClone(g.event),players:g.players.map(p=>p.name)});audit=audit.slice(-12);}settle(m.reward);render();}if(m.type==='closed'||m.type==='disconnected'){closedReason='连接已结束，请重新进入房间';connection.stop();queueInfo=null;snapshot=null;busy=false;selected.clear();render();}}
function command(type,data={}){if(!snapshot?.game)return;connection.send({type,...data,revision:snapshot.game.revision,requestId:crypto.randomUUID()});}
function openDialog(){
 const title=dialog.querySelector('h2'),body=document.createElement('div');body.className='dialog-body';
 if(title)title.remove();body.append(...dialog.childNodes);dialog.replaceChildren();
 const header=document.createElement('div');header.className='dialog-heading';
 if(title){title.tabIndex=-1;header.append(title);}
 const close=document.createElement('button');close.className='quiet';close.dataset.do='close';close.textContent='关闭';close.setAttribute('aria-label','关闭弹窗');header.append(close);
 dialog.append(header,body);dialog.showModal();title?.focus({preventScroll:true});body.scrollTop=0;
}
function quickChat(){if(!snapshot){toast('入桌后可以发送快捷语');return;}dialog.innerHTML=`<h2>快捷语</h2><div class="phrase-buttons">${QUICK_PHRASES.map((text,i)=>button(text,'phrase:'+i,'quiet')).join('')}</div><ul class="chat-history">${(snapshot.chat||[]).slice(-6).map(line=>`<li><b>${esc(line.name)}</b>：${esc(line.text)}</li>`).join('')}</ul>${button('关闭','close','primary')}`;openDialog();}
function journal(){dialog.innerHTML=`<h2>最近开牌核对</h2><ul class="audit-history">${audit.slice().reverse().map(({round,event:e,players:p})=>`<li><b>第 ${round} 轮 · ${CARD_NAMES[e.target]}桌</b><p>${esc(p[e.caller])} 质疑 ${esc(p[e.accused])} 的上一手${e.auto?'（强制质疑）':''}。</p><p>${e.cards.map(k=>`${CARD_NAMES[k]}：${k==='thief'?'万能真牌':isTruth(k,e.target)?'真牌':'假牌'}`).join(' / ')}</p><p>${e.lied?'含假牌，出牌者':'全真，质疑者'} ${esc(p[e.loser])} 喝药。${e.source==='timeout'?'此手为超时随机代出。':''}</p></li>`).join('')||'<li>还没有开牌记录。</li>'}</ul>${button('关闭','close','primary')}`;openDialog();}
function rules(){dialog.innerHTML=`<h2>玩法说明</h2><ol><li>每轮随机指定魔王、勇者或公主为桌面牌。每人拿 5 张。</li><li>轮到你时，在30秒内扣下 1—3 张，统一声称是桌面牌。小偷是万能牌。超时自动扣下一张随机手牌。</li><li>你也可以质疑上一手：只要有一张假牌，出牌者喝药；全是真牌，质疑者喝药。</li><li>出空手牌后，本轮跳过你。只剩一位仍持牌时，自动质疑上一手。</li><li>六瓶药中一瓶诅咒，喝到即石化。判定后自动喝药。安全药不放回，药量跨轮保留。</li><li>每次质疑后，幸存者重新领 5 张牌。最后一位活着的玩家获胜。本桌不收入场费；营地冒险币按有效参与和首次目标单独结算。</li></ol><p><small>角色只改变外观。四席各用一种角色，重复选择会自动分配剩余角色。离席会取消未完成的牌局。断线保留座位30秒。手机房主切后台会关闭房间。</small></p><div class="row feel-settings">${button('减少晃动 '+(reducedMotion?'开':'关'),'motion','quiet')}${button('震动 '+(hapticsOn?'开':'关'),'haptics','quiet')}${button('最近开牌核对','journal','quiet')}</div><p><small>震动需要设备支持；减少晃动会关闭震动和大幅位移。</small></p>${button('我明白了','close','primary')}`;openDialog();}
function confirmLeave(toCamp=false){if(queueInfo){connection.send({type:'cancelMatch'});if(toCamp&&inCamp)emit('exit');return;}if(!snapshot){if(toCamp&&inCamp)emit('exit');else{connection.stop();snapshot=null;render();}return;}dialog.innerHTML=`<h2>现在离席？</h2><p>${snapshot.game?.phase==='finished'?'已到账的奖励会保留。':'离席会取消这场未完成的牌局，大家都不会获得本局奖励。'}</p><div class="row">${button('继续留桌','close')}${button('确认离席',toCamp?'confirm-return':'confirm-leave','danger')}</div>`;openDialog();}
async function action(value){const [type,id]=value.split(':');feedback.unlock();tone(420);
 if(type==='landscape'){await requestLandscape();return;}
 else if(type==='orientation-exit'){if(inCamp)confirmLeave(true);else if(snapshot)confirmLeave(true);else location.href='../../';return;}
 else if(type==='character'){readForm();character=id;welcome();}
 else if(type==='host'||type==='guest'){readForm();joining=type==='guest';welcome();}
 else if(type==='connect'){readForm();if(joining&&!/^\d{6}$/.test(code)){toast('请输入六位房间码');return;}busy=true;closedReason='';welcome();try{await connection.connect({hosting:!joining,code,name:characterName(character),character,clientId,address});}catch(e){busy=false;connection.stop();toast(e.message);welcome();}}
 else if(type==='match'||type==='match-again'){readForm();if(type==='match-again'){connection.leave();snapshot=null;}busy=true;closedReason='';welcome();try{await connection.connect({matching:true,name:characterName(character),character,clientId,playerId});}catch(e){busy=false;connection.stop();toast(e.message);welcome();}}
 else if(type==='cancel-match')connection.send({type:'cancelMatch'});
 else if(type==='phrase'){connection.send({type:'quickChat',phrase:Number(id)});dialog.close();}
 else if(type==='journal'){dialog.close();journal();}
 else if(type==='motion'||type==='haptics'){if(type==='motion')reducedMotion=!reducedMotion;else hapticsOn=!hapticsOn;try{localStorage.setItem('liars-reduced-motion',JSON.stringify(reducedMotion));localStorage.setItem('liars-haptics',JSON.stringify(hapticsOn));}catch{}dialog.close();render();rules();}
 else if(type==='ready')connection.send({type:'ready',value:!snapshot.players[snapshot.seat].ready});
 else if(type==='start'||type==='rematch')connection.send({type});
 else if(type==='card'){if(selected.has(id))selected.delete(id);else if(selected.size<3)selected.add(id);else toast('每次最多出三张');playView();}
 else if(type==='play')command('play',{cards:[...selected]});else if(type==='challenge')command(type);
 else if(type==='invite'){const text=`再骗一杯 · 房间 ${snapshot.code}\n${window.CampLan?'房主 Wi-Fi 地址：'+connection.address:location.origin+'/'}\n同一 Wi-Fi，进入再骗一杯后加入好友。`;try{await navigator.clipboard.writeText(text);toast('邀请已复制');}catch{dialog.innerHTML=`<h2>邀请好友</h2><p>${esc(text).replaceAll('\n','<br>')}</p>${button('关闭','close','primary')}`;openDialog();}}
 else if(type==='leave'||type==='return')confirmLeave(type==='return');else if(type==='close')dialog.close();
 else if(type==='confirm-leave'||type==='confirm-return'){connection.leave();snapshot=null;selected.clear();dialog.close();if(type==='confirm-return'&&inCamp)emit('exit');else if(type==='confirm-return')location.href='../../';else render();}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-do]');if(b&&!b.disabled)action(b.dataset.do);});
const tableHeader=document.querySelector('header'),tableMenu=document.querySelector('#table-menu');
function closeTableMenu(){tableHeader.classList.remove('menu-open');tableMenu.setAttribute('aria-expanded','false');}
tableMenu.onclick=()=>{const open=tableHeader.classList.toggle('menu-open');tableMenu.setAttribute('aria-expanded',String(open));};
document.querySelector('#help').onclick=()=>{closeTableMenu();rules();};document.querySelector('#chat').onclick=()=>{closeTableMenu();quickChat();};document.querySelector('#exit').onclick=()=>{closeTableMenu();confirmLeave(true);};document.querySelector('#mute').onclick=()=>{soundOn=!soundOn;document.querySelector('#mute').textContent='声音 '+(soundOn?'开':'关');};
document.addEventListener('pointerdown',e=>{if(!tableHeader.contains(e.target))closeTableMenu();},{passive:true});
window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.source!=='camp-host')return;const m=e.data;if(m.command==='enter'){joining=m.choice===2;balance=m.balance||0;render();}if(m.command==='sound'){soundOn=m.enabled;document.querySelector('#mute').textContent='声音 '+(soundOn?'开':'关');}if(m.command==='receipt'&&pendingReward?.runId===m.runId){balance=m.balance;receipt={id:m.runId};pendingReward=null;render();}if(m.command==='receiptError'&&pendingReward?.runId===m.runId){toast('记录未保存，可点击下方重试');const b=document.createElement('button');b.textContent='重试记录';b.onclick=()=>emit('finish',{result:pendingReward});document.querySelector('.event-box')?.append(b);}if(m.command==='ui-action'&&m.action==='help')rules();});
window.CampBridge={control(command){if(command==='exit')connection.leave();}};
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&tableHeader.classList.contains('menu-open')){closeTableMenu();tableMenu.focus();return;}if(tableHeader.contains(document.activeElement)&&['Enter',' '].includes(e.key))return;if(dialog.open||/INPUT|TEXTAREA/.test(document.activeElement?.tagName))return;if(e.key==='f'){e.preventDefault();document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.().catch(()=>{});}if(!snapshot?.game)return;if(e.key>='1'&&e.key<='5'){const card=document.querySelectorAll('.card')[Number(e.key)-1];if(card&&!card.disabled)card.click();}if(e.key==='Enter')document.querySelector('[data-do="play"]:not(:disabled)')?.click();if(e.code==='Space'){e.preventDefault();document.querySelector('[data-do="challenge"]:not(:disabled)')?.click();}});
function frame(t){
 visualTime=t;const now=serverNow(),g=snapshot?.game,mq=document.querySelector('#match-countdown');if(mq&&queueInfo)mq.textContent=Math.max(0,Math.ceil((queueInfo.deadline-now)/1000))+' 秒内入桌';
 drawTable(canvas,snapshot,visualTime,now);const shake=feedback.update(snapshot,now),shakeTransform=`translate(${shake.x.toFixed(2)}px,${shake.y.toFixed(2)}px)`;canvas.style.transform=shakeTransform;
 const scene=actionState(g,actionNow()),box=document.querySelector('.action-scene');if(scene&&box&&box.dataset.beat!==scene.beat&&snapshot.phase!=='paused'){
  box.dataset.beat=scene.beat;const title=box.querySelector('.scene-heading');if(title)title.textContent=sceneHeading(g,scene);
 }
 if(box)box.style.transform=shakeTransform;
 const seats=document.querySelector('.table-seats');if(seats&&g){
  seats.dataset.beat=scene?.beat||'';seats.style.transform=shakeTransform;
  for(const s of seats.querySelectorAll('.table-seat')){
   const seat=Number(s.dataset.owner),p=g.players[seat];s.dataset.beat=scene?.beat||'';
   s.classList.toggle('play-actor',g.phase==='playing'&&scene?.beat==='play'&&scene.actor===seat);
   s.classList.toggle('focus-loser',g.phase==='reveal'&&scene?.beat==='verdict'&&seat===g.event.loser);
   s.classList.toggle('stone-seat',!p.alive&&!(g.phase==='outcome'&&scene?.beat==='drinking'&&seat===g.event.loser));
   const label=seatActionLabel(g,seat,actionNow()),role=s.querySelector('.seat-role');if(label&&role.textContent!==label)role.textContent=label;
   const img=s.querySelector('.actor-body'),pose=actorPose(g,seat,actionNow(),reducedMotion);
   if(pose&&(img.dataset.frame!==String(pose.frame)||img.dataset.action!==pose.action)){img.src=pose.path;img.dataset.frame=pose.frame;img.dataset.action=pose.action;}
  }
 }
 const trace=document.querySelector('.challenge-trace');if(trace)trace.dataset.beat=scene?.beat||'';const focus=document.querySelector('.center-reveal');if(focus)focus.dataset.beat=scene?.beat||'';
 const intro=document.querySelector('.round-intro');if(intro)intro.hidden=!roundIntro(g,now);
 document.querySelectorAll('.seat-speech').forEach(b=>{b.hidden=now>Number(b.dataset.until);});
 for(const timer of document.querySelectorAll('.seat-timer')){
  const clock=seatCountdown(g,Number(timer.dataset.owner),actionNow());timer.hidden=!clock;if(!clock)continue;
  timer.querySelector('b').textContent=clock.seconds;timer.style.setProperty('--remaining',clock.fraction);timer.classList.toggle('urgent',clock.seconds<=5);timer.setAttribute('aria-label',`${characterName(g.players[Number(timer.dataset.owner)].character)}${clock.action}剩${clock.seconds}秒${snapshot.phase==='paused'?'，已暂停':''}`);
 }
 raf=requestAnimationFrame(frame);
}
window.advanceTime=ms=>{visualTime+=ms;drawTable(canvas,snapshot,visualTime,serverNow());syncTrace();};
window.render_game_to_text=()=>JSON.stringify({mode:'liars',coordinates:'canvas origin top-left; x right, y down; cosmetic only',orientationBlocked,screen:queueInfo?'matching':snapshot?(snapshot.game?snapshot.game.phase:'lobby'):'welcome',queue:queueInfo,matched:snapshot?.matched,chat:snapshot?.chat,room:snapshot?.code,seat:snapshot?.seat,host:snapshot?.host,roomPhase:snapshot?.phase,players:snapshot?.players,game:snapshot?.game,action:actionState(snapshot?.game,actionNow()),countdown:snapshot?.game?{seat:snapshot.game.phase==='playing'?snapshot.game.turn:null,clock:seatCountdown(snapshot.game,snapshot.game.phase==='playing'?snapshot.game.turn:snapshot.game.event?.loser,actionNow())}:null,table:snapshot?.game?tableSeats(snapshot.game,snapshot.seat):[],roundIntro:roundIntro(snapshot?.game,serverNow()),feedback:{lastCue:feedback.lastCue,reducedMotion,hapticsOn,soundOn},selected:[...selected],receipt,balance});
document.addEventListener('pointerdown',()=>feedback.unlock(),{passive:true});document.addEventListener('keydown',()=>feedback.unlock());
window.addEventListener('resize',()=>{syncOrientation();syncTrace();});if(!inCamp)window.CampOrientation?.setLandscape(true);
window.addEventListener('pagehide',()=>{connection.leave();cancelAnimationFrame(raf);feedback.close();if(!inCamp){window.CampOrientation?.setLandscape(false);window.screen.orientation?.unlock?.();}});render();raf=requestAnimationFrame(frame);emit('ready');

