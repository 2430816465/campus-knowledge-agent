# 上游源码、Jev 与许可核查

产品研发补充：CR-20261012-02后已实际集成固定版本双Skill文本及选定框架参考，11份资源逐字节核对，清单/哈希在research/skill-files.json，许可与集成边界见THIRD_PARTY.md。默认分别运行分析步骤，再由生成模型撰写主播口吻候选；Jev真实HTTP适配与协议测试已实现。没有供应商Key，实际接口0次。下方“本探针/当前只研究”是此前G1研究快照，不表示产品仍未实现组件。

核查日期2026-10-12；匿名 Git 克隆到 research/upstream/，仅研究，未把其应用代码拼入本探针。固定 revision 见 research/upstream-lock.json，源码引用以下均指固定 commit，不能视为将来主分支的承诺。保留相应许可原文于 research/licenses/。

## Jev 聊天助手参考工程

[goutoujunshi-jev-chat](https://github.com/shengjidaguai-china/goutoujunshi-jev-chat/tree/31618bd654d813f065f65f0289615c656b3d2d58)，commit `31618bd654d813f065f65f0289615c656b3d2d58`，提交时间2026-10-06 21:35:14+08，Android README 标示 `0.1.8-preview`。

事实：根 LICENSE 为 MIT / 2026 powerycy；integrations/jev_android/ 有另一份 MIT / Finderchangchang and the jev-chat contributors 及 NOTICE。若分发其代码或衍生，应保留 LICENSE/NOTICE 和来源说明，不暗示作者背书。当前探针独立实现，保存许可是研究证据，不声称基于该代码实现了微信接入。

源码证据：[Android README](https://github.com/shengjidaguai-china/goutoujunshi-jev-chat/blob/31618bd654d813f065f65f0289615c656b3d2d58/integrations/jev_android/README.md) 明确写无法截取微信、暂不支持微信，真机验收未完成。`capture/ChatCaptureService.kt:543` 遇 `WECHAT_PACKAGE` 直接提示不支持并返回；存在旧微信节点 ID 不意味着通路可用。因此不能直接交其 APK 充当本项目成功。

阅读了 ChatCaptureService、ChatAppAdapter、JevClient、JevQuestions、JudgeClient 与 README/许可中的相关实现。可参考接口分层、类型化问题、状态展示思路；不能照搬以下行为：

- 固定3条候选与短文本限制不符合动态候选、任意长度和多条消息组。
- 输入框填写路径不符合本项目“绝不自动填框”。
- JevQuestions.buildState 取 snapshot 最后10条，可选追加 history；不能据此宣称全部历史已处理。
- JudgeClient.postDecisions 的 enriched 4xx 后去掉 background/history 重试，会静默损失历史；本项目禁止这么降级。
- JevClient 某些排序异常回退为零分，与本项目要求明确暴露组件失败不一致。

## 狗头军师 Skill

[goutoujunshi](https://github.com/shengjidaguai-china/goutoujunshi/tree/6db7354a4002dc7c448a9c87ffdad8132570c9d3)，commit `6db7354a4002dc7c448a9c87ffdad8132570c9d3`，2026-09-15 13:49:39+08；根 MIT / 2026 powerycy。已阅读 README 和 SKILL.md。

它提供分析流程与提示指令，不是独立微信数据读取器，也不天然有在线 API。上游问 MBTI、关系状态、主观分值和紧凑记忆的流程，不可强制成为新观众回复的前置条件；本项目要求无标签可用、实际证据优先、保存完整取得历史。主观分值不是心理真相。用户明确要求组件默认开启，过 G1 后按冻结基线保留开关、分析出处与分歧；当前未启用 AI 调用。

## 恋爱大师 / 瑞恩视角 Skill

[lian-ai](https://github.com/xxzzzzy/lian-ai/tree/3dc8f7334fb75f7d46c52b927b68f537326bea1d)，commit `3dc8f7334fb75f7d46c52b927b68f537326bea1d`，2026-09-07 07:14:11+08；根 MIT / 2026。已完整阅读 SKILL.md 并核对 README。

原 Skill 定位为用户明确请求的瑞恩视角分析，强调不冒充本人、不作临床诊断、不提供逐字代聊模板；它不是生成候选话术的现成 API。用户已明确要求该分析组件默认开启，此授权保留；将来应在组件说明里体现其视角、来源与退出方式，由该组件提供分析，最终候选仍由生成模型按主播本人风格撰写。不要把导师口吻当主播口吻，也不宣称其为所有恋爱问题的客观真理。当前只研究，未把聊天任务交给该 Skill。

README 所述公开视频转写数量/字数是上游自述，未逐份独立核验；根 MIT 不能自动证明所有底层视频、人物形象/声音和转写材料均获原作者授权。当前未打包素材库、声音或人物形象；正式再分发任何这些材料之前应逐项核对实际来源及许可，不能把仓库声明当第三方权利证明。

## Jev 官方接口

[TypeSafe 官方 API](https://docs.typesafe.ai/api) 当前文档为 `POST https://api.typesafe.ai/v1/systemone`，输入 model/state/questions，结构化返回 answers；支持 noul/choice/score。文档推荐别名 jev-latest，示例或别名不是固定生产版本保证；未来应记录真实调用模型与版本。不能直接复制上游旧 alpha/decisions 地址并假称验证成功。

Jev 判断/评分只辅助策略比较；把其数值解释为“观众真实心理概率”是未经验证的推断。完整多模型与双 Skill 质量仍需同输入盲评，不能由组合复杂度推出增益。本轮没有配置密钥、没有请求 Jev 或生成模型、没有产生 API 费用数据。

## 本探针 Android/OCR 依赖

AGP8.13.2、Gradle8.13、JDK17 组合依据 [AGP 官方要求](https://developer.android.com/build/releases/agp-8-13-0-release-notes)；Kotlin/Compose compiler2.3.21 依据 [Kotlin 兼容表](https://kotlinlang.org/docs/gradle-configure-project.html)。Compose BOM2025.04.01 与 app/probe-core 的解析版本已写 Gradle lockfile，未使用动态加号版本。

离线中文 OCR 使用 `com.google.mlkit:text-recognition-chinese:16.0.1` 的打包模型，[官方接入文档](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)。ML Kit 属 Google SDK 条款，不能因为示例页 Apache2 就称整个模型/SDK 为 MIT 开源。[ML Kit 条款与隐私说明](https://developers.google.com/ml-kit/terms) 说明输入在设备处理，SDK 可能另行联网获取更新/上传性能指标；本验证 APK 已从合并 Manifest 移除 INTERNET，并关闭默认 Firebase 数据采集配置，不具备直接联网权限。具体无网运行、初始化错误和耗电仍待红米实测。

Gradle Wrapper 保留 Gradle 项目的 Apache2 许可；AndroidX/Kotlin 等转依赖按其各自许可使用。当前交付为内部验证；完整商业发布前仍须按最终实际依赖生成完整许可清单和应用说明，研究仓库的 MIT 不替代 SDK 服务条款。
