from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'app.js';s=p.read_text(encoding='utf-8')
old='<button class="wallet" data-action="wallet"'
new='<button class="square camp-settings-entry" data-action="settings" aria-label="设置">${icon(\'gear\')}</button><button class="wallet" data-action="wallet"'
assert old in s;s=s.replace(old,new,1)
start=s.index('function menu(){');end=s.index('\nasync function startGame',start)
s=s[:start]+'''let settingsTab='sound';
function syncPreferences(){
 const settings=api.get().settings;window.WoodUI?.update(settings);
 document.querySelectorAll('iframe.game-frame').forEach(frame=>frame.contentWindow?.postMessage({source:'camp-host',command:'preferences',settings},location.origin));
 host.active?.sound?.(settings.sound);
}
function openSettings(tab=settingsTab){settingsTab=tab;show('设置',settingsBody(api.get().settings,tab),'settings');}
function menu(){
 host.active?.pause?.();
 const multiplayer=['chess','liars'].includes(mode.id)||(mode.id==='coop'&&(choice.coop||0)===0);
 const note=mode.id==='chess'?'牌局仍在进行；离席由机器人接替，手机房主退出会关闭房间。':mode.id==='liars'?'牌局仍在进行；离席会取消未完成牌局，手机房主请保持前台。':multiplayer?'联机世界仍在运行；手机房主请保持前台。':'本局已暂停';
 show(multiplayer?'冒险菜单':'冒险暂停',`<p class="wood-menu-note">${mode.name} · ${note}</p>${btn(icon('arrow')+' 继续冒险','close','primary full wood-continue')}<div class="wood-menu-tools">${btn(icon('gear')+' 本局设置','menu-settings','secondary')}${btn(icon('book')+' 玩法说明','menu-help','secondary')}</div>${gameActions().includes('data-action')?`<details class="wood-menu-more"><summary>本局进度与专属选项</summary>${gameActions()}</details>`:''}${btn('返回营地','exit-game','quiet full wood-exit')}`,'menu');
 modal.querySelector('[data-action="close"].wood-continue')?.focus({preventScroll:true});
}
''' + s[end:]
s=s.replace("gain.gain.value=ambient?.012:.025;","gain.gain.value=(ambient?.012:.025)*((ambient?api.get().settings.musicVolume??60:api.get().settings.soundVolume??80)/100);")
s=s.replace("case 'menu-help':menuReturn=true;help();break;","case 'menu-help':menuReturn=true;help();break;\n case 'settings':menuReturn=false;openSettings();break;\n case 'menu-settings':menuReturn=true;openSettings();break;\n case 'settings-tab':openSettings(id);modal.querySelector(`[data-action=\"settings-tab:${id}\"]`)?.focus();break;\n case 'wood-defaults':for(const [key,value]of Object.entries({music:false,sound:true,vibration:false,musicVolume:60,soundVolume:80,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}))api.settings(key,value);syncPreferences();updateMusic();openSettings();toast('已恢复默认设置');break;\n case 'wood-fullscreen':if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen?.();break;")
s=s.replace("case 'defaults':for(const [k,v]of Object.entries({music:false,sound:true,vibration:false}))api.settings(k,v);updateMusic();render();toast('已恢复默认设置');break;","case 'defaults':for(const [k,v]of Object.entries({music:false,sound:true,vibration:false}))api.settings(k,v);syncPreferences();updateMusic();render();toast('已恢复默认设置');break;")
s=s.replace('不影响四款真实游戏。','不清除各游戏的独立存档。')
old="api.settings(e.target.dataset.setting,e.target.checked);if(e.target.dataset.setting==='music')updateMusic()"
new="api.settings(e.target.dataset.setting,e.target.checked);syncPreferences();if(e.target.dataset.setting==='music')updateMusic();const label=e.target.nextElementSibling;if(label?.tagName==='EM')label.textContent=e.target.checked?'开':'关'"
assert old in s;s=s.replace(old,new)
pos=s.index("document.addEventListener('keydown'")
s=s[:pos]+'''document.addEventListener('input',e=>{
 const key=e.target.dataset.volume;if(!key)return;
 const value=Number(e.target.value);try{
  api.settings(key,value);api.settings(key==='musicVolume'?'music':'sound',value>0);syncPreferences();
  if(key==='musicVolume')updateMusic();
  e.target.style.setProperty('--range',value+'%');e.target.parentElement.querySelector('output').textContent=value;
 }catch{toast('设置保存失败，请检查存储权限');}
});
''' + s[pos:]
s=s.replace('1.15.0 · 像素营地','1.16.0 · 像素木牌')
p.write_text(s,encoding='utf-8')
p=ROOT/'views.js';s=p.read_text(encoding='utf-8');s=s.replace('<h2>${icon(\'gear\')} 营地设置</h2>','<h2>${icon(\'gear\')} 营地设置</h2>');s=s.replace("${btn(icon('book')+' 玩法帮助','help-all','secondary')}${btn('恢复默认设置','defaults','quiet')}","${btn(icon('gear')+' 完整设置','settings','primary')}${btn(icon('book')+' 玩法帮助','help-all','secondary')}");p.write_text(s,encoding='utf-8')
# Propagate common preferences at actual frame-ready time.
p=ROOT/'live-games.js';s=p.read_text(encoding='utf-8');s=s.replace("send('sound',{enabled:options.sound});", "send('sound',{enabled:options.sound});send('preferences',{settings:window.WoodUI?.preferences||{}});");s=s.replace("if(id==='coop'&&e.data.type==='menu')", "if(e.data.type==='menu')");p.write_text(s,encoding='utf-8')
p=ROOT/'evolve-host.js';s=p.read_text(encoding='utf-8');s=s.replace("send('sound',{enabled:options.sound});", "send('sound',{enabled:options.sound});send('preferences',{settings:window.WoodUI?.preferences||{}});");p.write_text(s,encoding='utf-8')
for rel in ['package.json','android/app/build.gradle','android/app/src/main/java/com/adventurecamp/game/MainActivity.java']:
 p=ROOT/rel;s=p.read_text(encoding='utf-8').replace('1.15.0','1.16.0')
 if rel.endswith('build.gradle'):s=s.replace('versionCode 18','versionCode 19')
 p.write_text(s,encoding='utf-8')
print('Settings, menu hierarchy and native version updated')
