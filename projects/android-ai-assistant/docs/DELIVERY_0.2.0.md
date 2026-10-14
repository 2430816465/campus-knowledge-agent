# 0.2.0-development 交付说明

这是2026-10-12历史交付记录。当前同名APK/源码包已更新为0.3.0-development，最新行为、哈希与测试见DELIVERY_0.3.0.md及deliverables/SHA256SUMS.txt。

2026-10-12。按用户最新授权，先完成不依赖手机的工程研发与测试。原PRD/Master完整保留，CR-01变更为主动读取/授权导入，CR-02允许手机暂缓期间继续独立研发；不宣布G1通过。

## 已交付

- 产品APK：deliverables/xindong-junshi-debug.apk，Android11+，Debug签名，约69.5MiB。
- 独立G1探针APK：deliverables/xindong-g1-probe-debug.apk，保留原现场验证程序。
- 完整源码：deliverables/xindong-junshi-source.zip，含Wrapper、依赖锁、模块源码、测试、100组输入、盲评工具、许可证及公开报告。
- 外部校验清单：deliverables/SHA256SUMS.txt；源码逐文件清单：deliverables/source-files.json。
- 安装/使用：PRODUCT_INSTALL.md；架构：ARCHITECTURE.md；AI/费用：AI_PIPELINE.md；需求：REQUIREMENTS_STATUS.md；问题：KNOWN_ISSUES.md。

源码ZIP不含API Key、真实私聊、原始真机证据、上游整仓、构建缓存或APK。两个APK单独提供；本地Git保留开发记录，源包不含.git。没有替换原始冻结文件或旧P0失败证据。

## 当前验证

64项产品核心JUnit、38项Python、5项自有App Android模拟器测试通过。产品lint0错误1警告；真实APK签名/权限检查通过。最终模拟器原始输出及摘要绑定产品SHA；历史失败和早期UTP结果分开保留。

实际测试覆盖核心规则、HTTP回环契约、加密/隔离/原件、真实Compose导入校对入库和锁定、WAV播放、本地OCR管线。OCR合成图含错字，未宣布准确率通过。实际浏览器检查盲评载入/1000条搜索/评分/CSV/备份/异常保护及桌面/手机宽度；自动填入的工具测试分数不算人工验收。桌面真实接口runner的未核账及模型/Key缺失路径实跑拒绝，没有调用服务商。

最终产品APK SHA256：d686e0fc76e36e8ebb8820aa7be53d4a755a295d6cdb5f08fd96f672ca5ae623。源ZIP和探针哈希以外部SHA256SUMS为准，避免在ZIP内部自引用哈希。

## 仍待完成的验收

| 项目 | 状态 |
|---|---|
| 新G1撤权/恢复及指定红米产品读屏/浮层/导航 | 用户暂缓手机测试，未通过 |
| 长期运行、休眠/重启、权限/ROM、耗电/ANR及真机多主播/媒体矩阵 | 未完成，不以模拟器替代 |
| Jev与生成服务实际连通/usage/账单 | 无Key，真实调用0 |
| 100组普通模型与完整架构对照、主播匿名盲评≥95/100 | 输入与工具已就绪；真实生成0组、真实人工评分0组，通过数未知 |
| 正式发布签名/分发 | 当前为研发包，未完成正式发布验收 |

软件提供原件和人工完整描述/转写，未实现自动ASR/视频语义或ZIP整包恢复。所有已实现项及边界逐项列在需求追踪和已知问题中；没有用静态页面、假模型结果或最近几条历史冒充完整能力。下一次集中补手机验收；真实AI需在本机私有配置中填写Key与经核验价格后按AI_QUALITY_TEST_REPORT.md执行，不在聊天传密钥。
