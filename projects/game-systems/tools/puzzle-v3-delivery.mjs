import fs from 'node:fs';
import {LEVELS} from '../games/marble/puzzle-levels.js';
const desktop='C:/Users/24308/Desktop/再弹一次';
const overview=`# 再弹一次 · 50关遗迹闯关验收

本轮按确认的 A / ACD / A / A 实施：保留旧关主题并重排，加入传送门、一次性镜面与双珠分流，使用静态机关，以路线推理逐步增加难度。安装包未在本轮制作，请先验收网页源码。

## 打开方式

- 本机全部关卡可选：[50关验收入口](http://127.0.0.1:4173/games/marble/puzzle.html?review=1&rev=50)。
- 手机与电脑连接同一网络：[手机验收入口](http://192.168.3.24:4173/games/marble/puzzle.html?review=1&rev=50)。电脑预览服务须保持运行。
- 桌面独立工程在本文件所在目录。执行 Node 的 server.mjs 后打开 http://127.0.0.1:4180/puzzle.html?review=1 。
- 正常模式按通关顺序解锁；验收模式解锁全部50关，进度独立，不发放营地币。

## 难度与机制

1–5关学习瞄准、墙反射、镜反射与绕障；6–20关加入钥匙、碎墙、转镜、同发按序、方向封印和反弹蓄能。21–35关分别引入传送、碎镜和分裂；36–50关叠加这些条件，增加跨室、双路和多目标推理。

新机制的首次出现保留学习空间，后续再组合加难。因此章节的总体难度逐步提升，不声称任意后一关都比前一关更难。未加入移动机关或等待时机。

| 机制 | 规则 |
| --- | --- |
| 传送门 | 同字母配对，穿门保持方向和已有反弹次数；虚线在空间跳跃处断开；每颗弹珠最多传送6次。 |
| 一次性镜面 | 橙色虚线镜面反射一次后消失，变化跨发射保留，免费重试恢复。第27关需要先碎镜取钥，再发射穿过原镜位。 |
| 双珠分流 | 绿色晶体将主弹珠替换为两颗子弹珠，不递归分裂。两颗按各自路线同时运动，一颗回收不提前收回另一颗。绿色分流印要求子弹珠同发点亮。 |

每发硬上限8秒；复杂关增加碰撞额度。拖动松开发射，向发射台下方拖动取消；按住约半秒后慢速移动可精调角度。普通预测保留下一次碰撞，提示不会自动替你发射。

## 广告提示与存档

每关均可从“帮助”选择“模拟广告 · 显示正确路线”。完成后显示青色主路/支路、金色另一支路与起始角度；多发关逐发更新。免费重试、刷新继续本关可保留提示，重新选关则重置。已偏离参考机关状态或发数不足时，提供主动免费重置并保留提示。

取消或加载失败不发奖、不消耗帮助。补1发与三次碰撞预测共享一次使用额度；路线提示独立。当前是开发广告模拟，未接真实SDK。

50关使用v3独立存档，避免旧20关编号错配；旧存档未删除。无尽模式的进度和规则保留。正常营地每关首次通关奖励仍为8币，沿用已有收据编号防止旧1–20关奖励重领。

## 建议验收顺序

先体验1–5关的教学，再重点试玩9、17、20、21、27、31、38、41以及46–50。先不看完整路线，观察是否能靠机关关系推理；遇到困难再检查提示是否准确。请重点反馈具体关号、重复感、路线不清楚的位置和触控是否过于精细。

## 已验证与待验收

- 50关固定数据和参考解；2917次无广告模拟重放，包括多发角度组合、不同帧步长与采样安全区间。
- 50关实际触摸事件免费通关，以及50关广告提示流程与再次触摸通关。
- 传送方向、碎镜跨发/跨刷新、两发准备关、分裂不递归、双珠飞行存档与暂停、取消/失败/补发/免费重置。
- 十章选关、667×375 / 915×412 / 390×844菜单，合集与独立版入口/返回；横屏场地面积超过80%。
- 技能客户端截图与文本状态检查，无页面和资源错误。

自动验证证明存在可操作的解法和机制有效；真人难度、实体手机触感以及广告收益均未据此认定完成。等待试玩验收，暂不制作新安装包。
`;
const table='# 再弹一次 · 50关清单\n\n固定地图，十章各五关。推荐发数用于独立通关星级，允许发数用于本次挑战。\n\n| 关 | 章节 | 名称 | 推荐 / 允许发数 | 关卡思路 |\n| --- | --- | --- | --- | --- |\n'+LEVELS.map((l,i)=>`| ${i+1} | ${l.chapter} | ${l.name} | ${l.par} / ${l.shots} | ${l.hint} |`).join('\n')+'\n';
for(const dir of [desktop,'output/puzzle-v3']){fs.writeFileSync(dir+'/遗迹闯关-验收说明.md',overview);fs.writeFileSync(dir+'/50关清单.md',table)}
const standaloneTest=fs.readFileSync('tools/puzzle-v3-check.mjs','utf8').replaceAll('../games/marble/','../').replace("'output/puzzle-v3/solutions.json'","new URL('./puzzle-v3-solutions.json',import.meta.url)");
fs.writeFileSync(desktop+'/tests/puzzle-check.mjs',standaloneTest);
fs.copyFileSync('output/puzzle-v3/solutions.json',desktop+'/tests/puzzle-v3-solutions.json');
if(!fs.readFileSync('progress.md','utf8').includes('## 再弹一次 · 五十关重制'))fs.appendFileSync('progress.md',`\n## 再弹一次 · 五十关重制（2026-10-01）\n\nUser decisions: A / ACD / A / A. Retain useful old themes with geometry/order/budget revision; portals preserve direction, one-use mirrors persist across shots, splitters replace one orb by two bounded branches; static puzzles and moderate aiming tolerance. No APK build in this task.\n\n- Fixed 50 maps in ten chapters. First five rebuilt as reflection tutorials. Old 20 themes interleaved with 30 new maps. New mechanic introductions at 21/26/31, combinations in 36–50. Immutable previous data and solutions saved in output/puzzle-v3.\n- Chronological multi-orb collision stepping; original plate indices retained after filtering broken mirrors; branches cannot recursively split; relay marks expire only after every live branch ends. Portal jumps are discontinuities in hint trails. Per-orb portal/contact and global eight-second caps. Mirror preparation level 27 independently verified to require disappearance before second shot.\n- Recomputed reference sequences and sampled safe angle intervals; widen targets and selected passages for legacy maps; >=1.99 degrees sampled inner interval per shot (nominal two degrees with floating tolerance). Not a mathematical proof of every continuous angle or human difficulty ranking. Corrected hints to match geometric conditions and actual portal/split order.\n- All 50 full-route hints replay exact simulated branches without state mutation. Optional reward outcomes and fallback to user-triggered reset preserved. v3 puzzle save isolated; old receipt namespace retained to avoid awarding old 1–20 again. Eight-coin first-clear amount unchanged.\n- PASS 2917 free solution replays including interval samples, multi-shot combinations and 0.01/0.0167/0.04 frame sizes. PASS 50 actual touch free clears + 50 rewarded hints, branch-flight save/resume, mirror save, cancel/fail/reset/extra help and menu layouts. PASS camp + standalone entry/return/pause and endless regression. Skill client screenshot/state inspected. No real mobile-device or real ad SDK validation.\n- Synced Desktop/再弹一次 source and corrected standalone CSS asset paths; refreshed 50关清单 and 遗迹闯关-验收说明. Current LAN preview 192.168.3.24:4173. Browser and solver evidence output/puzzle-v3. Browser native-fullscreen resize caused a test harness failure; layout checks now use separate fresh contexts and pass.\n- Next: user acceptance of exact room difficulty and distinction, especially 27/31/38/41/46–50. APK must wait for acceptance; no blocker or unfinished implementation.\n`);
console.log('Updated desktop acceptance guide, fifty-room list and progress log.');
