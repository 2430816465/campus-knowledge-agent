const fs=require('node:fs'),G=require('../games/coop/src/game-shared.js');
const report=JSON.parse(fs.readFileSync('交付校验-1.13.0.json','utf8'));
const rows=G.LEVELS.map(l=>`| ${l.id} | ${l.title} | ${l.design?.chapterTitle||'遗迹入口'} | ${l.rooms?.length||1} | ${l.design?.mechanism||l.subtitle} |`).join('\n');
const text=`# 再闯一关重制 · 再来亿把 1.13.0

日期：2026-10-01。基于总/adventure-camp 当前源码。安装文件：总/再来亿把-1.13.0.apk，versionCode 16，约 ${(report.bytes/1048576).toFixed(1)} MiB。

## 已核实的问题与处理

- 第二关原来把上层深渊矩形当作致死区域，角色下落时即使下桥已开启也可能提前死亡。现在先执行真实平台/桥碰撞，穿越上层空隙本身不会死亡；落不到任何地面、越过最下层地面或掉出画面才进入坠落动画与共同复位。主动跳下、走出边缘，两种情况都验证了两名角色能落到已开启的下桥。桥上的原地跳跃也不会因头部进入上层空隙而被误判。
- 原第二、十关属于同一上下桥结构；旧关卡中还存在 11/13、36/40 的重复。保留 1–3 的地图和机关，重制 4–50。去掉标题、ID、旗标名字后，按地形、角色归属与机关依赖审计，50 关没有完全相同的关卡结构。
- 手机房主 Worker 原先没有完整加载地图依赖。现在与浏览器、Node 共用关卡文件，实际生成 Worker 已验证 50 关、61 段地图和物理状态一致。
- 修复通关光圈的变量作用域错误；新机关的互动按钮与画面提示使用同样的距离、角色与前置条件判断。

## 新规则与难度安排

1P 是日纹 ◆，2P 是月纹 ☾。各自只能操作专属机关、收集本色晶石。日池只伤害 2P，月池只伤害 1P，绿色毒池伤害双方。薄池可以跳过。

持续压板可临时开门，另一角色穿过后操作远端开关永久锁定。角色、可推箱子都能代替站岗。双压印需要同时压住两个 ⊕ 板，再由 2P 互动锁定。带前置条件的机关以连线指明接力顺序。所有永久机关与晶石完成后，两名角色分别进入自己的日/月出口。

- 4–10：站岗、永久锁定、石箱替代压板、专属机关、高台与单桥。
- 11–20：本色晶石、日/月危险池、折返、双压印与初步组合。
- 21–30：连续悬桥、桥后接应、绿池、左右同时站岗与桥塔组合。
- 31–40：多步前置条件、反向递钥匙、双门接力、跨高台折返。
- 41–49：每关两段，增加高度不同的上下回廊、不同长度的叶阶与回落缺口。50 关三段终章。进入新段会记录共同检查点；中间缺口可安全落到地面，两端叶阶可以向上跳穿。

五章按学习与机制组合递进编排；没有测量真实玩家的平均通关时间，也不宣称每一关都严格比上一关更难。自动路线解决的是可通性与边界错误，实际趣味和手感仍需试玩反馈。

单人模式可以随时切换角色，待命角色仍压板。双人模式继续使用手机局域网联机；房主点击下一关即可共同继续。自适应摇杆、推箱子连带推动队友、坠落动画均保留。重制前的 4–50 活跃存档会从该关起点恢复，关卡解锁、已获得的冒险币和首次通关记录保留，避免旧坐标卡在新地形内。

## 验证证据与边界

- 1–3 地图/机关数据与重制前备份逐项一致，原单人/双人路线通过。
- 4–50：47 条双人路线 + 47 条单人切换路线，均使用移动、跳跃、互动输入，不直接写机关旗标或角色坐标来完成关卡；全部通过且无死亡。
- 34 个危险池/角色案例；机关和晶石归属、跳穿平台、出口前置条件、真实坠落、桥面跳跃、箱子推队友、旧存档迁移均通过。
- 真实双 WebSocket 客户端通关 24、48、50，并验证两端结算状态一致、房主直接进入下一关。手机适配层使用实际 Java WebSocket 服务和实际 Worker，验证加入、准备、正常完成第一关、房主一次点击进入第二关、延迟、断线重连与退出清理；原生桥接在测试中模拟。
- 844×390、740×360、1024×600 横屏验证自适应摇杆、多点触控、可见坠落与暂停恢复。新关 13、34、50 在实际浏览器界面按键通关，包含终章三段流程，控制台无错误；测试最终打包的冻结文件时也通过。
- 总工程 84 项 Node 检查通过；打包后的七个玩法入口通过。包中含现有再骗一杯、再进化一次、再弹一次、星光工坊等已接入内容。
- APK ZIP 完整性和 ${report.packedFilesVerified} 个资源文件逐字节核对通过；版本 1.13.0/code16，名称再来亿把，v1/v2 签名验证通过，签名证书与上一版一致。再上一层的 28 个源文件与原备份一致。
- 没有连接到真实安卓手机。浏览器自动化、Java 网络测试不能替代两部手机的实际安装、触摸手感、不同 WebView 性能和长时间联机验收。联机时两部手机都应安装此版本，并连接同一 Wi-Fi。

SHA-256：${report.sha256}

## 参考来源

查看了官方玩法说明：[Fireboy and Watergirl Forest Temple](https://www.coolmathgames.com/0-fireboy-and-water-girl-in-the-forest-temple/1-strategy-games-01)。参考的原则是角色专属危险区、机关合作和各自的出口。

GitHub 核验项目：[Omar-Elhakim/Fireboy_and_watergirl_game](https://github.com/Omar-Elhakim/Fireboy_and_watergirl_game)。2026-10-01 通过 GitHub API 读取 README、LICENSE 和源文件，核实为 MIT 的 C++/SFML 项目，README 明确只有一关。该项目不能直接并入当前 JavaScript/WebView 架构。本次仅研究玩法，未复制其代码、地图或美术。读取证据保存在 artifacts/coop-remake/reference-*，不进入 APK。

## 50 关清单

| 关 | 名称 | 章节 | 段数 | 主要内容 |
| --- | --- | --- | --- | --- |
${rows}

源码修改前备份：总/备份-关卡重制前-20261001/coop。
最终打包文件快照：总/发布快照-1.13.0-定稿。
审计报告：adventure-camp/交付校验-1.13.0.json。
`;
fs.writeFileSync('../再闯一关重制-1.13.0-说明.md',text);
fs.appendFileSync('progress.md',`\n## 再闯一关 · 日月遗迹关卡重制（2026-10-01）\n\nUser request: fix level 2 dropping onto open lower bridge; remake after level 3, eliminate duplicates and improve progressively combined cooperation puzzles, reference Fireboy/Watergirl or GitHub.\n- Retained original 1–3 geometry/mechanics (deep comparison against backup). Removed old 4–50 factory maps and authored 47 temple maps, 61 stages in total; role-specific runes/crystals/liquids, permanent remote latch, dual pressure seals, varied late upper galleries and per-room checkpoints.\n- Abyss rectangles no longer kill above a supporting lower bridge; explicit element pools remain hazardous. Added walk-off and jumping-drop regressions for both roles, actual falls, bridge jumps and crate cliff pushes.\n- Worker now imports the actual remake and catalog dependencies; Node/browser/phone Worker share 50 levels/61 stages. Migrates older active geometry while retaining progress and coin receipt namespaces. Fixed completion renderer scope and role interaction cues.\n- PASS all 47 duo + 47 serial solo normal-input routes, original 1–3 routes, 34 pool/role fixtures, map data/topology audit, crate and save tests, actual Node WebSocket levels 24/48/50, actual Java phone adapter host-next/reconnect tests, mobile joystick/fall tests and solo entry/resume/receipts. Browser and final frozen bundle UI normal-input routes 13/34/50 pass without errors. Skill client screenshot/state checked.\n- PASS 84 project Node cases and all seven packed mode entries. APK 1.13.0/code16 built offline, ${report.packedFilesVerified} source/asset bytes checked, unchanged tower 28 files, ZIP integrity and matching v1/v2 debug signer verified. Final SHA256 ${report.sha256}.\n- Delivered 总/再来亿把-1.13.0.apk and 再来亿把.apk; details 总/再闯一关重制-1.13.0-说明.md. No physical Android attached; automated routes establish solvability, not human enjoyment, strict per-level difficulty ranking or long-session phone performance.\n`);
console.log('Saved release notes and progress.');
