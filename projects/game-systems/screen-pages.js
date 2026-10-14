// Paginated menu presentation. Existing controls and their game-owned handlers stay in place.
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./screen-pages.css',import.meta.url);if(document.body)document.body.append(css);else document.addEventListener('DOMContentLoaded',()=>document.body.append(css),{once:true});
const game=location.pathname.includes('/games/'),cache=new Map(),mounted=new Map();let pending=false;
const selector=game?[
 'dialog[open]','#scene-overlay .panel','#overlay .panel','#screen>.panel','#screen>.home',
 '#screen .welcome','#screen .lobby-panel','#screen .home-panel','#screen .match-panel',
'#home.home-screen:not(.hidden)',
 '#app .shade .dialog',
 '#app .scrim .panel','#management:not([hidden])','#modal.show .modal-box',
 '#modal.show>div','#modal.show>.box','.info-sheet','.manual-sheet',
 '.mine-draft','.mine-report','#home .home-panel','#home .home-card','#home .lobby-panel',
 '#tutorial .guide-card','#guide:not(.guide):not([hidden])','#mechanismGuide:not([hidden])','#guideLibrary:not([hidden])','#screen .choice-panel','#lobby .lobby-panel:not(.hidden)'
].join(','):'dialog[open]:not([data-kind=menu]):not([data-kind=settings]):not([data-kind=product])';
const containers='.home-content,.home-columns,.game-picker,.hero-panel,.profile-box,.profile-editor,.game-grid,.play-primary,.friend-actions,.characters,.split,.settings-list,.codex-list,.room-help,.dialog-body,.modal-body,.home-nav,.skill-grid,.gear-list,.research-list,.partner-grid,.summon-grid,.quest-list,.level-list,.business-stats,.order-needs,.distribution,.resonances,.inventory,.actions,.rule-summary,.help-rule,.training,.stages,.levels,.chapters,.collection-grid,.record-grid,.mode-grid,.game-menu-actions,.help-list,.ledger,.species-grid,.codex-grid,.settings-actions,.upgrades,.recipes,.manual-list,.manual-grid,.panel-body,.tab-panel,.prepare-body,.profile-shortcuts,.wood-settings-body,[data-fit-list]';
const fixedSelector='.modal-top,.dialog-top,.panel-head,.panel-header,.manual-head,.info-head,.wood-tabs,.tabs,.panel-foot,.wood-settings-footer';
const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],.hidden');
function splitText(el){
 if(el.matches('p')&&!el.id&&!el.children.length&&el.textContent.length>90&&!el.dataset.fitText){
  const text=el.textContent,parts=text.match(/[^。；！？]+[。；！？]?/g)||[text];let chunks=[],line='';
  for(const part of parts){for(let i=0;i<part.length;i+=72){const piece=part.slice(i,i+72);if(line.length+piece.length>90){chunks.push(line);line='';}line+=piece;}}if(line)chunks.push(line);
  if(chunks.length>1){el.textContent='';el.dataset.fitText='true';for(const text of chunks){const span=document.createElement('span');span.className='fit-paragraph';span.textContent=text;el.append(span);}}
 }
}
function unitsFor(root){const units=[],wrappers=[];let titleFound=false;
 function walk(el){
  if(el.matches('.fit-pager'))return;
  if(el.matches('dialog[open],#guide'))return;
  if(el.hidden||el.classList.contains('hidden')||getComputedStyle(el).display==='none')return;
  if(el.matches('button')&&(/^(close|back|resume|help-close|levels|title|home)$/.test(el.dataset.action||'')||/^(close|close-dialog)$/.test(el.dataset.do||'')||el.dataset.dialog==='close'||el.classList.contains('compact-shop'))){el.classList.add('fit-fixed');return;}
  if(el.matches(fixedSelector)||(!titleFound&&el.matches('h1,h2,.compact-heading,.page-heading,.title-plate'))){if(el.matches('h1,h2,.compact-heading,.title-plate'))titleFound=true;return;}
  // Long documents are split into readable chunks; fields/buttons are never cloned.
  splitText(el);
  if(el.matches(containers+',.prepare-compact,.wood-settings-copy,#wood-settings-content,.grid,.codex,.level-panel,.room-panel,.form,.rules,.form-grid,.settings-form,.home-hero,.hero-copy,.campaign-list,form,fieldset')||el.dataset.fitText||el.querySelector('button[data-dialog="close"],button[data-action="help-close"]')){el.classList.add('fit-container');wrappers.push(el);for(const child of [...el.children])walk(child);}
  else units.push(el);
 }
 for(const child of [...root.children])walk(child);
 return {units,wrappers};
}
function limitFor(root){
 const vv=window.visualViewport,h=vv?.height||innerHeight;
 if(root.id==='main')return Math.max(180,root.parentElement.clientHeight-document.querySelector('.topbar').getBoundingClientRect().height-(document.querySelector('.nav')?.getBoundingClientRect().height||0)-16);
 if(root.id==='management')return Math.max(180,h-16);
 if(root.id==='home'&&root.classList.contains('home-screen'))return Math.max(180,h-70);
 return Math.max(180,h-20);
}
function keyFor(root){return (root.id||root.className.replace(/fit-screen/g,''))+'|'+(root.querySelector('h1,h2')?.textContent||root.dataset.kind||'').slice(0,50);}
function contentHeight(root){const r=root.getBoundingClientRect(),s=getComputedStyle(root);let bottom=r.top+parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop);for(const child of root.querySelectorAll('*')){const cs=getComputedStyle(child),overlay=child.closest('dialog,#guide');if(!visible(child)||cs.position==='fixed'||cs.position==='absolute'||overlay&&overlay!==root)continue;bottom=Math.max(bottom,child.getBoundingClientRect().bottom+parseFloat(cs.marginBottom));}return bottom-r.top+parseFloat(s.paddingBottom)+parseFloat(s.borderBottomWidth);}
function layout(root,depth=0){
 if(!visible(root))return;
 const key=keyFor(root);let state=mounted.get(root);if(state&&state.key!==key){state.key=key;state.page=cache.get(key)||0;}
 if(!state){state={root,key,page:cache.get(key)||0,nav:document.createElement('nav')};state.nav.className='fit-pager';state.nav.setAttribute('aria-label','页面切换');state.nav.innerHTML='<button type="button" data-fit-prev aria-label="上一页">‹</button><select aria-label="选择功能页面"></select><button type="button" data-fit-next aria-label="下一页">›</button>';mounted.set(root,state);root.append(state.nav);
  state.nav.addEventListener('click',e=>{e.stopPropagation();if(e.target.closest('[data-fit-prev]'))showPage(state,state.page-1);if(e.target.closest('[data-fit-next]'))showPage(state,state.page+1);});
  const choose=e=>{e.stopPropagation();showPage(state,Number(e.target.value));};
  state.nav.querySelector('select').addEventListener('input',choose);
  state.nav.querySelector('select').addEventListener('change',choose);
 }
 // Games may replace a panel's HTML while keeping the root. Restore only our pager.
 if(!state.nav.isConnected)root.append(state.nav);
 root.classList.add('fit-screen');root.querySelectorAll('.fit-page-hidden,.fit-empty').forEach(e=>e.classList.remove('fit-page-hidden','fit-empty'));
 root.style.setProperty('--fit-limit',limitFor(root)+'px');
 const {units,wrappers}=unitsFor(root);
 const home=root.matches('.home,.marble-home,.home-screen')||/再选一次|再进化一次/.test(root.querySelector('h1')?.textContent||'');
 if(home){const primary=u=>u.matches('[data-action="new"],[data-action="continue"],[data-action="start"],[data-action="resume"],#startSolo')||!!u.querySelector('[data-action="new"],[data-action="continue"],[data-action="start"],[data-action="resume"],#startSolo');units.sort((a,b)=>Number(primary(b))-Number(primary(a)));}
 state.units=units;state.wrappers=wrappers;state.pages=[];
 if(!units.length){state.nav.hidden=true;return;}
 state.nav.hidden=false;
 function mask(selected){for(const u of units)u.classList.toggle('fit-page-hidden',!selected.includes(u));for(const w of [...wrappers].reverse())w.classList.toggle('fit-empty',![...w.children].some(e=>!e.classList.contains('fit-page-hidden')&&!e.classList.contains('fit-empty')&&!e.hidden&&getComputedStyle(e).display!=='none'));}
 const styles=getComputedStyle(root),edges=parseFloat(styles.borderTopWidth)+parseFloat(styles.borderBottomWidth),budget=limitFor(root)-16;
 state.nav.hidden=true;mask(units);const allFit=contentHeight(root)<=limitFor(root)+1;state.nav.hidden=allFit;
 let current=[];
 if(allFit)state.pages=[units];else for(const u of units){const trial=[...current,u];mask(trial);
  if(current.length&&(contentHeight(root)>budget+1||trial.filter(e=>e.matches('button,.quest-detail,.item-card,.guide')).length>6)){state.pages.push(current);current=[u];mask(current);}else current=trial;
  if(current.length===1&&contentHeight(root)>budget+1&&depth<8&&u.children.length&&!u.matches('button,label,input,select,svg,article.item')&&!u.dataset.fitList){u.dataset.fitList='true';return layout(root,depth+1);}
 }
 if(current.length)state.pages.push(current);
 state.mask=mask;
 state.nav.querySelector('select').innerHTML=state.pages.map((list,i)=>{let label=list.map(e=>e.querySelector('h2,h3,strong,b')?.textContent||e.textContent).find(t=>t?.trim())?.trim().replace(/\s+/g,' ').slice(0,12)||'内容';return `<option value="${i}">${i+1} / ${state.pages.length} · ${label.replace(/[<&"]/g,'')}</option>`;}).join('');
 showPage(state,Math.min(state.page,state.pages.length-1),false);
 state.nav.hidden=state.pages.length<2;
 root.dataset.fitPages=state.pages.length;
 // Do not silently crop an oversized individual unit. Mark it for the audit.
 root.dataset.fitOverflow=String(contentHeight(root)>limitFor(root)+2);
}
function showPage(state,index,focus=true){if(!state.pages?.length)return;if(focus)observer.disconnect();state.page=Math.max(0,Math.min(index,state.pages.length-1));state.mask(state.pages[state.page]);cache.set(state.key,state.page);state.nav.querySelector('select').value=state.page;state.nav.querySelector('[data-fit-prev]').disabled=state.page===0;state.nav.querySelector('[data-fit-next]').disabled=state.page===state.pages.length-1;state.root.dataset.fitPage=state.page;state.root.scrollTop=0;if(focus){state.nav.querySelector('select').focus({preventScroll:true});observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});}}
const observer=new MutationObserver(records=>{if(records.every(r=>r.target.closest?.('.fit-pager')))return;if(records.some(r=>r.type!=='characterData'||r.target.parentElement?.closest(selector)))refresh();});
function refresh(){pending=false;if(!css.sheet)return;observer.disconnect();for(const [root] of mounted)if(!root.isConnected)mounted.delete(root);const roots=[...document.querySelectorAll(selector)].filter(e=>visible(e)&&!e.closest('[data-fit-native]'));document.documentElement.dataset.fitMenu=String(roots.length>0);for(const root of roots)if(root.matches('dialog,#guide')||!roots.some(other=>other!==root&&other.contains(root)))layout(root);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(refresh);}
function reveal(element){refresh();const states=[...mounted.values()].filter(s=>s.root.contains(element));for(const state of states){const page=state.pages?.findIndex(list=>list.some(u=>u===element||u.contains(element)));if(page>=0)showPage(state,page,false);}return visible(element);}
window.ScreenPages=Object.freeze({refresh:schedule,reveal,describe:()=>[...mounted.values()].filter(s=>visible(s.root)).map(s=>({key:s.key,page:s.page,pages:s.pages?.length,overflow:s.root.dataset.fitOverflow}))});
addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);document.fonts?.ready.then(schedule);css.addEventListener('load',schedule);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
