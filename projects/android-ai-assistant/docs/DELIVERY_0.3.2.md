# 0.3.2-development 修复与实测交付

本文件为0.3.2当时交付及真机实测的历史记录；通用APK/源码下载路径现已更新为0.3.3，以下0.3.2哈希只说明历史证据，不是当前下载包哈希。当前交付见DELIVERY_0.3.3.md。

2026-10-13，Asia/Shanghai。真实原生Android工程、Debug APK及源码包已提供；指定红米实际覆盖安装、原账户解锁和资料保留已核验。P05B在用户明确仅本轮临时关闭Jev授权下，DeepSeek＋双Skill真实生成成功。完整Jev架构及正式100组质量仍未验收，不作为正式发布版。

## 文件与安装

- 产品APK：[xindong-junshi-debug.apk](../deliverables/xindong-junshi-debug.apk)。versionCode4 / 0.3.2-development，72356334字节（约69.0MiB），minSdk30/targetSdk35，Android Debug签名。
- 完整源码：[xindong-junshi-source.zip](../deliverables/xindong-junshi-source.zip)，包含原生产品、独立探针、AI核心、质量评审工具、依赖锁文件、测试、许可和公开报告。
- 校验：[SHA256SUMS.txt](../deliverables/SHA256SUMS.txt)、[逐文件清单](../deliverables/source-files.json)。APK SHA256：`ecee2c62285c33c14fc72f3a6f60f7f3cce6d486130aa560670ddf44e4afc38d`。
- [安装与使用](PRODUCT_INSTALL.md)、[环境与依赖](ENVIRONMENT_REPORT.md)、[架构](ARCHITECTURE.md)、[来源许可](THIRD_PARTY.md)。覆盖安装，不卸载已有产品；口令由本人保管。

12:11正常adb install -r返回Success，设备base.apk哈希与上述相同。持有人自行解锁后，同一主播/观众、六条历史和DeepSeek配置保留，实际导出确认正文逐字一致。早前INSTALL_FAILED_USER_RESTRICTED和本地安装记录保留，没有绕过安装或微信安全机制。

## 修复内容

P05首个Skill输出未满足JSON约定，原版没有足够诊断确认具体原因。0.3.2为两个独立Skill追加明确输出约定，严格检查字段、类型、非空内容及本观众引用；失败分类为EMPTY_CONTENT、INVALID_JSON、SCHEMA、FOREIGN_REFERENCE。安全诊断仅固定阶段/字段、长度和SHA256，不记录被拒原文、密钥或异常原始信息。没有静默修补输出、跳过失败组件或自动付费重试。

API Key输入框采用密码键盘配置；这项改动不代表已经验收所有输入法的隐私行为。默认Jev、狗头军师、恋爱大师仍全部开启。原始两份冻结文档和固定上游11份Skill/许可字节不变，未增加依赖。

## 实际结果

| 验证 | 结果 |
|---|---|
| 本轮构建 | productVerification成功，qa-runner编译成功，签名核验通过 |
| 本轮单元测试 | 核心77＋Android本地7＝84项通过，0失败/错误/跳过 |
| 其他工程证据 | 之前Python38项通过；0.3.0模拟器6项为历史，0.3.2未重跑仪器测试 |
| lint | 0错误、1警告、2提示，target35发布适配待 |
| 真实历史 | P03H提供3条＋P04R核对新3条，来源/顺序/原件/导出及升级保留通过；全部微信历史未知 |
| P05失败 | 真实首Skill请求1次、0候选，usage估算¥0.032374，具体根因未知，未自动重试 |
| P05B成功 | 真实双Skill＋最终生成3次请求，4候选，分段1/2/1/1；报告目标准确对应最新3条，已提供历史覆盖6/6 |
| 真实交互 | 候选选择/编辑/移除、完整分析展开、证据回查、SAF导出核验通过；草稿未成为已发样本 |
| 本轮费用 | ¥0.124052；含P05累计¥0.156426，全部为usage×配置价格估算，服务商扣款未核对；100元额度未增加 |
| 结束恢复 | 12:34保存并再进入页面核验Jev/双Skill全开、临时云端及组件说明确认关闭，DeepSeek配置保留 |

实测报告：[PRODUCT_REAL_DEVICE_REPORT_20261013.md](PRODUCT_REAL_DEVICE_REPORT_20261013.md)；机器摘要：[P05B](../reports/product-phone/20261013-0945/p05b-inference-verification.json)、[安装](../reports/product-phone/20261013-0945/p05b-install-verification.json)、[会话](../reports/product-phone/20261013-0945/session.json)。原始聊天画面、明文资料ZIP及凭证排除于Git和源码包，仅保留私有证据路径及哈希。

## 未通过的验收与下一步

Jev独立凭证缺失，DeepSeek密钥不能替代；本轮Jevoff只按用户有限授权，现已恢复开启。因此默认完整架构仍会在缺少Jev配置时阻断。正式100组普通模型对照与完整架构输出0/100、人工评分0/100，通过数未知；不能从单轮候选推导≥95/100。评审执行方法见[AI质量报告](AI_QUALITY_TEST_REPORT.md)。

P05B第三候选把“明晚聊”写成“明晚见”，存在额外暗示见面的风险；主播已发送样本0，严格模仿本人风格未验收。OCR含错字、标题和控件，身份、方向、最新状态仍须核对。双向/多媒体、跨会话/权限恢复、锁屏/重启、长期稳定性、候选悬浮面板、剪贴板复制/真实人工发送反馈、实际账单和整包恢复仍待验证。见[已知问题](KNOWN_ISSUES.md)及[真机补验清单](FOREGROUND_MESSAGE_ACCEPTANCE.md)。

下一步是配置独立Jev账户和授权主播已发样本，完成默认全组件有限连通，再执行正式100组对照及人工评分；同时补做真机权限、导航与稳定性矩阵。每一轮云端调用仍按明确授权和本机费用控制执行。
