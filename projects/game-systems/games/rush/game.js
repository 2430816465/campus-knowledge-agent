import {actorFrame} from './actor.js';
import {activateBurst,burstUnlocked,createChoiceBattle,stepChoice,selectOffer,choicePlan,gateCount,GROWTH,SWORDS,ARTS,REALMS,BOSSES,choiceDamage,choiceInterval,choiceRange} from './choice.js';
import {KEY,W,H,MAX_SQUAD,STAGES,CHAPTERS,TRAINING,WEAPONS,clamp} from './data.js';
import {createBattle,step,notice,members,fireInterval,shotRange,bossSeal,bossDamageScale} from './battle.js';
import {fresh,load,persist,unlocked,upgrade,settle} from './profile.js';
import {loadAssets,draw} from './scene.js';
const canvas=document.getElementById('field'),overlay=document.getElementById('overlay'),hud=document.getElementById('hud'),error=document.getElementById('error');
const embedded=new URLSearchParams(location.search).has('camp')&&parent!==window;
const defense=new URLSearchParams(location.search).get('mode')==='defense';
const storage={getItem:k=>localStorage.getItem(defense?k+'-defense':k),setItem:(k,v)=>localStorage.setItem(defense?k+'-defense':k,v)};
const loaded=load(storage);let profile=loaded.profile,corrupt=loaded.corrupt,art={},screen=profile.pending?'result':profile.active?'paused':'home',hostPaused=false,hiddenPaused=false,keys=new Set(),pointer=null,last=0,savedTime=0,saveFailed=false,ackTimer=0,audio=null,lastSound=0;
let chapterView=STAGES[profile.selected-1]?.chapter||0;
const btn=(text,action,cls='',disabled=false)=>`<button class="btn ${cls}" data-action="${action}" ${disabled?'disabled':''}>${text}</button>`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=(type,data={})=>{if(embedded)parent.postMessage({source:'camp-game',mode:'rush',type,...data},location.origin);};
function alert(text){error.textContent=text;error.hidden=false;}
function save(){try{if(corrupt)throw Error('损坏存档尚未处理');persist(storage,profile);saveFailed=false;error.hidden=true;return true;}catch(e){saveFailed=true;alert('保存失败，进度仍保留在当前页面。请重试保存后再离开。');return false;}}
function transact(fn){const next=structuredClone(profile);try{fn(next);persist(storage,next);profile=next;saveFailed=false;error.hidden=true;return true;}catch(e){alert(e.message==='符晶不足，先完成一次闯关'?e.message:'操作未保存：'+e.message);return false;}}
function clearInput(){keys.clear();pointer=null;}
function tone(freq=520){if(!profile.sound||!audio||audio.state!=='running'||performance.now()-lastSound<90)return;lastSound=performance.now();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(.018,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.08);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.09);}
function unlockAudio(){try{audio??=new AudioContext();audio.resume();}catch{}}
function resultReceipt(){if(!profile.pending||profile.pending.acked||!save())return;const p=profile.pending;if(!embedded){transact(p=>p.pending.acked=true);show();return;}send('finish',{result:{runId:p.win&&p.mode!=='defense'?'rush-stage-'+p.stage:p.runId,win:p.win,score:p.stage,reward:{stage:p.mode==='defense'?undefined:p.stage,submode:p.mode,wave:p.wave,kills:p.kills}}});ackTimer=performance.now();}
function show(){if(screen==='playing'&&profile.active?.offers)screen='choice';document.getElementById('game').dataset.screen=screen;hud.hidden=screen!=='playing';document.getElementById('game').dataset.ability=String(burstUnlocked(profile.active));document.getElementById('ability-bar').hidden=screen!=='playing'||!burstUnlocked(profile.active);requestAnimationFrame(resize);const p=profile;
 if(corrupt){overlay.innerHTML=`<section class="panel"><h2>存档需要恢复</h2><p>旧存档无法读取，原内容尚未覆盖。可以导出原文留存，或备份后重新开始。</p>${btn('导出原存档','export-corrupt','full')}${btn('备份并建立新存档','reset-corrupt','primary full')}</section>`;return;}
 if(screen==='playing'){overlay.innerHTML='';canvas.focus();return;}
 if(screen==='choice'){
 const b=p.active;overlay.innerHTML=`<section class="panel choice-panel"><div class="eyebrow">守点 · 第 ${b.wave} 波完成</div><h2>选一道机缘</h2><p>战斗已暂停 · ${REALMS[b.growth.realm]} · 灵阵 ${Math.ceil(b.core)} / 100</p><div class="choice-cards">${b.offers.map(id=>`<button class="btn" data-action="pick:${id}"><strong>${GROWTH[id].name}</strong><span>${GROWTH[id].desc}</span><small>${GROWTH[id].max?'当前 '+b.growth[id]+' / '+GROWTH[id].max:'立即生效'}</small></button>`).join('')}</div>${btn('保存并返回整备','save-home','full')}</section>`;
 }else if(screen==='home'){
 const s=STAGES[p.selected-1];overlay.innerHTML=`<section class="panel"><div class="eyebrow">${defense?'附属玩法 · 灵阵守点':'主线 · 御剑选路'}</div><h1>再选一次</h1><div class="wallet"><span>符晶 <b>${p.shards}</b></span><span>${defense?'最佳 '+(p.bestWave||0)+' / 30 波':'已通关 '+p.cleared.length+' / 18'}</span></div><div class="chapter-preview" style="--chapter:${s.chapter}"><div><strong>${defense?'守住伙伴的营地':CHAPTERS[s.chapter].name}</strong><span>${defense?'守住 30 波，完成试炼':'最终目标：击败魔君'}</span></div><img src="../nightwatch/assets/${BOSSES[s.id-1].type==='mage'?'mage_red':BOSSES[s.id-1].type}.webp" alt="本关首领"></div><div class="stage-note"><b>${defense?'守住灵阵 · 三十波试炼':'第 '+s.id+' 关 · '+s.name}</b><p>${defense?'队伍固定守点，自动索敌。点击战场左 / 中 / 右区域，改变优先目标。每波结束四选一，选择时暂停。':'左右拖动选路 → 自动攻击 → 躲开红色预警。首领：'+BOSSES[s.id-1].name}</p><p>${defense||s.id>=3?'击破补给箱 · 蓄满后点击爆发':'先学会选路，第三关解锁补给与爆发'}</p></div>${btn(p.active?'继续'+(defense?'守点':'第 '+p.active.stage+' 关'):'出发 · '+(defense?'守住灵阵':'第 '+s.id+' 关'),p.active?'resume':'start','primary full')}<div class="actions">${defense?'':btn('选择关卡','stages')}${btn('小队训练','training')}${btn('玩法说明','help')}</div>${btn(defense?'切换 · 御剑选路':'附属玩法 · 灵阵守点','switch-mode','full')}${p.active?btn('放弃当前进度','abandon','full'):''}${embedded?btn('返回营地','exit','quiet full'):''}</section>`;
 }else if(screen==='stages'){
 overlay.innerHTML=`<section class="panel"><h2>选择关卡</h2><div class="tabs" role="tablist" aria-label="关卡章节">${CHAPTERS.map((c,i)=>btn(c.name,'chapter:'+i,chapterView===i?'selected':'')).join('')}</div>${CHAPTERS.map((c,i)=>i!==chapterView?'':`<div class="chapter-head"><b>${i+1} · ${c.name}</b><small>${p.cleared.filter(n=>STAGES[n-1].chapter===i).length}/6</small></div><div class="stages">${STAGES.filter(s=>s.chapter===i).map(s=>`<button data-action="stage:${s.id}" aria-label="第${s.id}关${s.name}" aria-pressed="${p.selected===s.id}" class="${p.selected===s.id?'selected':''} ${p.cleared.includes(s.id)?'cleared':''}" ${unlocked(p,s.id)?'':'disabled'}><strong>${unlocked(p,s.id)?s.id:'·'}</strong><small>${s.name}</small></button>`).join('')}</div>`).join('')}${btn('返回整备','home','primary full')}</section>`;
 }else if(screen==='training')overlay.innerHTML=`<section class="panel"><div class="eyebrow">出发前 · 小队训练</div><h2>把伙伴练得更可靠</h2><div class="wallet">符晶 <b>${p.shards}</b></div><div class="training">${Object.entries(TRAINING).map(([id,c])=>`<article><strong>${c.name}</strong><small>${p.upgrades[id]} / ${c.max}</small><p>${c.description}</p>${btn(p.upgrades[id]===c.max?'已满级':'训练 · '+c.cost(p.upgrades[id])+' 符晶','upgrade:'+id,'full',p.upgrades[id]===c.max||p.shards<c.cost(p.upgrades[id])||!!p.active)}</article>`).join('')}</div><p>训练在下次出发生效；局内通过光幕成长。三阶飞剑可穿透，三阶剑诀可追踪。</p>${btn('返回整备','home','primary full')}</section>`;
 else if(screen==='help')overlay.innerHTML=`<section class="panel"><h2>选出自己的御剑队伍</h2><div class="guide"><b>选路</b><div>左右拖动或 A / D 移动，以队伍中心穿过一道光幕。前两关各4组；第3关6组，此后每关增加1组。第三关起二选一、三选一混合出现，人数上限48。升级已满时转化6点护盾。</div></div><div class="guide"><b>成长</b><div>飞剑6阶提升伤害与穿透；剑诀6阶提升射速，分光诀开始追踪；全队从凡修到飞升共5种形态，获得光环、灵翼、仙冠和更强属性。雷鸣与赤炎可组合；护盾抵挡伤害。成长仅在本局生效。</div></div><div class="guide"><b>魔物</b><div>数字就是剩余生命，归零击破。8类小怪拥有疾行、护甲、施法、再生、分裂、冲阵、治疗等差异。每关独立魔物首领，先看预警再躲开弹幕。</div></div><div class="guide"><b>补给</b><div>第3关起出现伙伴箱和护盾箱。射击击破或靠近箱子即可取得奖励；漏掉没有惩罚。选门和击破魔物会蓄能，满100后点击下方爆发按钮，或按空格，获得3秒齐射。爆发期间不蓄能，暂停时不会消耗时间。</div></div><div class="guide"><b>守点</b><div>队伍固定，自动瞄准；点击左中右区域设置优先目标。魔物或弹幕越过守线会扣除灵阵生命，护盾优先抵挡。每波结束恢复8点灵阵与4点护盾，再暂停四选一；每5波一位首领，共30波。两种模式分别存档与训练。</div></div><p>暂停可保存离开；符晶用于局外训练。闯关每关首通8冒险币，守点不重复领取闯关奖励。旧战斗保留原来的规则，完成后新开局启用新内容。</p>${btn('明白了','help-close','primary full')}</section>`;
 else if(screen==='paused')overlay.innerHTML=`<section class="panel"><div class="eyebrow">第 ${p.active?.stage||1} 关</div><h2>小队稍作休整</h2><p>位置、队员、符文门与剩余魔物会一同保存。</p>${p.active?.layoutVersion<7?'<p>本局保留更新前的规则。完成或放弃后，新开局启用补给、手动爆发与新的攻击预警。</p>':''}${btn('继续前进','resume','primary full')}${btn('保存并返回整备','save-home','full')}${btn('声音：'+(p.sound?'开启':'关闭'),'sound','full')}${btn('玩法说明','help','full')}${saveFailed?btn('重试保存','retry','primary full'):''}${embedded?btn('保存并返回营地','exit','quiet full'):''}</section>`;
 else if(screen==='confirm')overlay.innerHTML=`<section class="panel"><h2>放弃当前闯关？</h2><p>本局不会结算，已经取得的成长与已通关关卡保留。</p>${btn('继续当前闯关','resume','primary full')}${btn('确认放弃','abandon-confirm','full')}</section>`;
 else if(screen==='result'){const r=p.pending;if(!r){screen='home';show();return;}overlay.innerHTML=`<section class="panel"><div class="eyebrow">${r.mode==='defense'?'守点 '+(r.win?30:r.wave-1)+' 波':'第 '+r.stage+' 关'} · ${r.win?'道路已打通':'重新集结'}</div><h2>${r.win?'伙伴们，回营地！':'再选一条路试试'}</h2><p>${r.mode==='defense'?(r.win?'三十波试炼完成！':'灵阵失守，下次可尝试不同的成长组合。'):r.win?(r.first?'首次打通这条道路。':'本关已通关，可继续练习。'):r.failureReason==='seal'?'选门失误超过本关容错，首领封印未能解除。下次优先通过带破阵符印的门。':'队员耗尽，或首领未被击破。改变选门与拾取路线再试。'}</p>${r.mistakeLimit!==null&&r.mistakeLimit!==undefined?`<p class="seal-note">选门失误 ${r.mistakes} / ${r.mistakeLimit} 次 · ${r.failureReason==='seal'?'封印未解':'本关记录'}</p>`:''}<div class="stat-grid"><div><b>${r.kills}</b><span>击破魔物</span></div><div><b>${r.peak}</b><span>最多队员</span></div><div><b>+${r.shards}</b><span>本局符晶</span></div><div><b>${r.seconds}s</b><span>闯关时间</span></div></div>${r.ruleVersion>=7?`<p class="run-detail">取得补给 ${r.supplies||0} 次 · 使用爆发 ${r.burstUses||0} 次</p>`:''}<p id="receipt">${r.acked?(embedded?(r.mode==='defense'?'守点记录已保存。':r.win?'营地记录已同步；每关只发一次首通奖励。':'本局已记录，失败不发冒险币。'):'符晶已保存。'):'正在保存并同步本局…'}</p>${!r.acked||saveFailed?btn('重试保存与同步','retry-receipt','full'):''}${btn(r.mode!=='defense'&&r.win&&r.stage<18?'前往下一关':'再试一次','next','primary full',!r.acked||saveFailed)}${btn('返回整备','result-home','full',!r.acked||saveFailed)}${r.mode!=='defense'&&r.stage===18&&r.win?'<p>三章道路全部打通！已通关关卡可自由重玩。</p>':''}</section>`;}
 requestAnimationFrame(()=>overlay.querySelector('button:not(:disabled)')?.focus({preventScroll:true}));
}
let helpReturn='home';
function start(){if(profile.active||profile.pending||corrupt||!unlocked(profile,profile.selected))return;const b=createChoiceBattle(profile.selected,profile.upgrades,crypto.randomUUID(),defense?'defense':'campaign');if(!transact(p=>p.active=b))return;notice(profile.active,defense?'固定守点 · 点击左右区域设置集火方向':'选择光幕 · 自动御剑');screen='playing';savedTime=0;show();}
function ended(){settle(profile);screen='result';clearInput();save();show();resultReceipt();}
function update(ms){if(screen!=='playing'||hostPaused||hiddenPaused||saveFailed||!profile.active)return;const b=profile.active;let left=ms/1000;while(left>0&&b.status==='playing'&&!b.offers){const dt=Math.min(left,1/60),count=b.count,shots=b.shots,kills=b.kills;stepChoice(b,dt,(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0));if(b.count!==count)tone(b.count>count?750:190);else if(b.kills!==kills)tone(360);else if(b.shots!==shots)tone(880);left-=dt;}if(b.status!=='playing')ended();else if(b.offers){screen='choice';clearInput();save();show();}else if(b.time-savedTime>=1){savedTime=b.time;if(!save()){screen='paused';show();}}}
function render(){
 const active=profile.active,burst=document.getElementById('burst');if(burstUnlocked(active)){burst.disabled=screen!=='playing'||hostPaused||saveFailed||active.energy<100||active.burstTime>0;burst.classList.toggle('ready',!burst.disabled);burst.style.setProperty('--charge',active.energy+'%');document.getElementById('burst-label').textContent=active.burstTime>0?'齐射 '+active.burstTime.toFixed(1)+'s':active.energy>=100?'爆发 · 点击释放':'爆发 '+Math.floor(active.energy)+' / 100';document.getElementById('ability-hint').textContent=active.burstTime>0?'齐射中 · 射速与伤害提升':active.energy>=100?'满了！可留给首领':'选路、击破魔物可蓄能';const n=active.notices.at(-1);if(n)document.getElementById('ability-hint').textContent=n.text;}
 draw(canvas,profile.active,art,profile.selected);
 const b=profile.active,progress=document.querySelector('#hud .progress');
 progress.hidden=!!(b?.layoutVersion>=6&&b.mode!=='defense');
 if(b?.layoutVersion>=6){
  document.getElementById('stage-label').textContent=b.mode==='defense'?'灵阵守点 · 第 '+b.wave+' / 30 波':'第 '+b.stage+' 关 · '+STAGES[b.stage-1].name;
  document.getElementById('count-label').textContent=b.count+' 人 · '+REALMS[b.growth.realm];
  document.getElementById('mistake-label').hidden=false;
  document.getElementById('mistake-label').textContent=SWORDS[b.growth.sword]+' · '+ARTS[b.growth.art];
  document.getElementById('buff-label').textContent='伤害 '+choiceDamage(b)+' · 护盾 '+b.shield+(b.mode==='defense'?' · 集火 '+['左','中','右'][b.aimLane]:'');
  if(b.mode==='defense')document.getElementById('progress-fill').style.width=Math.min(100,b.wave/30*100)+'%';
  document.getElementById('announcement').textContent=screen==='playing'?(b.notices.at(-1)?.text||''):'';
  return;
 }
 if(b){
  document.getElementById('stage-label').textContent='第 '+b.stage+' 关 · '+(b.layoutVersion>=2?STAGES[b.stage-1].name:'旧路线')+' · '+WEAPONS[b.weaponType||'sword']+' '+(b.weapon+1)+' 阶';
  document.getElementById('count-label').textContent='小队 '+b.count+' 人';
  const seal=bossSeal(b),sealLabel=document.getElementById('mistake-label');
  sealLabel.hidden=seal==='inactive';sealLabel.classList.toggle('over-limit',seal==='broken');
  sealLabel.textContent=seal==='inactive'?'':`失误 ${b.mistakes}${b.layoutVersion>=5?' · 首领抗性 '+Math.round((1-bossDamageScale(b))*100)+'%':' / '+STAGES[b.stage-1].mistakeLimit} · ${seal==='broken'?'封印无法解除':seal==='pending'?'首领封印待解除':'封印已解'}`;
  const buffs=b.modifiers||{};
  document.getElementById('buff-label').textContent=[buffs.haste?'射速 +'+buffs.haste*20+'%':'',buffs.range?'射程 +'+buffs.range*20+'%':'',buffs.damage?'伤害 +'+buffs.damage*25+'%':''].filter(Boolean).join(' · ');
  document.getElementById('progress-fill').style.width=Math.min(100,b.time/(b.layoutVersion>=2?STAGES[b.stage-1].duration:55)*100)+'%';
  const n=b.notices.at(-1);document.getElementById('announcement').textContent=screen==='playing'&&n?n.text:'';
 }else document.getElementById('announcement').textContent='';
}
function resize(){canvas.width=Math.round(canvas.clientWidth*Math.min(devicePixelRatio,2));canvas.height=Math.round(canvas.clientHeight*Math.min(devicePixelRatio,2));render();}
function mapX(clientX){const r=canvas.getBoundingClientRect();return clamp((clientX-r.left)/r.width*W,0,W);}
canvas.addEventListener('pointerdown',e=>{if(screen!=='playing'||hostPaused)return;unlockAudio();pointer=e.pointerId;canvas.setPointerCapture(pointer);defense?profile.active.aimLane=Math.min(2,Math.floor(mapX(e.clientX)/160)):profile.active.targetX=mapX(e.clientX);e.preventDefault();});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===pointer&&screen==='playing'&&!hostPaused)defense?profile.active.aimLane=Math.min(2,Math.floor(mapX(e.clientX)/160)):profile.active.targetX=mapX(e.clientX);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>pointer=null);
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','a','d'].includes(e.key)&&screen==='playing'&&!hostPaused){keys.add(e.key);e.preventDefault();unlockAudio();}if(e.repeat)return;if(e.code==='Space'&&screen==='playing'&&!hostPaused&&!saveFailed){e.preventDefault();unlockAudio();activateBurst(profile.active);render();}if(['p','P','Escape'].includes(e.key)){if(screen==='playing'){screen='paused';clearInput();save();show();}else if(screen==='paused'&&!hostPaused&&!saveFailed){screen='playing';show();}}if(e.key.toLowerCase()==='f'){if(!document.fullscreenElement)document.getElementById('game').requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.();}});
window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>{clearInput();if(screen==='playing'&&!window.CampHostOverlayOpen){screen='paused';save();show();}});
document.addEventListener('visibilitychange',()=>{hiddenPaused=document.hidden;clearInput();if(hiddenPaused&&profile.active){save();if(screen==='playing'){screen='paused';show();}}});
function download(raw){const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='再选一次-原存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;unlockAudio();clearInput();
 if(action.startsWith('stage:')){const stage=+action.split(':')[1];if(unlocked(profile,stage)&&transact(p=>p.selected=stage)){screen='home';show();}return;}
 if(action.startsWith('upgrade:')){transact(p=>upgrade(p,action.split(':')[1]));show();return;}
 if(action.startsWith('pick:')&&profile.active?.offers){if(transact(p=>{if(!selectOffer(p.active,action.slice(5)))throw Error('选项已变化');})){screen='playing';show();}return;}
 if(action==='switch-mode'&&save()){const url=new URL(location.href);if(defense)url.searchParams.delete('mode');else url.searchParams.set('mode','defense');location.href=url.href;return;}
 if(action==='burst'&&screen==='playing'&&!hostPaused&&!saveFailed){activateBurst(profile.active);render();return;}
 if(action==='start')start();
 if(action==='resume'&&profile.active&&!hostPaused&&save()){screen='playing';show();}
 if(action==='pause'){screen='paused';save();show();}
 if(action==='home'||action==='training'||action==='stages'){screen=action;show();}
 if(action==='save-home'&&save()){screen='home';show();}
 if(action.startsWith('chapter:')){chapterView=Number(action.split(':')[1]);show();return;}
 if(action==='help'){helpReturn=screen;screen='help';show();}
 if(action==='help-close'){screen=helpReturn;show();}
 if(action==='sound'){transact(p=>p.sound=!p.sound);show();}
 if(action==='abandon'){screen='confirm';show();}
 if(action==='abandon-confirm'&&transact(p=>p.active=null)){screen='home';show();}
 if(action==='retry'){save();show();}
 if(action==='retry-receipt')resultReceipt();
 if(['next','result-home'].includes(action)&&profile.pending?.acked&&!saveFailed){const r=profile.pending;if(transact(p=>{p.pending=null;p.selected=action==='next'&&r.mode!=='defense'&&r.win&&r.stage<18?r.stage+1:r.stage;})){screen='home';show();if(action==='next')start();}}
 if(action==='exit'&&save())send('exit');
 if(action==='export-corrupt')download(corrupt);
 if(action==='reset-corrupt'){try{storage.setItem(KEY+'-corrupt-backup',corrupt);const p=fresh();persist(storage,p);profile=p;corrupt=null;screen='home';show();error.hidden=true;}catch{alert('备份失败，原存档保持原样。');}}
 render();
});
window.addEventListener('message',e=>{if(!embedded||e.origin!==location.origin||e.source!==parent||e.data?.source!=='camp-host')return;const d=e.data;
 if(d.command==='pause'){hostPaused=true;clearInput();save();}
 if(d.command==='resume'){hostPaused=false;clearInput();}
 if(d.command==='sound')profile.sound=!!d.enabled;
 if(d.command==='enter'){profile.sound=!!d.enabled||profile.sound;resultReceipt();}
 if(d.command==='ui-action'&&d.action==='pause'&&profile.active&&screen==='playing'){screen='paused';clearInput();save();show();}
 if(d.command==='receipt'&&profile.pending&&d.runId===(profile.pending.win&&profile.pending.mode!=='defense'?'rush-stage-'+profile.pending.stage:profile.pending.runId)){if(transact(p=>p.pending.acked=true))show();}
 if(d.command==='receiptError'){alert('营地记账失败。进度已保留，点击重试同步。');show();}
 if(d.command==='exit')save();
});
window.CampBridge={control(command){if(command==='exit')save();}};
window.render_game_to_text=()=>JSON.stringify({screen,hostPaused,saveFailed,assetsLoaded:Object.keys(art).length,coordinate:'480x800，左上为原点，x向右，y向下；队伍中心选门，成员分别碰撞',profile:{shards:profile.shards,selected:profile.selected,cleared:profile.cleared,upgrades:profile.upgrades},battle:profile.active?{mode:profile.active.mode,energy:profile.active.energy,burstTime:profile.active.burstTime,burstUses:profile.active.burstUses,supplies:profile.active.supplies,growth:profile.active.growth,core:profile.active.core,shield:profile.active.shield,wave:profile.active.wave,offers:profile.active.offers,aimLane:profile.active.aimLane,stage:profile.active.stage,layoutVersion:profile.active.layoutVersion||1,title:STAGES[profile.active.stage-1].name,status:profile.active.status,time:profile.active.time,x:profile.active.x,targetX:profile.active.targetX,count:profile.active.count,peak:profile.active.peak,weapon:profile.active.weapon,weaponType:profile.active.weaponType||'sword',modifiers:profile.active.modifiers||{},fireInterval:profile.active.layoutVersion>=6?choiceInterval(profile.active):fireInterval(profile.active),shotRange:profile.active.layoutVersion>=6?choiceRange(profile.active):Number.isFinite(shotRange(profile.active))?shotRange(profile.active):null,shots:profile.active.shots,rescued:profile.active.rescued,crates:profile.active.crates||0,trapLoss:profile.active.trapLoss||0,mistakes:profile.active.mistakes||0,mistakeLimit:profile.active.layoutVersion>=4?STAGES[profile.active.stage-1].mistakeLimit:null,bossSeal:profile.active.layoutVersion>=6?'not-required':bossSeal(profile.active),bossDamageScale:profile.active.layoutVersion>=6?1:bossDamageScale(profile.active),gateHistory:profile.active.gateHistory||[],kills:profile.active.kills,passed:profile.active.passed,entities:profile.active.entities.map(e=>({choices:e.choices,name:e.name,role:e.role,kind:e.kind,x:e.x,y:e.y,hp:e.hp,open:e.open,loot:e.loot,amount:e.amount,delivery:e.delivery,left:e.left,right:e.right,split:e.split,radius:e.radius,type:e.type,warning:e.warning,lock:e.lock,melee:e.melee,attackElapsed:e.attackElapsed,animation:actorFrame(e)?.key,animationFrame:actorFrame(e)?.index,hit:e.hit,correctSide:e.correctSide,selectedSide:e.selectedSide,gateIndex:e.gateIndex})),bullets:profile.active.bullets.length,enemyBullets:profile.active.enemyBullets.length}:null,result:profile.pending});
window.advanceTime=ms=>{update(Math.min(120000,Math.max(0,ms)));render();};
function frame(now){if(last)update(Math.min(50,now-last));last=now;render();if(profile.pending&&!profile.pending.acked&&performance.now()-ackTimer>3000)resultReceipt();requestAnimationFrame(frame);}
window.addEventListener('resize',resize);window.addEventListener('beforeunload',()=>{if(!corrupt)save();});
try{art=await loadAssets();document.getElementById('loading').hidden=true;resize();show();if(profile.active?.status!=='playing') {if(profile.active)ended();}send('ready');resultReceipt();requestAnimationFrame(frame);}catch(e){document.getElementById('loading').textContent='素材加载失败，请刷新重试。';send('error',{message:e.message});alert('资源没有加载完成：'+e.message);}
