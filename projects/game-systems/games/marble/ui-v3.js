import {W,H,RELICS,TIERS} from './data.js';
import {V3,ELEMENTS,V3_UPGRADES} from './data-v3.js';
const btn=(name,action,kind='')=>`<button class="m-btn ${kind}" data-action="${action}">${name}</button>`;
const relic=id=>RELICS.find(x=>x.id===id);
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function titleV3(g,sound,dev,standalone=false){
 const r=g.run,old=r&&r.version!==3;
 return `<main class="shell home"><header class="top">${standalone?'<span>独立试玩</span>':'<button data-action="exit" class="small">‹ 返回大厅</button>'}<span>${standalone?'本地记录':'◈ 营地冒险币'}</span><button data-action="sound" class="small" aria-label="声音">${sound?'♫':'♪'}</button></header>
 <div class="hero"><div class="hero-shade"></div><div class="hero-orb">✦</div><div class="commander"></div><div class="hero-copy"><p>ANCIENT RICOCHET</p><h1>再弹一次</h1><h2>十五房 · 弹珠割草远征</h2></div></div>
 <div class="story panel"><small>六球齐射 · 六种弹珠 · 怪群连锁</small><strong>一发打穿整片怪群</strong><p>借弹力柱和斜向反射板冲进敌阵，打碎晶簇触发连锁。每房免费抽取不同力量，打造自己的弹珠队列。</p></div>
 <div class="section-label">远征记录 <span>最佳 ${g.meta.bestNormal||0} / 15 房</span></div>
 <div class="path"><span>① 六球</span><span>② 元素</span><span>③ 宝匣</span><span>④ 多波</span><span>⑤ 守卫</span></div>
 ${r&&r.phase!=='result'?btn(old?'继续旧版五房远征':'继续十五房远征','continue','gold')+btn('结算旧局并重开','restart','quiet'):btn('开始十五房远征','new','gold')}
 ${g.meta.challengeUnlocked?btn(`挑战模式 · 最佳 ${g.meta.bestChallenge||0}/15`,'newChallenge','primary'):'<p class="footnote">普通模式通关后免费解锁十五房挑战模式</p>'}
 <div class="split">${btn('玩法规则','rules')}${btn('遗物图鉴','codex')}</div>
 ${dev?btn('本地开发调试 · 配置房间与队列','debug','quiet'):''}
 <p class="footnote">本地体验版本 · 可选广告帮助为开发模拟</p></main>`;
}
export function battleV3(g){
 const r=g.run,room=r.room,v=r.volley,phase=r.phase;
 const queue=r.queue.map((id,i)=>`<span class="v3-orb" style="--orb:${ELEMENTS[id].color}" title="${ELEMENTS[id].description}">${i+1} ${ELEMENTS[id].icon}${ELEMENTS[id].name}</span>`).join('');
 const mark=room.locked.length?`预告攻击 ${room.projected||0} · 已标记 ${room.locked.length} 名行动者`:'本轮暂无敌人攻击预告';
 const status=phase==='flight'?`齐射中 · 已发 ${v.launched}/${r.queue.length} · 场上 ${v.balls.length} · ${v.combo} 连击 · 击破 ${v.kills}`:safe(g.notice||room.hint);
 return `<main class="shell battle v3-battle"><header class="battle-top"><button class="iconbtn" data-action="pause" aria-label="暂停">Ⅱ</button><div><small>${r.challenge?'挑战 · ':''}房间 ${r.roomIndex+1} / ${r.sequence.length} · 第 ${room.wave}/${room.waves} 波</small><strong>${safe(room.name)}</strong></div><div class="heart">♥ ${r.hp}/${r.maxHp}</div></header>
 <div class="room-ribbon"><span>${safe(room.hint)}</span><b>◈ ${g.reward()} 待结算</b></div>
 <div class="v3-readout"><span>存活 ${room.enemies.filter(e=>e.hp>0).length}</span><span>${mark}</span><span>能量 ${r.energy}/100</span></div>
 ${g.debugMode?`<div class="v3-metrics">球 ${v?.balls.length||0} / 生成 ${v?.generated||0} · 碰撞 ${v?.collisions||0} · 直击 ${v?.direct||0} / 间接 ${v?.indirect||0} · 连击 ${v?.combo||0} · 击杀 ${v?.kills||0} · ${(v?.elapsed||0).toFixed(2)} 秒 · 峰值数字 ${v?.peakEffects||0} · 帧间隔 ${Math.round(g.debugFrameMs||0)} ms ${btn('导出战斗状态','debugExport','quiet')}</div>`:''}
 <div class="v3-queue" aria-label="弹珠队列">${queue}</div>
 <div class="board-wrap"><canvas id="board" width="${W}" height="${H}" aria-label="弹珠战斗区域"></canvas></div>
 <div class="hintline" role="status">${status}</div>
 <div class="controls"><div class="upgrades">${r.upgrades.length?r.upgrades.map(id=>`<span title="${V3_UPGRADES[id]?.effect||''}">${V3_UPGRADES[id]?.icon||'✦'} ${V3_UPGRADES[id]?.name||id}</span>`).join(''):'<span>清房后免费三选一 · 第三房有遗物宝匣</span>'}</div>
 ${r.relics.length?`<div class="relic-strip">${r.relics.map(x=>`<span>${relic(x.id)?.icon} ${relic(x.id)?.name} · ${TIERS[x.tier].name}</span>`).join('')}</div>`:''}
 ${phase==='aim'?btn(g.strongSelected?'强击已选 · 再点取消':r.energy>=100?'能量已满 · 下轮强击':'能量未满 · 强击待机','strong',r.energy>=100?'primary':'quiet'):''}
 <div class="control-row">${phase==='flight'?btn('↩ 提前回收整轮','recall','primary'):btn('↶ 撤回最近一轮','undo',g.canUndo()&&!r.help.freeUndo?'primary':'')}${btn('暂停','pause')}</div>
 <p>在场地空白处拖动瞄准，松手齐射 · 点击敌人看行动</p></div></main>`;
}
export function rewardV3(g){
 const r=g.run;if(r.offerType==='relic')return null;
 const cards=r.offer.map(id=>{
  const [kind,name]=id.split(':'),item=kind==='element'?ELEMENTS[name]:V3_UPGRADES[name];
  const detail=kind==='element'?item.description:item.effect;
  const hint=kind==='element'?'选择后替换下方指定槽位的弹珠':'本局持续生效';
  return `<button class="upgrade-card ${kind==='element'?'element-card':''}" style="--orb:${kind==='element'?item.color:'#ffe19d'}" data-action="choose:${id}"><i>${item.icon}</i><strong>${item.name}</strong><span>${detail}</span><small>${hint}</small></button>`;
 }).join('');
 return `<main class="shell choice"><header class="top"><span>第 ${r.roomIndex+1} / 15 房已清空</span><span>免费强化</span></header>
 <div class="reward-head">✦<h1>这一轮，弹出什么花样？</h1><p>三项随机加成，免费选择一项</p></div>
 <label class="v3-slot">如果选择元素弹珠，替换队列中的
 <select id="queue-slot">${r.queue.map((id,i)=>`<option value="${i}" ${i===r.queue.indexOf('basic')?'selected':''}>第 ${i+1} 槽 · ${ELEMENTS[id].name}</option>`).join('')}</select></label>
 <div class="cards">${cards}</div><p class="footnote">当前队列：${r.queue.map(id=>ELEMENTS[id].name).join(' · ')} · 所有加成可免费获得，刷新不会重抽</p></main>`;
}
export function resultV3(g,camp,claimPending,bonusPending){
 const r=g.run,p=r.pending;
 return `<main class="shell result"><div class="result-mark">${r.win?'✦':'◇'}</div>
 <h1>${r.win?'十五房通关 · 遗迹守卫已倒下':'远征暂告一段落'}</h1>
 <p>已清空 ${r.roomsCleared} / ${r.sequence.length} 房 · 最高 ${r.bestCombo} 连击 · ${r.shots.length} 轮齐射</p>
 <div class="panel result-panel"><h2>本局目标积分</h2><div><span>清房奖励</span><b>+${p.clear}</b></div>
 <div><span>宝箱奖励</span><b>+${p.chest}</b></div><div><span>守卫奖励</span><b>+${p.boss}</b></div>
 <div class="total"><span>目标积分合计</span><b>+${g.reward()}</b></div>
 <small>${camp?'领取后写入营地本地体验钱包；同一局只结算一次。':'独立试玩仅记录本局结果；从营地进入才写入营地钱包。'}</small></div>
 <div class="panel"><h2>弹珠队列</h2><p>${r.queue.map(id=>ELEMENTS[id].icon+ELEMENTS[id].name).join(' · ')}</p></div>
 <div class="panel"><h2>本局加成</h2><p>${r.upgrades.map(id=>V3_UPGRADES[id]?.name||id).join(' · ')||'无'}</p><p>${r.relics.map(x=>relic(x.id)?.name+' · '+TIERS[x.tier].name).join(' · ')}</p></div>
 ${btn(r.claimed?'返回大厅':claimPending?'正在确认…':'领取基础奖励','claim',r.claimed?'':'gold')}
 ${camp&&r.claimed&&!r.bonusClaimed&&g.canAdHelp()&&g.bonusValue()>0?btn(bonusPending?'正在确认追加收益…':`开发模拟广告 · 额外 +${g.bonusValue()}`,'bonus','primary'):''}
 ${btn('再来一局','restart','quiet')}</main>`;
}
export const rulesV3=`<h2>十五房弹珠远征</h2><p>在场地拖动瞄准，松手后依次发射弹珠队列。六颗基础球，每颗最多 18 次碰撞；整轮最多飞行 8 秒。清场立即结束。</p><p>真正命中敌人才累计连击和能量；特殊球有各自效果，间接伤害不会再次触发元素。弹力柱返还碰撞额度，斜板改变路线，晶簇最多连爆 8 个。</p><p>整轮结束后，仅预告标记的存活怪物会行动。每房清空可免费选择加成，第三房免费开遗物宝匣。普通模式通关后解锁挑战模式。</p><p>可选帮助每局最多成功 2 次；浏览器内为开发模拟。</p>`;
export function debugPanelV3(){
 const roomOptions=[['sample','18 怪样板房'],['0','普通房 · 第 1 房'],['2','密集房 · 第 3 房'],['10','精英房 · 第 11 房'],['14','Boss · 第 15 房']]
  .map(([v,n])=>`<option value="${v}">${n}</option>`).join('');
 return `<div class="shade"><div class="dialog panel v3-debug"><h2>本地开发调试</h2>
 <p>仅 localhost 且带 dev 参数显示。按固定种子进入指定波次，正式入口不提供跳房。</p>
 <label>房间<select id="debug-room">${roomOptions}</select></label>
 <label>波次<select id="debug-wave"><option value="0">第 1 波</option><option value="1">第 2 波</option></select></label>
 <label>随机种子<input id="debug-seed" type="number" value="12345"></label>
 <label>六球元素队列（英文 ID，逗号分隔）<input id="debug-queue" value="basic,fire,lightning,pierce,ice,split"></label>
 <label>通用强化<select id="debug-upgrade"><option value="">无</option>${Object.entries(V3_UPGRADES).map(([id,u])=>`<option value="${id}">${u.name}</option>`).join('')}</select></label>
 <label>遗物<select id="debug-relic"><option value="">无</option>${RELICS.map(x=>`<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
 <label class="v3-debug-check"><input id="debug-lowfx" type="checkbox">低特效模式（仅降低绘制）</label>
 ${btn('开始调试','debugStart','gold')}${btn('关闭','close','quiet')}</div></div>`;
}
