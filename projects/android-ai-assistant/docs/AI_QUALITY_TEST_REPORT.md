# AI质量、100组与匿名对照

2026-10-13晚间0.3.3补充：配置核查和既有P05B四候选工程复核已完成；新6组虚构对话真实生成待本批临时关闭Jev授权，新增推理0次。回复规则已补充，尚未宣称语义问题修复通过；本轮122项为工程检查，不是对话质量分数。详见CONFIG_AND_DIALOGUE_CHECK_20261013.md。

正式100组状态：**PREPARED_NOT_EXECUTED；真实A/B生成对0/100，人工评分0/100，通过数未知**。手机已配置DeepSeek并真实推理4次：P05失败1次，0.3.2 P05B双Skill及最终生成3次成功、得到4条候选。P05B按用户明确授权临时关闭Jev，结束已恢复；Jev独立凭证仍缺失。这是单一会话六条测试文字的有限验证，不能计入完整架构对照或95/100验收。

P05B确认了回复目标和6/6已提供历史覆盖，但第三候选将“明晚聊”写成“明晚见”，且主播已发样本0，语义风险及本人风格未验收。累计usage估算¥0.156426，非已核对账单。详细真实条件及私有证据哈希见PRODUCT_REAL_DEVICE_REPORT_20261013.md和p05b-inference-verification.json。

## 已准备

qa/cases.jsonl含100组明确标识为SYNTHETIC_NOT_REAL_WECHAT的输入，10类各10组：新观众零标签、共情、拒绝、矛盾、1000条长历史、媒体内容未知、连发、主播风格、同名身份、提示注入。qa/manifest.json保存输入哈希，200行人工评分模板不预填分数。

长历史样本含第35/410/899条的生日/咖啡过敏/体检安排；核心测试只证明全部原文提交和锚点未被截断，不证明真实模型正确理解。媒体未知样本检验不臆造，不能代替真实图片/语音识别准确率。

qa-runner复用产品AnalysisEngine，真实HTTPS生成普通模型和默认Jev+双Skill完整系统；按同一历史/问题/主播风格输入随机匿名A/B。完整系统的组件调用、模型、覆盖与费用审计私有保存。qa/judge.html仅读取grading文件供人工评分，不访问网络、不揭示映射、不自动打分。

0.3.0按CR-20261013-04增加明确reply_target：两组均接收同一批尾部已确认对方消息ID/版本/正文及全部历史，完整组额外执行默认组件；不是只给完整组补充最新消息。实验计划标记LATEST_REPLY_TARGET_V1，旧流程目录禁止恢复，须新建私有实验目录以免复用没有目标的旧结果。100组合成输入均以已确认对方消息结束，工程校验不等于真实读屏自动识别或人工质量评分。

评分器校验100个唯一真实生成对、完整组件SUCCEEDED、匹配输入/候选文件SHA、200行具名人工A/B评分；空白、夹具、缺组件、混用不同实验分数均拒绝。文件/哈希只能审计一致性，不能自行证明评分者身份或服务商返回真实性，仍须可靠的实际执行记录。

## 合格规则（保持冻结）

每组五项同时为1才算可用：至少一条直接用或轻微修改（明确拒绝时正确不回复可用）；不编造/混身份；正确利用关键历史；贴近主播真实格式；尊重边界。完整架构至少95/100；普通模型同样统计。

另按自然度、口吻、历史、情绪、可用性各1—5人工评分，计算偏好及平均分。偏好不强制完整架构获胜；不得把模型自评分当人工评分，不得由组件更多推断质量更好。

合成测试证明不了每位真实主播的严格风格；正式推广前还应使用经授权真实主播历史复核，不改变冻结的100组门槛。

## 本机配置及执行

不要把密钥发到聊天。qa/private/已忽略，模板没有可用Key和单价。复制qa/config-template.json到qa/private/config.local.json，填写：真实端点/模型/Key、经核验上下文与输出容量、人民币输入/输出/缓存价和来源；确认cloudConsent/componentNoticeAccepted，保留三个组件开启。

billingReviewed仅在核对供应商本月已有费用后设true。previousMonthMicroRmb这个历史字段表示本月已花微元，1元=1000000微元，只在首次创建桌面账本时计入；跨月及其他设备后续费用仍须核对。模板的窗口、model别名和端点只是配置示例，不代表供应商当前规格已被实测。

先运行1组校验实际接口及账单，再显式扩展到100组。没有自动批准无限费用：

```powershell
.\scripts\Run-Quality.ps1 -Action status
.\scripts\Run-Quality.ps1 -Limit 1 -Output qa/private/run-reviewed
.\scripts\Run-Quality.ps1 -Limit 100 -Resume -Output qa/private/run-reviewed
```

Resume要求同一输入文件和公开模型配置，保留预先随机标签并复用完整且哈希匹配的已完成结果，避免重付已成功调用。中断请求费用未知则先查供应商账单；仅UNCERTAIN可核账。两个显式操作：

```powershell
.\scripts\Run-Quality.ps1 -Action reconcile -ChargeId <待核账ID> -ActualYuan <实际金额>
.\scripts\Run-Quality.ps1 -Action confirm-budget
```

confirm-budget明确增加本月100元提醒额度，不会改变历史/组件。若完整100组实际成本超预期，可以暂停并先报告费用，不能静默降级或伪造其余结果。

人工评审：浏览器本地打开qa/judge.html，选择同一run的grading目录全部JSON；先查看/搜索完整历史，再逐项评A/B并填写评分人，保存各组，及时导出CSV及备份JSON。刷新不自动保存。不要让评分人查看blind-mapping.json或full-audit，避免泄盲。将CSV存入同一私有run目录后执行：

```powershell
python scripts/score_quality.py --run qa/private/run-reviewed --scores qa/private/run-reviewed/human-scores.csv --output qa/private/run-reviewed/quality-report.json
```

完整100组至少涉及普通生成100次、完整架构至少400次请求，长历史分块/归并和限流重试另计。费用由真实token、模型价格与缓存决定；目前没有实测月费预测。不得为了满足30—100元目标删除历史或默认组件。

## 实际验证与未执行

本地工具实际检查：Run-Quality.ps1 的帮助、无账本状态、未核账拒绝，以及模型/Key缺失拒绝均已执行；未产生供应商调用。修复 Windows 批处理分隔符传递、中文编码及旧 JAVA_HOME 选择问题。证据：reports/product/runner-smoke.json、runner-keyless-smoke.json及日志。

qa/judge.html 已在 Chromium 151 实际执行文件载入、1000条历史搜索、空分拒绝、评分保存/切换、CSV含引号换行及SHA往返、备份恢复/冲突拒绝，并检查1440px与390px布局。修复同批同ID不同输入覆盖及非法/重复备份恢复；浏览器无脚本错误或外网请求。证据：judge-browser.json、judge-qa-inventory.md及截图。全部是明确标识的工具测试夹具，自动填入的测试分数不计入真实人工验收；正式A/B生成对及人评仍0。

已执行：核心格式/引用/全历史/默认组件失败阻断与本机HTTP协议测试；Python10项质量审计规则。它们使用明确夹具，不产生产品质量分数。模拟器没有模型Key，也没有伪造候选。

已执行的真实供应商验证：DeepSeek模型列表鉴权、P05首Skill失败计费、P05B双Skill和最终融合有限成功。失败与成功分场记录，未自动付费重试。

未执行：真实Jev、完整架构100组A/B输出、人工评分、≥95/100、真实主播风格/媒体准确率、实际账单和质量增益。没有把缺少Jev的手机单轮转换为完整架构成功，也没有把模型自评作为人工评分。
