# -*- coding: utf-8 -*-
from pathlib import Path
import os, json, hashlib, shutil, zipfile, sys
sys.stdout.reconfigure(encoding='utf-8')
p=Path(__file__).resolve().parents[1];out=p.parent;evidence=p/'artifacts/optimization-1.21.0'
apk=p/'android/app/build/outputs/apk/debug/app-debug.apk'
audit=json.loads((evidence/'resource-audit.json').read_text(encoding='utf-8'))
for key in ['missingFromApk','differentFromApk','extraInApk','stagedMissing','stagedDifferent']:assert not audit[key],key
assert audit['zipCorruption'] is None
sha=hashlib.sha256(apk.read_bytes()).hexdigest();assert sha==audit['apkSha256']
tests=(evidence/'all-node-tests.txt').read_text(encoding='utf-8');assert 'pass 232' in tests and 'fail 0' in tests
entries=json.loads((evidence/'browser-audit.json').read_text(encoding='utf-8'));assert len(entries)==40
assert all(not x.get('error') and not x['errors'] and not x['requests'] for x in entries)
plays=json.loads((evidence/'play-audit.json').read_text(encoding='utf-8'));assert len(plays)==10
assert all(not x.get('error') and not x['errors'] for x in plays)
for name in ['collection-audit.json','focused-verification.json','staged-critical.json']:
    assert not json.loads((evidence/name).read_text(encoding='utf-8'))['errors']
notes='''# 再来亿把 1.21.0 · 整体优化验收版

基于1.20.0；版本码26，包名 com.adventurecamp.game。签名与旧版一致，可覆盖安装；请保留应用数据，不要先卸载旧版。本次是Android开发验收包，广告为模拟，尚不是可直接提交抖音的商业产品。

## 本轮已实现

- 再弹一次无尽：按最新要求固定横屏；竖屏时暂停战斗并提示旋转。初始敌人85→36，压力随进度增长。构筑面板增加最近一发击杀/连击/经验与自动回收摘要，明确7.2秒飞行、主球8/总球32及共享触发额度。品质60%/27%/10%/3%未暗改。
- 再闯一关：保留36普通+36困难地图及人物动作，苦难文案改为困难。大厅使用紧凑专用布局，选关独立弹层。统一地图ID51—122与campaign/难度奖励凭据；72关每关首次8币、共576币的单人/联机去重回归通过，不直接向历史玩家无凭据补发。浮动轮盘、单人切换与房主续关机制保留。
- 再挖一层：首屏集中继续/开始、新手与档案；目标风格、每日与同图入口另进。输入取消、失焦、后台清空触控状态；异常不再直接终止主循环，出现恢复本局/返回探索首页。恢复不凭空结算。偶发卡死全部根因尚未获得真机证据。
- 再上一层：手动检查点与自动进度分离；免费保存/恢复，自动存档不覆盖手动检查点，恢复后同步自动进度。原地图与人物保留。
- 再进化一次：补齐地狱模式样式、横屏首页操作；同级单位使用虚线轮廓，近距离显示可合成提示；人物/物种资产保留。修复新增提示产生的绘制异常。
- 魔王面包房：保留小店场景和人物；设备详情增加理论生产间隔、升级前后变化、瓶颈与人工运输说明。沿用1.20分类管理，未假称理论产能为实测玩家产能。
- 再守一夜：隐藏未到解锁阶段的多条养成入口，同时识别老玩家已有进度；失败结算显示城门受伤来源与调整建议。
- 再冲一阵：新局按实际人数选择判断数值门损失；不同能力门不强判错误。错误仍增加首领抗性，但最高24%，不再形成超容错后首领永久无敌的隐性死局。前两关保留引导，后续减少答案标记；旧版本进行中的战斗规则原样恢复。
- 再骗一杯/勇者棋牌：明确同网与机器人练习边界，保留人物；修复小横屏入口裁切。牌桌胜负与营地奖励文案分开，不虚报固定冒险币收入。
- 全局：移除强插的悬浮钱包遮挡，币数放在营地暂停菜单；设置提供来源与许可。广告模拟共享每日6次、每局2次、120秒间隔，取消/失败不发奖、同票据不重复领取；离开游戏取消未完成广告。模拟不产生真实广告收入。
- 资源：仅从运行包移除无引用的原始大图，完整源码仍保留原始素材；许可、版权声明、原始地图与转换工具保留。商业release构建主动阻断，防止模拟广告和未核清素材误发布。

## 已完成验证

232项Node逻辑测试通过。10款游戏×4种手机窗口（360×640、390×844、640×360、844×390）入口共40次检查无页面异常与HTTP失败；十游戏实际开局操作回归无页面异常。设置三分类、17件藏品详情×4尺寸共68次、工坊四尺寸管理与详情检查通过。挖矿菜单/选矿/注入一次异常恢复、魔塔手动检查点、广告取消与完成回执分别实测通过。

72合作地图加载、数据与机制夹具通过；普通第一关、困难第一关输入路线通过。双客户端局域网开房、加入、满员、准备、开始、移动、重置、离开通过。未完整实操通关72张地图，不把这些检查等同全部可玩性验证。

打包后再次检查横屏/旋转暂停、进化局内绘制、合作入口与选关、离线许可页。运行资源与源码、staged目录、APK逐项哈希一致；APK ZIP完整与签名验证通过。未连接实体Android手机，真机安装/刘海/系统手势/长时间后台/双手机弱网仍须验收。

## 合规发行与下一阶段

保留SuperLemonadeFactoryOUYA的GPL-3.0、版权声明、72原始地图及对应完整源码；另保留棋牌MIT与字体OFL。不靠更名/隐藏来源解决授权。APK与完整源码一起交付；公开分发时应同时部署对应源码的可用下载。

待完成：魔塔地图授权链、其余素材逐项商业授权证据、GPL结合范围与平台条款兼容审查、抖音小游戏运行环境移植/平台适配、真实广告SDK及服务端奖励校验、适用主体/备案/隐私材料、真实玩家与设备分层数据。广告上限只是当前测试配置，不能用本次模拟推算收入。

报告中长期设计（章节总结、完整实操教学、深层数值调整、全地图难度实测及真实留存实验）进入后续验证，不宣称本轮已完成所有建议。更细发行条件见源码中的商业发行检查清单-1.21.0.md。

构建：Node.js；JDK17、SDK36/build-tools35、Gradle8.13、AGP8.13.2。node android/pack-assets.mjs；gradle -p android assembleDebug。首次依赖下载需要联网；缓存齐后可 --offline。源码包不包含用户存档、签名私钥和构建缓存，自建签名不能覆盖本次签名APK。
'''
report={'version':'1.21.0','versionCode':26,'bytes':apk.stat().st_size,'MiB':round(apk.stat().st_size/1048576,2),'sha256':sha,'runtimeFilesVerified':len(audit['manifest']),'nodeTests':232,'entryCases':40,'physicalAndroidTested':False,'all72RoutesTested':False,'commercialReady':False}
notes+='\nAPK大小：'+str(report['MiB'])+' MiB；运行文件：'+str(report['runtimeFilesVerified'])+'。\nAPK SHA256：'+sha+'\n'
(out/'再来亿把-1.21.0-说明.md').write_text(notes,encoding='utf-8');(p/'android/发布核对-1.21.0.md').write_text(notes,encoding='utf-8')
(evidence/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
for dest in [out/'再来亿把-1.21.0.apk',out/'再来亿把.apk',p/'再来亿把.apk']:
    shutil.copyfile(apk,dest);assert hashlib.sha256(dest.read_bytes()).hexdigest()==sha
excluded={'node_modules','.git','.gradle','build','output','artifacts','__pycache__','.idea','versions','screenshots','.liars-data','.adventure-camp-coop'}
archive=out/'再来亿把-1.21.0-完整源码.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    z.writestr('adventure-camp/交付说明-1.21.0.md',notes)
    for directory,dirs,files in os.walk(p):
        dirs[:]=[d for d in dirs if d not in excluded and not d.startswith(('备份','.chess-backup'))]
        for name in files:
            f=Path(directory)/name;r=f.relative_to(p)
            if r.parts[:6]==('android','app','src','main','assets','web'):continue
            if name in ['dev-wallets.json','local.properties'] or 'keystore' in name.lower() or f.suffix.lower() in ['.apk','.log','.jks','.zip','.tmp']:continue
            z.write(f,'adventure-camp/'+r.as_posix())
    for name in ['release.json','resource-audit.json','focused-verification.json','staged-critical.json','collection-audit.json','all-node-tests.txt','coop72.txt','coop-lan.txt','signature.txt']:
        z.write(evidence/name,'adventure-camp/交付验证/'+name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    names=z.namelist();assert 'adventure-camp/licenses/GPL-3.0.txt' in names
    assert 'adventure-camp/games/coop/third_party/slf/LICENSE.txt' in names or any('third_party/slf/' in n and 'license' in n.lower() for n in names)
report['sourceZipBytes']=archive.stat().st_size;report['sourceZipSha256']=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'再来亿把-1.21.0-交付校验.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
