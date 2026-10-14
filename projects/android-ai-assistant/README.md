# 个性化 AI 对话辅助 Android 应用

Kotlin / Jetpack Compose 原生 Android 个人项目。结合人工确认的聊天历史、联系人档案与表达习惯，编排多视角分析和候选回复；候选由用户选择、编辑和复制。

## 核心实现

- `product-core`：上下文与档案隔离、风格统计、Skill 编排、HTTP 契约、严格 JSON 校验及 token 费用估算。
- `product-app`：原生页面、前台读屏与 OCR 核对、历史归档、证据回查、候选编辑和文件导出。
- SQLite 与 Android Keystore；业务记录使用 AES-GCM 加密，媒体采用分块认证加密。
- `qa-runner`、`qa`：实际引擎复用、合成输入、评分及审计工具；探针和产品模块分别保留。

## 构建

需要 JDK17、Android SDK36 / BuildTools35，产品 Android11+。用 Android Studio 打开本目录，在本机配置 SDK 路径；不要提交 `local.properties`。

```powershell
.\gradlew.bat :product-core:test
.\scripts\Build-Product.ps1
python -m unittest discover -s scripts/tests -v
```

真实模型调用需在设备上自行配置 API Key，并确认输入资料的处理范围。源码与测试不包含真实聊天、密钥或设备截图。

## 已有验证

2026-10-13 原工程记录：核心77项、本地 Android 单元7项、Python38项通过。0.3.2 真机的一轮 DeepSeek＋双 Skill 流程经3次请求成功产生4条候选；在临时关闭 Jev 的有限配置下完成，不能视为完整架构或模型稳定性验收。0.3.3 已构建，未把旧真机结果算作新版本结果。

100组合成输入与盲评工具已建立，正式A/B及人工评分仍为0/100。OCR需核对，应用不会自动在微信填写或发送消息。详见 `docs/ARCHITECTURE.md`、`docs/TEST_REPORT.md`、`docs/KNOWN_ISSUES.md`。

## 来源许可

整合的上游 Skill 保留原文件、锁定版本和许可证；见 `docs/THIRD_PARTY.md` 与 `research/licenses/`。不把第三方 Skill 或 SDK 写成本人原创。
