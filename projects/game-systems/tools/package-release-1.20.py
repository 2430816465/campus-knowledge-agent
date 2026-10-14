from pathlib import Path
import json,hashlib,shutil,zipfile,sys
sys.stdout.reconfigure(encoding='utf-8')
p=Path(__file__).resolve().parents[1];out=p.parent;apk=p/'android/app/build/outputs/apk/debug/app-debug.apk'
audit=json.loads((p/'artifacts/ui-redesign/resource-audit.json').read_text(encoding='utf-8'))
for key in ['missingFromApk','differentFromApk','extraInApk','stagedMissing','stagedDifferent']:assert not audit[key],key
assert audit['zipCorruption'] is None
sha=hashlib.sha256(apk.read_bytes()).hexdigest();assert sha==audit['apkSha256']
notes='''# 再来亿把 1.20.0 · UI 操作布局更新

基于1.19.1营地画风，保留工程中后续1.91.2普通弹珠触控修复。版本码25，包名与签名保持一致，可覆盖安装；请保留应用数据，不要卸载旧版。

- 冒险首页：精简营地场景，玩法按屏幕空间分为每页2/4/6项；保留最近玩法入口和翻页位置。新增玩法可扩展到后续页。
- 藏品：头像/皮肤/装饰分类、已拥有筛选、独立探索图鉴。列表只保留预览、名称和价格/状态，详情集中展示用途、余额、兑换与装备。兑换后可直接装备，关闭详情保留目录位置。
- 任务：进度、奖励与操作集中展示，任务说明单独查看，待领奖励优先展示。
- 我的：旅人概览与四个快捷入口，游玩记录独立目录，完整设置继续按声音/操作/画面分类。
- 面包工坊：设备分为采集/加工/运输/扩建/仓库；目录点开单台设备，费用、效果、升级操作同屏。场景点设施可进入单台管理。配方一次展示一款。经营按目标/堂食/外卖/补货/分配拆分，福利区分免费干劲与可选广告。管理页明确提示生产是否继续。保留人物、场景、经济、存档和新手教学。
- 保留局内深色返回营地/结算按钮、无尽守线默认竖屏、合作浮动移动轮盘、普通36关+苦难36关。

验证：191项Node逻辑测试通过；360×640、390×844、640×360、844×390营地和工坊布局检查通过；17件藏品详情共68次显示检查无溢出；兑换/装备/筛选、设备升级/配方/补货/分配保存回归通过。工坊新手实操完整流程在四种尺寸通过。十款游戏入口、局内菜单和设置通过，合作真实触摸模拟的浮动轮盘、双指跳跃、松手/取消回归通过。打包后的资源另行跑四尺寸操作流程；943个运行文件与源码、APK逐项核对，ZIP和签名验证通过。
限制：未连接实体Android手机，真机安装、音效、长期联机仍需手机验收；本次未重新完整通关72张合作地图。

源码：合作地图来自Initials Video Games的SuperLemonadeFactoryOUYA，GPL-3.0。版权、许可证、原始地图、导入工具保留在games/coop/third_party/slf与games/coop/tools。随附当前完整可修改源码，不包含存档、构建缓存和签名私钥。
构建：node android/pack-assets.mjs；JDK17/Android SDK36/Gradle8.13执行gradle --offline -p android assembleDebug。Windows资源目录被预览服务占用时保留根目录，清理子项再打包。
'''
notes+='\nAPK SHA256：'+sha+'\n'
(out/'再来亿把-1.20.0-说明.md').write_text(notes,encoding='utf-8');(p/'android/发布核对-1.20.0.md').write_text(notes,encoding='utf-8')
for dest in [out/'再来亿把-1.20.0.apk',out/'再来亿把.apk']:
 shutil.copyfile(apk,dest);assert hashlib.sha256(dest.read_bytes()).hexdigest()==sha
report={'version':'1.20.0','versionCode':25,'bytes':apk.stat().st_size,'sha256':sha,'packedFilesVerified':len(audit['manifest']),'nodeTests':191,'physicalAndroidTested':False}
(p/'artifacts/ui-redesign/release.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
excluded={'node_modules','.git','.gradle','build','output','artifacts','__pycache__','.idea'}
archive=out/'再来亿把-1.20.0-完整源码.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 z.writestr('adventure-camp/交付说明-1.20.0.md',notes)
 for f in p.rglob('*'):
  if not f.is_file():continue
  r=f.relative_to(p)
  if any(x in excluded or x.startswith('备份') for x in r.parts):continue
  if r.parts[:6]==('android','app','src','main','assets','web'):continue
  if f.name in ['dev-wallets.json','local.properties'] or 'keystore' in f.name.lower() or f.suffix in ['.apk','.log','.jks']:continue
  z.write(f,'adventure-camp/'+r.as_posix())
print(json.dumps(report));print('source_zip_bytes',archive.stat().st_size)
