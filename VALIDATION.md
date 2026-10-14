# 验证记录

## 2026-10-15 同步与复验

2026-10-15，核对当前主工作目录中的 255 个发布范围文件，内容一致（比较时只忽略 UTF-8 BOM 和 CRLF / LF 差异）。本轮应用代码未变更，更新项目首页、模块说明、架构图及同步清单；未重跑真实模型或恢复测试。

2026-10-14 的 33 项隔离证据测试和更早的检索 / 恢复报告保留为历史证据，日期与统计口径不变。

源码文件及发布字节哈希见 [SOURCE_INVENTORY.json](SOURCE_INVENTORY.json)，同步范围见 [同步摘要](validation/source-sync-20261015.json)。

## 历史记录（原日期保留）

2026-10-14，在隔离 SQLite 与临时数据目录中运行：

```sh
python -m pytest tests/test_model_evidence.py tests/test_evidence_windows.py -q
```

结果：33 passed。验证证据逻辑，不调用真实模型。

原工程历史报告：2026-10-09，28道开发回归题目标原文进入Top3；11次来源核对通过，独立问法9种。2026-10-10，PostgreSQL备份恢复及原件核验通过。详见 `validation/historical-summary.json`，其中保留报告时间、指标边界与原报告哈希。检索召回和有限来源核对不等同于总体回答准确率。

生产数据库、原件、模型权重、凭据和个人部署配置未发布。
