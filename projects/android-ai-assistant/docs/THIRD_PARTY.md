# 来源、许可与分发范围

上游固定 commit 见 research/upstream-lock.json；逐份实际打包文件的 SHA256、相对来源和许可见 research/skill-files.json。`python scripts/verify_product_sources.py` 检查字节与文件全集。上游主分支之后的变化不会自动进入产品。

| 来源 | 固定版本 | 本工程用途与许可 |
|---|---|---|
| shengjidaguai-china/goutoujunshi-jev-chat | 31618bd654d813f065f65f0289615c656b3d2d58 | 源码研究，未复制其应用实现；根 MIT、Android 子目录 MIT/NOTICE 均留在 research/licenses |
| shengjidaguai-china/goutoujunshi | 6db7354a4002dc7c448a9c87ffdad8132570c9d3 | 原样打包 SKILL.md / LICENSE，作为独立分析视角；MIT |
| xxzzzzy/lian-ai | 3dc8f7334fb75f7d46c52b927b68f537326bea1d | 原样打包下列 Skill 与框架说明、LICENSE；MIT |
| Gradle Wrapper / Gradle 8.13 | 固定分发校验和 | Wrapper 及分发许可见 research/licenses/gradle-distribution-LICENSE.txt |
| Kotlin / AndroidX / Compose / JUnit | Gradle lockfile | 构建、UI 与测试；按各自 artifact 许可使用，主要为 Apache 2.0 / EPL，不能把全部依赖一概称为 MIT |
| JSON-java 20250517 | JVM/桌面锁定版本 | 仅 JVM/桌面显式依赖；Android 使用系统 org.json；依实际 POM/项目许可 |
| ML Kit 中文 OCR 16.0.1 | 锁文件固定模型 SDK | Google SDK/服务条款；打包模型不等于 MIT 开源模型 |

恋爱大师资源范围：SKILL.md；references/六个核心心智模型.md、回答协议.md、safety-protocol.md、defense-patterns.md；references/research/05-decisions.md、06-timeline.md、08-supplement-2026.md。它们为作者整理的框架、决策和使用边界说明。SkillLibrary 会实际加载这些文件，默认分别调用分析模型，最终候选仍使用主播本人风格。

没有打包全部公开直播转写、音视频、外部图片、声音或肖像。上游所称材料数量是作者自述，未逐份验证；根 MIT 不代表第三方原素材权利已经逐项查清。此处不承诺导师身份背书、心理结论真实性或方法适用于所有关系。

集成边界：用户明确授权这两种视角默认开启；原独立 Skill 的激活/提问流程不强制覆盖本项目交互。恋爱大师用于分析，最终消息由独立生成步骤按照主播历史撰写；不冒充作者、不给心理诊断、不照抄作者口吻。不把 Skill 误当独立收费 API。

Jev 使用 [TypeSafe 官方协议](https://docs.typesafe.ai/api)，服务许可、账户费用及用户所选模型另按供应商条款。可切换 chat/completions 接口参考 [DeepSeek 官方接口文档](https://api-docs.deepseek.com/api/create-chat-completion/)，不是所有兼容供应商均已实测。

ML Kit 依据 [Android 中文 OCR 接入说明](https://developers.google.com/ml-kit/vision/text-recognition/v2/android) 与 [服务条款](https://developers.google.com/ml-kit/terms)。G1 离线探针移除 INTERNET；产品因 AI 需要 INTERNET，不能再声称产品完全无网。产品关闭 Firebase 默认采集配置，但这不等于对所有 SDK 联网行为已完成网络审计。

源码包包含许可证原文和固定来源。当前为研发 Debug 分发；商业发布前还须依最终实际发布变体核对完整转依赖通知、SDK 条款、正式签名与商店政策，当前没有把研究许可清单写成法律认证。
