package cn.xindong.junshi

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import cn.xindong.core.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import java.io.ByteArrayOutputStream
import java.lang.ref.WeakReference

data class Captured(val scope: Scope, val text: String, val png: ByteArray, val detail: String, val at: Long,
    val id: String = newId(), val automatic: Boolean = false)
object ReadBridge {
    var scope: Scope?=null
    var contactName=""
    var autoRead by mutableStateOf(false)
    var consumedId: String?=null
    var preview by mutableStateOf<Captured?>(null)
    var status by mutableStateOf("请先在App解锁并选择观众；读取只包含当前可见屏幕")
    var candidates: List<Candidate> = emptyList()
    var invalidation: (()->Unit)?=null
    fun clear(reason: String, preserveMenu: Boolean=false) { preview=null; candidates=emptyList(); status=reason; ChatReadService.current?.invalidatePanel(preserveMenu); invalidation?.invoke() }
    fun select(scope: Scope?, name: String = "") { autoRead=false; consumedId=null; ChatReadService.current?.scopeChanged(); clear("档案已切换；前台自动读取已暂停，请核对身份后开启"); this.scope=scope; contactName=name }
}
class ChatReadService: AccessibilityService() {
    companion object {
        private var instance=WeakReference<ChatReadService>(null)
        val current: ChatReadService? get()=instance.get()
    }
    private val handler=Handler(Looper.getMainLooper())
    private var ball: View?=null; private var panel: View?=null
    private var panelIsMenu=false
    private var panelStatus: TextView?=null
    private val handoff by lazy { ReadHandoffGuard(packageName) }
    private var navigation=0L; private var request: String?=null
    private var lastDigest: String?=null
    private var lastCapture: Captured?=null
    private var lastReadAt=0L
    private var lastWindow: Int?=null
    private var lastPackage: String?=null
    private val autoTask=Runnable { if(ReadBridge.autoRead && window()!=null) readScreen(automatic=true) }
    private val recognizer by lazy { TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build()) }
    private val environment=object: Runnable {
        override fun run() {
            if(!available()) { ReadBridge.autoRead=false; cancel("屏幕锁定或权限不可用，自动读取已暂停；旧预览和候选已清除"); hide() }
            else {
                val now=window()
                val focused=focusedPackage()
                if(focused!=lastPackage) {
                    lastPackage=focused
                    audit(when(focused) { packageName -> "FOCUS_REVIEW_APP"; "com.tencent.mm" -> "FOCUS_WECHAT"; null -> "FOCUS_UNKNOWN"; else -> "FOCUS_OTHER_APP" })
                    if(focused==packageName) {
                        // Stop pending capture callbacks before reviewing a completed capture.
                        request=null; handler.removeCallbacks(autoTask); removePanel()
                    }
                }
                if(!handoff.mayRetain(focused,SystemClock.elapsedRealtime()) &&
                    (ReadBridge.preview!=null || request!=null || panel!=null || lastWindow!=null)) {
                    navigation++; cancel(if(focused==null) "前台窗口无法确认，旧预览和候选已清除" else "已进入其他应用，旧预览和候选已清除")
                    lastDigest=null; lastCapture=null
                    audit(if(focused==null) "CLEAR_UNKNOWN_FOCUS" else "CLEAR_OTHER_APP")
                }
                if(now!=lastWindow) {
                    lastWindow=now
                    if(now!=null) { navigation++; cancel("微信前台窗口已变化，请核对当前聊天",preserveMenu=true); lastDigest=null; lastCapture=null; scheduleAuto() }
                }
            }
            handler.postDelayed(this,1000)
        }
    }
    private fun available(): Boolean = Settings.Secure.getString(contentResolver,Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        ?.split(':')?.any { it.equals("$packageName/${javaClass.name}",true) || it.equals("$packageName/.ChatReadService",true) }==true &&
        getSystemService(PowerManager::class.java).isInteractive && !getSystemService(KeyguardManager::class.java).isKeyguardLocked
    private fun window(): Int? = if(!available()) null else windows.filter { it.type==AccessibilityWindowInfo.TYPE_APPLICATION && it.isFocused && it.root?.packageName?.toString()=="com.tencent.mm" }.singleOrNull()?.id
    private fun focusedPackage() = windows.firstOrNull { it.type==AccessibilityWindowInfo.TYPE_APPLICATION && it.isFocused }?.root?.packageName?.toString()
    override fun onServiceConnected() { instance=WeakReference(this); handler.post(environment); ReadBridge.status="读取服务已连接；可在App开启本次档案的前台自动读取" }
    private fun audit(event: String, detail: String="") {
        if(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE!=0) {
            // Fixed event codes and capture metadata only. Never record OCR text, names or secrets.
            Log.i("XindongRead","event=$event epoch=$navigation pending=${ReadBridge.preview!=null} menu=$panelIsMenu $detail")
        }
    }
    private fun status(value: String) { ReadBridge.status=value; panelStatus?.text=value; panelStatus?.contentDescription=value }
    private fun cancel(reason: String, preserveMenu: Boolean=false) { handler.removeCallbacks(autoTask); request=null; ReadBridge.clear(reason,preserveMenu); (application as JunshiApp).session.invalidate() }
    fun scopeChanged() { request=null; navigation++; handler.removeCallbacks(autoTask); lastCapture=null; lastDigest=null; handoff.reset(); removePanel(); audit("SCOPE_CHANGED") }
    fun autoModeChanged() {
        handler.removeCallbacks(autoTask)
        if(ReadBridge.autoRead) { lastDigest=null; lastCapture=null; show(); scheduleAuto() }
        else { request=null; status("前台自动读取已暂停；仍可手动读取或粘贴最新消息") }
    }
    private fun scheduleAuto() {
        handler.removeCallbacks(autoTask)
        if(ReadBridge.autoRead && ReadBridge.scope!=null) handler.postDelayed(autoTask,maxOf(1000L,3000L-(SystemClock.elapsedRealtime()-lastReadAt)))
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if(event?.packageName?.toString()=="com.tencent.mm" && window()!=null && event.eventType in listOf(AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,AccessibilityEvent.TYPE_VIEW_SCROLLED,AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)) {
            navigation++; cancel("微信页面或内容已改变，旧预览和候选已清除；重新读取后核对最新消息",preserveMenu=true)
            if(event.eventType!=AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) { lastDigest=null; lastCapture=null }
            audit("WECHAT_INVALIDATED","type=${event.eventType}")
            scheduleAuto()
        }
    }
    private fun dp(n: Int)=(resources.displayMetrics.density*n).toInt()
    private fun view(label: String, action: ()->Unit) = TextView(this).apply {
        text=label; contentDescription=label; setTextColor(Color.WHITE); textSize=14f; gravity=Gravity.CENTER
        setPadding(dp(12),dp(10),dp(12),dp(10)); minHeight=dp(48); isClickable=true; isFocusable=true; setOnClickListener { action() }
    }
    fun show() {
        if(ball!=null) return
        if(ReadBridge.scope==null) { ReadBridge.status="请先解锁并选择观众"; return }
        val v=view("军师") { menu() }.apply { background=GradientDrawable().apply { setColor(Color.rgb(18,83,79)); cornerRadius=dp(28).toFloat() } }
        try { getSystemService(WindowManager::class.java).addView(v,params(Gravity.END or Gravity.CENTER_VERTICAL,dp(56),dp(56))); ball=v }
        catch(e: Exception) { ReadBridge.status="无法显示悬浮球：${e.javaClass.simpleName}" }
    }
    private fun params(gravity: Int, width: Int=WindowManager.LayoutParams.WRAP_CONTENT, height: Int=WindowManager.LayoutParams.WRAP_CONTENT) =
        WindowManager.LayoutParams(width,height,WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT).apply { this.gravity=gravity; title="心动军师主动辅助" }
    private fun menu() {
        removePanel()
        val box=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL; setPadding(dp(8),dp(8),dp(8),dp(12))
            background=GradientDrawable().apply { setColor(Color.rgb(22,43,47)); cornerRadius=dp(16).toFloat() }
        }
        box.addView(view("当前档案：${ReadBridge.contactName}\n请本人核对当前微信聊天身份") {})
        box.addView(view(if(ReadBridge.autoRead) "前台自动读取：开启 · 点击暂停" else "前台自动读取：暂停 · 点击开启") {
            (application as JunshiApp).controller.setAutoRead(!ReadBridge.autoRead); menu()
        })
        // Fixed status-row height keeps the controls in place during automatic refresh.
        panelStatus=view(ReadBridge.status) {}.apply { height=dp(88); minHeight=dp(88); maxLines=3; ellipsize=TextUtils.TruncateAt.END }
        box.addView(panelStatus)
        box.addView(view("点击读取当前可见屏幕") { removePanel(); readScreen() })
        box.addView(view("核对最新消息并分析") { openReview() })
        box.addView(view("我确认当前聊天对应此档案，加载已保存候选") { loadCandidates(box) })
        box.addView(view("关闭面板") { removePanel() }); box.addView(view("关闭悬浮球") { hide() })
        val scroll=ScrollView(this).apply { addView(box) }
        try { getSystemService(WindowManager::class.java).addView(scroll,params(Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,WindowManager.LayoutParams.MATCH_PARENT,dp(380))); panel=scroll; panelIsMenu=true; audit("MENU_OPENED") }
        catch(e: Exception) { ReadBridge.status="面板无法打开：${e.javaClass.simpleName}" }
    }
    private fun openReview() {
        request=null; navigation++; handler.removeCallbacks(autoTask)
        handoff.beginReview(SystemClock.elapsedRealtime()); audit("REVIEW_REQUESTED")
        try {
            // Keep the menu attached until our app gains focus; removing it over WeChat can
            // cause another content event and invalidate the just-completed capture.
            startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("review_latest",true))
        } catch(e: Exception) { handoff.reset(); status("核对页无法打开：${e.javaClass.simpleName}"); audit("REVIEW_LAUNCH_FAILED") }
    }
    private fun loadCandidates(box: LinearLayout) {
        val scope=ReadBridge.scope ?: return; val target=window() ?: run { ReadBridge.status="请先打开已授权的微信聊天"; return }
        val epoch=navigation; val expectedPanel=panel; val app=application as JunshiApp
        panelIsMenu=false; panelStatus=null
        app.io.execute {
            try {
                val conversation=app.vault.conversation(scope); val latest=app.vault.rounds(scope).firstOrNull() ?: error("本档案没有已完成的报告，请先在App主动生成")
                val host=Streamer(scope.streamerId,scope.accountId,"")
                require(latest.optString("inputFingerprint")==RoundInput.fingerprint(conversation,app.vault.settings(host),app.vault.conversations(host))) {
                    "历史、风格样本或模型配置已有变化，旧报告只供回查；请重新生成候选"
                }
                val analysis=AnalysisFormat.parse(latest.getJSONObject("result").toString(),conversation.messages.map { it.id }.toSet())
                handler.post { if(ReadBridge.scope==scope && navigation==epoch && window()==target && panel!=null && panel===expectedPanel) {
                    ReadBridge.candidates=analysis.candidates
                    if(analysis.noReply) { box.removeAllViews(); box.addView(view("建议不回复：${analysis.noReplyReason}") {}); box.addView(view("返回") { menu() }) }
                    else showCandidates(box)
                } }
            } catch(e: Exception) { handler.post { if(ReadBridge.scope==scope && navigation==epoch) {
                ReadBridge.status=AnalysisEngine.safeError(e); android.widget.Toast.makeText(this,ReadBridge.status,android.widget.Toast.LENGTH_LONG).show()
            } } }
        }
    }
    private fun showCandidates(box: LinearLayout) {
        box.removeAllViews()
        box.addView(view("${ReadBridge.contactName} · 仅复制，需本人编辑并手动发送") {})
        ReadBridge.candidates.forEach { candidate -> candidate.segments.forEachIndexed { i,text ->
            box.addView(view("${candidate.style} ${i+1}\n$text\n点此复制这一条") {
                getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("军师草稿",text))
            })
        } }
        box.addView(view("返回") { menu() })
    }
    private fun removePanel() { panel?.let { runCatching { getSystemService(WindowManager::class.java).removeView(it) } }; panel=null; panelIsMenu=false; panelStatus=null }
    fun invalidatePanel(preserveMenu: Boolean=false) {
        if(preserveMenu && panelIsMenu) status(ReadBridge.status) else removePanel()
    }
    fun hide() { removePanel(); ball?.let { runCatching { getSystemService(WindowManager::class.java).removeView(it) } }; ball=null }
    private fun readScreen(automatic: Boolean = false) {
        if(request!=null) { status("读取正在进行，请稍候"); return }
        val scope=ReadBridge.scope ?: return
        val target=window(); if(target==null) { ReadBridge.clear("请先打开已授权的微信聊天；无法从后台取得未显示消息"); return }
        val id=newId(); val epoch=navigation; val at=System.currentTimeMillis(); request=id
        lastReadAt=SystemClock.elapsedRealtime()
        ReadBridge.clear("正在读取当前可见窗口；文字、身份及最新消息均需核对",preserveMenu=true)
        audit("CAPTURE_STARTED","automatic=$automatic window=$target")
        fun valid() = request==id && ReadBridge.scope==scope && navigation==epoch && window()==target
        fun finishError(reason: String) { if(request==id) { request=null; ReadBridge.clear(reason,preserveMenu=true); audit("CAPTURE_DISCARDED") } }
        handler.postDelayed({ if(request==id) finishError("截图/OCR超时，本次读取未采用") },40_000)
        val callback=object: TakeScreenshotCallback {
            override fun onFailure(errorCode: Int) { finishError("系统截图失败：$errorCode；本次读取未采用") }
            override fun onSuccess(result: ScreenshotResult) {
                val hardware=result.hardwareBuffer
                if(!valid()) { hardware.close(); finishError("页面已变化，本次读取已丢弃"); return }
                val wrapped=Bitmap.wrapHardwareBuffer(hardware,result.colorSpace)
                val bitmap=wrapped?.copy(Bitmap.Config.ARGB_8888,false); wrapped?.recycle(); hardware.close()
                if(bitmap==null) { finishError("截图为空，没有取得聊天材料"); return }
                val png=ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }.toByteArray()
                recognizer.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener { text ->
                    if(valid()) {
                        val lines=text.textBlocks.flatMap { it.lines }.sortedWith(compareBy({ it.boundingBox?.top ?: 0 },{ it.boundingBox?.left ?: 0 }))
                        val raw=lines.joinToString("\n") { it.text }
                        if(raw.isBlank()) finishError("未取得可核对文字；可在App粘贴对方最新原文") else if(automatic && lastDigest==sha256(raw.toByteArray())) {
                            request=null
                            ReadBridge.preview=lastCapture?.takeIf { it.scope==scope && it.id!=ReadBridge.consumedId }
                            status(if(ReadBridge.preview!=null) "可见文字未改变，保留同一次待核对读取；尚未调用AI" else "可见文字与上次相同，未重复提交AI；若确有同文新消息，请手动读取并核对")
                            audit("CAPTURE_UNCHANGED","automatic=$automatic chars=${raw.length} capture=${ReadBridge.preview?.id}")
                        } else {
                            lastDigest=sha256(raw.toByteArray())
                            ReadBridge.preview=Captured(scope,raw,png,"当前可见窗口OCR；消息边界/说话人/联系人/时间未验证；置信度未知；含标题和控件的可能",at,id,automatic)
                            lastCapture=ReadBridge.preview
                            status("取得待核对文字；请点军师→核对最新消息并分析；尚未入库或调用AI"); request=null
                            audit("CAPTURE_READY","automatic=$automatic chars=${raw.length} capture=$id")
                            android.widget.Toast.makeText(this@ChatReadService,ReadBridge.status,android.widget.Toast.LENGTH_LONG).show()
                        }
                    } else finishError("页面或档案已变化，本次OCR已丢弃")
                }.addOnFailureListener { finishError("OCR失败：${it.javaClass.simpleName}") }.addOnCompleteListener { bitmap.recycle() }
            }
        }
        try { if(Build.VERSION.SDK_INT>=34) takeScreenshotOfWindow(target,mainExecutor,callback) else takeScreenshot(Display.DEFAULT_DISPLAY,mainExecutor,callback) }
        catch(e: Exception) { finishError("读取异常：${e.javaClass.simpleName}") }
    }
    override fun onInterrupt() { ReadBridge.autoRead=false; cancel("无障碍中断，自动读取已暂停；旧预览和候选已清除"); hide() }
    override fun onDestroy() {
        ReadBridge.autoRead=false; cancel("无障碍已断开，自动读取已暂停；旧预览和候选已清除"); hide(); handler.removeCallbacksAndMessages(null)
        if(current===this) instance.clear(); recognizer.close(); super.onDestroy()
    }
}
