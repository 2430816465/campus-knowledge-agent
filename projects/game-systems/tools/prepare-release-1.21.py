# -*- coding: utf-8 -*-
from pathlib import Path
import json, hashlib, importlib.util
p=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit_release',p/'tools/audit-collection-release.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
groups={}
for name,path in sorted(module.runtime_files(p).items()):
    if name=='release-manifest.json':continue
    key=module.group(name);digest=hashlib.sha256(path.read_bytes()).hexdigest()
    groups.setdefault(key,[]).append({'path':name,'bytes':path.stat().st_size,'sha256':digest})
manifest={'version':'1.21.0','versionCode':26,'baseVersion':'1.20.0','environment':'development-acceptance','commercialReady':False,'ads':'development-simulation','coopCampaign':{'version':'slf72-v1','normal':36,'difficult':36,'mapLayoutChanged':False},'groups':{key:{'files':len(rows),'bytes':sum(r['bytes'] for r in rows),'digest':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()} for key,rows in groups.items()}}
(p/'release-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
f=p/'README.md';s=f.read_text(encoding='utf-8')
if not s.startswith('# 当前验收版本：1.21.0'):
    f.write_text('# 当前验收版本：1.21.0（2026-10-02）\n\n十款游戏的整体优化验收版，版本码26。无尽弹珠改为横屏，简化入口与设置、增加挖矿异常恢复、独立魔塔检查点、更新合作72关奖励与困难模式文案。人物与面包房场景保留。完整改动、验证结果和发行条件见随附说明及 `商业发行检查清单-1.21.0.md`。\n\n**本版是开发验收 APK，广告为模拟，不代表商业授权完成或抖音审核通过。** 完整源码与 APK 同时交付。新构建方式和第三方许可见检查清单与 `THIRD-PARTY-NOTICES.txt`。下面均为历史版本记录。\n\n---\n\n'+s,encoding='utf-8')
print('Release manifest prepared:',len(groups),'groups')
