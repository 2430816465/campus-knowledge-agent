import * as E from './active-state.js';
import {guideStep} from './active-guide.js';
import * as J from './journey.js';
import {workPlan} from './work-plan.js';
import {journeyHTML} from './journey-ui.js';
import {ROOMS,createScene,stationLocked,stationStatus} from './active-scene.js';
const $=id=>document.getElementById(id),panel=$('panel'),inCamp=new URLSearchParams(location.search).has('camp')&&parent!==window;
document.body.dataset.camp=String(inCamp);
let raw=null,loadError=false,saveText=null,recoveryBlocked=false;
try{saveText=localStorage.getItem(E.SAVE_KEY);raw=JSON.parse(saveText);if(saveText&&raw?.version!==3&&!localStorage.getItem(E.BACKUP_KEY))localStorage.setItem(E.BACKUP_KEY,saveText);}catch{loadError=true;if(saveText){try{localStorage.setItem(E.BACKUP_KEY+'-unreadable',saveText);}catch{recoveryBlocked=true;}}}
if(raw?.version===2&&saveText){try{const key='starlight-workshop-v2-before-topdown-v3';if(!localStorage.getItem(key))localStorage.setItem(key,saveText);}catch{recoveryBlocked=true;}}
let state=E.restore(raw),room='raw',manualPaused=state.paused,hostPaused=false,adPaused=false,hiddenAt=null,holding=null,holdClock=0,lastFrame=performance.now(),manualUntil=0,uiClock=0,saveClock=0,toastTimer,sound=true,audio=null,lastOp='',panelKind='',returnFocus=null;
const offlineInfo=E.offline(state),adRunId='bakery-active-'+Date.now();
let orientationPaused=innerHeight>innerWidth;
const send=(type,data={})=>{if(inCamp)parent.postMessage({source:'camp-game',mode:'workshop',type,...data},location.origin);};
const scene=createScene({canvas:$('board'),container:$('scene'),labels:$('stations'),read:()=>state,onSelect(){release();$('board').focus({preventScroll:true});update();}});
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2500);}
function chime(){if(!sound)return;try{audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=640;g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.13);}catch{}}
function persist(){if(recoveryBlocked){toast('原存档无法备份，尚未覆盖它；请先腾出存储空间');return false;}try{localStorage.setItem(E.SAVE_KEY,JSON.stringify({...state,paused:manualPaused,savedAt:Date.now()}));return true;}catch{toast('存储空间不足，当前进度无法保存');return false;}}
function report(){for(let i=1;i<=state.beacons;i++)send('finish',{result:{runId:'workshop-beacon-'+i,win:true,score:i,reward:{beacon:i}}});}
function release(){holding=null;holdClock=0;$('action').classList.remove('holding');}
function syncPause(){state.paused=manualPaused||hostPaused||adPaused||orientationPaused||panel.open||document.hidden;if(state.paused){release();scene.stop();}lastFrame=performance.now();update();}
function syncOrientation(){orientationPaused=innerHeight>innerWidth;$('landscape-prompt').hidden=!orientationPaused;$('workshop').inert=orientationPaused;if(orientationPaused&&panel.open)closePanel();syncPause();}
function enter(next){if(!ROOMS[next]||manualPaused||hostPaused||adPaused)return;release();room=next;scene.enter(room);update();}
function finish(r){lastOp=r.message;toast(r.message);if(r.ok){chime();if(persist())report();}update();}
function action(useEvent=true){if(state.paused)return;const near=scene.nearby();if(!near){toast('先点击工位，走到它身边');return;}const id=near.id;
 if(E.constructionAt(state,id)?.first){toast('正在组装，可先去其他工位工作');return;}
 if(stationLocked(state,id)){openPanel('equipment');return;}
 const jt=J.eventTarget(state);if(useEvent&&state.journey.engaged&&J.eventUnlocked(state)&&id===jt.station&&(!['prepare','packing','travel'].includes(state.journey.phase)||state.journey.phase==='prepare'&&J.eventStockReady(state)&&!(id==='oven'&&(state.jobs.oven||E.total(state.ovenReady))))){openPanel('journey');return;}
 if(id==='counter'){openPanel('orders');return;}if(id==='oven'){if(!E.total(state.ovenReady)&&!state.jobs.oven){openPanel('recipe');return;}finish(E.bake(state));return;}
 if(id==='depot')finish(E.deposit(state));if(id==='mill'||id==='jam')finish(E.process(state,id));if(id==='rack')openPanel('shelf');if(id==='table')finish(E.serve(state));if(id==='pack')finish(E.pack(state));if(id==='wagon')finish(E.wagon(state));
}
function begin(){if(state.paused)return;const i=['wheat','cow','berries'].indexOf(scene.nearby()?.id);if(i<0||!E.rawUnlocked(state,i))return;holding=i;holdClock=0;$('action').classList.add('holding');}
function step(dt){const pending=Object.values(state.construction).filter(j=>!j.applied);E.tick(state,dt);if(pending.some(j=>j.applied)){persist();chime();toast('施工完成，设备已就绪');}scene.tick(dt);if(holding!==null&&!state.paused){if(['wheat','cow','berries'].indexOf(scene.nearby()?.id)!==holding){release();return;}holdClock+=dt;while(holding!==null&&holdClock>=E.harvestSeconds(state,holding)){holdClock-=E.harvestSeconds(state,holding);const r=E.harvest(state,holding);lastOp=r.message;if(!r.ok){release();toast(r.message);}else{chime();persist();}}}}
function placeGuide(){
 const el=$('guide');if(el.hidden)return;const r=el.getBoundingClientRect(),buttons=[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect());
 const points=[...document.querySelectorAll('[data-station]')].map(b=>{const p=b.getBoundingClientRect();return {x:p.x+p.width/2,y:p.y+p.height/2};});
 const top=Math.max(68,document.querySelector('.hud')?.getBoundingClientRect().bottom+8||68);
 const xs=[10,Math.max(10,innerWidth-r.width-10)],ys=[top,Math.max(top,innerHeight-r.height-72)];let best=null;
 for(const x of xs)for(const y of ys){let score=0;for(const p of points)for(const b of buttons){const bx=x+b.x-r.x,by=y+b.y-r.y;if(p.x>=bx-12&&p.x<=bx+b.width+12&&p.y>=by-12&&p.y<=by+b.height+12)score+=100;}for(const p of points)if(p.x>=x&&p.x<=x+r.width&&p.y>=y&&p.y<=y+r.height)score++;if(!best||score<best.score)best={x,y,score};}
 el.style.left=best.x+'px';el.style.top=best.y+'px';el.style.bottom='auto';
}
function update(){
 const guide=guideStep(state);$('guide').hidden=!guide||guide.hidden||panel.open||state.paused;if(guide){$('guide-title').textContent=`新手 ${guide.index}/${guide.total} · ${guide.title}`;$('guide-text').textContent=guide.text;$('guide-go').textContent=guide.panel?'查看步骤':'定位目标';}
 document.querySelectorAll('.guide-target').forEach(el=>el.classList.remove('guide-target'));if(guide&&!guide.hidden&&!state.paused){document.querySelector(`[data-room="${guide.room}"]`)?.classList.add('guide-target');if(room===guide.room)document.querySelector(`[data-station="${guide.station}"]`)?.classList.add('guide-target');}
 $('coins').textContent=Math.floor(state.coins).toLocaleString()+' 金币';$('journey-title').textContent=J.journeyHint(state);$('work-next').textContent=workPlan(state).text;
 const jp=workPlan(state);document.querySelectorAll('.journey-target').forEach(el=>el.classList.remove('journey-target'));if((!guide||guide.hidden)&&!state.paused){document.querySelector(`[data-room="${jp.room}"]`)?.classList.add('journey-target');if(room===jp.room)document.querySelector(`[data-station="${jp.station}"]`)?.classList.add('journey-target');}
 $('room-title').textContent=ROOMS[room].name;$('room-purpose').textContent=ROOMS[room].purpose;
 const readyBread=E.total(state.ovenReady)+state.millReady+state.jamReady,readyOrders=state.orders.filter(o=>E.readyToDeliver(state,o)).length;
 const roomNotes={raw:state.jobs.transfer?'这批入仓中':'采集 · 入仓',bake:readyBread?`${readyBread} 份待取`:state.jobs.oven?`烘烤 ${Math.ceil(state.jobs.oven.t)} 秒`:'投料 · 取货',shop:readyOrders?`${readyOrders} 张可交`:'交单 · 送餐',delivery:state.receipt?'回款待签收':state.packReady.length?'外卖篮待取':state.jobs.trip?'配送中…':'打包 · 签收'};
 for(const b of document.querySelectorAll('[data-room]')){b.setAttribute('aria-current',b.dataset.room===room?'page':'false');b.disabled=manualPaused||hostPaused||adPaused;b.querySelector('small').textContent=roomNotes[b.dataset.room];}
 $('pause').textContent=manualPaused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',manualPaused?'继续游戏':'暂停游戏');$('pause-shade').hidden=!state.paused||panel.open||adPaused;
 const snapshot=scene.snapshot(),near=scene.nearby(),id=near?.id,selected=snapshot.selected,isRaw=['wheat','cow','berries'].includes(id);
 let label='选择建筑',context=room==='raw'?`手提 ${E.total(state.raw)} / ${E.bagCapacity(state)} 份 · 点工位走近，按住采集`:ROOMS[room].purpose;
 if(selected&&!near){label='前往中…';context='到达后使用右侧操作按钮';}
 if(near){context=stationStatus(state,id);label=isRaw?'按住采集':id==='depot'?'原料入仓':id==='counter'?'订单 / 交付':id==='oven'?E.total(state.ovenReady)?'取面包':state.jobs.oven?'烘烤中…':'配方 / 投料':id==='mill'||id==='jam'?state[id+'Ready']?'取货':state.jobs[id]?'加工中…':'投料':id==='rack'?'补货':id==='table'?'送餐':id==='pack'?state.packReady.length?'取外卖':state.jobs.pack?'打包中…':'打包':state.receipt?'签收回款':state.jobs.trip?'配送中…':'装篮发车';if(stationLocked(state,id))label='解锁 / 建造';if(E.constructionAt(state,id)?.first)label='组装中…';}
 const event=J.eventSpec(state),phase=state.journey.phase;if(near&&event&&state.journey.engaged&&J.eventUnlocked(state)&&id===J.eventTarget(state).station&&!stationLocked(state,id)&&(!['prepare','packing','travel'].includes(phase)||phase==='prepare'&&J.eventStockReady(state)&&!(id==='oven'&&(state.jobs.oven||E.total(state.ovenReady))))){label={prepare:event.mode==='decorate'?'活动装饰':event.mode==='route'?'核对地址 / 打包':'活动配盘',handoff:'活动上菜 / 验收',packed:'取活动外卖',carried:'活动装车',sign:'核对回执 / 签收',claim:'领取章节纪念牌'}[phase]||label;}
 if(holding!==null){label='采集中…';context=`${E.RAW_NAMES[holding]} ${state.raw[holding]} 份 · 背包 ${E.total(state.raw)} / ${E.bagCapacity(state)}`;}
 $('action').textContent=label;$('action').disabled=!near||state.paused||!!E.constructionAt(state,id)?.first;$('context').textContent=context;scene.update();placeGuide();
 if(E.completed(state)&&!state.completed){state.completed=true;persist();toast('王国面包节店主达成！六枚纪念章已永久保留');}
 if(E.completed(state)&&J.journeyComplete(state)&&!state.journey.crowned){state.journey.crowned=true;persist();toast('六队、六主题、十章全部达成！获得王国总厨称号');}
}
const stocks=(a,names)=>`<div class="mini-stock">${a.map((v,i)=>`<span>${names[i]} <b>${v}</b></span>`).join('')}</div>`;
const breadNames=E.RECIPES.map(r=>r.name);
function openPanel(kind){release();scene.stop();returnFocus=document.activeElement;panelKind=kind;renderPanel();if(!panel.open)panel.showModal();syncPause();$('close-panel').focus();}
function closePanel(){if(panel.open)panel.close();panelKind='';syncPause();if(returnFocus?.isConnected)returnFocus.focus();}
function orderHTML(o){const near=scene.nearby()?.id==='counter',can=E.readyToDeliver(state,o);return `<article class="card"><h3>${o.name} #${o.id}</h3><p>${o.need.map((v,i)=>v?`${breadNames[i]} ${state.goods[i]} / ${v}`:'').filter(Boolean).join(' · ')}</p><p class="good">基础报酬 ${o.reward} 金币${o.bonus?`<br><span class="urgent">${o.expired?'加成已过期，仍可领基础报酬':`剩余 ${Math.ceil(o.remaining)} 秒 · 额外 +${o.bonus} 金币`}</span>`:''}</p><button data-deliver="${o.id}" ${near&&!can?'disabled':''}>${near?can?'交付这张订单':'还缺面包':'前往门店柜台'}</button></article>`;}
function commissionHTML(){return '<article class="card"><h3>主题委托 · '+state.journal.done.length+' / 6 枚纪念章</h3><p>选择一个主题开展工作。不限时，可随时换主题并保留进度；仅当前主题记录新操作。每两枚纪念章使烤箱批量 +1（总上限 6）。全部完成获得面包节店主称号。</p></article>'+E.COMMISSIONS.map(c=>{const done=state.journal.done.includes(c.id),active=state.journal.active===c.id,p=state.journal.progress[c.id]||{},near=scene.nearby()?.id==='counter';return '<article class="card"><h3>'+c.name+(done?' · 已留念':active?' · 进行中':'')+'</h3><p>'+c.story+'</p><p>'+c.goals.map(([k,n,label])=>label+' '+(p[k]||0)+' / '+n).join(' · ')+'</p><p>完成奖励 '+c.reward+' 金币 + 纪念章</p>'+(done?'':E.commissionReady(state,c.id)?'<button data-claim="'+c.id+'">'+(near?'领取纪念章':'前往门店柜台领奖')+'</button>':'<button data-commission="'+c.id+'" '+(active||state.beacons<c.unlock?'disabled':'')+'>'+(state.beacons<c.unlock?'完成第 '+c.unlock+' 队开放':active?'正在开展':'开展这个主题')+'</button>')+'</article>';}).join('');}
function renderPanel(){
 let html='',title='';
 if(panelKind==='journey'){title='经营旅程与下一步';html=journeyHTML(state,scene.nearby()?.id);
 }else if(panelKind==='orders'){
  title='订单与主题委托';html=`<p><b>${state.beacons<6?E.CREWS[state.beacons]+' · '+state.stageDone+' / '+E.QUOTAS[state.beacons]+' 单':'六队补给已完成'}</b></p>`+'<button data-panel=journey>十章经营旅程 · '+J.journeyHint(state)+'</button>'+'<button data-panel=commissions>主题委托 · '+E.journalHint(state)+'</button><p>普通订单不限时。交单只用共用成品箱，展示架中的面包需先放回。到门店柜台才能交付。</p>'+state.orders.map(orderHTML).join('');
  html+=state.bonus?orderHTML(state.bonus):`<article class="card"><h3>可选加急赏金单</h3><p>150 秒内交付可多赚 40%。过期仅失去加成，面包和基础报酬保留，不影响六队进度。</p><button data-bonus ${state.beacons<1?'disabled':''}>${state.beacons<1?'完成第一队后开放':'自愿接取一张'}</button></article>`;
 }else if(panelKind==='commissions'){title='主题活动手册';html=commissionHTML();
 }else if(panelKind==='recipe'){
  title='面包配方';html=`<p>本批最多 ${E.batchCapacity(state)} 个，缺料时加工能做的数量。${state.jobs.oven?'已有一批在烤，新配方仅用于下一批。':'确认后走近烤箱投料。'}</p><div class="recipe-options">`+E.RECIPES.map((r,i)=>`<button data-recipe="${i}" class="${state.recipe===i?'selected':''}" ${E.recipeUnlocked(state,i)?'':'disabled'}>${r.name}<small>${r.need.map((v,k)=>v?`${E.RAW_NAMES[k]}×${v}`:'').filter(Boolean).join(' + ')}${r.jam?' + 果酱×1':''}</small><small>${E.recipeUnlocked(state,i)?'仓内原料可投料':'尚未解锁'}</small></button>`).join('')+`</div><label class="batch-select">本批数量<select id="batch">${Array.from({length:E.batchCapacity(state)},(_,i)=>`<option ${state.batch===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>${stocks(state.store,E.RAW_NAMES)}<p>面粉 ${state.flour} · 果酱 ${state.jam}；面粉可代替麦子并缩短烘烤时间。</p><button data-feed>确认配方，投这一批</button>`;
 }else if(panelKind==='shelf'){
  title='展示架配货';html='<p>选择要补给堂食的口味和数量，订单面包可继续留在成品箱。展示架不自动卖货。</p>'+E.RECIPES.map((r,i)=>`<article class="card"><h3>${r.name}</h3><p>成品箱 ${state.goods[i]} · 展示架 ${state.shelf[i]}</p><div class="panel-actions"><button data-stock="${i}" data-amount="1" ${state.goods[i]?'':'disabled'}>补 1 个</button><button data-stock="${i}" data-amount="3" ${state.goods[i]?'':'disabled'}>补 3 个</button></div></article>`).join('')+'<button data-return-shelf>全部放回成品箱</button>';
 }else if(panelKind==='inventory'){
  title='共用库存';html=`<p>跨区共用，无需重复搬运成品。原料须亲自采集、送仓；烤好的面包须取出才可使用。</p><div class="inventory-grid"><article class="card"><h3>手提原料 ${E.total(state.raw)} / ${E.bagCapacity(state)}</h3>${stocks(state.raw,E.RAW_NAMES)}</article><article class="card"><h3>原料仓 ${E.total(state.store)} / ${E.storeCapacity(state)}</h3>${stocks(state.store,E.RAW_NAMES)}<p>面粉 ${state.flour} · 果酱 ${state.jam}</p></article><article class="card"><h3>共用成品箱</h3>${stocks(state.goods,breadNames)}</article><article class="card"><h3>展示架（不自动卖出）</h3>${stocks(state.shelf,breadNames)}<button data-return-shelf>放回成品箱，供交单 / 打包</button></article></div><h3>工位进度</h3>`+Object.values(ROOMS).flatMap(r=>r.stations).filter(x=>!['wheat','cow','berries'].includes(x[0])).map(x=>`<p>${x[1]}：${stationStatus(state,x[0])}</p>`).join('')+`<p>随身外卖篮 ${state.parcels.length} · 待签收 ${state.receipt} 金币</p><button data-panel="clear">清理过量原料</button>`;
 }else if(panelKind==='clear'){
  title='清理过量原料';html='<p>每次明确丢弃 10 份所选原料（不足则丢弃现有数量），不换金币。仓库被单一原料占满时可腾出空间。已有金币、面包和设备不受影响。</p>'+['raw','store'].map(k=>`<article class="card"><h3>${k==='raw'?'手提背包':'原料仓'}</h3>${E.RAW_NAMES.map((name,i)=>`<button data-discard="${k}" data-index="${i}" ${state[k][i]?'':'disabled'}>丢弃 ${Math.min(10,state[k][i])} 份${name}</button>`).join('')}</article>`).join('');
 }else if(panelKind==='equipment'){
  title='设备与效率';html='<p>首次建造约 3 秒，升级约 1.4 秒。施工时可在其他工位工作；升级保留原有能力，完成后生效。所有工位完成本批即停机。</p>';
  const cards=[['collector','麦田采集','缩短采集间隔；逐级增加每轮数量',0],['collector','奶牛棚采集','缩短采集间隔；逐级增加每轮数量',1],['collector','莓果丛采集','缩短采集间隔；逐级增加每轮数量',2],['rail','批次传送带','入仓一次提交整包，输送完本批就停止'],['polish','烤箱','缩短本批时间；每两级增加一个批量名额'],['storage','背包与原料仓','背包 +4 格，原料仓 +20 格'],...E.FACILITIES.map(f=>[f.id,f.name,{mill:'手动投麦子，取面粉；提高每批数量',jam:'手动投莓果，取果酱；提高每批数量',rack:'手动补货；增加展示容量',table:'手动送餐；一次服务更多客人',pack:'手动提交三味面包；缩短打包时间',wagon:'手动装篮和签收；一趟能装更多篮'}[f.id]])];
  html+=cards.map(([id,name,desc,i=0])=>{const facility=E.FACILITIES.find(f=>f.id===id),lv=facility?state.facilities[id]:id==='collector'?state.collectors[i]:state.upgrades[id],unlocked=facility?E.facilityUnlocked(state,id):id==='collector'?E.rawUnlocked(state,i):true,max=lv>=(facility?3:8),price=E.upgradeCost(state,id,i),building=state.construction[E.constructionKey(id,i)];return `<article class="card"><h3>${name} · ${id==='rail'&&!state.lineBuilt?'未建造':`${lv} 级`}</h3><p>${desc}</p><button data-buy="${id}" data-index="${i}" ${!unlocked||max||state.coins<price||building?'disabled':''}>${building?'施工中':!unlocked?'随勇者队进度解锁':max?'已满级':`${facility&&!lv||id==='rail'&&!state.lineBuilt?'建造':'升级'} · ${price} 金币`}</button></article>`;}).join('');
 }else if(panelKind==='help'){
  title='经营说明';html='<ol class="guide-steps"><li><b>原料区：</b>点麦田、奶牛棚或莓果丛走近，按住操作按钮，每 0.65 秒采一轮；松开即停。把背包送到原料仓。</li><li><b>烘焙区：</b>到烤箱选择配方和批量，投一次料。加工时去采集或处理其他工位，烤好后回来取面包。磨坊与果酱锅也按批次投料和取货。</li><li><b>门店区：</b>在订单柜台选择小订单交付。展示架须手动补货，长桌须手动送餐；都不自动卖货。普通订单和堂食没有超时惩罚。</li><li><b>外卖区：</b>普通、牛奶、莓果面包各一个打一篮，完成后取篮、装车；配送结束回来签收才获得金币。</li><li><b>升级：</b>提升采集量、批量、容量或加工速度。离线仅完成已提交的一批，不会循环加工或自动赚钱。</li></ol><p>基础店主目标：六队、六主题、批次传送带及六设施、送餐 8 份与签收 3 趟。新增十章经营旅程包含品鉴配盘、分席宴会、手工装饰与地址外卖；全部达成获得王国总厨。点击左上目标条查看下一步，新工艺会同步显示操作提示。</p><p>键盘 E 操作、按住空格采集、P 暂停、F 全屏。阅读面板期间暂停计时。</p>';
 }else if(panelKind==='reset'){
  title='重新开店？';html='<p>这会清除本游戏当前金币、库存和设施，其他小游戏与营地冒险币不受影响。旧版本迁移备份仍保留。</p><button data-reset class="danger">确认重新开店</button>';
 }else{
  title='面包房菜单';html=`<p class="summary-line">六队进度 ${state.beacons} / 6 · 送餐 ${state.served} / 8 · 外卖 ${state.trips} / 3</p><p>采集 → 入仓 → 有限批次 → 取货 → 主动交付。普通订单不会催促你。</p><div class="panel-actions"><button data-panel="journey">经营旅程 / 最终目标</button><button data-panel="commissions">主题活动手册</button><button data-panel="equipment">设备升级</button><button data-panel="recipe">配方</button><button data-panel="help">玩法说明</button><button data-fullscreen>切换全屏</button><button data-sound>声音：${sound?'开':'关'}</button><button data-panel="reset">重新开店</button><button data-ad>广告 · 12 次采集 +1 份</button><button data-exit>返回合集</button></div><p class="menu-note">广告为开发模拟；加成只影响亲自采集，不产生挂机收益。${state.adActions?`剩余 ${state.adActions} 次加成。`:''}</p>`;
 }
 if(panelKind==='menu')html+='<button data-guide>恢复同步新手教程</button>';
 $('panel-title').textContent=title;$('panel-body').innerHTML=html;
}
function atCounter(id){closePanel();if(manualPaused||hostPaused||adPaused)return;if(scene.nearby()?.id!=='counter'){enter('shop');scene.select('counter');toast('已前往柜台，到达后点“选择订单 / 交付”');return;}finish(E.deliver(state,id));openPanel('orders');}
panel.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.panel)openPanel(b.dataset.panel);
 if(b.hasAttribute('data-begin-journey')){closePanel();if(J.startJourney(state)){persist();toast('活动已开展，按目标提示筹备；普通经营也可继续');}openPanel('journey');}
 if(b.hasAttribute('data-normal')){closePanel();action(false);}
 if(b.hasAttribute('data-work-go')||b.hasAttribute('data-event-go')){const t=b.hasAttribute('data-event-go')?{...J.eventTarget(state),panel:'journey'}:workPlan(state);closePanel();if(t.recipe!==undefined){state.recipe=t.recipe;state.batch=Math.max(1,t.qty||E.batchCapacity(state));persist();}if(t.room&&room!==t.room)enter(t.room);if(t.station)scene.select(t.station);if(t.panel&&(!t.station||scene.nearby()?.id===t.station))openPanel(t.panel);else toast(t.text||'到达工位后点操作按钮，完成当前工序');update();}
 if(b.dataset.event){closePanel();const r=J.eventAct(state,scene.nearby()?.id,b.dataset.event,Number(b.dataset.value));finish(r);if(!r.ok||['prepare','claim'].includes(state.journey.phase))openPanel('journey');}
 if(b.hasAttribute('data-guide')){state.guide.hidden=false;closePanel();persist();update();if(!guideStep(state))toast('新手步骤已掌握，可在主题手册继续经营');}
 if(b.dataset.commission){closePanel();if(E.chooseCommission(state,b.dataset.commission)){persist();toast('主题已开始，相关操作会记录进度');}openPanel('commissions');}
 if(b.dataset.claim){closePanel();if(scene.nearby()?.id!=='counter'){enter('shop');scene.select('counter');toast('到达柜台后从主题手册领奖');}else{if(E.claimCommission(state,b.dataset.claim)){persist();toast('获得纪念章！批量奖励已自动生效');}openPanel('commissions');}}
 if(b.dataset.recipe!==undefined){state.recipe=Number(b.dataset.recipe);renderPanel();persist();}
 if(b.hasAttribute('data-feed')){state.batch=Number($('batch').value);closePanel();if(manualPaused||hostPaused||adPaused)return;if(room!=='bake'||scene.nearby()?.id!=='oven'){enter('bake');scene.select('oven');toast('已前往烤箱，到达后确认投料');}else finish(E.bake(state));persist();}
 if(b.dataset.deliver)atCounter(Number(b.dataset.deliver));
 if(b.hasAttribute('data-bonus')){closePanel();if(E.acceptBonus(state)){persist();toast('已接加急单，可在订单簿查看');}openPanel('orders');}
 if(b.dataset.buy){const kind=b.dataset.buy,index=Number(b.dataset.index);closePanel();if(E.buy(state,kind,index)){const target=E.constructionTarget(kind,index);if(room!==target.room)enter(target.room);scene.select(target.id);persist();toast('开始施工，可继续在其他工位工作');}else{toast('本次未购买，请检查金币或施工状态');openPanel('equipment');}update();}
 if(b.dataset.stock!==undefined){const i=Number(b.dataset.stock),q=Number(b.dataset.amount);closePanel();if(scene.nearby()?.id==='rack')finish(E.refillShelf(state,i,q));openPanel('shelf');}
 if(b.dataset.discard){const i=Number(b.dataset.index),q=Math.min(10,state[b.dataset.discard][i]);state[b.dataset.discard][i]-=q;persist();toast(`已丢弃 ${q} 份${E.RAW_NAMES[i]}`);renderPanel();update();}
 if(b.hasAttribute('data-return-shelf')){state.shelf.forEach((v,i)=>state.goods[i]+=v);state.shelf.fill(0);persist();renderPanel();update();}
 if(b.hasAttribute('data-reset')){state=E.fresh();manualPaused=false;closePanel();enter('raw');persist();toast('已重新开店');}
 if(b.hasAttribute('data-sound')){sound=!sound;renderPanel();}
 if(b.hasAttribute('data-fullscreen'))fullscreen();
 if(b.hasAttribute('data-exit'))exit();
 if(b.hasAttribute('data-ad')){closePanel();adPaused=true;syncPause();try{const r=await window.CampAds?.show('workshop','active-harvest',adRunId);if(r?.status==='completed'){state.adActions=12;persist();toast('接下来 12 次主动采集各多 1 份');}else toast(r?.message||'本次未领取加成');}catch{toast('广告未完成，请继续经营');}finally{adPaused=false;syncPause();}}
});
$('close-panel').onclick=closePanel;panel.addEventListener('cancel',e=>{e.preventDefault();closePanel();});panel.addEventListener('close',()=>{release();syncPause();});
$('guide-go').onclick=()=>{const g=guideStep(state);if(!g||state.paused)return;if(g.room){if(room!==g.room)enter(g.room);if(g.station)scene.select(g.station);}if(g.panel&&(!g.station||scene.nearby()?.id===g.station))openPanel(g.panel);update();};
$('guide-hide').onclick=()=>{state.guide.hidden=true;persist();update();};
$('campaign').onclick=()=>openPanel('journey');$('orders-button').onclick=()=>openPanel('orders');$('inventory').onclick=()=>openPanel('inventory');$('menu').onclick=()=>openPanel('menu');$('equipment').onclick=()=>openPanel('equipment');
$('pause').onclick=()=>{manualPaused=!manualPaused;syncPause();persist();};document.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>enter(b.dataset.room));
$('action').addEventListener('pointerdown',e=>{if(e.button!==0)return;if(['wheat','cow','berries'].includes(scene.nearby()?.id)&&!stationLocked(state,scene.nearby().id)){e.preventDefault();$('action').setPointerCapture(e.pointerId);begin();}});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('action').addEventListener(type,release);
$('action').onclick=e=>{if(['wheat','cow','berries'].includes(scene.nearby()?.id)&&!stationLocked(state,scene.nearby().id)){if(e.detail===0)finish(E.harvest(state,['wheat','cow','berries'].indexOf(scene.nearby().id)));return;}action();};
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else{await document.documentElement.requestFullscreen();try{await screen.orientation?.lock?.('landscape');}catch{}}}catch{toast('当前设备未开放全屏，可直接旋转手机');}}
$('landscape-fullscreen').onclick=fullscreen;$('landscape-exit').onclick=exit;
function exit(){release();persist();if(inCamp)send('exit');else location.assign('../../index.html');}
function control(command,data={}){if(command==='pause')hostPaused=true;if(command==='resume'||command==='exit')hostPaused=false;if(command==='enter'){globalThis.CampCosmetics=data.cosmetics||globalThis.CampCosmetics||[];report();}syncPause();}
window.CampBridge={control,exitToCamp:exit};addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.source==='camp-host'){if(e.data.command==='sound')sound=!!e.data.enabled;control(e.data.command,e.data);}});
addEventListener('keydown',e=>{if(panel.open){if(e.key==='Escape'){e.preventDefault();closePanel();}return;}if(e.key==='Escape'&&document.fullscreenElement&&!document.querySelector('dialog[open]')){e.preventDefault();document.exitFullscreen().catch(()=>{});return;}if(e.target.matches('input,select,textarea'))return;if(e.code==='Space'){if(e.target.closest('button')&&e.target.id!=='action')return;e.preventDefault();if(!e.repeat)begin();}if(e.code==='KeyE'&&!e.repeat){e.preventDefault();action();}if(e.code==='KeyP'&&!e.repeat)$('pause').click();if(e.code==='KeyF'&&!e.repeat)fullscreen();});addEventListener('keyup',e=>{if(e.code==='Space')release();});addEventListener('blur',()=>{release();scene.stop();});
document.addEventListener('visibilitychange',()=>{release();scene.stop();if(document.hidden){hiddenAt=Date.now();state.savedAt=hiddenAt;persist();}else{if(hiddenAt){const paused=state.paused;state.paused=manualPaused||hostPaused||adPaused||orientationPaused||panel.open;E.offline(state);state.paused=paused;hiddenAt=null;}lastFrame=performance.now();}syncPause();});
addEventListener('pagehide',()=>{release();persist();});addEventListener('resize',()=>{release();syncOrientation();scene.resize();update();});new ResizeObserver(()=>{release();scene.resize();update();}).observe($('scene'));
window.render_game_to_text=()=>JSON.stringify({mode:'workshop',rules:'active-batch-v3',screen:panel.open?'panel':'play',panel:panelKind,coordinates:'World 1000x562.8; ground origin top-left, +x right, +y down; fixed camera solid projection supplies CSS scale and offset',room,...state,tutorial:guideStep(state),shop:{served:state.served,trips:state.trips,facilities:state.facilities,completed:E.completed(state)},theme:globalThis.CampCosmetics?.includes('bakery-berry')?'bakery-berry':'demon-bakery',movement:scene.snapshot(),holding,lastOp,event:J.eventSpec(state),nextWork:workPlan(state),goal:{beacons:state.beacons,served:state.served,trips:state.trips,chapters:state.journey.done.length,themes:state.journal.done.length,completed:E.completed(state)&&J.journeyComplete(state)}});
window.advanceTime=async ms=>{const seconds=Math.min(7200,Math.max(0,Number(ms)||0)/1000);for(let t=0;t<seconds;t+=.05)step(Math.min(.05,seconds-t));manualUntil=performance.now()+120;lastFrame=performance.now();update();scene.draw();};
function frame(now){const dt=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;if(!document.hidden&&now>manualUntil){step(dt);uiClock+=dt;saveClock+=dt;if(uiClock>.12){uiClock=0;update();}if(saveClock>5){saveClock=0;persist();}}scene.draw();requestAnimationFrame(frame);}
scene.resize();scene.enter('raw');syncOrientation();requestAnimationFrame(frame);await scene.load();update();send('ready');persist();
if(loadError)toast(recoveryBlocked?'存档备份失败，暂不覆盖原始数据':raw?.version===1?'原备份写入失败，请先腾出存储空间':'原存档无法读取，已留存恢复备份');else if(raw?.version===1)toast('旧店已迁移：金币、库存、设备保留，已备份原存档');else if(offlineInfo.seconds>30)toast('离开期间只完成已提交批次；取货后可继续经营');
