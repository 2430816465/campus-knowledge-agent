# -*- coding: utf-8 -*-
from pathlib import Path
import re
p=Path(__file__).resolve().parents[1]
def edit(name,a,b):
 f=p/name;s=f.read_text(encoding='utf-8');assert a in s,(name,a);f.write_text(s.replace(a,b),encoding='utf-8')
edit('android/app/build.gradle',"versionName '1.20.0'","versionName '1.21.0'")
edit('tests/rewarded-policy.test.mjs',"a=ads.reserve('mine','supply','a');assert.equal(ads.complete(a.ticket,'complete'),false);a=ads.reserve('mine','supply','a');assert.equal(ads.complete(a.ticket,'complete'),true);","a=ads.reserve('mine','supply','a');assert.equal(ads.complete(a.ticket,'complete'),true);")
edit('games/liars/game.js',"${win?'+30 冒险币':'未获奖励'}","${win?'本桌获胜':'本桌练习已完成'}")
edit('games/liars/game.js','最后一位活着的玩家获胜，领取 30 冒险币。','最后一位活着的玩家获胜。本桌不收入场费；营地冒险币按有效参与和首次目标单独结算。')
edit('games/liars/game.js','经典牌局 · 六瓶魔药','经典牌局 · 六瓶魔药 · 同网好友 / 机器人练习')
edit('games/liars/game.js',"${!p.connected?'等待重连':p.ready?'已准备':'尚未准备'}","${p.bot?'机器人':!p.connected?'等待重连':p.ready?'已准备':'尚未准备'}")
edit('games/evolve/render.js',"this.label('同级 · 可合成',e.x,e.y-er-13,'#654526','#fff5c9',10);","if(Math.hypot(e.x-p.x,e.y-p.y)<170)this.label('同级 · 可合成',e.x,e.y-er-13,'#654526','#fff5c9',10);")
edit('games/rush/game.js','每次错门使首领抗性 +8%；超过上限无法破除封印。','每次错门首领抗性 +8%，最高24%。保持人数、拾取补给仍可通关。')
edit('games/rush/game.js','p.active?.layoutVersion!==4','p.active?.layoutVersion<5')
edit('games/rush/game.js','本局沿用更新前的旧路线；完成或放弃后，新开局启用破阵符印、逐关容错与首领封印的新规则。','本局保留更新前的规则。完成或放弃后，新开局启用可补救的抗性规则。')
edit('games/rush/game.js','容错逐步收紧','选错仍可补救')
edit('games/rush/game.js','第 3–6 关可错 3 次，7–12 关可错 2 次，13–17 关可错 1 次，第 18 关必须零失误。失误每关重置，只计选错门；箱子、石块和敌人造成的损失不计。每次失误使首领抗性增加 8%，超过容错封印无法解除；全部门通过后才能攻击首领。容错内仍需保住人数、拾取补给并击败首领。','前两关显示路线提示，第三关起比较门上的算式及属性。选门损失每关重置，每次使首领抗性增加8%，最高24%；不会让首领永久无敌。全部门通过后才能攻击首领，仍需保住人数、拾取补给并击败首领。旧版续玩保留旧规则。')
f=p/'games/tower/src/core/ads.js';s=f.read_text(encoding='utf-8');s=re.sub(r'/\* 魔塔.*?\*/','/* Optional rewarded ads: foreground development countdown by default.\n * Future SDK providers must confirm completed viewing; callbacks are deduplicated. */',s,count=1,flags=re.S);s=s.replace('测试直通','开发模拟').replace('默认实现（没有 provider）会立刻 onReward()，也就是「点一下直接给」。','默认实现使用统一的开发模拟广告，取消或失败不发奖励。');f.write_text(s,encoding='utf-8')
f=p/'games/shared/camp-wallet.js';s=f.read_text(encoding='utf-8').replace('chip.hidden=true;','chip.hidden=true;chip.style.display="none";');f.write_text(s,encoding='utf-8')
# Preserve full license terms both in the binary and corresponding source distribution.
(p/'licenses').mkdir(exist_ok=True)
(p/'licenses/GPL-3.0.txt').write_bytes((p/'games/coop/third_party/slf/LICENSE').read_bytes())
notices='''再来亿把 1.21.0 — 来源、许可与开发版边界

1. 再闯一关合作地图与改编
原项目：Super Lemonade Factory OUYA
原作者：Initials Video Games 及原贡献者
来源：https://github.com/initials/SuperLemonadeFactoryOUYA
许可：GNU GPL version 3，完整条款见 licenses/GPL-3.0.txt。
保留72份原始可编辑地图、转换脚本、改编规则与版权声明，位置 games/coop/third_party/slf、games/coop/tools、games/coop/src。
本版修改：困难模式名称、紧凑首页、独立选关、72关奖励元数据、广告频控与界面调整。地图坐标布局保持既有改编。
GPL涵盖的改编及相应组合作品按其要求提供对应可修改源码。其他第三方作品保留各自许可；不声称拥有原作者的版权，不表示原作者背书。

2. 勇者棋牌规则参考
CardRoomPro 的 MIT 许可保留于 games/chess/vendor/CardRoomPro-LICENSE.txt。项目改编与规则实现见 games/chess。

3. 字体
站酷快乐体：SIL Open Font License，保留 assets/fonts/OFL-ZCOOLKuaiLe.txt。

4. 源码获取与构建
随本APK交付 再来亿把-1.21.0-完整源码.zip，为本二进制对应完整可修改源码，包含原始地图、许可证、转换工具、Android/局域网宿主及构建脚本。
本地构建说明：先 node android/pack-assets.mjs；使用JDK17、Android SDK36、Gradle8.13，gradle --offline -p android assembleDebug。必须以APK和源码压缩包一起提供给接收者；如后续公开下载，必须同时提供对应源码的可用下载，不仅提供这段说明。
不把用户存档、签名私钥或构建缓存放入源码包。

5. 尚未完成的商业发行条件
当前仅为Android开发体验版，不代表抖音已审核通过。模拟广告不产生真实商业展示或收入。
魔塔原始地图授权链、部分美术/音频来源证据、合集GPL结合范围及平台条款兼容性仍待核实；不能用更名、删除来源或混淆代码代替授权。
正式发行前补齐授权台账、主体/备案等适用材料、真实平台SDK、隐私与真机验收；许可不明内容需获得授权或更换。
'''
(p/'THIRD-PARTY-NOTICES.txt').write_text(notices,encoding='utf-8')
from html import escape
(p/'legal.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>再来亿把 · 来源与许可</title><style>body{margin:0;background:#fff4df;color:#503a29;font:16px/1.7 system-ui;padding:20px;max-width:800px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#694118}button{min-height:44px}</style><button onclick="history.back()">返回</button><h1>来源与许可</h1><pre>'+escape(notices)+'</pre><p><a href="licenses/GPL-3.0.txt">GPL完整许可</a> · <a href="games/chess/vendor/CardRoomPro-LICENSE.txt">棋牌MIT许可</a> · <a href="assets/fonts/OFL-ZCOOLKuaiLe.txt">字体OFL许可</a></p></html>',encoding='utf-8')
