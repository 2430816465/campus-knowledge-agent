# 再守一夜：完整角色动作 V4

2026-10-02；呈现版本 `20261002-actions-v4-final`；manifest version 4。

## 已查证的问题

- 原先只有普通骷髅具有已验收的独立八帧行走/攻击，其余怪物缺少对应出手动作。
- 站姿施法仍随逻辑位置前进。实际画布逐帧录制中，红法师从蓄力到收招 Y=295.93→307.13；龙 Y=297.40→304.60。
- 旧远程攻击在发射时扣城墙血，画面弹体尚未到达；精英冲锋一次移动 35 个逻辑像素。
- 同一角色两动作若各自按包围盒缩放，伸手、武器前探会引起体型变化；部分旧脚底注册有两像素偏差。

## 美术交付范围

共 **11 种怪物（8 种普通/精英 + 3 Boss）与勇者**。普通骷髅继续使用已验收的 V3 八帧行走、八帧攻击。本轮接受 **21 张新生成动作原图**：十种其余怪物各 walk/attack 两张，加勇者 shoot 一张。另将原已接受的 hero-idle 统一脚底注册，保留原动作。

`assets/art-v4/` 共 22 张运行 PNG。每张 512×256，4 列×2 行，逐行八帧，128×128 单格，脚底 origin `[64,116]`。同角色两动作使用共享 `bodyHeight` 和共享原格尺度；仅按审看的躯干/腰部点平移注册，无逐帧缩放。透明、脚部、武器和身体完整；生成和后处理 QC 无空帧、触边或裁切。

| 角色 | 共享 bodyHeight | 动作 |
|---|---:|---|
| hero | 69 | idle / shoot |
| skeleton（保留 V3） | 93.75 | walk / attack |
| orc_warrior | 68.875 | walk / attack |
| guard_mid | 79.5 | walk / attack |
| mage_red | 74.875 | walk / attack |
| ghost_warrior | 76 | walk / attack |
| rock_golem | 72.75 | walk / attack |
| skeleton_elite | 61.875 | walk / attack |
| mage_low | 77.125 | walk / attack |
| vampire | 65 | walk / attack |
| knight_black | 75.25 | walk / attack |
| dragon | 67.75 | walk / attack |

英雄释放帧为索引 3；普通骷髅沿用索引 3；其余怪物释放帧索引 4。法师发射口分别 `[27,79]`、`[28,101]`，龙嘴 `[88,82]`。图鉴和静态降级图由已验收 walk 首帧裁切生成，保留透明及留白，保证外观一致。巨像/冰龙召唤显示同角色出手动作和最终准备姿势。

原图由内置 image generation 生成，依 generate2dsprite 技能处理；脚本没有绘制原始角色。原始来源如实分布在两处：

- 项目根 `assets/source/motion-v1.26-nightwatch/`：勇者和三个 Boss 的七张新原稿、精确 prompt，以及复用的 hero-idle。
- `games/nightwatch/assets/source/motion-v1.26-nightwatch/`：其余七种怪物的十四张已接受原稿和 prompt，并保留被替换的早期尝试。
- `games/nightwatch/assets/source/motion-v4/old-thumbnails/`：替换前十张图鉴/降级图；根 source 亦保留了早期备份。

上述 source 目录均排除于 Android 运行资产，仍保留于完整源码。运行清单核查：24 张有效动画、22 张 art-v4 PNG 全存在并会入包；新原始大图没有混入运行资源。场景共加载 55 张图片。manifest 使用 no-cache；入口、模块及替换图片携带本轮呈现版本。

## 动作与判定

- 行走步相按实际 `walkDistance` 推进；减速、冻结和停止行走不会继续原地跑步。全部角色保持固定脚下锚点；不再用整张图片压扁代替攻击。
- 勇者根据实际射击冷却预备动作，真正发射时进入第 4 帧，随后收招。普通与最快 0.14 秒间隔均完成八帧循环；无目标不凭空蓄力；转向发生在新动作开始前，避免半次出手中翻面。
- 远程法师与龙到达射程后站稳，首次完整蓄力 0.24 秒，释放后收招 0.32 秒，再恢复原速。后续发射间隔仍为 3 秒。Boss 召唤同样站稳，召唤周期仍为初始 7 秒、随后 9 秒。没有通过瞬移追赶停步期间的路程。
- 普通近战攻击间隔保持 1.25 秒。所有数据表、技能伤害公式、攻击频率参数和经济参数未改。
- 远程弹体进入可保存的飞行队列，到达城墙时才扣血并播放城墙受击。伤害总值不变，实际扣血时刻比旧版延后约 0.08–0.45 秒，符合画面接触。施法者死亡后已发射弹体仍会落地；最后一只怪死亡后等飞行队列结束再结算，因此不会漏扣或提前胜利。
- 精英每七秒的 35 像素突进改为 0.24 秒连续位移，行走步相计入突进距离；冻结/眩晕暂停该段移动与攻击动作，解冻后继续。
- 战斗时间驱动动作和效果；暂停、升级选择、冻结/眩晕、保存/继续保持对应动作/队列。减少动态效果设置保留必要的行走与射击动作。
- 最终真实冰弹回归发现：原来只在渲染内存中保留被冻结的上一帧，12 种起始步相有 2 种在继续存档时跳了一帧。现将实际显示的 `frozenPose` 随敌人存档，解冻时清除；12 种步相重新验证零差异。

## 验证与证据

`node --test tests/nightwatch.test.mjs tests/nightwatch-actions.test.mjs`：**30/30 通过**（原 17 项 + 新 13 项）。新测试已加入 `package.json` 的 `test` 和 `test:nightwatch`。

- `tests/nightwatch-browser.mjs`：九项真实界面/玩法流程通过，包括瞄准、技能选择、暂停读档、自然第一夜胜利、失败复活、召唤教学、合集奖励幂等。
- `tests/nightwatch-art-browser.mjs`：九项美术/交互检查通过；三种合法五技能配置覆盖十二技能，检查动作、图标、暂停、减少动态效果及布局。
- `tests/nightwatch-v4-browser.mjs`：11 种怪物全部 walk/attack 八帧；勇者普通/极快×两种动态偏好四组合；冻结、暂停、读档；法师/龙站稳八帧；弹体消失、城墙扣血、受击 FX 与伤害记录同帧。
- `tests/nightwatch-v3-browser.mjs`：原普通骷髅在两个动态偏好下八帧行走/攻击仍正常，冻结、暂停未退化。
- `tests/nightwatch-freeze-save-browser.mjs`：12 种起始步相，真实冰弹命中→冻结→暂停保存→重载继续，动作帧、动作表、脚下坐标与行走距离完整一致。
- 实际画布分别在 320×568、390×844、844×390、1440×900 检查，无横向溢出，召唤按钮可见。
- 原版 develop-web-game client 已执行真实第一波，最新状态第 15.4 秒、击败 7 个敌人、进入升级教程，55 张资源/manifest 4，未出现控制台或资源错误；截图已人工查看。
- 桌面 Chromium 100 敌混合压力场景：240 个 RAF 样本，中位 16.7 ms，P95 16.8 ms，超过 34 ms 为 0；最后三远程发射口复核 P95 16.7 ms。压力场景使用测试专用超高血量以保留所有可见对象，不是普通游戏出怪阵容。

工作区证据根目录：`C:/Users/24308/Documents/ChatGPT/游戏/nightwatch-v4/`。

- `production-actions-final.gif`：生产画布实际录制，四角色行走/攻击及勇者射击。
- `recordings/<actor>/production.gif`、`states.json`：逐角色 60 帧画布和对应状态。
- `mage_red-cast-final-contact.png`、`dragon-cast-final-contact.png`：站稳施法连续帧；对应 `*-before-contact.png` 为修复前对照。
- `root-actions-contact.png`、`four-actions-contact.png`、三近战各自的 `contact-registered.png`：最终资产逐帧图。
- `browser/report.json`：全 11 怪物和四尺寸；`browser-final-emitters/report.json` 与 `*-flight-log.json`：最终法杖/龙嘴发射口和扣血同步复验。
- `browser-final/report.json`：冻结姿势存档修正后的最终全 11 怪物/英雄/弹道/站稳/四尺寸完整回归；`live-freeze-save-final.json` 为真实冰弹 12 步相结果，`live-freeze-save-check.json` 保留修正前的两处失败证据。
- `skill-client-final/shot-4.png`、`state-4.json`：原客户端最后截图/状态。
- `skill-client-frozen-save-final/shot-1.png`、`state-1.json`：冻结存档修正后再次运行原客户端的实际第一波截图/状态。
- `runtime-asset-audit.json`：全部运行引用、入包集合、原图排除结果。

## 实际影响和限制

站稳施法会减少该段向前移动的距离；冻结现在也暂停攻击冷却，因此控制效果对出手节奏更一致。弹体实际命中时刻修正和 Boss 停步会改变个别战斗结算时间、承伤与小怪召唤次数，不能声称战斗结果完全不变。原有 30 夜推进、资源获取、胜负及经济回归仍通过。

目前验证覆盖桌面浏览器真实 RAF、桌面模拟手机尺寸和脚本交互；**尚未在实体 Android 设备测量帧率或完成触屏舒适度验收**。本轮源码和美术已完成，合集打包与安装包总体核对由主任务处理。
