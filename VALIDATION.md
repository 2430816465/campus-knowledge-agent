# 验证记录

2026-10-14，在隔离 SQLite 与临时数据目录中运行：

```sh
python -m pytest tests/test_model_evidence.py tests/test_evidence_windows.py -q
```

结果：33 passed。验证证据逻辑，不调用真实模型。

原工程历史报告：2026-10-09，28道开发回归题目标原文进入Top3；11次来源核对通过，独立问法9种。2026-10-10，PostgreSQL备份恢复及原件核验通过。详见 `validation/historical-summary.json`，其中保留报告时间、指标边界与原报告哈希。检索召回和有限来源核对不等同于总体回答准确率。

生产数据库、原件、模型权重、凭据和个人部署配置未发布。
