from pathlib import Path
import json,hashlib,shutil,zipfile,sys
sys.stdout.reconfigure(encoding='utf-8')
p=Path(__file__).resolve().parents[1];out=p.parent
apk=p/'android/app/build/outputs/apk/debug/app-debug.apk'
sha=hashlib.sha256(apk.read_bytes()).hexdigest()
report=json.loads((p/'artifacts/release-1.91.2/resource-audit.json').read_text(encoding='utf-8'))
assert report['apkSha256']==sha
for key in ['missingFromApk','differentFromApk','extraInApk','stagedMissing','stagedDifferent']:
 assert not report[key],key
assert report['zipCorruption'] is None
notes='''# 再来亿把 1.91.2 · 普通弹珠瞄准修复

- 修复滑到 ±89.5° 后积累多余位移的问题。每次拖动独立更新角度，反向移动立即响应。
- 游戏画面外的两侧/上下空白区域也接受瞄准拖动，关卡状态文字不再拦截触摸。菜单按钮保持可点击。
- 恢复普通版简洁界面样式；取消瞄准按钮固定在右下角，瞄准时不再挤入左上角。
- 桌面「再弹一次」源码已同步。保留普通50关、无尽模式及当前合集其他玩法。
- 按用户最终指定使用版本名 1.91.2，版本码24；电脑原工程版本名为1.19.1、版本码23。包名与既有签名不变。

验证：191项合集Node测试通过；全部50关及±1.5°容错路线通过；合集/独立版的触控拖动、极限角度反向、长按、取消、松手发射、暂停、提示及存档回归通过。640×360、844×390、1280×720、390×844界面检查通过。普通入口/返回无尽流程通过，原始游戏测试客户端第一关真实发射通关。打包资源也完成四尺寸触控回归。
APK全部运行资源与源码/暂存资源逐项哈希核对通过，ZIP无损坏，v1/v2签名验证通过。没有连接Android真机，尚未完成实机安装、触控与音效验收。

完整可修改源码随附。合集既有合作地图来自Initials Video Games的SuperLemonadeFactoryOUYA，GPL-3.0；保留games/coop/third_party/slf版权、许可证、原始地图与导入工具。
构建：node android/pack-assets.mjs；JDK17、SDK36、Gradle8.13执行 gradle --offline -p android assembleDebug。
'''
notes+='\nAPK SHA256：'+sha+'\n'
(p/'android/发布核对-1.91.2.md').write_text(notes,encoding='utf-8')
(out/'再来亿把-1.91.2-说明.md').write_text(notes,encoding='utf-8')
dest=out/'再来亿把-1.91.2.apk'
for target in [dest,out/'再来亿把.apk',Path('C:/Users/24308/Desktop/再弹一次/再来亿把-1.91.2.apk')]:
 shutil.copyfile(apk,target);assert hashlib.sha256(target.read_bytes()).hexdigest()==sha
release={'version':'1.91.2','versionCode':24,'bytes':apk.stat().st_size,'sha256':sha,'packedFilesVerified':len(report['manifest']),'nodeTests':191,'physicalAndroidTested':False}
(p/'artifacts/release-1.91.2/release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2),encoding='utf-8')
archive=out/'再来亿把-1.91.2-完整源码.zip'
excluded={'node_modules','.git','.gradle','build','output','artifacts','__pycache__','.idea'}
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 z.writestr('adventure-camp/交付说明-1.91.2.md',notes)
 for f in p.rglob('*'):
  if not f.is_file():continue
  r=f.relative_to(p)
  if any(x in excluded for x in r.parts):continue
  if r.parts[:6]==('android','app','src','main','assets','web'):continue
  if f.name in ['dev-wallets.json','local.properties'] or 'keystore' in f.name.lower() or f.suffix in ['.apk','.log','.jks']:continue
  z.write(f,'adventure-camp/'+r.as_posix())
print(json.dumps(release,ensure_ascii=False));print(str(dest))
