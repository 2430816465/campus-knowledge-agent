# 验证记录

## 本次发布副本检查 · 2026-10-14

以下命令在相应项目目录执行；采用隔离的数据目录，没有写入原工程数据库或个人存档。检查源码及确定性逻辑，不把它们计作真实模型问答成功率。

| 项目 | 命令 / 条件 | 本次结果 |
| --- | --- | --- |
| 校园 RAG | `python -m pytest tests/test_model_evidence.py tests/test_evidence_windows.py -q`；临时 SQLite 与数据目录 | 33 passed |
| Android 对话助手 | `python -m unittest discover -s scripts/tests -v` | 38 tests，OK |
| 二维游戏 | `node --test tests/services.test.mjs tests/adventure.test.mjs tests/economy.test.mjs` | 31 passed，0 failed |
| Godot 工程 | Godot 4.6.3，`--headless --path . --editor --import --quit` | 导入成功；无脚本解析错误 |
| Godot 战斗 | `godot --headless --path . --script tests/test_combat.gd` | 371 个基准场景，18,095 次断言，0 failures |
| Godot 存档 | `godot --headless --path . --script tests/test_storage.gd -- --balanced-economy` | 79 checks，0 failures |

Godot 发布副本补齐了战斗测试的报告输出目录。存档测试初次在默认免费试玩配置下运行，79 项中有2项扣费/恢复断言失败；切换源码已有的 `--balanced-economy` 后79项全部通过。没有为通过测试改变业务源码或删除断言。其余全部原生测试套件未在本次重新运行。

Python 逻辑检查不依赖 Android 构建链；本次没有重新安装 APK 或调用真实模型 API。第三方素材许可尚未核实的游戏资源已从展示副本排除，二维游戏目录用于代码审阅和逻辑验证。

## 原工程已有报告

- 校园项目：2026-10-09 的28道开发回归题目标原文进入Top3；11次来源核对通过，独立问法9种。2026-10-10 完成 PostgreSQL 恢复及原件核验。摘要保留报告时间、指标边界和原报告 SHA-256，见 `projects/campus-rag/validation/historical-summary.json`。
- Android 项目：2026-10-13 的核心77项、本地 Android 单元7项及 Python38项检查通过，记录见 `projects/android-ai-assistant/docs/TEST_REPORT.md`。一轮有限配置真机 DeepSeek＋双 Skill 流程经3次请求产生4条候选。正式A/B与人工评分尚未完成。
- Godot 项目：交付目录原有40套模块测试报告均通过，逐套结果见 `projects/honghuang-godot/validation/historical-summary.json`。属于历史记录，不代表本次复跑全部40套或完成视觉验收。

`SOURCE_INVENTORY.json` 记录原工程复制文件的路径、大小与 SHA-256；Git 可按各项目 `.gitattributes` 规范化文本换行。仓库说明及本次验证记录为发布时补充。密钥、真实聊天、运行数据库、模型权重和个人部署配置未收录。
