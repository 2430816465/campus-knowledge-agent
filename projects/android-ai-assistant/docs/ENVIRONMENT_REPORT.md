# G0 宿主环境报告

## 0.3.3配置检查（2026-10-13晚间，当前）

无新增依赖或全局配置更改。productVerification成功，核心77＋Android本地7项通过；Python38项本轮重跑通过，lint0错误1警告。APK0.3.3-development/versionCode5，72356334字节，签名通过，SHA256见reports/product/artifact-verification.json。当前ADB无设备，未安装或测试0.3.3手机。真实GET /models HTTP200，官方模型/价格及思考默认值已复核；6组虚构对话真实生成仍待本批Jev例外授权，未调用推理。见CONFIG_AND_DIALOGUE_CHECK_20261013.md。

## 0.3.2与真实接口重测（2026-10-13，历史）

继续使用锁定JDK17/SDK36/BuildTools35/Gradle8.13及原依赖，无新增SDK/库和全局配置变更。实际构建核心77项、本地Android7项通过，lint0错误1警告，qa-runner编译成功。APK72356334字节，0.3.2-development/versionCode4，正常adb install -r于12:11返回Success，设备base.apk哈希与交付包一致；没有绕过早前系统安装限制。

红米/微信版本沿用下节已核验基线。升级后持有人自行解锁，六条历史和模型配置实际保留；无障碍启用期间未使用UIAutomator/instrumentation。P05B按另行有限授权真实调用DeepSeek＋双Skill成功，实际请求3次；含P05失败累计4次，usage估算¥0.156426，服务商账单未核对。结束恢复三个组件开启及临时云端授权关闭；Jev凭证缺失、100组及手机稳定性待。原始聊天截图/ZIP及凭证只在私有目录，不进入源码包。

## 0.3.1与恢复真机测试（2026-10-13，历史）

沿用锁定依赖，无新增SDK或库。明确指定真实红米，读取实际Android16/API36、HyperOS OS3.0.304.0.WOMCNXM及微信8.0.78；原始设备标识和截图留私有目录，公开报告匿名。电脑两次安装被系统以INSTALL_FAILED_USER_RESTRICTED拒绝，0.3.0由持有人在本地安装并授权；不绕过系统安装限制。

0.3.1构建、核心73项/本地交接7项、Python38项、签名及lint检查已实际通过。APK73095625字节，红米实际覆盖安装包SHA256匹配；P02B真实微信自动采样/菜单/核对交接有限通过，P03H提供文字3条校对入库，OCR准确率和其他边界待。读取实验启用后未使用UiAutomation，防止抑制被测无障碍服务；无需更改USB/无障碍权限。真机截图原文不进入源码ZIP。设备USB充电及初始40.4°C条件不支持推导应用自身温升/耗电。

## 0.3.0补充（2026-10-13）

继续使用已锁定JDK17/SDK36/BuildTools35/Gradle8.13/AGP8.13.2/Kotlin2.3.21/ComposeBOM2025.04.01，无新增依赖和系统配置更改。本轮只以指定emulator-5580启动已有API35 AVD，无窗口后台运行；实际安装0.3.0产品和测试APK，6项仪器测试通过，随后实际冷启动Status:ok，截图见reports/product/product-home-0.3-emulator.png。未连接/操作真实手机。

核心73项、Python38项、lint0错误1警告，真实APK73090129字节；apksigner与aapt确认Debug签名、versionCode2/min30/target35，构建与检查报告在reports/product。宿主默认JAVA_HOME仍是Java8，脚本选择已配置的JDK17且只修改本进程环境；最终增量构建22秒不代表首次下载。09:26左右实查C盘剩余35.78GiB。实际供应商调用和100组评分仍为0。

## 产品研发与模拟器补充（2026-10-12）

本轮自动安装官方Android Emulator37.2.12、system-images;android-35;default;x86_64 revision2，并建立Xindong_Product_API35 AVD。使用已有WHPX加速，未修改Hyper-V/BIOS或重启电脑。无窗口后台启动，2048MiB内存、1080×2400/density420，Android15/API35；只选emulator-5580测试，不连接用户手机。启动日志报告约40358ms完成启动，API35不等于指定红米API36。

产品复用JDK17/SDK36/BuildTools35/AGP8.13.2/Kotlin2.3.21/ComposeBOM2025.04.01；新增product-core/product-app/qa-runner的锁文件。桌面显式org.json:json:20250517；Android使用系统JSON，避免双实现。JVM、Android仪器测试和APK构建实际成功。

宿主CPU为Ryzen9 7845HX，物理内存约16GiB；13:50核查C盘剩余约8.8GiB，初始空间见下方历史记录。模拟器/SDK/Gradle缓存增加磁盘占用，首次下载时间不计入增量构建耗时。源码包不含这些缓存。产品APK约69.5MiB，未宣称包体/耗电已优化。

新增脚本Build-Product.ps1、Test-ProductEmulator.ps1、Inspect-ProductApk.ps1及Run-Quality.ps1。工程构建输出仍采用下述ASCII缓存；本地配置/真实Key不进Git。ProductVerification含核心测试、桌面工具编译、lint、APK；真机/真实接口验收另行记录。

## G0/G1初始核查记录（历史快照）

核查日期：2026-10-12，Asia/Shanghai。机器输出在 reports/environment/host-environment.json。

| 项目 | 实际状态 |
|---|---|
| OS/Shell | Windows 11，内核 10.0.26200；PowerShell，确切版本见 JSON |
| 架构/空间 | AMD64；初查 C 盘可用约 79.2 GB，实时值见 JSON |
| 默认 Java | PATH 为 Oracle Java 8，不能构建本工程 |
| 工程 JDK | 复用 Temurin 17.0.20.1+1；脚本仅设置当前进程变量 |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk`，原已安装但未加入 PATH |
| SDK Platform/Build Tools | android-36 revision 2 / 35.0.0，已用 SDK 工具核对 |
| ADB | 1.0.41 / Platform Tools 37.0.1；首次交付无设备；本次更换数据线后实际识别授权红米 |
| Gradle/AGP | Wrapper 8.13 / AGP 8.13.2，稳定版，官方兼容表支持 JDK17、Gradle8.13、SDK36 |
| Kotlin/Compose | Kotlin 与 Compose Compiler 2.3.21；Compose BOM 2025.04.01；AndroidX Activity1.10.1/Core1.16.0 |
| OCR | ML Kit 中文打包模型16.0.1，预打包；0.1.3真实点击OCR已运行，文字含错，不代表准确率验收 |
| Git/Python | Git2.53.0；Python3.8，可运行无第三方依赖的核对脚本 |
| 网络 | 已成功匿名 git clone 三仓库、下载 Gradle 分发及 Maven 依赖；代理仅记录是否配置，不记录认证值 |
| GitHub CLI | 已安装但无认证；使用匿名 HTTPS git clone 读取公开仓库，无需用户登录 |
| 设备/模拟器 | 已连接型号24122RKC7C/miro，Android16/API36、微信8.0.78；未运行模拟器 |

配置动作：复用已有本地 JDK/SDK；创建独立工程与官方 Gradle Wrapper，校验分发 SHA256；自动解析构建依赖并写入锁文件；创建不进 Git 的 local.properties。没有改系统 PATH、全局 Java、其他工程或手机权限。未下载/使用宿主其他项目的 APK。

Windows 中文路径：源代码仍在用户目录中。Java17 Gradle 测试 worker 首轮 classpath 无法载入测试类，故 build.gradle.kts 对 Windows 非 ASCII 源路径将**构建产物**放在 `%LOCALAPPDATA%\XindongG1Build\<工作区哈希>\<模块>`。stageVerification 将 APK、测试 XML 与 lint 报告复制回本工程。

重新核查：`pwsh -NoProfile -File .\scripts\Inspect-Environment.ps1`（本机实际 PowerShell7.6.5）。

重新构建：`pwsh -NoProfile -File .\scripts\Build.ps1`。可显式传入 `-JavaHome` 和 `-SdkRoot`。首次联网下载依赖；正常构建使用已冻结锁文件，只有主动加 `-RefreshLocks` 才更新解析结果。未声称旧版Windows PowerShell5.1已验证。

官方版本依据：[AGP8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes)、[Kotlin/Gradle兼容表](https://kotlinlang.org/docs/gradle-configure-project.html)、[ML Kit 中文 OCR](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)。采用已核验的兼容稳定组合，不声称这些是最新版本。
