import {PuzzleGame,clone} from './puzzle-state.js';
import {LEVELS as NORMAL_LEVELS} from './puzzle-levels.js';
import {LEVELS as HARD_LEVELS} from './puzzle-hard-levels.js';
import {drawPuzzle as drawNormal} from './puzzle-render.js';
import {drawPuzzle as drawHard} from './puzzle-hard-render.js';
import {artReady} from './puzzle-art.js';
import {AimGesture} from './puzzle-aim.js';
import {ImpactAudio} from './endless-audio.js';
import * as normalTutorial from './puzzle-tutorial.js';
import * as hardTutorial from './puzzle-hard-tutorial.js';
const hard=new URLSearchParams(location.search).get('difficulty')==='hard',campaign=hard?'hard':'normal',LEVELS=hard?HARD_LEVELS:NORMAL_LEVELS,drawPuzzle=hard?drawHard:drawNormal,{mechanisms,tutorialBody,drawTutorial}=hard?hardTutorial:normalTutorial;
document.documentElement.dataset.puzzleDifficulty=campaign;document.title='再弹一次 · '+(hard?'困难机关':'普通闯关');
if(hard)artReady.catch(console.error);
const review=new URLSearchParams(location.search).get('review')==='1';
const KEY=(hard?'adventure-camp.marble.ruins.v3':'adventure-camp.marble.normal.v2')+(review?'.review':''),canvas=document.querySelector('#board'),hud=document.querySelector('#hud'),overlay=document.querySelector('#overlay'),cancel=document.querySelector('#aim-cancel'),audio=new ImpactAudio(),camp=new URLSearchParams(location.search).has('camp')&&parent!==window;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return {}}};
const saved=read();let inheritedUnlocked=1;
try{if(!hard)inheritedUnlocked=Math.max(1,Math.min(50,JSON.parse(localStorage.getItem('adventure-camp.marble.normal.v1'))?.meta?.unlocked||1))}catch{}
const meta={unlocked:inheritedUnlocked,best:{},attempts:{},tutorialSeen:{},...saved.meta};
let chapter=0,g=new PuzzleGame(0,campaign),view='levels',angle=null,lastAim=0,pointer=null,hostPaused=false,sound=saved.sound!==false,adKind=null,message='',lastSignature='',savedRun=saved.run,tutorialQueue=[],tutorialAt=0,tutorialReturn='';
meta.tutorialSeen=meta.tutorialSeen||{};
if(review)meta.unlocked=50;
if(savedRun&&Number.isInteger(savedRun.index)&&savedRun.index>=0&&savedRun.index<50&&['aim','flight','failed'].includes(savedRun.phase)){g=Object.assign(new PuzzleGame(savedRun.index,campaign),savedRun);g.level=clone(LEVELS[g.index]);chapter=Math.floor(g.index/5)}
function save(){try{localStorage.setItem(KEY,JSON.stringify({meta,run:g.phase==='won'?null:g,sound}))}catch{message='浏览器未允许保存；本次仍可继续游玩'}}
const send=(type,data={})=>{if(camp)parent.postMessage({source:'camp-game',mode:'marble',type,...data},location.origin)};
const btn=(text,action,cls='',disabled=false)=>`<button class="${cls}" data-action="${action}" ${disabled?'disabled':''}>${text}</button>`;
async function landscape(){try{if(window.CampOrientation){window.CampOrientation.setLandscape(true);return}if(matchMedia('(pointer:coarse)').matches&&!document.fullscreenElement)await document.documentElement.requestFullscreen?.();await screen.orientation?.lock?.('landscape')}catch{}}
function clearAim(){const id=pointer?.id;pointer=null;angle=null;cancel.hidden=true;if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}
function openTutorial(replay=false,back=''){tutorialQueue=mechanisms(g.level,g.index).filter(id=>replay||!meta.tutorialSeen[id]);tutorialAt=0;tutorialReturn=back;if(tutorialQueue.length){view='tutorial';clearAim()}return tutorialQueue.length>0}
function finishTutorial(all=false){if(view!=='tutorial')return;if(all){for(const id of tutorialQueue)meta.tutorialSeen[id]=true;tutorialAt=tutorialQueue.length}else{meta.tutorialSeen[tutorialQueue[tutorialAt]]=true;tutorialAt++}if(tutorialAt>=tutorialQueue.length){view=tutorialReturn;tutorialQueue=[];tutorialAt=0}save();ui(true)}
function start(index){if(index<0||index>=50||index>=meta.unlocked)return;clearAim();g.start(index);chapter=Math.floor(index/5);lastAim=0;view='';hostPaused=false;message='';savedRun=null;meta.attempts[index]=(meta.attempts[index]||0)+1;openTutorial();save();landscape();ui(true)}
function record(){if(g.phase!=='won'||g.recorded)return;g.recorded=true;const stars=1+Number(!g.assistUsed)+Number(g.used<=g.level.par&&!g.assistUsed),old=meta.best[g.index]||{};meta.best[g.index]={stars:Math.max(old.stars||0,stars),shots:Math.min(old.shots||99,g.used)};meta.unlocked=Math.min(50,Math.max(meta.unlocked,g.index+2));save();if(!review)send('finish',{result:{runId:(hard?'marble-hard-v3-level-':'marble-ruins-v2-level-')+(g.index+1),win:true,score:g.index+1,reward:hard?{total:8,campaign:'marble-hard-v3',difficulty:'hard',levelId:g.index+1}:{total:8,campaign:true}}})}
function ui(force=false){
 record();document.body.dataset.view=view||g.phase;const sig=[view,g.phase,g.left,g.index,g.flags.join(','),g.assistUsed,g.routeHint,g.boostUsed,sound,message,chapter,meta.unlocked].join('|');if(!force&&sig===lastSignature)return;lastSignature=sig;
 const lights=hard?g.level.requires.length:g.level.nodes.length,done=hard?g.level.requires.filter(id=>g.flags.includes(id)).length:g.level.nodes.filter(n=>g.flags.includes(n.id)).length;
 hud.innerHTML=btn('‹ 选关','levels','small')+`<div class="name"><strong>第 ${g.index+1} 关</strong><span>剩 ${g.left} 发${lights?(hard?' · 机关 ':' · 亮灯 ')+done+'/'+lights:''}</span></div><div class="right">${btn('提示','help','small',g.phase==='flight')}${btn('暂停','pause','small')}</div>`;
 let body='';
 if(view==='levels')body=`<h1>再弹一次 <small>${hard?'困难机关 · 50关':'普通版 · 新50关'}</small></h1><p>${hard?'规划机关顺序，破解镜面、传送与分流。':'观察通道，找准折返点。'}</p><div class="chapter-nav">${btn('‹','chapter:'+Math.max(0,chapter-1),'small',chapter===0)}<b>${LEVELS[chapter*5].chapter} · ${chapter*5+1}–${chapter*5+5}</b>${btn('›','chapter:'+Math.min(9,chapter+1),'small',chapter===9)}</div><div class="levels">${LEVELS.slice(chapter*5,chapter*5+5).map((l,j)=>{const i=chapter*5+j,b=meta.best[i];return btn(`<b>${i+1}</b><span>${l.name}</span><small>${i>=meta.unlocked?'未解锁':b?'★'.repeat(b.stars):l.shots+' 次发射'}</small>`,'level:'+i,'level'+(b?' cleared':''),i>=meta.unlocked)}).join('')}</div><div class="row">${savedRun||g.used?btn('继续当前关','continue','gold',g.phase==='won'):btn('开始闯关','level:'+Math.min(meta.unlocked-1,49),'gold')}${camp?'':btn('无尽模式','home')}${camp?btn('返回营地','exit'):btn('玩法说明','rules')}</div><p class="foot">已通关 ${Object.keys(meta.best).length}/50 · 免费重试不限次</p>`;
 else if(view==='tutorial')body=tutorialBody(tutorialQueue[tutorialAt],tutorialAt+1,tutorialQueue.length,btn);
 else if(view==='help')body=`<h2>关卡提示</h2><p>${g.level.hint}</p><div class="help"><b>显示正确路线</b><p>观看完成后显示全程虚线。免费重试保留提示。</p>${btn(g.routeHint?'路线提示已开启':'模拟广告 · 显示路线','ad:route','gold',g.routeHint)}</div>${g.index>=3?`<div class="row">${btn(g.boostUsed?'补发已使用':'模拟广告 · 多一发','ad:extra','',g.boostUsed)}</div>`:''}${message?`<p role="status">${message}</p>`:''}<div class="row">${btn('返回','close','gold')}${btn('免费重试','retry')}</div>`;
 else if(view==='ad')body=`<h2>${adKind==='route'?'显示正确路线':'增加一次发射'}</h2><p>开发模拟广告；完成后获得帮助。</p><div class="row">${btn('模拟观看完成','adComplete','gold')}${btn('取消','adCancel')}${btn('加载失败','adFail')}</div>`;
 else if(view==='pause')body=`<h2>已暂停</h2><div class="row">${btn('继续','close','gold')}${btn('免费重试','retry')}${btn(sound?'音效：开':'音效：关','sound')}</div><div class="row">${btn('玩法教程','tutorial')}${btn('选择关卡','levels')}${btn('全屏横屏','fullscreen')}</div>${camp?`<div class="row">${btn('返回营地','exit')}</div>`:''}`;
 else if(view==='rules')body=`<h2>${hard?'困难机关玩法':'普通版玩法'}</h2><p>左右滑动调整方向，松手发射；轻点目标方向也可射击。拖到右下角“取消”后松手，不消耗发射次数。</p><p>${hard?'先看每关的机关目标：收集钥匙、转动镜面、穿越传送门或分流双珠。遇到新机关会自动播放免费教程，也可在暂停菜单重看。':'石墙都能反弹。先点亮青色圆点，再碰到金色光环；圆点无需顺序，进度跨发射保留。普通预测线显示一次折返。'}</p><p>${hard?'50 关按十章逐步引入和组合机关。':'50 关逐步增加绕行与目标。'}免费重试不限次，提示为可选模拟广告。</p>${btn('返回','levels','gold')}`;
 else if(!view&&g.phase==='won')body=`<h2>第 ${g.index+1} 关完成</h2><div class="stars">${'★'.repeat(meta.best[g.index].stars)}</div><p>本次 ${g.used} 发 · 最佳 ${meta.best[g.index].shots} 发</p><div class="row">${btn(g.index<49?'下一关':'五十关完成','next','gold')}${btn('再试一次','retry')}${btn('选关','levels')}</div>`;
 else if(!view&&g.phase==='failed')body=`<h2>再调整一下方向</h2><p>亮点进度可用补发保留，或免费重新挑战。</p><div class="row">${btn('免费重试','retry','gold')}${btn('查看提示','help')}${btn('选关','levels')}</div>`;
 overlay.innerHTML=body?`<div class="scrim"><section class="panel ${view==='tutorial'?'tutorial-panel':''}">${body}</section></div>`:`<div class="caption">${g.phase==='flight'?'弹珠飞行中':g.routeHint?(g.route()?'青色虚线为参考路线 · 可以调整大概方向':'剩余发数不足 · 免费重试保留提示'):g.level.objective}</div>`;
 drawPuzzle(g,canvas,angle,lastAim);
}
function act(action){
 audio.enabled=sound;audio.unlock();const [a,id]=action.split(':');
 if(a==='tutorialNext'){finishTutorial();return}if(a==='tutorialSkip'||a==='close'&&view==='tutorial'){finishTutorial(true);return}
 if(a==='cancelAim'){clearAim();return}
 if(a==='tutorial'){if(g.phase==='flight')return;openTutorial(true,view==='help'||view==='pause'?view:'');ui(true);return}
 if(a==='chapter'){chapter=Math.max(0,Math.min(9,Number(id)));ui(true);return}
 if(a==='level'){start(Number(id));return}if(a==='next'){g.index<49?start(g.index+1):act('levels');return}
 if(a==='retry'){const hint=g.routeHint;start(g.index);if(hint){g.routeHint=true;g.assistUsed=true;save();ui(true)}return}
 if(a==='exit'){clearAim();save();send('exit');return}if(a==='home'){clearAim();save();const url=new URL('index.html',location.href);url.search=location.search;url.searchParams.delete('difficulty');location.href=url.href;return}
 if(a==='continue'||a==='close'){clearAim();view='';hostPaused=false;message='';if(a==='continue'&&g.phase==='aim')openTutorial();landscape()}
 else if(['levels','pause','help','rules'].includes(a)){if(a==='help'&&g.phase==='flight')return;clearAim();view=a;save()}
 else if(a==='sound'){sound=!sound;audio.enabled=sound;if(!sound)audio.suspend();save()}
 else if(a==='fullscreen')landscape();
 else if(a==='ad'){if(!['aim','failed'].includes(g.phase))return;if(id==='route'){if(g.routeHint)return}else if(id!=='extra'||g.index<3||g.boostUsed)return;adKind=id;view='ad';clearAim()}
 else if(a.startsWith('ad')){if(view!=='ad')return;const outcome=a==='adComplete'?'complete':a==='adCancel'?'cancel':'fail';adKind==='route'?g.unlockRoute(outcome):g.help(adKind,outcome);view=outcome==='complete'&&g.phase==='aim'?'':'help';message=outcome==='fail'?'加载失败，未消耗帮助次数。':outcome==='cancel'?'已取消，未消耗帮助次数。':'';save()}
 ui(true);
}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled)act(b.dataset.action)});
function at(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*640/r.width,y:(e.clientY-r.top)*360/r.height}}
document.addEventListener('pointerdown',e=>{if(e.target.closest('button,.scrim'))return;if(!e.isPrimary){clearAim();return}if(e.button!==0||view||hostPaused||g.phase!=='aim')return;e.preventDefault();audio.enabled=sound;audio.unlock();pointer={id:e.pointerId,gesture:new AimGesture(at(e),g.level.origin,lastAim)};canvas.setPointerCapture(e.pointerId);angle=pointer.gesture.angle;cancel.hidden=false;drawPuzzle(g,canvas,angle,lastAim)});
document.addEventListener('pointermove',e=>{if(pointer?.id!==e.pointerId)return;e.preventDefault();angle=pointer.gesture.move(at(e));drawPuzzle(g,canvas,angle,lastAim)});
document.addEventListener('pointerup',e=>{if(pointer?.id!==e.pointerId)return;const r=cancel.getBoundingClientRect(),cancelled=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;const gesture=pointer.gesture;angle=gesture.move(at(e));const fire=gesture.canFire&&!cancelled&&!view&&!hostPaused;const shotAngle=angle;clearAim();if(fire){lastAim=shotAngle;g.shoot(shotAngle);save()}ui(true)});
document.addEventListener('pointercancel',clearAim);canvas.addEventListener('lostpointercapture',clearAim);canvas.addEventListener('contextmenu',e=>e.preventDefault());
function pause(){hostPaused=true;clearAim();audio.suspend();save()}
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('focus',()=>hostPaused=false);window.addEventListener('pagehide',save);window.addEventListener('resize',clearAim);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.source!=='camp-host')return;const d=e.data;if(d.command==='pause')pause();if(d.command==='resume'||d.command==='enter'){hostPaused=false;if(Array.isArray(d.cosmetics)){g.orbSkin=['rose','mint','comet','violet','amber'].find(s=>d.cosmetics.includes(s+'-orb'))||'cyan';g.campFlag=d.cosmetics.includes('flag')}ui(true)}if(d.command==='sound'){sound=!!d.enabled;audio.enabled=sound}if(d.command==='ui-action'&&d.action==='pause')act('pause')});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(pointer)clearAim();else if(view==='levels')act(camp?'exit':'home');else act(view?'close':'pause')}if(e.key.toLowerCase()==='f'){document.fullscreenElement?document.exitFullscreen?.():document.documentElement.requestFullscreen?.()}});
let prev=performance.now(),lastPhase='';function tick(now){const dt=Math.min(.04,(now-prev)/1000);prev=now;if(!view&&!hostPaused){g.step(dt);audio.consume(g.sounds.splice(0),sound);if(g.phase!==lastPhase){lastPhase=g.phase;ui(true);save()}else ui()}drawPuzzle(g,canvas,angle,lastAim);if(view==='tutorial')drawTutorial(document.querySelector('#tutorialDemo'),tutorialQueue[tutorialAt],now);requestAnimationFrame(tick)}
window.advanceTime=ms=>{let t=Math.min(60000,Math.max(0,ms));while(t>0&&!view&&!hostPaused){g.step(Math.min(t,16.667)/1000);t-=16.667}ui();save();drawPuzzle(g,canvas,angle,lastAim)};
window.render_game_to_text=()=>JSON.stringify({...g.describe(),mode:hard?'hard-puzzle':'normal-puzzle',campaign,view,aim:{active:!!pointer,degrees:angle===null?null:angle*180/Math.PI,lastDegrees:lastAim*180/Math.PI},hostPaused,unlocked:meta.unlocked,tutorial:view==='tutorial'?tutorialQueue[tutorialAt]:null});
window.Puzzle={get game(){return g},get tutorial(){return view==='tutorial'?tutorialQueue[tutorialAt]:null},meta,start,act};ui(true);requestAnimationFrame(tick);send('ready');
const reviewLevel=Number(new URLSearchParams(location.search).get('level'));
if(review&&Number.isInteger(reviewLevel)&&reviewLevel>=1&&reviewLevel<=50)start(reviewLevel-1);
window.CampBack=()=>{if(pointer){clearAim();return true}if(view==='levels'||!view)return false;act(view==='ad'?'adCancel':'close');return true;};
