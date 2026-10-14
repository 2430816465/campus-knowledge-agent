# G1 验证器工程说明

历史说明：以下为独立0.1.4探针的工程记录。CR-20261012-02后已经继续产品研发，当前产品架构见ARCHITECTURE.md，阶段状态见STATUS.md；下文“未启动G2—G6”仅描述当时探针范围。此次继续研发不代表G1验收通过。

这里只描述0.1.4 G1验证器，未启动G2—G6的正式产品架构实现。生效需求为CR-20261012-01：用户点击读取、授权历史导入、缺失提示；旧后台观察仅保留作对照。

Kotlin + Compose 原生调试 App；probe-core 为纯 Kotlin 证据规则模块；app 为 Android 采集与展示模块。G1 使用系统 SQLiteOpenHelper 存储加密的追加事件，避免为验证器引入 Room/KSP。正式产品数据模型仍依冻结需求待过闸门后实现。

采集通路：

1. ProbeAccessibilityService：默认USER_CLICK_ONLY。已授权且实验启动时显示TYPE_ACCESSIBILITY_OVERLAY读取按钮。只有用户点击才申请当前有焦点、TYPE_APPLICATION且root包名为微信的单一窗口截图；Android34+使用takeScreenshotOfWindow，30—33使用display截图。屏幕需交互且未锁定，服务许可需仍有效。服务用弱引用公开入口，销毁只清除自身引用。没有任何微信点击、滚动、填写、手势或发送调用。
2. ProbeNotificationService：只保存微信实际发布/移除的通知；保留通知 key、合并提示、文本字段及 MessagingStyle 的人名/标识提示。通知 key 不当消息 ID，人名不当联系人 ID。
3. 点击截图OCR：记录请求、节点是否可用、截图回调/错误、OCR开始/结果/失败/丢弃。每个请求固定run_id、scenario、window_id、navigation_epoch及request_id；截图和OCR回调重新检查。10秒截图回调、30秒OCR超时为主线程定时器，进程暂停会延迟触发，不能当硬实时保证。位图仅在内存使用并释放，不保存屏幕图片。文字预览只接收当前非空请求ID，取消/失效/清空后迟到结果不能恢复原文。所有点击材料automatic=false、UNVERIFIED，核对程序排除旧后台A。
4. 旧对照通路：关闭点击模式后才可启用连续节点记录、每两秒无障碍截图或MediaProjection。节点遍历最多2000节点/80层，截断明确记录；单张延时诊断标USER_DELAYED_SAMPLE并排除自动验收。MediaProjection每次启动走系统授权，注册Callback后只创建一次VirtualDisplay；处理停止、拒绝、尺寸、裁切、黑帧和OCR错误，仅在微信可见时处理，停止后不复用token。该通路尚未完成真机会话验收。
5. MonitorService：用户启动的前台实验心跳，记录网络/屏幕/权限状态。进程被杀时无法凭空写日志，恢复时根据上次心跳记录可能断档。重启接收器只记断档并停实验，要求手动恢复。

日志正文用 Android Keystore AES-GCM 密钥加密。每条事件有 UUID、墙钟、单调时钟、run_id、scenario、来源及 SHA256 完整性链，外层来源/时钟必须和被哈希的正文元数据一致。SAF 导出时解密到持有人选择的 JSONL；正文不写 logcat、不发网络。合并 Manifest 已显式移除依赖带来的 INTERNET，没有存储全盘权限、悬浮权限或其他特殊微信访问权限。

已观察到微信WINDOW_STATE_CHANGED或VIEW_SCROLLED事件时增加navigation_epoch、取消进行中请求并清除旧预览；服务中断/销毁、定时检查发现锁屏/许可不可用时清除预览并移除浮层。查看结果会移除读取浮层并取消尚未完成的请求。窗口ID并非联系人ID，同一窗口内的页面变化未必有可靠事件，不能承诺自动辨认每次会话切换。截图与窗口切换不是系统提供的原子操作，尤其30—33全屏通路尚未真机验证；实验只使用测试材料，切换/撤权和竞态需单独验收。

屏幕只是诊断材料：候选字段默认 contact_id=null、direction=UNKNOWN、order=null、message_boundary_verified=false。顶栏文本、Person/shortcut 均仅是未经验证的提示。真机已连接并有S04/S05证据，但稳定微信身份和边界仍未验证；不硬编码猜测的微信资源ID或气泡归属，不把标题、按钮、日期伪装消息。用户已批准主动读取/授权历史导入路线，来源与人工核对必须独立保留，见CHANGE_REQUEST_20261012.md。

probe-core 的保守合并只在可靠原生消息 ID、稳定联系人、方向、顺序、正文都一致时合并跨来源记录；无可靠消息 ID 保留所有原始观察。当前微信字段未证实，故这段规则尚未构成微信去重成功，也没有被接到“已验证消息”入库通路。

compare_evidence.py 只读独立 G 与自动证据 A，不能通过真值给未知候选补联系人、方向或顺序。它检查截止时刻、身份、方向、消息完整边界、类型和顺序，人工修复单独处理，不计自动成功。探针暂未生成满足这些条件的最终消息；这是明确的验证缺口。

调试UI真实执行启停实验、系统设置入口、通知许可请求、点击浮层、窗口OCR预览、明确的一屏覆盖/身份与顺序未知提示、清除预览、旧对照采样及证据导出。预览不创建确认消息、档案或长期记忆；正式身份/说话人/排序校对编辑尚未实现。没有候选回复、AI API或产品悬浮球的假页面。当前24项Kotlin、28项Python测试是规则验证，有限真实点击证据及未完成项目以G1_REAL_DEVICE_REPORT.md为准。
