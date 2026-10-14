/* Keep the economy-owned controls alive; arrange them by the player's task. */
export function createManagementUI({read,tutorial}){
 const $=id=>document.getElementById(id),manager=$('management');
 let device=null,group='collect',business='goal',welfare='free';
 const groups={collect:['machine-0','machine-1','machine-2'],craft:['machine-4'],transport:['machine-3','machine-5'],expand:[...$('facilities').children].map(n=>n.id)};
 const names={collect:'采集',craft:'加工',transport:'运输',expand:'扩建',inventory:'仓库'};
 const make=(tag,cls,html='')=>{const n=document.createElement(tag);n.className=cls;n.innerHTML=html;return n};
 const bar=(attr,items)=>make('nav','management-subtabs',items.map(([id,label])=>`<button ${attr}="${id}">${label}</button>`).join(''));
 const production=$('production'),deviceNav=bar('data-device-group',Object.entries(names)),directory=make('div','device-directory'),detail=make('div','device-detail'),back=make('button','device-back','‹ 设备目录'),inventory=production.querySelector('.inventory');
 back.type='button';back.onclick=()=>{device=null;manager.classList.remove('quick-device');renderDevices()};
 production.querySelectorAll(':scope > .hint,:scope > .expansion-heading').forEach(n=>n.hidden=true);
 production.prepend(deviceNav,directory,back,detail);inventory.classList.add('inventory-page');
 $('recipe').querySelector('.section-note span').hidden=true;
 const biz=$('business'),bizNav=bar('data-business-view',[['goal','目标'],['dining','堂食'],['delivery','外卖'],['stock','补货'],['distribution','分配']]);biz.prepend(bizNav);
 const tip=biz.querySelector(':scope>.hint');tip.hidden=true;
 const headers=[...biz.querySelectorAll(':scope>h3')];headers.forEach(n=>n.hidden=true);
 const stockHint=$('shelf-stock').nextElementSibling;stockHint.hidden=true;
 const sky=$('sky'),skyNav=bar('data-welfare-view',[['free','免费干劲'],['advert','可选广告']]);sky.prepend(skyNav);
 $('settings').querySelectorAll(':scope>.hint:not(#save-status)').forEach(n=>n.hidden=true);
 const label=make('p','management-time-note','管理中仍会生产 · 关闭后回到小店');manager.append(label);
 function setSelected(nav,attr,value){nav.querySelectorAll('button').forEach(b=>{const selected=b.getAttribute(attr)===String(value);b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected))})}
 function renderDevices(){
  const cards=[...production.querySelectorAll('.machine-card')];
  // A selected card may already be in detail. Return it to its original owner first.
  cards.forEach(n=>{n.hidden=true;(n.id.startsWith('machine-')?$('upgrades'):$('facilities')).append(n)});
  $('upgrades').hidden=true;$('facilities').hidden=true;deviceNav.hidden=!!device;directory.hidden=!!device||group==='inventory';back.hidden=!device;detail.hidden=!device;inventory.hidden=!!device||group!=='inventory';
  setSelected(deviceNav,'data-device-group',group);
  if(device){const n=$(device);if(n){n.hidden=false;detail.append(n);$('panel-title').textContent=n.querySelector('.machine-title').firstChild.textContent}return;}
  $('panel-title').textContent='小店设备';
  directory.replaceChildren();directory.classList.add('device-grid');
  for(const id of groups[group]||[]){const n=$(id);n.hidden=false;directory.append(n)}

 }
 function renderBusiness(){
  setSelected(bizNav,'data-business-view',business);
  biz.querySelector('.business-goal').hidden=business!=='goal';$('business-stats').hidden=!['dining','delivery'].includes(business);
  [...$('business-stats').children].forEach((n,i)=>n.hidden=business==='dining'?![2,3].includes(i):![4,5,6,7].includes(i));
  biz.querySelector('.distribution').hidden=business!=='distribution';$('distribution-note').hidden=business!=='distribution';
  $('shelf-stock').hidden=business!=='stock';
  [...$('shelf-stock').children].forEach(n=>n.hidden=false);
  $('return-carry').hidden=!['dining','delivery'].includes(business);$('business-tip').hidden=!['dining','delivery'].includes(business);
 }
 function refresh(){
  if(manager.hidden)return;
  const active=document.querySelector('.tab-panel:not([hidden])')?.id;
  if(active==='production'){
   if(tutorial.snapshot().active&&tutorial.snapshot().step===7&&device!=='machine-3'){device='machine-3';manager.classList.add('quick-device');renderDevices()}
  }
  if(active==='business')renderBusiness();
  if(active==='sky')renderWelfare();
  label.textContent=read().paused?'经营已暂停 · 关闭后回到小店':'管理中仍会生产 · 关闭后回到小店';
 }
 function open(id,index){
  manager.classList.toggle('quick-device',id==='production'&&index!==undefined&&index!==null);
  if(id==='production'){device=index!==undefined&&index!==null?(typeof index==='string'?'facility-':'machine-')+index:null;renderDevices()}
  if(id==='recipe'){[...$('recipes').children].forEach(n=>n.hidden=false)}
  if(id==='business')renderBusiness();
  if(id==='sky')renderWelfare();
  refresh();
 }
 function renderWelfare(){setSelected(skyNav,'data-welfare-view',welfare);sky.querySelectorAll('.sky-heading,.resonances,#resonance-status').forEach(n=>n.hidden=welfare!=='free');sky.querySelector('.ad-section').hidden=welfare!=='advert';$('offline-ad').hidden=welfare!=='advert'||!read().offlineBonus}
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.deviceGroup){group=b.dataset.deviceGroup;device=null;renderDevices()}
  if(b.dataset.deviceDetail){device=b.dataset.deviceDetail;manager.classList.add('quick-device');renderDevices()}
  if(b.dataset.businessView){business=b.dataset.businessView;renderBusiness()}
  if(b.dataset.welfareView){welfare=b.dataset.welfareView;renderWelfare()}
 });
 addEventListener('resize',()=>{if(!manager.hidden&&document.querySelector('.tab-panel:not([hidden])')?.id==='production')renderDevices()});
 return {open,refresh};
}
