# 校园知识服务与溯源问答

面向校园公开通知、竞赛与办事资料的应用项目。使用 Python、FastAPI、SQLAlchemy、Ollama 与 Qwen3，贯通资料采集、文档解析、检索、问答和原文溯源。开发中实际使用过 PostgreSQL、Docker 与 Dify；本展示副本默认 SQLite，不包含运行数据或 Dify 全栈。

## 实现内容

- 官网公开资料与 PDF/Word 等附件解析；分页筛选、字段候选和教师审核发布流程。
- 多轮咨询与年份、话题范围约束；展示原文片段、位置、来源 URL、日期及版本。
- 检索与模型输出分离核验，支持来源定位、备份恢复及中断后继续处理。

## 快速启动

以下命令在本项目目录执行。推荐 Python 3.11；先安装相应 Python 环境及 Ollama。

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
ollama pull qwen3:8b
python -m uvicorn app.main:app --host 127.0.0.1 --port 8008
```

访问 `http://127.0.0.1:8008`。首次启动为空库，需自行导入公开资料。管理端随机口令首次启动写入 `.secrets/admin-password.txt`；请仅在本机读取，勿提交。可用 `DATABASE_URL`、`CAMPUS_DATA`、`OLLAMA_URL` 配置独立环境。

## 验证与边界

`validation/historical-summary.json` 是原始本地报告的脱敏摘要，保留时间、指标定义与原报告哈希。2026-10-09 的 28 道开发回归题目标原文进入 Top3；11 次问答来源核对通过，其中独立问法9种。前者是检索召回，后者是有限来源核对，均不代表总体回答准确率或教师审核结果。

```sh
python -m pytest tests/test_model_evidence.py tests/test_evidence_windows.py -q
```

该命令验证隔离的证据逻辑，不调用真实模型。生产数据库、原件、模型权重、个人服务器配置与凭据未发布。项目不是学校官方服务，也未接入学校统一身份认证。


## 验证记录

本仓库的检查条件和结果见 [VALIDATION.md](VALIDATION.md)。
