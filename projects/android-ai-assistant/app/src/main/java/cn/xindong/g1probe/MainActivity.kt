package cn.xindong.g1probe

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.UUID

class MainActivity: ComponentActivity() {
    private var exportInProgress by mutableStateOf(false)
    private var exportMessage by mutableStateOf("尚未导出；请停止并冻结后导出")
    private val notificationPermission=registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        probeStore.record("APP_NOTIFICATION_PERMISSION_RESULT","health",JSONObject().put("granted",granted))
    }
    private val projectionConsent=registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if(result.resultCode == Activity.RESULT_OK && result.data != null && probeStore.armed) {
            try { startForegroundService(Intent(this,ProjectionService::class.java).putExtra("result_code",result.resultCode).putExtra("consent",result.data)) }
            catch(e: Exception) { show("屏幕服务启动失败：${e.javaClass.simpleName}") }
        } else { probeStore.record("PROJECTION_CONSENT_DENIED","health"); show("未开始屏幕采样") }
    }
    private val export=registerForActivityResult(ActivityResultContracts.CreateDocument("application/x-ndjson")) { uri ->
        if(uri != null) try {
            exportInProgress=true
            exportMessage="正在写入证据，请等待完成提示后再取回文件"
            val output=contentResolver.openOutputStream(uri) ?: error("No output stream")
            probeStore.export(output) { ok -> runOnUiThread {
                exportInProgress=false
                exportMessage=if(ok) "导出完成（含结束标记）；可取回核验。明文测试数据请妥善保管。" else "导出失败；文件不得用于验收，请查看错误"
                show(exportMessage)
            } }
        } catch(e: Exception) { exportInProgress=false; exportMessage="导出失败：${e.javaClass.simpleName}"; show(exportMessage) }
    }
    private fun show(message: String) { Toast.makeText(this,message,Toast.LENGTH_LONG).show() }
    private fun settings(action: String) {
        try { startActivity(Intent(action)) } catch(e: Exception) { show("系统入口不可用，请在手机设置中手动打开：$action") }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme {
            var consent by remember { mutableStateOf(false) }
            var run by remember { mutableStateOf(probeStore.runId.ifBlank { "run-${UUID.randomUUID().toString().take(8)}" }) }
            var scene by remember { mutableStateOf(probeStore.scenario.ifBlank { "S01" }) }
            var armed by remember { mutableStateOf(probeStore.armed) }
            var status by remember { mutableStateOf("") }
            var baseline by remember { mutableStateOf("") }
            var eventCount by remember { mutableLongStateOf(0) }
            var storageError by remember { mutableStateOf<String?>(null) }
            var reveal by remember { mutableStateOf(false) }
            var logs by remember { mutableStateOf(emptyList<String>()) }
            var autoOcr by remember { mutableStateOf(probeStore.autoScreenshot) }
            var clickOnly by remember { mutableStateOf(probeStore.onDemandOnly) }
            LaunchedEffect(reveal) {
                baseline=deviceBaseline(this@MainActivity).toString(2)
                while(true) {
                    armed=probeStore.armed; autoOcr=probeStore.autoScreenshot
                    status=permissionStatus(this@MainActivity).toString(2)
                    withContext(Dispatchers.IO) {
                        try { eventCount=probeStore.count(); if(reveal) logs=probeStore.recent() }
                        catch(e: Exception) { storageError="读取证据失败：${e.javaClass.simpleName}" }
                    }
                    storageError=probeStore.error ?: storageError
                    delay(1500)
                }
            }
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.safeDrawingPadding().padding(16.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(10.dp)) {
                    Text("心动军师 · G1 验证",style=MaterialTheme.typography.headlineSmall)
                    Text("点击读取已取得真机材料；切换/撤权待验证",color=MaterialTheme.colorScheme.error)
                    Text("按已批准的需求变更，由你点击读取当前聊天。此版本用于验证读取材料；未接入 AI，也不会输入或发送微信消息。")
                    val preview=CaptureReview.current
                    Text("最近读取：${preview.status}",style=MaterialTheme.typography.titleMedium)
                    if(preview.source.isNotBlank()) Text("来源：${preview.source}")
                    if(preview.text.isNotBlank()) {
                        Text(preview.text,style=MaterialTheme.typography.bodyMedium)
                        Text("当前仅是一屏待核对文字，可能含标题、时间或按钮。联系人、说话人、顺序尚未确认；更早历史和屏外多媒体尚未取得。",color=MaterialTheme.colorScheme.error)
                        OutlinedButton(onClick={CaptureReview.clear()}) { Text("清除本页预览（保留加密实验记录）") }
                    }
                    Text("当前实验：${if(armed) "采集中" else "已停止"}　原始事件：$eventCount")
                    Text("旧后台全量路线未通过；本次点击读取不回填旧验收结果。")
                    storageError?.let { Text(it,color=MaterialTheme.colorScheme.error) }
                    OutlinedTextField(run,{run=it},label={Text("实验 run_id（与发送端记录一致）")},enabled=!armed,modifier=Modifier.fillMaxWidth())
                    OutlinedTextField(scene,{scene=it},label={Text("场景 S01—S10（每场停止后更换）")},enabled=!armed,modifier=Modifier.fillMaxWidth())
                    Row { Switch(clickOnly,{clickOnly=it},enabled=!armed); Text("只在点击时读取（当前生效需求）",Modifier.padding(start=8.dp,top=8.dp)) }
                    if(!clickOnly) Text("旧自动观察仅用于对照实验，不代表后台全量可用。",color=MaterialTheme.colorScheme.error)
                    Row { Checkbox(consent,{consent=it}); Text("我仅使用已授权的测试账号和测试对话；实验期间避免私人会话，证据导出为明文。",Modifier.padding(top=8.dp)) }
                    Button(onClick={
                        try {
                            CaptureReview.clear()
                            probeStore.begin(run.trim(),scene.trim(),clickOnly)
                            exportMessage="本场尚未导出；请停止并冻结后导出"
                            startForegroundService(Intent(this@MainActivity,MonitorService::class.java))
                            armed=true
                        } catch(e: Exception) { probeStore.end("start_failed"); show("启动失败：${e.javaClass.simpleName}") }
                    },enabled=consent && !armed && run.isNotBlank() && scene.isNotBlank(),modifier=Modifier.fillMaxWidth()) { Text("开始当前场景（不生成回复）") }
                    OutlinedButton(onClick={
                        ProbeAccessibilityService.current?.stopOnDemand("SESSION_STOPPED")
                        probeStore.end(); stopService(Intent(this@MainActivity,ProjectionService::class.java)); stopService(Intent(this@MainActivity,MonitorService::class.java)); armed=false
                    },enabled=armed,modifier=Modifier.fillMaxWidth()) { Text("停止并冻结当前场景") }
                    HorizontalDivider()
                    Text("授权与采样",style=MaterialTheme.typography.titleMedium)
                    Button(onClick={ProbeAccessibilityService.current?.showOnDemand()},enabled=armed && ProbeAccessibilityService.current != null,modifier=Modifier.fillMaxWidth()) { Text("显示点击读取按钮（然后手动打开微信测试聊天）") }
                    OutlinedButton(onClick={ProbeAccessibilityService.current?.stopOnDemand("USER_CLOSED_OVERLAY")},modifier=Modifier.fillMaxWidth()) { Text("关闭点击读取按钮") }
                    Text("使用已授权的无障碍浮层，只读取当前有焦点的微信窗口。请在聊天页面点击浮层“读取”，再点“查看读取结果”。每次需核对身份和内容。")
                    OutlinedButton(onClick={settings(Settings.ACTION_ACCESSIBILITY_SETTINGS)},modifier=Modifier.fillMaxWidth()) { Text("打开系统无障碍设置") }
                    OutlinedButton(onClick={settings(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)},modifier=Modifier.fillMaxWidth()) { Text("打开系统通知使用权设置") }
                    if(Build.VERSION.SDK_INT >= 33) OutlinedButton(onClick={notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)},modifier=Modifier.fillMaxWidth()) { Text("允许显示实验状态通知") }
                    Row { Switch(autoOcr,{
                        probeStore.autoScreenshot=it; autoOcr=it
                        probeStore.record("ACCESSIBILITY_OCR_TOGGLE","health",JSONObject().put("enabled",it))
                    },enabled=armed && !clickOnly && ProbeAccessibilityService.current != null); Text("旧对照：每 2 秒尝试 OCR",Modifier.padding(start=8.dp,top=8.dp)) }
                    OutlinedButton(onClick={
                        if(ProjectionService.active) { show("当前授权会话仍在运行，请先停止"); return@OutlinedButton }
                        projectionConsent.launch(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
                    },enabled=armed && !clickOnly && ProbeAccessibilityService.current != null,modifier=Modifier.fillMaxWidth()) { Text("旧对照：请求系统屏幕授权并开始 OCR") }
                    OutlinedButton(onClick={stopService(Intent(this@MainActivity,ProjectionService::class.java))},modifier=Modifier.fillMaxWidth()) { Text("停止系统屏幕 OCR 会话") }
                    OutlinedButton(onClick={ProbeAccessibilityService.current?.delayedScreenshot(); show("请在 6 秒内手动切回测试微信聊天；此样本单独标记")},enabled=armed && ProbeAccessibilityService.current != null,modifier=Modifier.fillMaxWidth()) { Text("6 秒后取一张可见屏幕诊断样本") }
                    Text("单张诊断与后补观察不计入后台自动收录验收。黑屏/受保护屏幕会记录失败。停止屏幕会话后再次启动必须重新授权。")
                    Text(status,style=MaterialTheme.typography.bodySmall)
                    HorizontalDivider()
                    Text("证据与设备",style=MaterialTheme.typography.titleMedium)
                    OutlinedButton(onClick={export.launch("g1-${run.trim()}.jsonl")},enabled=!armed && !exportInProgress,modifier=Modifier.fillMaxWidth()) { Text("导出完整原始证据 JSONL（含完整性链）") }
                    Text(exportMessage,style=MaterialTheme.typography.bodySmall)
                    Row { Switch(reveal,{reveal=it}); Text("显示测试原文（只在本机调试页）",Modifier.padding(start=8.dp,top=8.dp)) }
                    if(reveal) logs.forEach { Text(it,style=MaterialTheme.typography.bodySmall); HorizontalDivider() }
                    Text(baseline,style=MaterialTheme.typography.bodySmall)
                    Text("原始正文在应用私有数据库中使用 Android Keystore + AES-GCM 加密。采样只能看到系统实际提供的字段；联系人、方向、正文边界、顺序未经真机验证时保持 UNKNOWN。")
                    Spacer(Modifier.height(24.dp))
                }
            }
        } }
    }
}
