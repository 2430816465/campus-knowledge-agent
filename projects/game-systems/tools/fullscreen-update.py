from pathlib import Path
root=Path.cwd()
def edit(name,old,new):
 p=root/name;s=p.read_text(encoding='utf-8');assert old in s,(name,old[:70]);p.write_text(s.replace(old,new),encoding='utf-8')
edit('views.js','return `<div class="game-toolbar">', 'return `${mode.id===\'marble\'?\'\':`<div class="game-toolbar">')
edit('views.js','</span></div><section class="live-game">','</span></div>`}<section class="live-game">')
p=root/'unified.css';p.write_text(p.read_text(encoding='utf-8')+'\nbody[data-page="preview"][data-mode="marble"] .live-game{height:100dvh;height:100svh}\n',encoding='utf-8')
edit('games/marble/ui-endless.js','<b>再弹一次 <small>第 ${r.shot+1} 发</small></b>','<b>第 ${r.shot+1} 发</b>')
edit('games/marble/ui-endless.js','<button data-action="landscape" aria-label="全屏横屏">⛶</button></header>','<button class="arena-settings" data-action="togglePanel" aria-label="能力与设置" aria-controls="arena-settings" aria-expanded="${!!g.panelOpen}">⚙</button></header>')
edit('games/marble/ui-endless.js','<aside class="arena-sidebar">','${g.panelOpen?\'<button class="arena-backdrop" data-action="togglePanel" aria-label="收起设置"></button>\':\'\'}<aside id="arena-settings" class="arena-sidebar" ${g.panelOpen?\'\':\'hidden\'} aria-label="能力与设置"><header class="arena-panel-head"><b>能力与设置</b><button data-action="togglePanel" aria-label="收起设置">×</button></header><small class="arena-panel-note">查看时战斗暂停</small>')
edit('games/marble/ui-endless.js','<div class="arena-support"><small>','<div class="arena-support"><div class="arena-panel-tools">'+ '${btn(\'声音开关\',\'sound\')}${btn(\'全屏\',\'landscape\')}${btn(\'暂停 / 返回\',\'pause\')}</div><small>')
edit('games/marble/main.js','const box=field.getBoundingClientRect(),scale=Math.min((box.width-2)/640,(box.height-2)/360);board.style.width=640*scale+\'px\';board.style.height=360*scale+\'px\';','board.style.width=field.clientWidth+\'px\';board.style.height=field.clientHeight+\'px\';')
edit('games/marble/main.js',"const id=parts.join(':');if(a==='landscape')", "const id=parts.join(':');if(a==='togglePanel'){g.panelOpen=!g.panelOpen;pointer=null;g.cancelAim();lastUI='';ui();return}if(a==='landscape')")
edit('games/marble/main.js',"function startNew(challenge=false){requestLandscape();", "function startNew(challenge=false){g.panelOpen=false;requestLandscape();")
edit('games/marble/main.js',"function showScene(){if(!g.run)","function showScene(){if(g.run?.phase==='reward'||g.run?.phase==='result')g.panelOpen=false;if(!g.run)")
edit('games/marble/main.js',"if(a==='continue'){requestLandscape();", "if(a==='continue'){g.panelOpen=false;requestLandscape();")
edit('games/marble/main.js',"if(a==='resume'||a==='close'){overlay='';", "if(a==='resume'||a==='close'){if(a==='resume')g.panelOpen=false;overlay='';")
edit('games/marble/main.js',"||overlay||busy)return;const p=point", "||overlay||busy||g.panelOpen)return;const p=point")
edit('games/marble/main.js',"if(screen==='game'&&!overlay&&!g.paused)g.advance(dt)","if(screen==='game'&&!overlay&&!g.paused&&!g.panelOpen)g.advance(dt)")
edit('games/marble/main.js',"if(e.key==='Escape'&&overlay)","if(e.key==='Escape'&&g.panelOpen&&!overlay){act('togglePanel')}else if(e.key==='Escape'&&overlay)")
p=root/'games/marble/style.css';p.write_text(p.read_text(encoding='utf-8')+'''
/* Full viewport battlefield. Settings overlay never participates in field sizing. */
.arena-shell{position:relative;display:block;padding:0;isolation:isolate}
.arena-field{position:absolute;inset:0;border:0;border-radius:0}
html[data-game-ui="marble"] .arena-field #board{aspect-ratio:auto;object-fit:fill}
.arena-hud{position:absolute;z-index:4;top:max(4px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));height:38px;gap:14px;padding:0 5px;background:#101d2be8;border:0;font-size:12px;pointer-events:none}
.arena-hud>button{pointer-events:auto;min-width:40px;height:34px}.arena-hud>b{font-size:13px}.arena-hud>button:last-child{margin-left:auto}
.arena-status{bottom:max(3px,env(safe-area-inset-bottom));font-size:10px}
.arena-backdrop{position:absolute;inset:0;z-index:5;background:#030b1666!important;border:0!important;border-radius:0!important}
.arena-sidebar{position:absolute;z-index:6;right:max(8px,env(safe-area-inset-right));top:max(7px,env(safe-area-inset-top));bottom:max(7px,env(safe-area-inset-bottom));width:min(310px,calc(100% - 24px));padding:12px;background:#101c2ff7;border:1px solid #667891;border-radius:12px;box-shadow:0 8px 28px #0008;overflow:auto;box-sizing:border-box}
.arena-sidebar[hidden]{display:none}.arena-panel-head{display:flex;align-items:center;justify-content:space-between}.arena-panel-head button{width:40px;height:34px;font-size:24px}.arena-panel-note{color:#a6bbd2;font-size:11px}
.arena-sidebar .owned-powers{flex:1;min-height:50px}.arena-panel-tools{display:flex;gap:4px}.arena-panel-tools .m-btn{flex:1;font-size:11px;padding:5px 2px}.arena-sidebar .arena-support>button{min-height:38px}
.arena-choices{padding:50px max(14px,env(safe-area-inset-left)) 12px;z-index:3}.inline-cards{width:min(960px,100%);align-self:center}.arena-choices header{width:min(960px,100%);align-self:center}
@media(max-height:440px){.arena-hud{height:34px;gap:10px;font-size:10px}.arena-hud>button{height:30px}.arena-sidebar{gap:5px;padding:8px}.arena-panel-note{display:none}.arena-sidebar .arena-level{padding:5px}.arena-sidebar .arena-support>button{min-height:32px}.arena-choices{padding-top:42px}}
''',encoding='utf-8')
edit('games/marble/render-endless.js','scale=Math.max(1,(canvas.clientWidth||640)/640*(window.devicePixelRatio||1)),width=Math.round(C.width*scale),height=Math.round(C.height*scale)','scale=Math.min(2,window.devicePixelRatio||1),width=Math.round((canvas.clientWidth||C.width)*scale),height=Math.round((canvas.clientHeight||C.height)*scale)')
edit('android/app/build.gradle','versionCode 2','versionCode 3')
edit('android/app/build.gradle',"versionName '1.2.0'", "versionName '1.3.0'")
for name in ['app.js','android/app/src/main/java/com/adventurecamp/game/MainActivity.java']:
 p=root/name;s=p.read_text(encoding='utf-8').replace('1.2.0','1.3.0').replace('AdventureCampAndroid/1.2','AdventureCampAndroid/1.3').replace('横屏弹珠版','全屏弹珠版');p.write_text(s,encoding='utf-8')
edit('android/app/src/main/java/com/adventurecamp/game/MainActivity.java',"document.querySelector('[data-action=menu]')?.click();return true", "const m=document.querySelector('[data-action=menu]');if(m)m.click();else document.querySelector('iframe.game-frame')?.contentWindow.postMessage({source:'camp-host',command:'ui-action',action:'pause'},location.origin);return true")
edit('android/test-bundle.mjs',"count()===1,`shared menu for ${id}`", "count()===(id==='marble'?0:1),`shared menu for ${id}`")
