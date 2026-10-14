// GPL-3.0 map adaptation; see third_party/slf/NOTICE.txt and LICENSE.txt.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./imported-maps.js'):root.RushImportedMaps,typeof module==='object'&&module.exports?require('./imported-engine.js'):root.RushImportedEngine);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.RushGame=api;})(typeof window!=='undefined'?window:globalThis,function(LEVELS,E){
'use strict';
if(!LEVELS||LEVELS.length!==72||!E)throw Error('完整72关未加载');
const CAMPAIGN_VERSION='slf72-v1';
const modeFor=i=>LEVELS[i]?.mode;
const modeIndices=mode=>LEVELS.map((l,i)=>l.mode===mode?i:-1).filter(i=>i>=0);
const nextLevelIndex=i=>{const ids=modeIndices(modeFor(i)),at=ids.indexOf(i);return at>=0&&at<ids.length-1?ids[at+1]:null;};
const isLevelUnlocked=(i,cleared)=>{const ids=modeIndices(modeFor(i)),at=ids.indexOf(i);return at>=0&&ids.slice(0,at).every(j=>(cleared||[]).includes(LEVELS[j].id));};
const stageFor=w=>LEVELS[w.levelIndex];
const createWorld=(i,run,safe)=>{if(!LEVELS[i])throw Error('关卡不存在');const w=E.create(LEVELS[i],i,run,safe);w.campaignVersion=CAMPAIGN_VERSION;return w;};
const rectsOverlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
return {VIEW:{width:1280,height:720,tile:32},PHYSICS:{...E.PHYSICS,playerWidth:14,playerHeight:56},ECONOMY:{currencyName:'冒险币',firstClear:60,repeatClear:25,firstAdBonus:30,repeatAdBonus:12},CAMPAIGN_VERSION,LEVELS,modeFor,modeIndices,nextLevelIndex,isLevelUnlocked,stageFor,createWorld,stepWorld:(w,inputs,dt)=>E.step(w,inputs,dt,stageFor(w)),respawnAll:E.respawn,bodyRect:E.body,rectsOverlap,activeGate:()=>false,bridgeIsActive:()=>false,solidRects:w=>stageFor(w).platforms.concat(w.lifts,w.boxes.filter(b=>!b.hidden)),updatePlateFlags:()=>{}};
});
