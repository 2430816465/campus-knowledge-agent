from pathlib import Path
root=Path.cwd()
for name in ['android/app/build.gradle','android/app/src/main/java/com/adventurecamp/game/MainActivity.java','app.js']:
 p=root/name;s=p.read_text(encoding='utf-8');assert '1.3.0' in s,name;s=s.replace('1.3.0','1.4.0').replace('AdventureCampAndroid/1.3','AdventureCampAndroid/1.4').replace('全屏弹珠版','自由瞄准版');
 if name.endswith('build.gradle'):s=s.replace('versionCode 3','versionCode 4')
 p.write_text(s,encoding='utf-8')
p=root/'progress.md';p.write_text(p.read_text(encoding='utf-8')+'''\n## 2026-09-29 Lower early density / 180° aiming / APK 1.4.0 (code 4)
- Audit: previous run started with 280 spirits, gained 32+ per shot, and aiming was clamped at ±1.12/1.25 radians; early battlefield quickly hit the 620 cap.
- New run starts with 110 spirits. Active population target is 110 + 4 per shot through shot 35, then +8 per shot, capped at 580. Spawn after each descent fills only the gap to target; physical placement may yield fewer. Drop and Boss HP growth remain, so late pressure continues to outrun capped abilities.
- New V4 revision 3 trims excessive opening population from revision 2 saves through shot 14. New aiming handles the upper semicircle; preview, fire, and touch release share this range. Returning to/below the launcher cancels.
- Deterministic simulations: starting 110, shot 10 target 150, shot 30 target 230, shot 60 target 420. Three seed gameplay simulations continue into late pressure with varied builds. Both ±88.7° directions fired through touch in integrated and standalone pages, shot advanced, no console errors. State, browser, fullscreen, landscape touch, and skill Playwright client passed.
''',encoding='utf-8')
p=Path('C:/Users/24308/Desktop/再弹一次/README.md');s=p.read_text(encoding='utf-8');s=s.replace('1.3.0','1.4.0').replace('冒险营地-再弹一次全屏版-1.4.0.apk','冒险营地-再弹一次自由瞄准版-1.4.0.apk');p.write_text(s+'\n## 难度与瞄准更新 1.4.0\n新局初始 110 个游魂，战场目标数量按发射次数从第 0 发 110 个、第 10 发 150 个、第 30 发 230 个逐渐增多；原早期存档也会调低密度。触摸可在上方 180° 方向瞄准。安装包：冒险营地-再弹一次自由瞄准版-1.4.0.apk。\n',encoding='utf-8')
