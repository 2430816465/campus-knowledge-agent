# 工程测试报告

## 0.3.3配置与回复规则（当前）

2026-10-13晚间，productVerification成功：核心77＋Android本地7项通过，Python38项重跑通过，lint0错误1警告，签名通过。配置check和未授权run阻断已实际执行，后者在创建结果目录、预留或推理前停止。新增聊天/见面区分、取消更新旧约定、风格不足提示规则；没有把编译通过当语义改善。6组虚构对话生成尚待本批Jev例外授权，新增推理0，正式100组仍0/100。

APK0.3.3-development/versionCode5，72356334字节，SHA256 `291987d87fba8ead5df12dd16eb01548bf23d243c391949212b3b96760f390ba`。当前无ADB设备，未安装或真机测试。reports/product现在为0.3.3；下节及手机报告记录0.3.2的历史事实。配置、既有候选复核及待执行样本见CONFIG_AND_DIALOGUE_CHECK_20261013.md。

## 0.3.2产品修复与真实生成（历史）

2026-10-13，实际productVerification成功：核心77项、本地Android单元7项全部通过，0失败/错误/跳过，qa-runner编译成功，lint0错误1警告2提示。新增SkillOutputTest4项覆盖严格结构/引用、固定字段脱敏诊断、失败仅调用一次及usage费用保留，没有自动付费重试。之前38项Python检查和0.3.0模拟器6项保留为各自历史；0.3.2没有重跑仪器测试，避免干扰真机无障碍通道。

APK versionCode4 / 0.3.2-development，72356334字节，SHA256 `ecee2c62285c33c14fc72f3a6f60f7f3cce6d486130aa560670ddf44e4afc38d`，Debug签名、min30/target35已核验。12:11正常adb覆盖安装Success，设备base.apk哈希一致，持有人自行解锁；原六条文字及DeepSeek配置经实际导出确认保留。

| 真实场景 | 结果与边界 |
|---|---|
| P04R新消息核对/归档 | 3条新消息经核对追加，总6条；正文/顺序/方向/未知时间/来源/原件及SAF导出核验通过，全部微信历史未知 |
| P05首轮（0.3.1） | 首Skill JSON失败；真实请求1次，¥0.032374估算，0候选；具体根因未知，失败保留 |
| P05B重测（0.3.2） | 用户明确仅本轮临时关闭Jev；双Skill＋最终生成3次真实成功，4候选，分段1/2/1/1，6/6已提供历史及最新3条目标正确 |
| 真实交互 | 完整分析展开、证据回查、候选选择/编辑/移除、明文ZIP导出通过；草稿没有作为已发入库，未执行微信输入或发送；复制及悬浮候选面板未本轮验证 |
| 真实费用 | 本轮¥0.124052，含P05累计¥0.156426；TOKEN_ESTIMATE，额度100未增加；服务商账单未核对 |
| 恢复 | 12:34保存Jev/双Skill全开、临时云端和组件说明确认关闭，再进入模型页核验；没有额外生成 |
| 尚未验收 | Jev独立凭证、100组对照、人评0/100、主播口吻样本0；第三候选“聊→见”语义风险；导航/撤权/长期稳定性待 |

公开机器记录为reports/product-phone/20261013-0945/session.json、p05-first-inference.json、p05b-inference-verification.json、p05b-install-verification.json；原聊天和Key不在交付包。reports/product当前为0.3.2构建，reports/product-0.3.1保留上一构建快照。后文按各版本和当时执行时间阅读。

## 0.3.1产品修复与真实手机补验（历史）

2026-10-13，用户已恢复真机测试。产品0.3.0安装/启动和权限准备已核验，P02观察到自动触发，但浮层消失、经最近任务返回后预览丢失，OCR正文未评估；没有把本场记作完整通过。条件、协议偏差和私有证据哈希见 PRODUCT_REAL_DEVICE_REPORT_20261013.md / reports/product-phone/20261013-0945/session.json。

0.3.1修复自动采样移除整个操作菜单、候选面板失效处理及短暂未知焦点的交接；进入已知其他应用仍清除，交接超时拒绝，迟到截图回调停止。诊断仅 Debug 事件元数据。实际 productVerification 构建成功：核心73项、Android本地交接测试7项全部通过，qa-runner编译成功，lint0错误1警告2提示。另实际运行38项Python测试通过，冻结和11份Skill/许可证哈希一致。单元测试不证明无障碍或微信行为。

APK实际versionCode3 / 0.3.1-development，73095625字节，SHA256 `73fef7be1ce69c7da562fd7b0c81280ed8053c253a5b9d83d5932f2220e63764`；Debug签名通过、min30/target35。红米覆盖安装哈希匹配，P02B自动采样、菜单保持、直接核对预览有限通过；P03H三条文字校对入库及来源通过。0.3.0的6项模拟器仪器结果保留，0.3.1未重跑。此P02B/P03H快照时真实AI0、人工评分0；后续P05失败另记，不能把早期0当当前总数。0.3.1构建快照见reports/product-0.3.1。

## 0.3.0产品研发版：历史结果

2026-10-13，按CR-20261013-04实现前台采样、最新消息核对后自动分析。手机按CR-02暂缓。本次检查均为本机真实命令执行；没有以模拟器或网络夹具代替微信/真实AI验收。

| 检查 | 实际结果与证据 |
|---|---|
| 产品核心JUnit | **73通过，0失败/错误/跳过**；CoreTest40、HistoryPipelineTest13、HttpContractTest6、ImportAndBillingTest4、StyleLearningTest2、LatestMessageTest8；reports/product/kotlin/ |
| 最新消息规则 | 未核对/跨范围/空正文拒绝、OCR控件不直接入库、未知时间保持空、持久化观察重放拒绝、同文不同次保留、连发目标顺序、修正/新消息/已发使旧目标失效；均为合成规则验证 |
| 完整组件输入 | 标记夹具记录4次请求，Jev/双Skill/最终均含具体最新目标及完整21条历史；不是实际模型调用或语义评分 |
| Python | **38通过**；质量用例补查100组均以已确认对方消息结束；reports/product/python-tests.log |
| 产品构建 | productVerification成功；qa-runner编译成功，普通模型与完整组均增加同一reply_target，实验计划有流程版本防旧结果复用；gradle-build.log |
| Android模拟器 | API35 AOSP，**6通过**；两次实际安装/仪器执行均OK (6 tests)，修正失效防护后的当前结果见emulator-instrumentation.txt / emulator-script-build.log |
| 新增实际界面 | 在App输入最新消息，勾选核对，点击确认后入库并自动启动引擎；缺少云端配置显示真实错误，无候选/无费用；重放同观察被拒绝；原有账户/历史/锁定/加密/音频/OCR交互保持通过 |
| OCR | 合成图实际“台成測试 今天有点累明天再聊”，expected不同，exact_match=false；synthetic-ocr.json；只判定管线，不放宽成准确率通过 |
| lint | **0错误、1警告、2提示**；reports/product/lint/；target35警告保留 |
| APK检查 | 0.3.0-development/versionCode2，73090129字节，SHA256 8453050784f6289d1ac3d94e0a4de40be541d9fa869562e9a32e2414d8d93584；Debug签名成功、min30/target35；artifact-verification.json、apk-metadata.txt |
| 来源完整性 | 原冻结两份SHA匹配；固定上游11份Skill/许可逐字节一致；原始要求和旧G1证据未改写 |
| 本轮真实手机/微信/AI | **未执行**；新前台自动触发/撤权/稳定性待，真实生成0、人工评分0、95/100未验收 |

首次编译因截图回调中Toast使用错误this引用失败，原日志gradle-0.3-first-attempt.log保留；修正为服务Context后构建成功。复查补修同档案重新选择时请求清理、本App再进入其他应用时清理、服务中断/销毁暂停自动开关，以及已处理/丢弃观察不再自动恢复预览，随后重新构建安装并通过仪器测试。这些代码防护不证明所有微信导航事件均可观察。

全部OCR当前均须人工核对，未把整屏最后一行当作最新消息。前台自动采样仅有实现与静态工程验证；模拟器没有运行微信。指定红米补验清单见FOREGROUND_MESSAGE_ACCEPTANCE.md，操作见PRODUCT_INSTALL.md，AI质量仍见AI_QUALITY_TEST_REPORT.md。

## 0.2.0产品研发版：历史结果

以下为2026-10-12交付时的历史数值，保留原结论；reports/product中的同名当前构建/JUnit/仪器/APK检查文件已由0.3.0更新，当前结果以上节及文件时间戳为准。

按CR-20261012-02继续独立研发，手机测试暂缓。以下产品测试与后文保留的0.1.4探针历史结果属于两套工程，不能互相替代验收。

| 检查 | 实际结果 / 原始证据 |
|---|---|
| product-core JUnit | **64通过，0失败/错误/跳过**；CoreTest40、HistoryPipelineTest12、HttpContractTest6、ImportAndBillingTest4、StyleLearningTest2；reports/product/kotlin/ |
| Python | **38通过**（证据28+质量协议10）；reports/product/python-tests.log |
| 产品构建 | productVerification成功，含核心测试、qa-runner编译、lint、真实APK；reports/product/emulator-script-build.log |
| 产品lint | **0错误、1警告、2提示**；reports/product/lint/；target35警告保留 |
| Android模拟器 | API35 AOSP x86_64，**5通过**；emulator-test-final.log、android/、emulator-instrumentation.txt |
| 可复现仪器脚本 | Test-ProductEmulator.ps1核验emulator-5580后安装并实际am instrument；OK (5 tests)，未操作手机 |
| 实际模拟器行为 | Compose创建账户/主播/观众、导入并逐条核对、入库2条及锁定；Keystore/SQLite密文、重建解密/异账户拒绝、原件往返删除；RAM WAV播放；ML Kit运行 |
| 合成图OCR | 预期“合成测试 今天有点累 明天再聊”，实际“台成測试 今天有点累明天再聊”；**exact_match=false**；synthetic-ocr.json。仅管线smoke，不作准确率通过 |
| HTTP协议 | 本机回环验证JSON/SSE/Bearer/Jev/限流/未知费用；返回体是明确夹具，**不是实际供应商模型** |
| 来源许可 | 11份Skill/许可与固定上游commit逐字节一致；research/skill-files.json、verify_product_sources.py |
| 产品APK | 72862997字节；SHA256 d686e0fc76e36e8ebb8820aa7be53d4a755a295d6cdb5f08fd96f672ca5ae623；Debug签名校验通过，min30/target35；artifact-verification.json |
| 产品权限 | INTERNET用于AI；无联系人/录音/全盘存储/SYSTEM_ALERT_WINDOW/SEND_SMS；文件通过SAF，无障碍由本人授权 |
| 桌面质量工具 | 帮助/状态/未核账拒绝/模型与Key缺失拒绝实跑通过；runner-smoke.json、runner-keyless-smoke.json；未调用供应商 |
| 盲评网页 | 实际Chromium文件载入、1000条历史搜索、评分保存/CSV/备份及冲突保护、桌面/手机宽度；judge-browser.json。工具夹具分数不算人工验收 |
| 模拟器启动/视觉 | 最终产品实际启动，修正浅色状态栏，product-launch-emulator.txt / product-home-emulator.png；不是红米截图 |
| 100组质量 | 输入/真实runner/匿名评审/严格评分器准备完成；真实调用0、人工评分0、通过数未知 |

修复前失败保留在emulator-test-build.log和ui-test-debug.log。OCR有错字，改为管线测试后仍记录expected/observed，未宣称准确率达标。历史入库按钮在横向滚动区域未显示，测试未实际点击；提交操作改为纵向全宽按钮，加入可见性与滑动检查，最终真实界面入库和锁定通过。另修复qa-runner编译依赖/语法、APK检查脚本PowerShell数组匹配。

未执行：产品红米安装/读屏/浮层/撤权/锁屏/长期稳定性，真实供应商接口、100组A/B人工盲评、真实月费。模拟器材料全部为SYNTHETIC，不是微信证据。输入覆盖不证明模型语义质量。完整复现步骤见PRODUCT_INSTALL.md和AI_QUALITY_TEST_REPORT.md。

## 0.1.4 G1探针历史结果（保留）

日期2026-10-12。本报告仅描述本机实际命令结果，不能替代指定红米或真实微信测试。

| 检查 | 命令/证据 | 实际结果 |
|---|---|---|
| 冻结输入完整性 | `python scripts/verify_baseline.py`；reports/baseline-index.json | 两份 SHA256 匹配，190非空源文行可追踪 |
| Kotlin规则 | `:probe-core:test`；reports/tests/kotlin/TEST-*.xml | **24通过，0失败/错误/跳过**；证据规则13+异步读取取消规则6+预览失效规则5 |
| 独立G审计 | `python -m unittest discover -s scripts/tests -v`；reports/tests/python-audit-tests.log | **28通过**，仅合成规则输入；新增点击材料排除旧后台成功 |
| Android源码与资源 | `scripts/Build.ps1` → stageVerification/assembleDebug | **BUILD SUCCESSFUL**，0.1.4本机增量1分10秒；55任务，27执行/28复用；不包含首次下载时间 |
| Android lint | `:app:lintDebug`；reports/tests/lint/ | 0 Error、9 Warning，明细见原始 XML/HTML |
| Android App 单元测试 | `:app:testDebugUnitTest` | **NO-SOURCE**；不得计作 App 行为测试通过 |
| APK签名 | build-tools35/apksigner；reports/tests/apk-signature.txt | 校验通过，v2，单个 Android Debug 签名者 |
| 最终APK权限 | aapt dump permissions；reports/tests/apk-permissions.txt | 没有 INTERNET、全盘存储、SYSTEM_ALERT_WINDOW、联系人或录音权限；读取浮层使用已连接无障碍服务的TYPE_ACCESSIBILITY_OVERLAY |
| APK基本信息 | aapt dump badging；reports/tests/apk-metadata.txt | 包名cn.xindong.g1probe；min30/target35/compile36；四种ABI |
| ADB设备 | reports/environment/latest-connection-check.json；G0_DEVICE_BASELINE.md | 更换USB线后真实授权设备可见；最初无设备记录保留 |
| 真机安装/启动 | G1_REAL_DEVICE_REPORT.md | 0.1.4安装Success；am start -W Status: ok；点击读取浮层实际显示 |
| 系统授权/连接 | 系统服务状态、S04的8次心跳 | 无障碍/通知监听实际连接，监测前台服务运行 |
| 真实加密保存与导出 | 50行本应用SQLite诊断、SAF完整导出与取回回执 | 密文存储/明文导出往返可运行；完整结束协议和三方SHA通过；不等于全部安全认证 |
| 后台微信通知 | reports/tests/real-s04-observation.json | 3次动态表情通知更新、2次通知型无障碍事件；0个符合完整消息资格的候选；没有完整独立G/A，不算场景通过 |
| 后台无通知 | reports/tests/real-s05-controlled-observation.json | 持有人确认收到3条且未打开微信；自动候选0，旧P0未通过；不计算正式G/A |
| 前台旧版对照 | reports/tests/real-s01-visible-observation.json | 26个空节点快照、无OCR结果；66611ms心跳间隔，原因未确定 |
| 新版点击读取 | reports/tests/real-click-visible-observation.json；G1_REAL_DEVICE_REPORT.md | 0.1.3三次真实窗口截图及OCR、结果预览、完整导出已核验；文字含错，联系人等仍未确认 |
| 页面切换/撤权 | G1_REAL_DEVICE_REPORT.md | 0.1.4首场未执行返回列表；正确重测B的空预览、读取后失效和完整导出已核验，只支持本次清除；撤权C进行中 |

Kotlin验证：未知身份不合并、相同正文的不同消息不合并、稳定消息字段一致才合并、不同主播命名空间、断档/重启/时间回拨线索、黑帧判定及哈希变化；停止/请求ID/场景/窗口/导航变化取消；仅当前非空请求可更新预览，失效/清空后拒绝迟到结果。规则尚未形成可验证的微信消息解析通路。

Python验证：独立G分母、缺失、串人、未知身份/方向/顺序、同文两条不误去重、观察不复用、跨通道稳定ID合并、手动截图/人工修复排除、截止后才打开/历史旧观察/不同run排除、模糊多ID、真值之外的错误消息、完美召回不能掩盖错人、正文/来源/单调时钟改动拒绝、日志截断拒绝、有效前缀缺结束标记拒绝、导出数量/ID/最终哈希校验、结束后多余数据拒绝、旧格式不静默通过、完整空导出不算收录成功、样本成功也不自动放行G1。

全部合成数据仅在 unittest 内存/临时目录中使用；没有制造真实微信证据或100组AI评分。

## 失败与修复

首次 JDK17 Windows 中文 classpath 导致 JUnit 找不到已编译类，保留 gradle-first-attempt.log；构建输出迁到英文 LOCALAPPDATA 缓存，源码位置未变。第二次编译修正 NotificationCompat.MessagingStyle 调用和 MediaProjection 可空 token，保留 gradle-second-attempt.log。之后 Build.ps1 真实构建成功。最终检查发现 ML Kit 转依赖带来 INTERNET，已用 manifest merger remove 移除并重建；最终权限以 APK 检查为准。

仍有非致命提示：Android overridePathCheck 实验选项（中文源码路径）、SDK XML版本解析提示；lint 的2项 SharedPreferences 同步提交（会话边界有意立即落盘）、6项KTX风格建议、1项target35未追至最新API。0.1.4将服务静态引用改为弱引用，原StaticFieldLeak警告消除；曾出现的备份兼容提示已通过 fullBackupContent=false 配置和强制 lint 重跑消除（lint-refresh.log），Android12+排除 cloud/device-transfer；这些静态配置不能代替真机备份/恢复检查。屏幕采样增加前后窗口/场景检查，异步切窗竞态仍待真机验证。不把“lint成功”写成零警告或全部安全已验证。

最终APK可重新运行 scripts/Inspect-Apk.ps1 检查，JSON证据在 reports/tests/artifact-verification.json。

Windows aapt 对中文绝对路径曾报 Illegal byte sequence，已改为在工程目录传 ASCII 相对APK路径并实跑成功；安装/取回脚本同样采用相对本地路径，已在设备执行。真机过程另修复短组件名称权限比较、旧服务实例销毁引用、导出竞态和跨场景旧心跳误报；原始失败文件与未改动旧场景日志保留，细节见G1_REAL_DEVICE_REPORT.md。

## G1探针当时未执行（产品后续见开头）

没有模拟器、设备仪器测试、完整G/A验收、前台/OCR准确率结论、MediaProjection权限会话、从未打开新会话、锁屏/休眠/强停重启、Keystore备份恢复、长时耗电/ANR测试。S05已完成上述观察，未取得后台正文；新点击已取得有限待校对材料，返回列表清除重测B已核验，其余切换情境未测。撤权C的撤权前预览已核实，后续USB中断，撤销/恢复结果待核验。没有AI真实接口调用、100组评分或普通模型对照测试。未执行项目保持NOT_TESTED/NOT_STARTED。

G1/P0结论见 G1_P0_REPORT.md，不能由本报告的工程测试通过直接推定。
