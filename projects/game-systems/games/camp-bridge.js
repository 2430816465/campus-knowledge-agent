import(new URL('shared/legibility.js',document.currentScript.src)).catch(console.error);
import(new URL('../screen-pages.js',document.currentScript.src)).catch(console.error);
(() => {
  const params=new URLSearchParams(location.search);
  if(!params.has('camp') || parent===window)return;
  const mode=location.pathname.split('/').at(-2);
  document.documentElement.dataset.campMode=mode;
  const send=(type,data={})=>parent.postMessage({source:'camp-game',mode,type,...data},location.origin);
  const ids=new WeakMap(), reported=new Map();
  let savedPause=null;
  const idFor=run=>{if(run.campRunId)return run.campRunId;if(!ids.has(run))ids.set(run,mode+'-'+(globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)));return ids.get(run)};
  const mineDetails=run=>({digActions:run.stats?.digActions||0,maxDepth:run.maxDepthReached||0,rooms:run.roomsFound?.length||0,treasureReached:!!run.treasureReached});
  const finish=(runId,win,score,reward=null)=>{if(!reported.has(runId)||(win&&!reported.get(runId))){reported.set(runId,win);send('finish',{result:{runId,win,score,reward}})}};
  const control=(command,data={})=>{
    const td=window.MT?.TD,mm=window.MT?.MM,tower=window.MT?.Game;
    if(command==='pause'&&savedPause===null){
      savedPause={td:td?.Game.scene?.paused,tower:tower?.G.busy};
      if(td?.Game.scene)td.Game.scene.paused=true;
      if(tower)tower.G.busy=true;
      window.campPaused=true;window.CampCoop?.pause();
    }
    if(command==='resume'&&savedPause!==null){
      if(td?.Game.scene)td.Game.scene.paused=savedPause.td;
      if(tower)tower.G.busy=savedPause.tower;
      savedPause=null;window.campPaused=false;window.CampCoop?.resume();window.focus();
    }
    if(command==='sound'){
      td?.Sfx?.setMuted(!data.enabled);window.MT?.Sfx?.setMuted(!data.enabled);
      window.CampCoop?.mute(!data.enabled);
      mm?.Audio?.setEnabled(data.enabled);
    }
    if(command==='ui-action'){
      const allowed={tower:['btnInfo','btnManual','btnSave','btnLoad','btnRestart','btnSettings'],coop:['helpButton','resetButton'],mine:[]};
      if(allowed[mode]?.includes(data.action))document.getElementById(data.action)?.click();
      if(mode==='mine'&&data.action==='settings'&&mm?.Game.scene)mm.Game.scene.settingsOpen=true;
    }
    if(command==='exit')window.CampCoop?.exit();
    if(command==='enter'){window.CampCosmetics=data.cosmetics||[];window.CampCoop?.enter(data);}
  };
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.source==='camp-host')control(e.data.command,e.data)});
  window.CampBridge={control,exitToCamp(){const mine=window.MT?.MM?.Game.scene?.run;if(mine?.settled&&!mine.tutorialRun)finish(idFor(mine),!!mine.treasureReached,mine.summary?.finalValue||0,mineDetails(mine));send('exit')}};
  window.CampBridge.coopAward=(id,level)=>{if(mode==='coop'&&id)finish('coop-'+id,true,level,{campaign:'slf-72-v1',levelId:level,difficulty:level<=86?'normal':'hard'})};
  window.addEventListener('load',()=>{
    if(!window.MT?.Game&&!window.MT?.TD?.Game&&!window.MT?.MM?.Game&&!window.CampCoop){send('error',{message:'游戏启动失败，请重试'});return}
    send('ready');
    setInterval(()=>{
      const td=window.MT?.TD?.Game.scene?.run;
      if(td?.result)finish(idFor(td),!!td.result.victory,td.wave);
      const mine=window.MT?.MM?.Game.scene?.run;
      if(mine?.settled&&!mine.tutorialRun)finish(idFor(mine),!!mine.treasureReached,mine.summary?.finalValue||0,mineDetails(mine));
      const tower=window.MT?.Game?.G;
      if(tower&&(tower.won||tower.dead))finish(tower.campRunId,!!tower.won,tower.floor);
      const coop=window.CampCoop?.snapshot();
      if(coop?.selfAward?.id)window.CampBridge.coopAward(coop.selfAward.id,window.RushGame?.LEVELS?.[coop.world?.levelIndex]?.id ?? (51+coop.world?.levelIndex));
    },250);
  });
})();
