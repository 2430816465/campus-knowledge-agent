import * as E from './active-state.js';
import * as J from './journey.js';
import {workPlan} from './work-plan.js';
const names=E.RECIPES.map(r=>r.name);
const button=(command,value,text,disabled=false)=>`<button data-event="${command}" data-value="${value}" ${disabled?'disabled':''}>${text}</button>`;
export function journeyHTML(s,station){
 const j=s.journey,e=J.eventSpec(s),p=workPlan(s),t=J.eventTarget(s),at=station===t.station;
 let summary=`<article class="card journey-summary"><h3>王国总厨之路 · ${j.done.length}/10 章</h3><p>当前已完成 ${s.beacons}/6 队 · ${s.journal.done.length}/6 主题。旧店主称号保留。最终目标：六队、六主题、全部基础设施、堂食与配送，以及十章经营旅程。</p><div class="chapter-track">${J.CHAPTERS.map((c,i)=>`<span class="${i<j.chapter?'done':i===j.chapter?'current':''}" title="${c.name}">${i<j.chapter?'★':i+1}</span>`).join('')}</div><button data-work-go>${p.text} →</button></article>`;
 const theme=E.COMMISSIONS.find(c=>c.id===s.journal.active),recommended=E.COMMISSIONS.find(c=>!s.journal.done.includes(c.id)&&s.beacons>=c.unlock);
 if(theme)summary+=`<article class="card"><h3>同步主题 · ${theme.name}</h3><p>${E.journalHint(s)}。新活动中的实际取货、配餐和配送会同步计入；仅当前主题记录。</p>${E.commissionReady(s)?`<button data-claim="${theme.id}">领取主题纪念章</button>`:'<button data-panel="commissions">查看 / 切换主题</button>'}</article>`;
 else if(recommended)summary+=`<article class="card"><h3>边做章节边完成主题</h3><p>当前没有开展主题，建议先接取，之后的工作才能同步记入目标。</p><button data-commission="${recommended.id}">开展${recommended.name}</button></article>`;
 if(j.chapter>=2&&(s.upgrades.polish<4||s.upgrades.storage<2))summary+=`<article class="card"><h3>可选效率升级</h3><p>建议烤箱熟练度升到 4，背包升到 2，并提升采集工具。当前每批 ${E.batchCapacity(s)} 个，背包 ${E.bagCapacity(s)} 份。升级缩短加工和搬运，仍需你投料、取货与交付。</p><button data-panel="equipment">查看效率升级</button></article>`;
 if(!e)return summary+`<article class="card"><h3>${E.completed(s)?'王国总厨已达成':'十章旅程已完成'}</h3><p>${E.completed(s)?'继续自由经营，已获得的十枚纪念牌永久保留。':'请完成目标清单中尚未达成的基础经营任务。'}</p><button data-panel="commissions">查看六个主题</button><button data-panel="equipment">查看设施</button></article>`;
 let html=`<article class="card event-current"><h3>第 ${j.chapter+1} 章 · ${e.name}</h3><p>${j.phase==='claim'?'本章全部轮次完成':`${J.MODE_NAMES[e.mode]} · 第 ${j.wave+1}/${e.modes.length} 轮`}</p>`;
 if(!J.eventUnlocked(s))return summary+html+`<p>完成第 ${e.unlock} 队后开展本章。已做的工作与金币均保留。</p><button data-panel="orders">查看普通订单</button></article>`;
 if(!j.engaged)return html+`<p>${e.story}</p><p>开展后，目标工位会显示活动操作。普通经营可随时继续，进度不会丢失。</p><button data-begin-journey>开展 / 继续本章活动</button></article><details class="journey-roadmap"><summary>目标清单与同步主题</summary>${summary}</details>`;
 if(j.phase==='claim')return html+`<p>领取 ${e.reward} 金币与纪念牌，下一章会切换新任务。</p>${at?button('claim',0,'领取纪念牌'):'<button data-event-go>前往柜台领取纪念牌</button>'}</article>`;
 html+=`<div class="event-stock">${J.eventNeed(s).map((n,i)=>n?`<span class="${J.availableBread(s,i)>=n?'ready':''}">🍞 ${names[i]} ${J.availableBread(s,i)}/${n}</span>`:'').join('')}</div>`;
 if(at&&j.phase==='prepare'&&p.panel!=='journey')html+=`<button data-work-go>${p.text} →</button>`;
 if(!at)html+=`<button data-work-go>${p.text} →</button><button data-event-go>前往${{rack:'展示架',table:'长桌',counter:'柜台',oven:'烤箱工作台',pack:'打包台',wagon:'马车站'}[t.station]} · 到达后操作</button>`;
 else if(j.phase==='handoff')html+=button('deliver',0,e.mode==='banquet'?`给${e.seats.find(x=>x.recipe===j.picks[0]).name}上菜`:'亲自呈上 / 验收');
 else if(j.phase==='prepare'){
  if(e.mode==='banquet')html+='<div class="event-seats">'+e.seats.map(x=>`<article class="seat ${j.served.includes(x.recipe)?'served':''}"><span class="pixel-guest" aria-hidden="true"></span><b>${x.name}</b><p>${names[x.recipe]} ×${x.qty}</p>${j.served.includes(x.recipe)?'<span>✓ 本席已配餐</span>':button('plate',x.recipe,'为这一席配盘',J.availableBread(s,x.recipe)<x.qty)}</article>`).join('')+'</div>';
  if(e.mode==='tasting')html+=`<p>品鉴顺序：${e.seats.map((x,i)=>`${i<j.picks.length?'✓ ':''}${names[x.recipe]}×${x.qty}`).join(' → ')}</p><p>当前配第 ${j.picks.length+1} 种口味。准备齐后才消耗整盘面包。</p><div class="event-choices">${names.map((n,i)=>button('flavour',i,n,!J.eventStockReady(s))).join('')}</div>`;
  if(e.mode==='decorate'){const topping=j.picks.length===0;html+=`<p>委托：${J.TOPPINGS[e.topping]} + ${J.SHAPES[e.shape]}</p><p>另需${['面粉','仓内牛奶','果酱'][e.topping]} 2 份；先选淋面，再选造型，全部匹配后才扣料。</p><p>${topping?'步骤 1 · 选择淋面':'✓ 淋面已选 · 步骤 2 选择造型'}</p><div class="event-choices">${(topping?J.TOPPINGS:J.SHAPES).map((n,i)=>button('finish',i,n,!J.eventStockReady(s))).join('')}</div>`;}
  if(e.mode==='route')html+=`<p>本站接收人：<b>${J.ADDRESSES[e.address]}</b> · 核对地址后贴签打包。</p><div class="event-choices">${J.ADDRESSES.map((n,i)=>button('address',i,n,!J.eventStockReady(s))).join('')}</div>`;
 }else if(['packing','travel'].includes(j.phase))html+=`<p>本批剩余 ${Math.ceil(j.timer)} 秒。关闭手册可继续备料；手册打开时暂停。没有自动取货、发车或结算。</p><button data-work-go>去做下一件工作</button>`;
 else if(j.phase==='packed')html+=button('take',0,'亲自取出已贴签的外卖篮');
 else if(j.phase==='carried')html+=button('dispatch',0,`装车发往${J.ADDRESSES[e.address]}`);
 else if(j.phase==='sign')html+=`<p>马车返回 · 回执来自 <b>${J.ADDRESSES[e.address]}</b>，选择正确地址签收。</p><div class="event-choices">${J.ADDRESSES.map((n,i)=>button('sign',i,n)).join('')}</div>`;
 return html+`<details class="event-help" ${!j.learned.includes(e.mode)?'open':''}><summary>${!j.learned.includes(e.mode)?'新工艺 · ':''}操作提示</summary><p>${e.tip}</p><p>${e.story}</p></details>${at?'<button data-normal>使用此工位的普通经营功能</button>':''}</article><details class="journey-roadmap"><summary>查看全十章、主题与最终目标清单</summary>`+summary+J.CHAPTERS.map((c,i)=>`<p>${i<j.chapter?'★':'○'} 第 ${i+1} 章 ${c.name} · ${c.modes.map(m=>J.MODE_NAMES[m]).join(' / ')}</p>`).join('')+`<p>基础设施 ${E.FACILITIES.filter(f=>s.facilities[f.id]).length}/${E.FACILITIES.length} · 入仓线 ${s.lineBuilt?'✓':'待建'} · 堂食 ${Math.min(8,s.served)}/8 · 配送 ${Math.min(3,s.trips)}/3</p><button data-panel="commissions">主题 ${s.journal.done.length}/6</button><button data-panel="equipment">设施清单</button></details>`;
}
