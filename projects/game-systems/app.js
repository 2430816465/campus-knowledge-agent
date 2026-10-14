import './games/shared/preferences.js';
import './screen-pages.js';
import './games/shared/legibility.js';

import {modes,products,createServices,createRoomService,taskProgress} from './services.js';
import {platform} from './platform.js';
import {registry,GameHost} from './adapters.js';
import './live-games.js';
import './evolve-host.js';
import {icon,btn,art,money,portrait,avatarVariant,itemArt,status,empty,escape} from './ui.js';
import {referenceArt} from './reference-art.js';
import {questBadge} from './quest-badge.js';
import {renderPage} from './views.js';
import {settingsBody} from './wood-settings.js';
import {campView,handleCampAction,rememberGame} from './camp-layout.js';
const api=createServices(platform),rooms=createRoomService(),host=new GameHost();
const app=document.querySelector('#app'),modal=document.querySelector('#modal');
let page='home',mode=modes[0],choice={},tab='daily',run=null;
let adBusy=false,adOutcome='complete',dev=false,devEnabled=new URLSearchParams(location.search).has('dev');
let toastTimer,lastFocus,focusAction,menuReturn=false,roomNextReady=false,myNextReady=false,peerWatchingAd=false,assetError=false;
const scrollPositions={};
function toast(text){clearTimeout(toastTimer);const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
function show(title,body,kind='plain'){
 if(page==='preview')host.active?.pause?.();
 if(!modal.open){lastFocus=document.activeElement;focusAction=lastFocus?.dataset?.action||null}
 modal.dataset.kind=kind;
 modal.innerHTML=`<div class="modal-top"><span class="eyebrow">冒险营地 · ${kind==='advert'?'本地模拟':'旅人手册'}</span><button class="square" data-action="close" aria-label="关闭" ${adBusy?'disabled':''}>${icon('close')}</button></div><h2 id="dialog-title">${title}</h2>${body}`;
 modal.setAttribute('aria-labelledby','dialog-title');if(!modal.open)modal.showModal();
 (modal.querySelector('input')||modal.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
}
function restoreFocus(){const target=lastFocus?.isConnected?lastFocus:[...document.querySelectorAll('[data-action]')].find(e=>e.dataset.action===focusAction);target?.focus({preventScroll:true})}
function close(){if(adBusy)return;if(menuReturn){menuReturn=false;menu();return}modal.close();host.active?.resume?.();if(page!=='preview')restoreFocus()}
function go(next){clearTimeout(toastTimer);document.querySelector('#toast').classList.remove('show');scrollPositions[page]=scrollY;if(page==='preview'&&next!=='preview')host.stop();page=next;menuReturn=false;modal.close();render();document.querySelector('#main').focus({preventScroll:true});window.scrollTo(0,scrollPositions[next]||0)}
function header(){const s=api.get();return `<header class="topbar"><button class="identity" data-action="nav:profile">${portrait(avatarVariant(s))}<span><b title="${escape(s.name)}">${escape(s.name)}</b><small>欢迎回来！</small></span></button><div class="brand">${referenceArt('crest')}${icon('compass')}<span>冒险营地<em class="build-stamp">1.27.0 · 像素营地</em></span></div><button class="wallet" data-action="wallet" aria-label="冒险币 ${s.coins}">${money(s.coins)}<span>冒险币</span></button></header>`}
function nav(){return `<nav class="nav" aria-label="主导航">${[['home','compass','冒险'],['tasks','book','任务'],['collection','bag','藏品'],['profile','user','我的']].map(([id,i,n])=>`<button data-action="nav:${id}" ${page===id?'aria-current="page"':''}>${referenceArt({home:'navHome',tasks:'navTasks',collection:'navCollection',profile:'navProfile'}[id])}<span>${n}</span>${id==='tasks'&&api.get().runs.length&&!api.get().claimed.includes('first')?'<i class="dot" aria-label="奖励待领"></i>':''}</button>`).join('')}</nav>`}
function developer(){return `<details class="developer" ${dev?'open':''}><summary>开发预览 · 本地演示数据</summary><div><label>模拟广告结果 <select id="ad-outcome"><option value="complete" ${adOutcome==='complete'?'selected':''}>完整观看</option><option value="cancel" ${adOutcome==='cancel'?'selected':''}>提前关闭</option><option value="unavailable" ${adOutcome==='unavailable'?'selected':''}>暂不可用</option></select></label>${page==='room'?`<label>模拟队友状态 <select id="room-state">${[['waiting','等待 / 队友离开'],['joined','已加入，未准备'],['ready','队友已准备'],['disconnected','连接中断'],['failed','重连失败']].map(([v,n])=>`<option value="${v}" ${rooms.get()?.state===v?'selected':''}>${n}</option>`).join('')}</select></label>`:''}${page==='results'&&mode.id==='coop'?btn(roomNextReady?'队友已准备':'模拟队友准备','peer-next','quiet')+btn('模拟队友看广告','peer-ad','quiet'):''}${btn('重置演示数据','reset','quiet')}${btn('收起预览工具','dev-close','quiet')}</div></details>`}
function render(){
 dev=document.querySelector('.developer')?.open??dev;
 const global=['home','tasks','collection','profile','shop'].includes(page);
 document.body.dataset.page=page;document.body.dataset.mode=['prepare','room','preview','results'].includes(page)?mode.id:'camp';document.body.style.setProperty('--mode-accent',mode.color);
 const view=campView(page,{s:api.get(),tab})??renderPage(page,{s:api.get(),r:rooms.get(),mode,choice,tab,run,myNextReady,roomNextReady,peerWatchingAd,devEnabled});
 app.innerHTML=`<div class="world" aria-hidden="true"><div class="world-far"></div><div class="world-mist"></div><div class="world-light"></div></div><div class="shell ${global?'has-nav':''}">${header()}${assetError?'<div class="notice asset-warning" role="alert">部分场景未加载，仍可操作。'+btn('重试加载','reload-art','quiet')+'</div>':''}<main tabindex="-1" id="main" class="page-${page}">${view}</main>${global?nav():''}<footer><span>围着同一簇火，走向不同的远方。</span><span class="demo-label">${icon('info')} 本地体验 · 非正式在线服务</span></footer>${devEnabled?developer():''}</div>`;
 document.title=(['prepare','preview','room'].includes(page)?mode.name:'冒险营地')+' · 公共 UI';
}
function help(target=mode){show(target.name,`<p>${target.description}</p><div class="help-rule"><p>${{rush:'左右拖动队伍选光幕，自动御剑；第三关起二选一与三选一混排，并逐关增加一组选择。18位魔物首领和8类小怪用数字显示剩余生命。选择人数、飞剑、剑诀和全队飞升，获得穿透、追踪、雷鸣连锁、赤炎爆炸与护盾。附属灵阵守点固定位置，点击左中右区域设置优先目标；每波结束暂停四选一，共30波，每5波首领。两种玩法独立存档，暂停可保存离开。旧战斗续玩保留原规则，重新出发启用新规则。',nightwatch:'勇者固定守在城门后，符文连弩和法术自动攻击。按住战场拖动瞄准，松手恢复索敌；升级暂停并三选一，最多同时掌握五项技能。主动召唤守护灵，每夜可免费重整一次。装备、符石、研习与伙伴永久保存，暂停可保存离开。',chess:'选择三人或四人斗地主、掼蛋、南京麻将。人机练习可离线使用；好友房准备后开局，空位由机器人补上。牌局由房主或服务端结算，每人仅能看到自己的手牌。互联网需填写已部署的HTTPS服务器地址；手机局域网房主需保持前台。桌内分数独立记录，有效参与可获得冒险币。',workshop:'原料、烘焙、门店、外卖四区切换，共用库存。点工位走近，短按住采集；亲自入仓、投一批、取成品，再到柜台交付小订单。普通订单不限时，可自愿接取限时加成单；超时只失去加成。设备提高批量、容量或速度，不连续生产售卖；外卖需取篮装车并签收。离线只完成已提交批次。完成六队、六项扩建、送餐 8 份和 3 趟外卖；进度自动保存。',evolve:'鼠标跟随、触屏按住拖动或方向键移动。主角加两只同级生物进化；低级随行生物三合一，并占据队伍空间。队员被更强生物吞噬；主角碰到强敌失败；完整观看模拟广告可复活一次，升到20级胜利。地狱挑战增加毒潮、移动裂隙、强水流和稀缺同级食物，与普通模式分别存档。',tower:'先观察路线，再分配生命、钥匙和塔内金币。模式资源与全局冒险币分别管理。',marble:'拖动瞄准，松手发射。无尽守线可免费抽选组合能力；普通闯关有 50 张独立反弹地图，依次点亮目标再命中金色终点；发射次数有限，可无限次免费重试。',mine:'留意剩余体力，权衡继续探索与结束本局的收益，把宝藏带回营地。',liars:'快速匹配优先凑齐同一服务器的玩家，短时等待后自动入桌；也可创建或加入好友房间。每轮指定一种桌面牌，每人5张，每次扣下1—3张。小偷是万能牌。质疑上一手：出现假牌则出牌者喝药，全真则质疑者喝药。每人六瓶中有一瓶诅咒，喝到即石化淘汰。冒险币按有效参与结算。',coop:'普通36关与困难36关，共72关。1P互动冲刺破障，2P二段跳、推箱和搭肩。摇杆左右移动，右侧跳跃、互动。单人点击左上角切换 1P / 2P（键盘 Q / Tab）；待命角色仍能踩机关。两人都到出口才通关。单人菜单会暂停，联机菜单不会暂停服务器。'}[target.id]}</p></div>${btn(menuReturn?'返回菜单':'明白了','close','primary full')}`,'help')}
let walletTab='balance';
function wallet(tab=walletTab){walletTab=tab;const s=api.get(),offer=s.runs.filter(r=>r.kind==='progress').reverse().map(r=>({id:r.id,...api.adInfo(r.id)})).find(x=>x.amount&&!x.claimed&&x.remaining);
 const tabs='<div class="wood-tabs">'+[['balance','余额'],['income','获取方式'],['ledger','收支记录']].map(([id,label])=>btn(label,'wallet-tab:'+id,id===tab?'selected':'secondary')).join('')+'</div>';
 const body=tab==='balance'?`<div class="wallet-summary"><span>当前冒险币</span><strong>${money(s.coins)}</strong><p>用于营地外观与装饰。</p></div><div class="actions">${btn('去任务','nav:tasks','secondary')}${btn('前往补给铺','shop','primary')}</div>`:tab==='ledger'?`<div class="ledger">${s.ledger.slice(0,30).map(l=>`<p><span>${escape(l.label)}</span><b>${l.amount>0?'+':''}${l.amount.toLocaleString()}</b></p>`).join('')||'<p>暂无收支记录。</p>'}</div>`:`<p>有效游玩自动积累冒险币，首通与任务另有奖励。暂停、离线生产和挂机不计收益。</p><p>基础收益最多每分钟 2 币，受有效目标数量限制。每日任务共 20 币，每周累计奖励 60 币。</p><p>局内金币和材料分别保存，不会自动兑换为冒险币。</p>${offer?btn('模拟广告 · 追加 '+offer.amount+' 币','wallet-ad:'+offer.id,'secondary full'):''}`;
 show('冒险币',tabs+body,'wallet');
}
function product(id){const p=products.find(x=>x.id===id),s=api.get(),owned=s.owned.includes(id),equipped=s.equipped.includes(id);
 show(escape(p.name),`<div class="product-detail-grid">${itemArt(p.id)}<div class="product-decision"><div class="product-meta">${status(equipped?'已装备':owned?'已拥有':p.type,owned?'success':'neutral',owned?'check':'')}<span>${p.mode}</span></div><p>${p.effect}</p><div class="product-permanent">永久拥有 · 仅改变外观</div><div class="reward-row"><span>${owned?'兑换价格':'需要冒险币'}</span><strong>${money(p.price)}</strong></div>${owned?'':`<p class="balance-preview">余额 ${s.coins} → ${s.coins>=p.price?s.coins-p.price:'余额不足'}</p>`}${btn(owned?(equipped?'卸下外观':'装备外观'):s.coins<p.price?'余额不足，查看获取方式':'确认兑换',owned?'equip:'+id:s.coins<p.price?'wallet':'buy:'+id,(owned||s.coins>=p.price?'primary':'secondary')+' full')}</div></div>`,'product');
}
function records(id){const m=modes.find(x=>x.id===id),runs=api.get().runs.filter(r=>r.mode===id);show(m.name+' · 足迹',`<div class="help-art">${art(id)}</div>${runs.length?`<div class="record-summary"><span><b>${runs.length}</b>次体验</span><span><b>${runs.filter(r=>r.win).length}</b>次完成</span><span><b>${runs.reduce((n,r)=>n+r.reward,0)}</b>基础冒险币</span></div><div class="ledger">${runs.slice(-8).reverse().map((r,i)=>`<p><span>第 ${runs.length-i} 次 · ${r.win?'完成':'暂歇'}</span><b>+${r.reward}</b></p>`).join('')}</div>`:empty('flag','还没有留下足迹','不必急着登顶，第一次出发也值得记下。')}${btn('前往'+m.name,'mode:'+id,'primary full')}`,'records')}
function codex(id){const m=modes.find(x=>x.id===id),visited=api.get().runs.some(r=>r.mode===id);show(m.name,`<div class="help-art">${art(id)}</div>${status(visited?'已探索':'尚未探索',visited?'success':'neutral')}<p class="codex-description">${m.description}</p><div class="feature-tags"><span>${m.people}</span><span>${m.tag}</span></div>${btn('查看冒险准备','mode:'+id,'primary full')}`,'help')}
function gameActions(){const items={rush:[['pause','小队存档与设置']],nightwatch:[['pause','守夜存档与设置']],evolve:[['pause','队伍、存档与本局结算']],tower:[['btnInfo','道具与商店'],['btnManual','怪物手册'],['btnSave','保存进度'],['btnLoad','读取存档'],['btnSettings','登塔设置'],['btnRestart','重新开始']],marble:[['pause','存档与本局结算']],mine:[['settings','矿坑设置']],coop:[['helpButton','合作操作说明'],['resetButton','重置本关']]};return '<div class=game-menu-actions>'+(items[mode.id]||[]).map(([id,label])=>btn(label,'game-option:'+id,'secondary')).join('')+'</div>'}
let settingsTab='sound';
function syncPreferences(){
 const settings=api.get().settings;window.CampPreferences?.update(settings);
 document.querySelectorAll('iframe.game-frame').forEach(frame=>frame.contentWindow?.postMessage({source:'camp-host',command:'preferences',settings},location.origin));
 host.active?.sound?.(settings.sound);
}
function openSettings(tab=settingsTab){settingsTab=tab;show('设置',settingsBody(api.get().settings,tab),'settings');}
function menu(){
 host.active?.pause?.();
 const multiplayer=['chess','liars'].includes(mode.id)||(mode.id==='coop'&&(choice.coop||0)===0);
 const note=mode.id==='chess'?'牌局仍在进行；离席由机器人接替，手机房主退出会关闭房间。':mode.id==='liars'?'牌局仍在进行；离席会取消未完成牌局，手机房主请保持前台。':multiplayer?'联机世界仍在运行；手机房主请保持前台。':'本局已暂停';
 show(multiplayer?'冒险菜单':'冒险暂停',`<p class="wood-menu-note">${mode.name} · ${note}</p><p class="wood-menu-receipt">${money(api.get().coins)} 冒险币 · 本局已到账 ${Number(document.querySelector('iframe.game-frame')?.contentWindow?.CampWalletReceipt?.earned||0)}</p>${btn(icon('play')+' 继续冒险','close','primary full wood-continue')}<div class="wood-menu-tools">${btn(icon('gear')+' 本局设置','menu-settings','secondary')}${btn(icon('book')+' 玩法说明','menu-help','secondary')}</div>${gameActions().includes('data-action')?btn('本局选项','menu-options','secondary full'):''}${btn('返回营地','exit-game','quiet full wood-exit')}`,'menu');
 modal.querySelector('[data-action="close"].wood-continue')?.focus({preventScroll:true});
}

async function startGame(roomCode){
 rememberGame(mode.id,choice[mode.id]||0);
 go('preview');
 await host.start(mode.id,{container:document.querySelector('.game-stage'),title:mode.name,choice:choice[mode.id]||0,roomCode,sound:api.get().settings.sound,cosmetics:api.get().equipped,getBalance:()=>api.get().coins,
 onProgress:data=>api.progress(data),onEconomyError:error=>toast('冒险收益未保存：'+error.message),
 onFinish:r=>{const existed=api.get().runs.some(x=>x.id===r.runId);run=api.finish(r.runId,mode.id,r.win,r.score,r.reward);if(!existed)toast('本局已记入旅人手册，营地奖励 +'+run.reward+'。');return run},
 onBonus:(id,amount)=>{api.adReward(id);toast('开发模拟广告奖励已记录');return true},
 onExit:()=>go('home'),onMenu:()=>menu(),
 onError:e=>{host.stop();const stage=document.querySelector('.game-stage');if(stage)stage.innerHTML=`<div class="game-error"><h2>暂时没能启程</h2><p>${escape(e.message)}</p>${btn('重新加载','preview','primary')}${btn('返回准备','again','secondary')}</div>`}
 });
}

let audioContext,musicNodes=[],musicGain;
function sound(ambient=false){try{audioContext||=new AudioContext();audioContext.resume();const gain=audioContext.createGain();gain.gain.value=(ambient?.012:.025)*((ambient?api.get().settings.musicVolume??60:api.get().settings.soundVolume??80)/100);gain.connect(audioContext.destination);if(ambient)musicGain=gain;for(const hz of ambient?[130.81,196,261.63]:[580]){const o=audioContext.createOscillator();o.type='sine';o.frequency.value=hz;o.connect(gain);o.start();if(ambient)musicNodes.push(o);else{o.stop(audioContext.currentTime+.045);o.onended=()=>{o.disconnect();gain.disconnect()}}}}catch{}}
function updateMusic(){musicNodes.forEach(n=>{n.stop();n.disconnect()});musicNodes=[];musicGain?.disconnect();if(api.get().settings.music)sound(true)}
function rewardFlash(){document.querySelector('.topbar .wallet')?.classList.add('reward-flash')}
async function action(a){const colon=a.indexOf(':'),type=colon<0?a:a.slice(0,colon),id=colon<0?undefined:a.slice(colon+1);if(adBusy&&type!=='none')return;
 const settings=api.get().settings;if(settings.sound)sound();if(settings.music&&!musicNodes.length)updateMusic();platform.vibrate(settings.vibration);
 if(handleCampAction(type,id)){render();document.querySelector(`[data-action="${a}"]`)?.focus({preventScroll:true});return;}
 switch(type){
 case 'nav':if(page==='room')rooms.leave();go(id);break;
 case 'close':close();break;
 case 'mode':mode=modes.find(m=>m.id===id);scrollPositions.prepare=0;go('prepare');break;
 case 'choice':choice[mode.id]=Number(id);render();document.querySelector(`[data-action="choice:${id}"]`)?.focus({preventScroll:true});break;
 case 'help':help();break;
 case 'menu-help':menuReturn=true;help();break;
 case 'licenses':show('来源与许可',`<p>合作关卡改编自 Super Lemonade Factory OUYA，按 GPLv3 提供许可与对应可修改源码；棋牌规则及字体许可同时保留。</p><p><a href="legal.html" target="_blank" rel="noopener">查看完整来源、许可与源码获取说明</a></p><p>这是 Android 开发体验版，模拟广告不产生商业收入。未完成素材授权核实的内容不应进入正式商业发布包。</p>`);break;
 case 'settings':menuReturn=false;openSettings();break;
 case 'menu-settings':menuReturn=true;openSettings();break;
 case 'settings-tab':openSettings(id);modal.querySelector(`[data-action="settings-tab:${id}"]`)?.focus();break;
 case 'wood-defaults':for(const [key,value]of Object.entries({music:false,sound:true,vibration:false,musicVolume:60,soundVolume:80,reducedMotion:window.CampPreferences.systemReducedMotion()}))api.settings(key,value);syncPreferences();updateMusic();openSettings();toast('已恢复默认设置');break;
 case 'wood-fullscreen':if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen?.();break;
 case 'help-mode':help(modes.find(m=>m.id===id));break;
 case 'help-all':show('玩法与冒险',`<div class="help-list">${modes.map(m=>btn(icon(m.id)+`<span><b>${m.name}</b><small>${m.tag} · ${m.people}</small></span>`+icon('arrow'),'help-mode:'+m.id,'secondary')).join('')}</div><p class="notice compact">${modes.length}个入口已连接真实游戏。牌局支持同一 Wi-Fi 内联机；勇者棋牌还可连接已部署的 HTTPS 公网服务器。单人进度保存在当前浏览器；${window.CampLan?'合作支持两部安卓手机在同一 Wi-Fi 下联机，房主需保持游戏前台。':'合作需要两位玩家连接同一营地服务器。'}</p>`,'help');break;
 case 'wallet':wallet();break;
 case 'wallet-tab':wallet(id);break;
 case 'wallet-ad':{const info=api.adInfo(id);if(info.claimed||!info.amount||!info.remaining){toast('当前没有可领取的广告加币');break;}adBusy=true;show('可选广告加币',`<p>完整观看开发模拟广告后，追加 ${info.amount} 冒险币。本次首次目标奖励不参与加成。</p><p>加载中…</p>`,'advert');try{const result=await platform.ad(adOutcome,()=>{},id);if(result==='complete'){api.adReward(id);toast('额外 '+info.amount+' 冒险币已到账');}else toast('已关闭广告，基础收益保留');}finally{adBusy=false;wallet();render();}break;}
 case 'shop':go('shop');break;
 case 'product':product(id);break;
 case 'task-detail':{const s=api.get(),q=s.tasks.find(t=>t.id===id)||{id,name:id==='all'?'世界的四个方向':'初次启程',...taskProgress(s,id),claimed:s.claimed.includes(id)},details=id==='first'?'完成一次有效冒险，获得第一笔冒险币收益。':id==='all'?'探索四种玩法；或体验三种单人玩法并累计六次有效冒险。':q?.description||q?.name||'有效游玩会自动记录任务进度。';show(q.name,`<div class="quest-detail-badge">${questBadge(q)}</div><p>${escape(details)}</p>${btn('返回任务','close','primary full')}`,'task');break;}
 case 'records':records(id);break;
 case 'codex':codex(id);break;
 case 'buy':{const result=api.buy(id);if(result==='poor')show('还差一点冒险币',`${empty('coin','好物还会等你','先把新的收获带回营地。')}<p>当前余额 ${api.get().coins}，需要 ${products.find(p=>p.id===id).price}。去完成任务，或再体验一次冒险。</p><div class="actions">${btn('继续逛逛','close','secondary')}${btn('去任务','nav:tasks','primary')}</div>`,'error');else{render();product(id);toast('已兑换，点击装备即可使用')}break}
 case 'equip':api.equip(id);render();if(modal.open&&modal.dataset.kind==='product')product(id);document.querySelector(`[data-action="equip:${id}"]`)?.focus({preventScroll:true});toast('外观装备状态已更新');break;
 case 'tab':tab=id;render();document.querySelector(`[data-action="tab:${id}"]`)?.focus({preventScroll:true});break;
 case 'claim':api.claim(id);render();rewardFlash();toast('任务奖励已到账');break;
 case 'create-room':await startGame();break;
 case 'join-room':show('加入好友房间',`<p>${window.CampLan?'两部手机连接同一 Wi-Fi。先输入房主手机显示的六位房间码，进入后填写房主手机地址。无需电脑。':'输入由本营地服务器创建的六位房间码。两名玩家连接同一服务器后即可合作。'}</p><label class="field-label" for="room-input">六位房间码</label><input id="room-input" maxlength="6" inputmode="numeric" placeholder="输入房间码"><p id="room-error" role="alert"></p>${btn('加入房间','join-submit','primary full')}`,'room');break;
 case 'join-submit':{const code=document.querySelector('#room-input').value.trim();if(!/^\d{6}$/.test(code)){document.querySelector('#room-error').textContent='请输入六位数字房间码';break}await startGame(code);break;}
 case 'invite':toast(await platform.share('冒险营地本地演示 · 房间码 246810（不连接真实好友）'));break;
 case 'ready':rooms.ready();render();document.querySelector('[data-action="ready"]')?.focus({preventScroll:true});break;
 case 'leave-room':rooms.leave();go('prepare');break;
 case 'demo-peer':rooms.set('ready');render();toast('模拟旅伴已加入并准备；未连接真实玩家');break;
 case 'reconnect-room':rooms.set('joined');render();toast('已恢复本地模拟房间；可继续准备');break;
 case 'preview':await startGame();break;
 case 'menu':menu();break;
 case 'menu-options':menuReturn=true;show('本局选项',gameActions()+btn('返回暂停菜单','close','primary full'),'game-options');break;
 case 'profile-records':show('游玩记录','<div class=record-grid>'+modes.map(m=>btn(icon(m.id)+' '+m.name,'records:'+m.id,'secondary')).join('')+'</div>','records-list');break;
 case 'game-option':menuReturn=false;modal.close();host.active?.resume?.();host.active?.uiAction?.(id);break;
 case 'sound':api.settings('sound',!api.get().settings.sound);host.active?.sound?.(api.get().settings.sound);menu();break;
 case 'exit-game':show('返回营地？',`<p>${mode.id==='rush'?'小队位置、人数和当前战场自动保存，下次可继续；通关自动同步首通奖励。':mode.id==='nightwatch'?'城门、波次、已选技能和养成自动保存，下次可继续守夜；结束并结算后才能同步本局营地奖励。':mode.id==='chess'?'离席后机器人接替你的座位；手机局域网房主退出将关闭房间。本桌分数独立记录，有效参与收益保留。':mode.id==='workshop'?'金币、设备、面包与勇者订单进度会自动保存，下次可继续经营。':mode.id==='evolve'?'进化旅程自动保存等级、队伍与复活次数；返回后可继续。需要在游戏内结束并领取才能入账。':mode.id==='liars'?'离席会取消未完成的牌局，已到账的冒险币保留。':mode.id==='tower'?'登塔使用原游戏自动存档；也可先返回游戏手动存档。':mode.id==='marble'?'弹珠远征已按回合边界保存；返回后可继续。尚未主动结算的冒险币不会入账。':mode.id==='coop'?((choice.coop||0)===1?'单人关卡与角色位置已保存在本机，下次选择继续旅程即可恢复。':'将离开真实房间，队友会收到离线提示。本局尚未完成的关卡不会结算。'):'矿坑在每次稳定操作后自动保存，下次可继续；已结算的奖励会保留。'}</p><div class="actions">${btn('继续游戏','close','secondary')}${btn('确认退出','exit-confirm','danger')}</div>`,'danger');break;
 case 'exit-confirm':go('home');break;
 case 'finish':if(!devEnabled)break;run=api.finish(crypto.randomUUID(),mode.id,id==='win');roomNextReady=false;myNextReady=false;peerWatchingAd=false;go('results');rewardFlash();break;
 case 'again':go('prepare');break;
 case 'ad':{if(api.get().ledger.some(x=>x.id==='ad-'+run.id)||myNextReady)break;adBusy=true;show('额外一点收获',`<div class="ad-loading"><span class="spinner" aria-hidden="true"></span><p id="ad-state" role="status">加载中</p></div><p class="muted">本地模拟广告，不会播放真实视频。</p>`,'advert');try{const result=await platform.ad(adOutcome,s=>{const el=document.querySelector('#ad-state');if(el)el.textContent=s},run.id);if(result==='complete'){const bonus=api.adInfo(run.id).amount;api.adReward(run.id);toast('额外 '+bonus+' 冒险币已到账')}else toast(result==='cancel'?'已提前关闭，基础奖励仍保留':'广告暂不可用，仍可正常继续')}finally{adBusy=false;close();render();restoreFocus();rewardFlash()}break}
 case 'peer-next':roomNextReady=true;peerWatchingAd=false;render();break;
 case 'peer-ad':peerWatchingAd=true;roomNextReady=false;render();break;
 case 'coop-next':myNextReady=true;if(roomNextReady){choice.coop=((choice.coop||0)+1)%mode.choices.length;rooms.set('ready');go('room')}else{render();toast('你已准备，正在等待同行者。准备后不再观看广告。')}break;
 case 'reload-art':location.reload();break;
 case 'defaults':for(const [k,v]of Object.entries({music:false,sound:true,vibration:false}))api.settings(k,v);syncPreferences();updateMusic();render();toast('已恢复默认设置');break;
 case 'dev-open':devEnabled=true;render();dev=true;document.querySelector('.developer').open=true;document.querySelector('.developer').scrollIntoView({block:'center'});break;
 case 'dev-close':devEnabled=false;render();break;
 case 'reset':show('重置演示数据？',`${empty('book','这一页，会从头写起','将清空本浏览器的演示奖励、藏品、设置与记录，不清除各游戏的独立存档。')}<div class="actions">${btn('保留数据','close','secondary')}${btn('确认重置','reset-confirm','danger')}</div>`,'danger');break;
 case 'reset-confirm':api.reset();rooms.leave();updateMusic();Object.keys(scrollPositions).forEach(k=>delete scrollPositions[k]);go('home');toast('已重置演示数据');break;
 }
}
// Claim the pause before the browser moves focus from the game to a camp button.
document.addEventListener('pointerdown',e=>{if(page==='preview'&&e.target.closest('[data-action]'))host.active?.pause?.();},{capture:true,passive:true});
document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button&&!button.disabled)action(button.dataset.action).catch(e=>toast('操作未完成：'+e.message))});
document.addEventListener('change',e=>{if(e.target.dataset.setting){try{api.settings(e.target.dataset.setting,e.target.checked);syncPreferences();if(e.target.dataset.setting==='music')updateMusic();const label=e.target.nextElementSibling;if(label?.tagName==='EM')label.textContent=e.target.checked?'开':'关'}catch{e.target.checked=!e.target.checked;toast('设置保存失败，请检查浏览器存储权限')}}if(e.target.id==='ad-outcome')adOutcome=e.target.value;if(e.target.id==='room-state'){rooms.set(e.target.value);render()}});
document.addEventListener('input',e=>{
 const key=e.target.dataset.volume;if(!key)return;
 const value=Number(e.target.value);try{
  api.settings(key,value);api.settings(key==='musicVolume'?'music':'sound',value>0);syncPreferences();
  if(key==='musicVolume')updateMusic();
  e.target.style.setProperty('--range',value+'%');e.target.parentElement.querySelector('output').textContent=value;
 }catch{toast('设置保存失败，请检查存储权限');}
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='room-input')action('join-submit')});
document.addEventListener('toggle',e=>{if(e.target.isConnected&&e.target.matches('.developer'))dev=e.target.open},true);
modal.addEventListener('cancel',e=>{e.preventDefault();close()});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
// One return path is used by Android Back and the camp UI, even when the toolbar is hidden.
function back(){
 if(window.CampAds?.dismiss())return true;
 if(modal.open){if(adBusy)toast('模拟广告正在处理，请稍候');else close();return true;}
 if(page==='preview'){
  const frame=document.querySelector('iframe.game-frame');
  try{
   const game=frame?.contentWindow,doc=game?.document;
   if(game?.CampBack?.())return true;
   const dialog=doc?.querySelector('dialog[open]');
   if(dialog){if(dialog.dispatchEvent(new game.Event('cancel',{cancelable:true})))dialog.close();frame.focus();return true;}
   const scene=game?.MT?.MM?.Game.scene;
   if(scene?.settingsOpen){scene.settingsOpen=false;game.advanceTime?.(0);frame.focus();return true;}
   for(const selector of ['#mechanismGuide:not([hidden]) #guideClose','#guideLibrary:not([hidden]) #closeGuideLibrary']){const button=doc?.querySelector(selector);if(button?.getClientRects().length){button.click();frame.focus();return true;}}
   if(doc?.querySelector('#cornerPanel:not([hidden])')){doc.querySelector('#cornerMenu')?.click();frame.focus();return true;}
   for(const selector of ['#management:not([hidden]) #close-panel','#gameHelp:not(.hidden) #closeHelp','#manualOverlay:not([hidden]) #btnManualClose','#infoOverlay:not([hidden]) #btnInfoClose']){
    const button=doc?.querySelector(selector);if(button?.getClientRects().length){button.click();frame.focus();return true;}
   }
  }catch(error){toast('返回界面未完成：'+error.message);}
  menu();return true;
 }
 if(page!=='home'){go('home');return true;}return false;
}
window.CampNavigation=Object.freeze({back});
window.render_game_to_text=()=>{const s=api.get();return JSON.stringify({screen:page,selectedGame:mode?.id||null,coins:s.coins,owned:s.owned,equipped:s.equipped,tasks:s.tasks,coordinates:'DOM layout, origin top-left, x right and y down'});};
window.addEventListener('beforeunload',()=>host.stop());
render();
for(const url of ['camp','tower','marble','mine','coop','quests','shelves','merchant','journal','portrait','scarf','pick','flag','amber-orb','violet-orb','comet-orb'].map(id=>'assets/pixel/'+id+'.svg')){const image=new Image();image.onerror=()=>{assetError=true;if(page!=='preview')render()};image.src=url}



let campResizeTimer;addEventListener("resize",()=>{clearTimeout(campResizeTimer);campResizeTimer=setTimeout(()=>{if(["home","tasks","collection","profile","shop"].includes(page))render();},120);});
