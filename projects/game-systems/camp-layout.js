import {modes,products,productCategory,taskProgress} from './services.js';
import {btn,icon,itemArt,money,portrait,avatarVariant,escape} from './ui.js';
import {referenceArt} from './reference-art.js';
import {questBadge} from './quest-badge.js';

const memory=new Map(),limits=new Map();
let profileSection='overview',ownedOnly=false;
const count=()=>innerHeight<700?2:innerHeight<850?4:6;
function pageNumber(key){if(!memory.has(key)){try{memory.set(key,Number(sessionStorage.getItem('camp.catalog.'+key))||0)}catch{memory.set(key,0)}}return memory.get(key)}
function remember(key,n){memory.set(key,n);try{sessionStorage.setItem('camp.catalog.'+key,String(n))}catch{}}
function catalog(key,items,render,kind=''){
 const size=count(),pages=Math.max(1,Math.ceil(items.length/size)),page=Math.min(pages-1,pageNumber(key));remember(key,page);limits.set(key,pages);
 const body=items.slice(page*size,(page+1)*size).map(render).join('')||'<p class="catalog-empty">这里还没有藏品，先去探索新的旅程。</p>';
 return `<div class="catalog-grid ${kind} ${items.length===1?'catalog-single':''}" style="--catalog-rows:${Math.ceil(Math.min(items.length,size)/2)||1}">${body}</div><div class="catalog-pager" ${pages===1?'hidden':''} aria-label="翻页">${btn('‹','catalog-prev:'+key,'secondary',page?'':'disabled')}<span role="status">${page+1} / ${pages}<small>${items.length} 项</small></span>${btn('›','catalog-next:'+key,'secondary',page<pages-1?'':'disabled')}</div>`;
}
const title=(name,sub,extra='')=>`<div class="catalog-heading"><div><h1>${name}</h1><p>${sub}</p></div>${extra}</div>`;
export function handleCampAction(action,id){
 if(action==='catalog-prev'||action==='catalog-next'){remember(id,Math.max(0,Math.min((limits.get(id)||1)-1,pageNumber(id)+(action==='catalog-next'?1:-1))));return true}
 if(action==='profile-section'){profileSection=id;return true}
 if(action==='owned-filter'){ownedOnly=!ownedOnly;return true}
 return false;
}
export function rememberGame(id,choice){try{localStorage.setItem('camp.recent-game',JSON.stringify({id,choice}))}catch{}}

export function campView(page,{s,tab}){
 if(page==='shop'){
  const category=['avatars','skins','decor','codex'].includes(tab)?tab:'all',codex=category==='codex';
  const tabs=[['all','全部'],['avatars','头像'],['skins','皮肤'],['decor','装饰']].map(([id,label])=>btn(label,'tab:'+id,category===id?'selected':'','aria-pressed="'+(category===id)+'"')).join('');
  const list=codex?modes:products.filter(p=>(category==='all'||productCategory(p)===category)&&(!ownedOnly||s.owned.includes(p.id)));
  return `<section class="camp-dashboard">${title('旅人藏品','点开查看，兑换或装备。',btn(codex?'返回藏品':'探索图鉴','tab:'+(codex?'all':'codex'),'secondary'))}<div class="catalog-tabs">${tabs}</div>${codex?'':`<div class="catalog-filter">${btn(ownedOnly?'✓ 只看已拥有':'只看已拥有','owned-filter',ownedOnly?'selected':'secondary','aria-pressed="'+ownedOnly+'"')}<span>${money(s.coins)}</span></div>`}${catalog('collection-'+category+'-'+ownedOnly,list,p=>codex?`<button class="catalog-item" data-action="codex:${p.id}">${referenceArt(p.id)}<b>${p.name}</b><small>${s.runs.some(r=>r.mode===p.id)?'已探索':'待探索'} · ${p.people}</small></button>`:`<button class="catalog-item" data-action="product:${p.id}">${itemArt(p.id)}<b>${escape(p.name)}</b><small>${s.equipped.includes(p.id)?'✓ 已装备':s.owned.includes(p.id)?'已拥有':p.price+' 币'}</small></button>`,'catalog-items')}</section>`;
 }
 if(page==='tasks'){
  const achievements=tab==='achievements',list=achievements?[{id:'all',name:'世界的四个方向',description:'探索四种玩法；或体验三种单人玩法并累计六次有效冒险。',...taskProgress(s,'all'),claimed:s.claimed.includes('all')}]:[{id:'first',name:'初次启程',description:'获得第一笔有效冒险收益。',...taskProgress(s,'first'),claimed:s.claimed.includes('first')},...(s.tasks||[])];
  list.sort((a,b)=>Number(a.claimed)-Number(b.claimed)||Number(b.count>=b.target)-Number(a.count>=a.target));
  return `<section class="camp-dashboard">${title('营地委托','奖励直接到账，无需广告。')}<div class="catalog-tabs">${btn('营地任务','tab:daily',achievements?'':'selected')}${btn('旅人成就','tab:achievements',achievements?'selected':'')}</div>${catalog('tasks-'+achievements,list,q=>`<article class="catalog-quest ${q.claimed?'quest-claimed':q.count>=q.target?'quest-ready':''}"><button class="quest-description" data-action="task-detail:${q.id}">${questBadge(q)}<b>${escape(q.name)}</b><span class="quest-more">详情 ›</span></button><p class="quest-summary">${escape(q.description||'点开详情查看完成条件。')}</p><progress value="${Math.min(q.count,q.target)}" max="${q.target}"></progress><div class="quest-numbers"><span>${Math.min(q.count,q.target)} / ${q.target}</span><strong>${q.reward} 币</strong></div>${btn(q.claimed?'已领取':q.count>=q.target?'领取奖励':'前往冒险',q.claimed?'none':q.count>=q.target?'claim:'+q.id:'nav:home',q.claimed?'secondary':'primary',q.claimed?'disabled':'')}</article>`,'catalog-quests')}${achievements?`<section class="exploration-list" aria-label="探索进度"><h2>探索不同玩法</h2><div>${modes.map(m=>btn(`<span>${m.name}</span><small>${s.runs.some(r=>r.mode===m.id)?'已留下足迹':'前往探索 ›'}</small>`,'mode:'+m.id,'secondary')).join('')}</div></section>`:''}</section>`;
 }
 if(page==='profile'){
  if(profileSection==='records')return `<section class="camp-dashboard">${title('游玩记录','点选游戏查看冒险足迹。',btn('返回我的','profile-section:overview','secondary'))}${catalog('records',modes,m=>`<button class="catalog-record" data-action="records:${m.id}">${icon(m.id)}<b>${m.name}</b><small>${s.runs.filter(r=>r.mode===m.id).length} 次冒险</small></button>`)}</section>`;
  return `<section class="camp-dashboard">${title('旅人手册','你的足迹，下一次出发。')}<div class="catalog-profile">${portrait(avatarVariant(s))}<div><h2>${escape(s.name)}</h2><p>已留下 ${s.runs.length} 次冒险足迹</p></div></div><div class="profile-stats"><span><b>${new Set(s.runs.map(r=>r.mode)).size}</b>已玩玩法</span><span><b>${s.runs.length}</b>冒险记录</span><span><b>${s.owned.length}</b>已拥有藏品</span></div><div class="profile-menu">${btn(icon('book')+' 游玩记录','profile-section:records','secondary')}${btn(icon('gear')+' 设置','settings','secondary')}${btn(icon('compass')+' 玩法帮助','help-all','secondary')}${btn(icon('bag')+' 我的藏品','nav:collection','secondary')}</div><p class="catalog-note">进度自动保存 · 设置全游戏通用</p></section>`;
 }
 return null;
}
