# 再守一夜

从冒险营地大厅的第九个入口进入，或直接访问 `games/nightwatch/index.html`。需要通过本地 HTTP 服务运行，不能直接以 `file://` 打开 ES 模块。

```powershell
node server.mjs
```

默认地址 `http://127.0.0.1:4173/`。本次试玩服务使用 `http://127.0.0.1:4187/`。

自动射击；按住战场拖动瞄准；升级三选一；右下角召唤守护灵。P / Escape 暂停，空格召唤，1–3 选择升级，F 切换全屏。

```powershell
node --test tests/nightwatch.test.mjs
node tests/nightwatch-browser.mjs
node tests/nightwatch-art-browser.mjs
node tools/nightwatch-balance-audit.mjs
node tools/nightwatch-spell-audit.mjs
```

后者默认测试端口 4187，可用 `BASE_URL` 指定自己的本地服务。浏览器测试需本机已安装 Playwright，目前引用已配置的 `develop-web-game` 技能依赖。

- [背景与填充规范](DESIGN.md)
- [完整数值、成本、曲线与验证依据](BALANCE.md)
- [美术生成提示词](ART-PROMPTS.json)
- [美术第二版、动画与检查说明](ART-V2.md)
- [当前生成需求与来源](ART-V2-PROMPTS.json)
- [当前运行素材清单](assets/art-v2/manifest.json)
- [素材来源](assets/manifest.json)

本机存档键 `camp-nightwatch-v1`。声音、伤害数字、首次教学开关和导入／导出入口在设置中。35 项机制教学可在“暂停 → 操作说明”重看；伙伴、守护灵和符印卡片也有“作用教学”。损坏存档在用户建立新存档之前保持原样；建立新存档会把原内容保存到 `camp-nightwatch-v1-corrupt-backup`。数值第二版保留旧资源和成长，进行中战斗按生命比例转换。

测试图像与报告在项目 `artifacts/nightwatch/`。原始图、透明合成表、动画 GIF 和质量检查在 `artifacts/nightwatch/art/`；这些不参与 Android 打包。

当前美术第二版的原图、处理元数据、逐帧图片、真实战斗 GIF 与测试报告在 `artifacts/nightwatch/art-v2/`。保留地图布局与数值，重做人物动作、飞行攻击／命中特效和全部技能图标。
