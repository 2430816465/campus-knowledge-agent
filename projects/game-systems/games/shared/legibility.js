// Shared action emphasis; all click handlers remain owned by each game.
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../../camp-settings.css',import.meta.url).href;document.head.append(css);
function mark(){for(const b of document.querySelectorAll('button,a[role=button]')){const t=(b.textContent||'').replace(/\s+/g,'');const important=/返回营地|回到营地|结束本局|结束并结算|结束并领取/.test(t);if(b.classList.contains('camp-important-action')!==important)b.classList.toggle('camp-important-action',important);}}
let queued=false;const observer=new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;mark();});}});observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});mark();

// Palette identity belongs to the current game, never the enclosing camp.
const gameId=location.pathname.match(/\/games\/([^/]+)\//)?.[1];
if(gameId)document.documentElement.dataset.gameTheme=gameId;
const theme=document.createElement('link');theme.rel='stylesheet';
theme.href=new URL('game-themes.css',import.meta.url).href;
document.head.append(theme);
