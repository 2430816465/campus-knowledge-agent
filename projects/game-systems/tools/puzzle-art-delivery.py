from pathlib import Path
import json,shutil
from PIL import Image
import numpy as np
root=Path(__file__).resolve().parent.parent
desktop=Path('C:/Users/24308/Desktop/再弹一次')
integration=root/'tools/puzzle-integration.mjs'
s=integration.read_text(encoding='utf-8')
needle="await frame.locator('[data-action=\"level:0\"]').click();const b="
replacement="await frame.locator('[data-action=\"level:0\"]').click();while(await frame.evaluate(()=>!!Puzzle.tutorial))await frame.locator('[data-action=tutorialNext]').click();const b="
if needle in s: integration.write_text(s.replace(needle,replacement),encoding='utf-8')
assets=root/'games/marble/assets/puzzle'
qc=[]
for f in sorted(assets.glob('*.png')):
    im=Image.open(f).convert('RGBA');a=np.asarray(im)
    box=im.getbbox();magenta=int(((a[:,:,0]>245)&(a[:,:,2]>245)&(a[:,:,1]<10)&(a[:,:,3]>0)).sum())
    if magenta: raise ValueError('Magenta remained in '+f.name)
    qc.append({'file':f.name,'size':list(im.size),'bbox':box,'transparent_fraction':float((a[:,:,3]==0).mean()),'visible_magenta':magenta})
(root/'output/puzzle-art-v1/asset-qc.json').write_text(json.dumps(qc,indent=2),encoding='utf-8')
doc='''# 再弹一次 · 像素美术与机制教学验收

本轮重绘闯关模式的特殊球与障碍；原50关布局、物理、发数和奖励规则保留。

## 打开新版

- 电脑：[全部50关验收](http://127.0.0.1:4173/games/marble/puzzle.html?review=1&art=1)。
- 手机同一网络：[手机验收](http://192.168.3.24:4173/games/marble/puzzle.html?review=1&art=1)。电脑预览服务需要保持运行。
- 桌面独立工程：[独立验收](http://127.0.0.1:4180/puzzle.html?review=1&art=1)。
- 若此前页面仍打开，请刷新；电脑可用 Ctrl+F5。

## 这轮改动

- 23张实际像素素材：出口、两类传送门、分裂晶体、机关、钥匙、顺序星印、蓄能晶体、方向封印、转镜齿轮、符文、分流印、发射台、弹珠，以及永久/一次镜面、地砖、石墙、裂墙、门墙和尖刺。
- 场上球体/机关不再带文字。方向用箭头外形；顺序用底座灯数；蓄能用灯条；传送门按颜色和造型配对。
- 19种免费机关教程，首次遇到自动出现，每个教程使用实际图案和运动示意，解释触发条件、跨发射保留或同发重置规则。右上角“教程”可随时重看，“稍后再看”可跳过。
- 教程期间暂停，不消耗发数或帮助额度。全屏场地与横屏尺寸保留，菜单统一深蓝铜金像素遗迹风格。
- 冒险营地原有弹珠配色与旗帜外观继续可用。

## 建议验收

先看1–3关的发射/反弹教学，再看17关顺序灯、21/41关传送配对、27关碎镜、31关分裂、47关复合条件、50关综合画面。

已用浏览器验证50关实际触控无帮助通关与完整提示通关、19种教程、跳过/重看/保存，以及667×375、915×412、390×844、1280×720布局。此结果验证规则与显示流程，不替代真机手感验收。

本轮没有制作或更新安装包。真实广告SDK尚未接入，帮助入口仍明确标记为开发模拟。
'''
(desktop/'像素美术与教程-验收说明.md').write_text(doc,encoding='utf-8')
old=desktop/'遗迹闯关-验收说明.md'
s=old.read_text(encoding='utf-8').replace('同字母配对','同颜色、同造型配对').replace('橙色虚线镜面','铜橙端头裂镜')
if '像素美术与教程-验收说明' not in s:s+='\n\n新美术与免费机关教程已接入，详见 [本轮验收说明](像素美术与教程-验收说明.md)。\n'
old.write_text(s,encoding='utf-8')
shutil.copyfile(desktop/'像素美术与教程-验收说明.md',root/'output/puzzle-art-v1/验收说明.md')
progress=root/'progress.md'
with progress.open('a',encoding='utf-8') as f:
    f.write('''\n## 再弹一次 · 像素美术和全部特殊球重绘（2026-10-01）
- User asked to redraw every special ball and obstacle, remove object writing, and teach each new mechanism; no APK update, browser acceptance first.
- Built-in image_gen supplied four raw images. Postprocessed 16 compact prop sprites, two mirror strips, four texture tiles and one hazard sprite; all 23 loaded assets, nearest-neighbor 640x360 rendering, navy/bronze UI, cosmetic color/flag preservation. Raw source, backups, provenance and alpha/QC saved in output/puzzle-art-v1.
- Added nineteen free visual guides with actual icons and animated diagrams, introduced by actual map mechanisms; pause with no shots/rewards consumed, persisted seen flags independent of game geometry, manual replay from HUD/help/pause, skip to the previous view. Removed labels from objects; lamp count encodes relay order, direction uses art arrow, portal pairs use color and shape.
- PASS 2917 exact physics replays and all 50 actual touch free/hint clears after replacement. PASS nineteen guide introductions/replay/skip/save, pause integrity, three guide sizes, branch play and zero page/resource errors. Develop-web-game supplied client screenshot/text inspected. No real Android/native orientation or ad SDK validation.
- Synced all new assets/modules to Desktop/再弹一次; wrote 像素美术与教程-验收说明.md. Next: user visual acceptance and actual phone readability; APK remains outside this task.
''')
print('QC 23 assets: no visible magenta; delivery documentation and progress updated.')
