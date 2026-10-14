from pathlib import Path
import zipfile,hashlib
root=Path.cwd();apk=root/'android/app/build/outputs/apk/debug/app-debug.apk'
with zipfile.ZipFile(apk) as z:
 assert z.testzip() is None
 for name in ['views.js','unified.css','games/marble/main.js','games/marble/ui-endless.js','games/marble/style.css','games/marble/render-endless.js']:
  assert z.read('assets/web/'+name)==(root/name).read_bytes(),name
copies=[apk,Path('C:/Users/24308/Desktop/再弹一次/冒险营地-再弹一次全屏版-1.3.0.apk'),Path('C:/Users/24308/Desktop/总/冒险营地-当前版.apk')]
hashes=[hashlib.sha256(p.read_bytes()).hexdigest() for p in copies];assert len(set(hashes))==1
print('APK assets match source; all copies match SHA256:',hashes[0])
p=root/'progress.md';p.write_text(p.read_text(encoding='utf-8')+'''\n## 2026-09-29 Fullscreen arena / APK 1.3.0 (code 3)
- Removed marble collection toolbar; iframe occupies full viewport. Battle canvas fills field, HUD floats above it.
- Abilities, XP, optional simulated ads and settings moved to an initially collapsed overlay. Opening pauses simulation and cancels aim; closing resumes without resizing the field. Rewards remain inline.
- Native Android Back opens internal pause when no outer menu exists. Same application ID and signing certificate, bumped version and distinct APK filename.
- Verified host at 667x375, 844x390, 915x412, 1280x720: canvas 100% viewport, identical bounds while drawer open, touch launch, simulation paused in drawer, exit works. Floating HUD uses under 11% height, leaving >89% unobscured when collapsed.
- Passed state, browser (integrated/standalone), touch/card bounds, skill Playwright client and packaged four-mode tests. APK build/signature/ZIP/source-byte checks passed. No physical Android device connected; device orientation behavior not re-tested on hardware.
''',encoding='utf-8')
p=Path('C:/Users/24308/Desktop/再弹一次/README.md')
s=p.read_text(encoding='utf-8') if p.exists() else ''
s=s.replace('1.2.0','1.3.0').replace('冒险营地-再弹一次横屏版-1.3.0.apk','冒险营地-再弹一次全屏版-1.3.0.apk')
p.write_text(s+'\n## 全屏更新 1.3.0\n战场铺满窗口；原合集菜单行已移除。右上角齿轮展开能力、经验和可选广告帮助，展开时暂停，收起后继续，不挤占战场。安卓安装包：冒险营地-再弹一次全屏版-1.3.0.apk。\n',encoding='utf-8')
