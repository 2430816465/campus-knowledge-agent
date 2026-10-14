"""One-time, backed-up migration from the audited 1.20.0 source."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]
BACKUP=ROOT/'versions'/'before-1.21.0'
def edit(name, fn):
    path=ROOT/name
    dest=BACKUP/name
    if not dest.exists():
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(path,dest)
    old=path.read_text(encoding='utf-8')
    new=fn(old)
    if new!=old:path.write_text(new,encoding='utf-8')
def replace(name,old,new):
    def change(s):
        if old not in s:raise ValueError(name+': expected text missing')
        return s.replace(old,new)
    edit(name,change)
replace('live-games.js',"if(id==='marble'&&options.choice!==1){if(window.CampOrientation?.setPortrait)window.CampOrientation.setPortrait();else window.CampOrientation?.setLandscape?.(false);}else if(id==='marble'||id==='liars'||id==='workshop'||id==='chess')", "if(id==='marble'||id==='liars'||id==='workshop'||id==='chess')")
replace('games/marble/main.js','requestPortrait();','requestLandscape(true);')
replace('screen-pages.js',".filter(visible);document.documentElement.dataset.fitMenu", ".filter(e=>visible(e)&&!e.closest('[data-fit-native]'));document.documentElement.dataset.fitMenu")
replace('games/coop/index.html','id="home" class="screen home-screen"','id="home" class="screen home-screen" data-fit-native')
replace('games/coop/index.html','五章 · 50 个合作挑战','普通 36 关 · 困难 36 关')
replace('games/coop/index.html','无需安装','单人 / 局域网')
replace('games/coop/index.html','<div class="home-columns">','<button id="chooseLevel" class="button button-secondary" type="button" aria-expanded="false">选择关卡 ▾</button><div class="home-columns">')
replace('games/coop/index.html','<link rel="stylesheet" href="css/style.css">','<link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/compact-home.css">')
replace('games/coop/src/client.js',"window.CampBridge?.coopAward(soloSession.award.id, Game.LEVELS[soloSession.world.levelIndex].id)","window.CampBridge?.coopAward(soloSession.award.id, Game.LEVELS[soloSession.world.levelIndex].id)")
replace('games/camp-bridge.js',"finish('coop-'+id,true,level)","finish('coop-'+id,true,level,{campaign:'slf-72-v1',levelId:level,difficulty:level<=86?'normal':'hard'})")
replace('games/camp-bridge.js',"finish('coop-'+coop.selfAward.id,true,coop.world?.levelIndex+1)","window.CampBridge.coopAward(coop.selfAward.id,window.RushGame?.LEVELS?.[coop.world?.levelIndex]?.id ?? (51+coop.world?.levelIndex))")
replace('economy.js',"if(mode==='coop'&&Number.isInteger(score)&&score>=1&&score<=50)return 'coop-level-'+score;", "if(mode==='coop'){\n  if(details.campaign==='slf-72-v1'&&Number.isInteger(details.levelId)&&details.levelId>=51&&details.levelId<=122&&score===details.levelId)return 'coop-slf-72-v1-'+details.levelId;\n  if(Number.isInteger(score)&&score>=1&&score<=50)return 'coop-level-'+score;\n }")
replace('services.js','campaign:details.campaign}};','campaign:details.campaign,levelId:details.levelId,difficulty:details.difficulty}};')
# Player-facing rename only; source attribution and license files remain intact.
for folder in ['games/coop']:
    for p in (ROOT/folder).rglob('*'):
        if 'third_party' in p.parts or not p.is_file() or p.suffix not in ['.js','.html','.css','.json']:continue
        if '苦难' in p.read_text(encoding='utf-8'):
            edit(str(p.relative_to(ROOT)),lambda s:s.replace('苦难','困难'))
edit('services.js',lambda s:s.replace('苦难','困难'))
with (ROOT/'progress.md').open('a',encoding='utf-8') as f:
    f.write('\n\n## 1.21.0 综合优化（用户批准调整与合规发行）\n以 1.20.0 为基线优化十款 Android 游戏。无尽守线改横屏；保留人物动作及合作地图；修复布局与72关奖励；统一模拟广告、补来源许可与对应源码。抖音移植和正式 SDK 后续单独验收。修改前源码保存于 versions/before-1.21.0。\n')
print('Applied first integration fixes; originals backed up.')
