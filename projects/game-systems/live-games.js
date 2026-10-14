import {EconomyObserver} from './economy-observer.js';
import {registerGame} from './adapters.js';
const entries={tower:'index.html',marble:'index.html',mine:'index.html',coop:'index.html',liars:'index.html',workshop:'index.html',chess:'index.html',nightwatch:'index.html',rush:'index.html'};
for(const id of Object.keys(entries)){
 let frame,listener,timer,economy;
 const send=(command,data={})=>frame?.contentWindow?.postMessage({source:'camp-host',command,...data},location.origin);
 registerGame(id,{
  canPause:!['coop','liars','chess'].includes(id),canResume:['tower','workshop','nightwatch','rush'].includes(id),load:async()=>{},
  enter(options){
   if(id==='tower')window.CampOrientation?.setPortrait?.();
   if(id==='marble'||id==='liars'||id==='workshop'||id==='chess')window.CampOrientation?.setLandscape(true);
   const entry=id==='marble'&&options.choice>=1?'puzzle.html':(options.choice===1&&id==='mine')?'index.html':entries[id];
   const url=new URL('./games/'+id+'/'+entry,location.href);url.searchParams.set('camp','1');if(id==='marble'&&options.choice===2)url.searchParams.set('difficulty','hard');if(id==='rush'&&options.choice===1)url.searchParams.set('mode','defense');if(id==='coop'&&options.choice===1&&!options.roomCode)url.searchParams.set('solo','1');
   frame=document.createElement('iframe');frame.title=options.title||id;frame.className='game-frame';frame.allow='autoplay; fullscreen';
   let ready=false;
   listener=e=>{
    if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.source!=='camp-game'||e.data.mode!==id)return;
    if(e.data.type==='ready'){ready=true;clearTimeout(timer);options.container.querySelector('.game-loading')?.remove();send('sound',{enabled:options.sound});send('preferences',{settings:window.CampPreferences?.preferences||{}});send('enter',{choice:options.choice,solo:id==='coop'&&options.choice===1&&!options.roomCode,roomCode:options.roomCode,cosmetics:options.cosmetics,balance:options.getBalance?.(),earned:0});frame.focus();economy?.stop();economy=new EconomyObserver(id,frame,options);economy.start();}
    if(e.data.type==='finish'){try{const result=options.onFinish?.(economy?.finish(e.data.result)||e.data.result);if(['marble','liars','nightwatch','rush'].includes(id)&&result)send('receipt',{runId:e.data.result.runId,balance:options.getBalance?.()})}catch(error){if(['marble','liars','nightwatch','rush'].includes(id))send('receiptError',{runId:e.data.result?.runId,message:error.message});else options.onError?.(error)}}
    if(e.data.type==='bonus'&&id==='marble'){try{if(options.onBonus?.(e.data.runId,e.data.amount))send('bonusReceipt',{runId:e.data.runId,balance:options.getBalance?.()})}catch(error){send('bonusError',{runId:e.data.runId,message:error.message})}}
    if(e.data.type==='exit')options.onExit?.();
    if(id==='coop'&&e.data.type==='playfield')document.body.dataset.coopPlaying=String(!!e.data.active);
    if(e.data.type==='menu')options.onMenu?.();
    if(e.data.type==='error')options.onError?.(new Error(e.data.message));
   };
   window.addEventListener('message',listener);
   timer=setTimeout(()=>{if(!ready)options.onError?.(new Error('游戏加载超时，请重试。'))},20000);
   frame.src=url.href;options.container.append(frame);
  },
  uiAction(action){send('ui-action',{action})},
  pause(){if(frame?.contentWindow)frame.contentWindow.CampHostOverlayOpen=true;economy?.setPaused(true);send('pause')},resume(){if(frame?.contentWindow)frame.contentWindow.CampHostOverlayOpen=false;send('resume');frame?.focus();economy?.setPaused(false)},sound(enabled){send('sound',{enabled})},
  exit(){try{frame?.contentWindow?.CampBridge?.control('exit')}catch{}},
  destroy(){window.CampAds?.cancelAll();economy?.stop();economy=null;if(id==='tower'||id==='marble'||id==='coop'||id==='liars'||id==='workshop'||id==='chess')window.CampOrientation?.setLandscape(false);if(id==='liars'||id==='workshop'||id==='chess')window.screen.orientation?.unlock?.();if(id==='coop')delete document.body.dataset.coopPlaying;clearTimeout(timer);window.removeEventListener('message',listener);frame?.remove();frame=null;listener=null;}
 });
}
