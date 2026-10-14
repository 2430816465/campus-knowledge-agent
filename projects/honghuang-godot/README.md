# 洪荒题材回合制养成与仙府经营原型

Godot 4.6.3 / GDScript 原生二维个人游戏项目。此副本来自桌面“洪荒”的实际交付源码，版本号0.10.0。围绕五人回合制战斗、角色与装备养成、召唤保底、仙府生产和存档迁移组织系统模块。

## 实现入口

- `scripts/game_combat.gd`、`game_equipment.gd`：战斗与随机装备。
- `scripts/game_economy.gd`、`game_store.gd`：经济结算、持久化和迁移。
- `scenes/`、原生 Control 界面及等距经营视图：交互与展示。
- `data/`：角色、关卡、装备、活动和系统配置。

## 运行和测试

用 Godot 4.6.3 打开 `project.godot`，首次导入资源后运行。命令行：

```sh
godot --headless --path . --editor --import --quit
godot --path .
godot --headless --path . --script tests/test_combat.gd
godot --headless --path . --script tests/test_storage.gd -- --balanced-economy
```

测试应配置独立用户数据目录，避免混入个人试玩存档。存档测试的扣费断言需要 `--balanced-economy` 关闭试玩免费开关；默认免费配置下这两项断言会失败。本次战斗与平衡经济配置的存档检查通过，详见仓库根目录 `VALIDATION.md`。历史模块测试摘要在 `validation/historical-summary.json`，保留原始逐套结果。

## 当前边界

这是本地框架测试原型，默认保留无货币消耗测试开关；真实网络、支付、广告及平台发行未接入。UI仍有后续迭代，未把框架测试通过等同商业成品完成。旧 Canvas 版本不是本副本的运行实现。

运行素材与字体许可随源码保留，素材生成与来源记录见 `docs/`；不包含商业游戏研究截图、用户存档、Godot引擎二进制或导出安装包。第三方字体按其附带许可证使用，未统一改为仓库级 MIT 许可。
