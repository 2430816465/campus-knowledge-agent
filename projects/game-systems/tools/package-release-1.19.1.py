# coding: utf-8
from pathlib import Path
import zipfile,hashlib,json,shutil,sys
sys.stdout.reconfigure(encoding='utf-8');p=Path('.').resolve();out=p.parent;dst=out/'再来亿把-1.19.1.apk';asset=p/'android/app/src/main/assets/web'
hashes={hashlib.sha256(f.read_bytes()).digest():str(f.relative_to(asset)) for f in asset.rglob('*') if f.is_file()}
with zipfile.ZipFile(dst) as z:
 assert z.testzip() is None
 names=z.namelist();web=[n for n in names if n.startswith('assets/web/') and not n.endswith('/')]
 for n in web:
  b=z.read(n);f=asset/n[len('assets/web/'):]
  if f.exists():assert b==f.read_bytes(),n
  else:assert hashlib.sha256(b).digest() in hashes,n
 assert not any('remade-campaign.js' in n or 'campaign-catalog.js' in n for n in names)
 assert any(b'setPortrait' in z.read(n) for n in names if n.endswith('.dex'))
report={'version':'1.19.1','versionCode':23,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'bytes':dst.stat().st_size,'packedFilesVerified':len(web),'nodeTests':190,'cooperativeMaps':72,'fullRoutesVerified':['normal1','hard1'],'physicalAndroidTested':False}
(p/'artifacts/release-1.19.1/release.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
notes='''# 再来亿把 1.19.1\n\n本次新增浮动移动轮盘：战场空白处按住即可唤出，中心对准触点，松手隐藏并停下；扩大触控区域，保留跳跃、互动双指操作。640x360与844x390实触控事件模拟通过：三处起点、边缘对齐、左右移动、松手及取消停止、同时跳跃。保留1.19.0的UI和玩法更新。设置按声音/操作/画面分类，常用选项无需滚动。无尽守线默认竖屏；结束本局、结算及返回营地按钮使用深暖棕底、浅色粗体文字。\n再闯一关普通36+苦难36，旧50关模块已移除，升级时清除旧合作进度及续局。\n\n验证：190项Node测试通过。72地图来源、加载和7组机关测试通过；普通和苦难首关正常操作通关。360x640、390x844、640x360、844x390设置无滚动及裁切，十款游戏营地菜单检查通过。APK资源逐字节/哈希核对、ZIP和签名验证通过。\n限制：未连接实体Android手机；其他70关尚未完整通关，不能据此宣称全部路线及长期真机联机已验证。\n\n地图来源Initials Video Games的SuperLemonadeFactoryOUYA，GPL-3.0，版权、原始地图和导入工具见games/coop/third_party/slf和games/coop/tools。随附完整可修改源码，存档和签名私钥除外。\n构建：node android/pack-assets.mjs，然后JDK17/SDK36/Gradle8.13执行gradle --offline -p android assembleDebug。测试见package.json；新合作测试node tests/coop72-campaign.cjs、node tests/coop72-routes.cjs 0及36。\n'''
notes+='\nSHA256: '+report['sha256']+'\n'
(out/'再来亿把-1.19.1-说明.md').write_text(notes,encoding='utf-8');(p/'android/发布核对-1.19.1.md').write_text(notes,encoding='utf-8')
archive=out/'再来亿把-1.19.1-完整源码.zip';excluded={'node_modules','.git','.gradle','build','output','artifacts','__pycache__','.idea'}
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 z.writestr('adventure-camp/交付说明-1.19.1.md',notes)
 for f in p.rglob('*'):
  if not f.is_file():continue
  r=f.relative_to(p)
  if any(x in excluded for x in r.parts):continue
  if r.parts[:6]==('android','app','src','main','assets','web'):continue
  if any(x in f.name.lower() for x in ['wallet','keystore','local.properties']) or f.suffix in ['.apk','.log','.jks']:continue
  z.write(f,'adventure-camp/'+r.as_posix())
print(json.dumps(report));print('source_zip_bytes',archive.stat().st_size)

