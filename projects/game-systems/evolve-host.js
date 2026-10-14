import {EconomyObserver} from './economy-observer.js';
import {registerGame} from './adapters.js';
let frame,listener,timer,economy;
const send=(command,data={})=>frame?.contentWindow?.postMessage({source:'camp-host',command,...data},location.origin);
registerGame('evolve',{
 canPause:true,canResume:true,load:async()=>{},
 enter(options){const requested=options.mode||options.difficulty,mode=requested==='hell'?'hell':requested==='normal'?'normal':Number(options.choice)===1?'hell':'normal';window.CampOrientation?.setLandscape(true);frame=document.createElement('iframe');frame.title=options.title||'再进化一次';frame.className='game-frame';frame.allow='autoplay; fullscreen';let ready=false;
 listener=e=>{if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.source!=='camp-game'||e.data.mode!=='evolve')return;const d=e.data;
  if(d.type==='ready'){ready=true;clearTimeout(timer);options.container.querySelector('.game-loading')?.remove();send('sound',{enabled:options.sound});send('preferences',{settings:window.CampPreferences?.preferences||{}});send('enter',{choice:mode==='hell'?1:0,mode,cosmetics:options.cosmetics});frame.focus();economy?.stop();economy=new EconomyObserver('evolve',frame,options);economy.start();}
  if(d.type==='finish'){try{const receipt=options.onFinish?.(economy?.finish(d.result)||d.result);if(receipt)send('receipt',{runId:d.result.runId,balance:options.getBalance?.(),earned:0});}catch(error){send('receiptError',{runId:d.result?.runId,message:error.message});}}
  if(d.type==='exit')options.onExit?.();if(d.type==='menu')options.onMenu?.();if(d.type==='error')options.onError?.(new Error(d.message));
 };window.addEventListener('message',listener);timer=setTimeout(()=>{if(!ready)options.onError?.(new Error('池塘加载超时，请重试'));},20000);frame.src=new URL('./games/evolve/index.html?camp=1&difficulty='+mode,location.href).href;options.container.append(frame);},
 uiAction(action){send('ui-action',{action});},pause(){economy?.setPaused(true);if(frame?.contentWindow)frame.contentWindow.CampHostOverlayOpen=true;send('pause');},resume(){economy?.setPaused(false);if(frame?.contentWindow)frame.contentWindow.CampHostOverlayOpen=false;send('resume');frame?.focus();},sound(enabled){send('sound',{enabled});},
 exit(){try{frame?.contentWindow?.CampBridge?.control('exit');}catch{}},
 destroy(){window.CampAds?.cancelAll();economy?.stop();economy=null;window.CampOrientation?.setLandscape(false);if(document.fullscreenElement===frame)document.exitFullscreen?.().catch(()=>{});window.screen.orientation?.unlock?.();clearTimeout(timer);window.removeEventListener('message',listener);frame?.remove();frame=null;listener=null;}
});
