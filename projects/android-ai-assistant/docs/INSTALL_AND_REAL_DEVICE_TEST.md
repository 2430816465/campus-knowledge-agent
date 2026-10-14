# 验证 APK 安装与红米实测操作

本版：`cn.xindong.g1probe`，`0.1.4-g1-click-probe`（versionCode5），Android11/API30及以上；通用APK含arm64、armv7、x86、x86_64。本次已在实际型号24122RKC7C的手机安装、启动。0.1.3真实点击OCR已取得可见材料，有识别错误；以下步骤不表示全部验收完成。没有AI API Key配置要求，也没有自动输入/发送功能。

## 现在无法连接 USB 时

电脑上的 APK：

`C:\Users\24308\Desktop\智能回复\xindong-junshi-ai\deliverables\xindong-g1-probe-debug.apk`

使用你自己的文件传输方式把该文件放到测试手机，打开手机文件管理器点击 APK。手机若询问“允许此来源安装应用”，由持有人为当前文件管理器确认；按系统正常安装流程操作。安装后打开“心动 G1 验证”。本程序是 Debug 签名验证版，安装并不代表 G1 通过。若系统拒绝安装，保存完整错误和系统版本，停止该步骤；不要修改微信或关闭系统安全保护来规避。

APK 与源码 ZIP 的 SHA256 在同目录 SHA256SUMS.txt。可在电脑 PowerShell 核对：

```powershell
Set-Location -LiteralPath 'C:\Users\24308\Desktop\智能回复\xindong-junshi-ai'
Get-FileHash -Algorithm SHA256 -LiteralPath '.\deliverables\xindong-g1-probe-debug.apk'
```

本程序的无障碍/通知权限可能暴露测试期间屏幕和通知。开始前切换到专门测试微信账号，避免显示私聊；只用已授权的测试联系人。导出 JSONL 含明文测试内容，保存到你控制的目录，勿上传公开仓库。

## 以后连接电脑并核验设备

1. 手机“设置 → 我的设备/关于手机”记录营销型号、具体型号、完整 HyperOS/Android 版本。名称以实际设置为准，不把口述“红米K80游戏版”映射为另一机型。
2. 在关于手机界面连续点版本号，按系统提示开启开发者选项；在设置搜索“开发者选项”，启用 **USB 调试**。不同 HyperOS 的菜单名称可能不同，以实际系统提示为准。无需 root、解锁 Bootloader 或打开“USB调试（安全设置）”。
3. 使用能传数据的 USB 线连接，解锁屏幕，必要时选择文件传输；手机确认这台电脑的 RSA 调试授权。没有弹窗先检查线材/端口/手机 USB 模式。
4. 在本工程目录的 PowerShell 中运行：

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
.\scripts\Collect-DeviceBaseline.ps1 -OutputDirectory '.\evidence\runs\redmi-baseline'
.\scripts\Install-Probe.ps1
```

`device` 才是已授权；`unauthorized` 需在手机确认，空列表是未连接。脚本遇到无设备、未授权或模拟器会停止；有多台时使用 `-Serial` 指定 `devices -l` 中的真实设备序列。输出基线 JSON 只是版本/权限信息，不是聊天成功证明。安装脚本只安装该 APK 并打开调试页，不代授权限。

若安装时报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，不要直接卸载抹掉证据；先导出旧版本证据并保留原包/签名，确认是否同一个测试应用。换机器构建的 Debug 证书通常不同，本交付不包含宿主的私钥。

## USB 调试连接排障与无线配对

充电显示只证明供电。先运行 `pwsh -NoProfile -File .\scripts\Diagnose-Connection.ps1`；退出码2表示没有正常授权设备，0只表示设备可见，不是微信测试通过。ADB列表为空且Windows也无手机数据设备时，先换确定能传文件的数据线并直连电脑接口；不要直接把未知原因写成缺驱动。

Android11+也支持不依赖USB的正常无线调试。手机与电脑连接同一个可互通的Wi-Fi；手机“开发者选项 → 无线调试 → 使用配对码配对”，保持弹窗打开。在电脑运行以下命令，替换为该弹窗的实际地址；按提示输入其配对码：

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" pair '手机配对弹窗的IP:端口'
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

重新打开弹窗后，端口和配对码可能变化，应一起核对。配对端口与无线调试主页的连接端口用途不同；配对成功但未连接时，可用主页上的实际地址执行 `adb connect`，再检查设备状态。若目标端口不可达，核对同一网络及设备互通能力；公共Wi-Fi可能隔离客户端。不要关闭防火墙或绕过学校/公司的网络限制；可共同换到允许互通的私人网络，或继续使用USB数据线。本次无线配对失败，最后通过更换USB数据线建立连接；未把配对失败算成微信失败。依据：[Android官方无线调试步骤](https://developer.android.com/tools/adb#wireless-adb-android-11)。

## 手机本人授权

1. 打开“心动 G1 验证”，点“打开系统无障碍设置”，在已下载/已安装服务中找到本应用，查看系统说明并授权。
2. 若 Android 13+ 因旁加载显示“受限设置”，可由持有人到本应用的系统应用信息页，检查更多菜单是否提供“允许受限制的设置”，再按系统提示操作。依据：[Android 官方步骤](https://support.google.com/android/answer/12623953?hl=zh-Hans)。HyperOS 若没有对应入口或仍拒绝，记录拒绝状态，不用 ADB 强改权限。
3. 返回 App，点“打开系统通知使用权设置”，为本应用授予通知使用权。这与“允许显示实验状态通知”是两个权限，分别授权。通知监听只记录实际发布的微信通知。
4. 保持默认“只在点击时读取”开启。本路线用已授权无障碍浮层主动读取；无需打开旧连续OCR或MediaProjection开关。按下一节开始点击实验。
5. 只有复测旧路线时，停止后关闭点击模式，另起独立场景，才可启用“旧对照：每2秒尝试OCR”或请求本次系统屏幕授权。投屏若允许选应用，选择微信；停止/锁屏/撤销后再次启动必须重新授权，不复用token。本程序不录音。

权限状态在调试页显示。无障碍开启但系统尚未绑定、通知使用权开启但监听器未连接时都要记录；权限开关为“开”不等于通路有效。授权被撤销、截图被保护、黑帧或 OCR 失败应作为真实结果保留。

## 当前点击读取路线

1. 用已授权测试账号和测试对话。填写唯一run_id及场景名（例如CLICK_VISIBLE、CLICK_NAVIGATION、CLICK_PERMISSION）；保持点击模式开启，勾选测试授权，再点“开始当前场景”。
2. 点“显示点击读取按钮”，然后**持有人手动**打开微信测试聊天。浮层第一项是“点击读取当前屏幕”，第二项是“查看读取结果”。一次点击后等待约3秒；如果提示忙、错误或超时，保留状态，不连续补点掩盖失败。
3. 普通读取场：点“查看读取结果”。读取浮层会关闭；到验证App顶部检查“最近读取”、来源及预览。材料只是当前可见窗口的未校对文字，可能混入标题/日期/按钮、错字或换行；联系人、说话人、顺序、边界未确认，更早历史/屏外媒体缺失。这个验证器不把预览写进正式档案或AI。
4. **页面切换场分两步执行**：先在测试聊天点读取并等约3秒，再点微信左上角返回到微信会话列表，等约3秒、停在那里；确认已回列表后才点浮层“查看读取结果”。检查旧文字是否消失，完整记录状态。直接从聊天点查看结果没有测试页面切换，必须记为协议偏差。
5. 撤权场另起run_id：先取得预览，再由持有人到系统无障碍设置关闭本验证器服务，返回验证App检查预览/连接状态；不要用ADB修改许可。恢复权限另记时间和连接检查，恢复后必须重新点击读取。具体现场顺序以当轮说明为准。
6. 完成后点“停止并冻结当前场景”，再导出JSONL到下载目录。等本应用显示“导出完成（含结束标记）”才取回；下节给出完整性核对命令。点击材料不会计入旧后台G/A成功率。

“清除本页预览”只移除当前显示内容，保留加密实验记录；它不是删除全部数据或正式核对。窗口ID不是联系人ID，本版没有自动联系人的可信绑定。正确返回列表的一次清除成功也不能证明所有切换、锁屏和异步竞态均通过。

## 旧后台对照场景流程

完整矩阵见G1_TEST_MATRIX.md。以下十场景保留作原冻结要求对照；旧后台P0未通过，用户已批准新点击路线，不要求以隐藏后台全收作为新路线准入。复测旧路线时先独立做S01，再做S05/S06，按真实结果保留，不能回填旧失败。

1. 准备独立发送端（另一个测试微信账号/设备）。预先保存发送端账号与接收端测试联系人 ID 的核验映射；两个昵称相同也必须保留两个不同账号。`streamer_id` 是接收主播的测试命名空间。
2. 同步两端时钟并记录来源、偏差与误差。脚本严格使用毫秒时间窗，不偷偷放宽。若误差或到达时刻不能确定，不能据此声明通过。
3. 复制 evidence/templates/ground_truth.csv、scenario_manifest.csv 到被 Git 忽略的 evidence/runs/本次编号/。表头说明见下节；保留发送端原始日志/媒体，而非只保存手抄结论。
4. 调试页填写唯一 `run_id` 和 `scenario`（S01—S10，子场景换 run_id），勾选测试账号授权，点“开始当前场景”。保存所用微信通知、免打扰、网络、锁屏等设置到场景表。
5. 独立发送端实际发消息，记录每条发送事件。不要在正文嵌编号后让程序从编号推导联系人/顺序。完全相同的两条正文仍是两条消息。
6. **S05/S06：发后保持微信在后台，截止前绝不打开对应会话/通知。** 从桌面直接打开探针，点“停止并冻结当前场景”。该动作记录 SESSION_END 的 at_ms，作为截止证据；此后才允许打开微信核验真实到达情况。导出时选择手机“下载/Download”，文件名保留 `g1-*.jsonl`。必须等本应用显示“导出完成（含结束标记）”后再取回；不是看到文件名就表示写完。
7. 后续核验接收端实际有哪些消息、内容/身份/方向/顺序。若只证明“后来读到”，而不能证明“冻结前已到达”，将场景标记“到达时刻不足，无法证实”，不要把发送时间当接收时间。离线未送达也不能悄悄从失败发送清单删掉。
8. 只有真正独立确认到达的记录才能填写 `delivery_confirmed=true`；未确认的发送记录另存原始清单。若真值全集不完整，禁止只挑可确认的子集宣称满足 P0。
9. 冻结后回看历史的文字、手动延时截屏、人工补录均不计自动 A；可以另设诊断场景观察差异。不要把人工核验值写回候选使其变成“自动验证”。

## 真值 CSV 与离线核对

ground_truth.csv 每行是一条真实消息：run_id、scenario 与探针一致；message_id 是独立发送端事件编号；sender_record_id 指向原始发送日志；streamer_id/contact_id 为经核验的不同账号；direction 为 INBOUND/OUTBOUND；body 原文不得清洗标点或合并；order 是该会话完整双向顺序；kind 保留 TEXT/IMAGE/VOICE/EMOJI 等真实类别；arrived_at_ms 是有证据的接收时间；cutoff_at_ms 是冻结时间；delivery_confirmed 是独立到达确认。含逗号、换行、双引号的正文必须遵守 CSV 引号规则，不要手工按逗号拆分。

非文字媒体不能仅用占位词宣称正文正确，需独立原件/转写和真实解析证据；本探针尚无多媒体解析器，应报告缺失。真值表不可包含来源不明的“猜测到达时间”。目前验证器没有已验证的微信身份解析器，即使看到了文字，也通常不能形成合格 A；核对失败是要交付的结果。

手机导出后，电脑取回该明确文件（也可通过你自己的文件传输方式复制）：

```powershell
.\scripts\Pull-Evidence.ps1 -DevicePath '/sdcard/Download/g1-redmi-s05.jsonl' -RunId 'redmi-s05'
python scripts/compare_evidence.py --truth evidence/runs/redmi-s05/ground_truth.csv --events evidence/runs/redmi-s05/events.jsonl --output evidence/runs/redmi-s05/comparison.json
```

将 DevicePath 替换为你实际选择的导出文件；脚本拒绝覆盖已有 events.jsonl，并核对取回前后手机哈希与本地哈希。比较程序先验证EXPORT_START/EXPORT_END、数量、导出ID和完整链，再只取冻结时间窗内自动候选逐条核对G。缺结束标记的有效前缀也拒绝；失败文件保留，等写完后换RunId重新取回。旧版没有结束标记的文件只可诊断，不能直接用于新版验收。未知字段、串人、正文/顺序/类型错误、人工修复、手动截图和晚到观察均不合格。退出码：0 仅“指定样本需人工复核”，2 为失败/未测试，3 为数据或完整性错误；**任何退出码都不自动放行 G1**。0 也不表示真实微信或永久100%通过。`--verify-only`只验证导出完整性，不评价微信收录。

运行采集时不要使用标准`uiautomator dump`检查页面，它的默认UiAutomation连接会抑制其他无障碍服务，造成测试干扰。检查自己应用页面可采用截图，健康状态以实际服务绑定和探针心跳为准，详见真机报告。

每轮保留 baseline、scenario_manifest、完整独立 G、原始发送证据、导出 JSONL、comparison.json、人工核验说明和文件 SHA256。不要提交 evidence/runs/ 到 Git。哈希链可发现未同步重算的改动，不是签名/独立公证，也不能单独证明日志来自真机。

## 停止实验、删除数据与复现构建

完成后停止场景和屏幕会话，再在系统关闭本应用无障碍、通知使用权。需要清理时先保留应交付的测试证据，然后通过系统“应用信息 → 存储 → 清除数据”删除本应用日志及 Keystore 密钥；导出的明文 JSONL 需在你选择的位置另行删除。不要清理微信数据。清除本应用数据不可逆，本轮脚本未执行。

源码复现（本机已验证）：

```powershell
python scripts/verify_baseline.py
python -m unittest discover -s scripts/tests -v
.\scripts\Build.ps1
.\scripts\Inspect-Apk.ps1
```

脚本仅为当前进程设置 JDK/SDK；原系统 java8 不适用。另一台 Windows 可传 `-JavaHome 'JDK17的目录' -SdkRoot 'AndroidSDK目录'`；需要 SDK android-36、build-tools;35.0.0 和 platform-tools，Gradle Wrapper 首次联网取依赖。中文源码路径的构建产物放到 `%LOCALAPPDATA%\XindongG1Build\工程路径哈希\`，交付 APK 会复制回 deliverables。Android Studio 可直接打开源码工程，JDK 选17。不要用 `-RefreshLocks` 无意更新锁文件；仅依赖变更时才重写。

真机安装、启动、有限点击OCR及预览已执行；切换/撤权等实际结果以阶段状态及真机报告为准。按已批准变更验证新G1后继续G2—G6，不能把旧后台失败抹去或把未测项目写成通过。
