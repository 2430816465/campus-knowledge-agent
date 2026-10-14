# 多玩法二维游戏与交互系统

JavaScript / Canvas 2D / Node.js 个人项目代码展示副本，来自“再来亿把”多玩法合集。展示关卡与状态管理、合作闯关、弹珠战斗、经营、奖励结算及局域网交互的实现。

## 阅读入口

- `games/coop/src/`、`games/coop/server/`：合作关卡、状态同步和服务端规则。
- `games/marble/`：弹珠战斗、强化选择、反弹与战斗状态。
- `services.js`、`economy.js`、`tests/`：进度、奖励、防重复结算及逻辑回归。
- `android/`：Android宿主源码；运行资源需另行准备。

在本目录用 Node.js 运行逻辑测试：

```sh
node --test tests/services.test.mjs tests/adventure.test.mjs tests/economy.test.mjs
```

## 分发范围

本副本用于源码审阅与逻辑验证。未发布授权尚未核实的美术、音频及魔塔地图，运行时画面资源并不完整；不是可直接安装的游戏发行包。原项目的 APK、截图和素材缓存也未发布。原文件中的资源引用保留，避免伪装为完整画面复现。

合作地图改编来源 Super Lemonade Factory OUYA，保留原始可编辑地图、转换工具及 GPL-3.0 许可。对应改编与组合作品须遵守 GPL；CardRoomPro、字体等另保留原许可。见 `THIRD-PARTY-NOTICES.txt`、`licenses/` 及各子项目许可，不把上游地图和规则说成本人原创。
