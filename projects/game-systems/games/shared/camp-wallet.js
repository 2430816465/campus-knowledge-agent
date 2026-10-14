// Actual camp receipts are separate from each game's internal resource estimates.
if(parent!==window&&new URLSearchParams(location.search).has('camp')){
 const chip=document.createElement('button');chip.id='camp-wallet-chip';chip.type='button';chip.textContent='冒险币 · 本次 +0';chip.title='有效游玩收益自动入账，点击查看营地菜单';
 chip.style.cssText='position:fixed;left:max(6px,env(safe-area-inset-left));bottom:max(5px,env(safe-area-inset-bottom));z-index:1200;border:1px solid #b89959;border-radius:6px;background:#382b21e6;color:#ffe1a0;padding:4px 7px;font:11px Microsoft YaHei,sans-serif;max-width:180px';
 if(location.pathname.includes('/workshop/')){chip.style.left='auto';chip.style.right='max(6px,env(safe-area-inset-right))';chip.style.bottom='max(85px,env(safe-area-inset-bottom))';}
 chip.onclick=()=>parent.postMessage({source:'camp-game',mode:location.pathname.split('/')[2],type:'menu'},location.origin);
 // Keep receipts available to settings/results without covering a touch target.
 chip.hidden=true;chip.style.display="none";document.body.append(chip);
 window.CampWalletReceipt={earned:0,balance:null};
 addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.source!=='camp-host')return;const d=e.data;
  if(d.command==='wallet-progress'){window.CampWalletReceipt={earned:d.earned,balance:d.balance};chip.textContent='已入账 +'+d.earned+' · '+d.balance+' 币';}
  if(d.command==='receipt'){window.CampWalletReceipt.balance=d.balance;chip.textContent='已入账 · '+d.balance+' 币';}
  if(d.command==='enter'){window.CampCosmetics=d.cosmetics||[];document.documentElement.dataset.campTheme=d.cosmetics?.includes('chess-bamboo')?'bamboo':'';}
 });
}
