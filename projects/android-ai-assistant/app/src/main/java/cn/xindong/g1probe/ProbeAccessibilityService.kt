package cn.xindong.g1probe

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.LinearLayout
import android.widget.TextView
import cn.xindong.probe.CaptureRules
import cn.xindong.probe.CaptureScope
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.lang.ref.WeakReference

class ProbeAccessibilityService: AccessibilityService() {
    companion object {
        @Volatile private var instance=WeakReference<ProbeAccessibilityService>(null)
        val current: ProbeAccessibilityService? get()=instance.get()
    }
    private val handler=Handler(Looper.getMainLooper())
    private var screenshotBusy=false
    private var navigationEpoch=0L
    private var activeRequest: CaptureScope?=null
    private var timeout: Runnable?=null
    private var panel: LinearLayout?=null
    private var readButton: TextView?=null
    private data class Target(val id: Int, val root: AccessibilityNodeInfo)
    private val sample=object: Runnable {
        override fun run() {
            if(probeStore.armed && !captureEnvironmentAvailable()) {
                invalidatePreview("SCREEN_LOCKED_OR_SERVICE_UNAVAILABLE","屏幕已锁定或服务不可用，旧预览已清除；请重新授权后点击读取")
                if(panel != null || activeRequest != null) stopOnDemand("SCREEN_LOCKED_OR_SERVICE_UNAVAILABLE")
            }
            if(probeStore.armed && !probeStore.onDemandOnly && probeStore.autoScreenshot && wechatVisible()) screenshot("AUTOMATIC_VISIBLE_SAMPLE")
            if(!probeStore.armed && panel != null) stopOnDemand("SESSION_STOPPED")
            handler.postDelayed(this,2000)
        }
    }
    override fun onServiceConnected() {
        instance=WeakReference(this)
        probeStore.record("ACCESSIBILITY_CONNECTED","health")
        handler.post(sample)
    }
    private fun captureEnvironmentAvailable(): Boolean = accessibilityEnabled(this) &&
        getSystemService(PowerManager::class.java).isInteractive &&
        !getSystemService(KeyguardManager::class.java).isKeyguardLocked
    private fun targetWindow(): Target? {
        if(!captureEnvironmentAvailable()) return null
        return windows.mapNotNull { window ->
        if(window.type != AccessibilityWindowInfo.TYPE_APPLICATION || !window.isFocused) return@mapNotNull null
        val root=window.root ?: return@mapNotNull null
        if(root.packageName?.toString() != WECHAT) null else Target(window.id,root)
        }.singleOrNull()
    }
    fun wechatVisible(): Boolean = targetWindow() != null
    private fun scope(id: String): CaptureScope? = targetWindow()?.let {
        CaptureScope(id,probeStore.runId,probeStore.scenario,it.id,navigationEpoch)
    }
    private fun rejection(request: CaptureScope): String? = CaptureRules.rejection(
        request,scope(request.requestId),probeStore.armed,activeRequest?.requestId)
    private fun diagnostic(type: String, request: CaptureScope, data: JSONObject = JSONObject()) {
        probeStore.record(type,"accessibility_ocr",data.put("request_id",request.requestId)
            .put("target_window_id",request.windowId).put("navigation_epoch",request.navigationEpoch),request.runId,request.scenario)
    }
    private fun invalidatePreview(reason: String, status: String) {
        if(CaptureReview.invalidate(status)) probeStore.record("READ_PREVIEW_INVALIDATED","health",JSONObject().put("reason",reason))
    }

    fun showOnDemand() {
        if(!probeStore.armed || panel != null) return
        val density=resources.displayMetrics.density
        fun dp(value: Int)=(value*density).toInt()
        val box=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(dp(4),dp(4),dp(4),dp(4))
            background=GradientDrawable().apply { setColor(Color.rgb(28,46,67)); cornerRadius=dp(16).toFloat() }
            importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_YES
        }
        fun action(label: String, action: ()->Unit): TextView = TextView(this).apply {
            text=label; contentDescription=label; setTextColor(Color.WHITE); textSize=14f
            gravity=Gravity.CENTER; minHeight=dp(48); setPadding(dp(12),dp(4),dp(12),dp(4))
            isClickable=true; isFocusable=true; setOnClickListener { action() }
            box.addView(this,LinearLayout.LayoutParams(dp(168),LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        readButton=action("点击读取当前屏幕") { screenshot("USER_TRIGGERED_VISIBLE_SAMPLE") }
        action("查看读取结果") {
            stopOnDemand("REVIEW_OPENED")
            try { startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            catch(e: Exception) { probeStore.record("REVIEW_OPEN_FAILED","health",JSONObject().put("error",e.javaClass.simpleName)) }
        }
        action("关闭读取按钮") { stopOnDemand("USER_CLOSED_OVERLAY") }
        val params=WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT).apply {
            gravity=Gravity.TOP or Gravity.END; x=dp(8); y=dp(120); title="心动 G1 主动读取"
        }
        try {
            getSystemService(WindowManager::class.java).addView(box,params); panel=box
            probeStore.record("ON_DEMAND_OVERLAY_SHOWN","health",JSONObject().put("capture_policy","USER_CLICK_ONLY"))
        } catch(e: Exception) {
            readButton=null
            probeStore.record("OVERLAY_FAILED","health",JSONObject().put("error",e.javaClass.simpleName))
        }
    }
    fun stopOnDemand(reason: String) {
        activeRequest?.let { request ->
            diagnostic("CAPTURE_CANCELLED",request,JSONObject().put("reason",reason))
            CaptureReview.finish(request.requestId,"读取已取消：$reason")
        }
        finishRequest()
        panel?.let { view ->
            try { getSystemService(WindowManager::class.java).removeView(view) }
            catch(e: Exception) { probeStore.record("OVERLAY_REMOVE_FAILED","health",JSONObject().put("error",e.javaClass.simpleName)) }
        }
        panel=null; readButton=null
    }
    private fun finishRequest() {
        timeout?.let { handler.removeCallbacks(it) }; timeout=null
        activeRequest=null; screenshotBusy=false
        readButton?.text="点击读取当前屏幕"
    }
    private fun armTimeout(request: CaptureScope, millis: Long, phase: String) {
        timeout?.let { handler.removeCallbacks(it) }
        timeout=Runnable {
            if(activeRequest?.requestId == request.requestId) {
                diagnostic("CAPTURE_TIMEOUT",request,JSONObject().put("phase",phase).put("timeout_ms",millis)
                    .put("note","Main-thread timer; process suspension may delay delivery"))
                CaptureReview.finish(request.requestId,"读取超时（$phase），未生成建议；可重新点击")
                finishRequest()
            }
        }.also { handler.postDelayed(it,millis) }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if(event == null || !probeStore.armed) return
        if(event.packageName?.toString() == WECHAT && (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            event.eventType == AccessibilityEvent.TYPE_VIEW_SCROLLED)) {
            navigationEpoch++
            activeRequest?.let { request ->
                diagnostic("CAPTURE_CANCELLED",request,JSONObject().put("reason","OBSERVED_WECHAT_NAVIGATION"))
                finishRequest()
            }
            invalidatePreview("OBSERVED_WECHAT_NAVIGATION","微信页面已改变，旧预览已清除；请在当前聊天重新点击读取")
        }
        if(event.packageName?.toString() != WECHAT || probeStore.onDemandOnly) return
        try {
            val root=rootInActiveWindow
            val nodes=JSONArray(); val candidates=JSONArray(); val hints=JSONArray()
            var visited=0; var truncated=false
            fun visit(node: AccessibilityNodeInfo, path: String, depth: Int) {
                if(visited >= 2000 || depth >= 80) { truncated=true; return }
                visited++
                val rect=Rect().also { node.getBoundsInScreen(it) }
                val text=if(node.isPassword) "" else node.text?.toString().orEmpty()
                val desc=if(node.isPassword) "" else node.contentDescription?.toString().orEmpty()
                if(text.isNotBlank() || desc.isNotBlank()) {
                    nodes.put(JSONObject().put("path",path).put("view_id",node.viewIdResourceName ?: JSONObject.NULL)
                        .put("class",node.className).put("text",text).put("description",desc)
                        .put("bounds",JSONArray(listOf(rect.left,rect.top,rect.right,rect.bottom)))
                        .put("visible",node.isVisibleToUser).put("password_redacted",node.isPassword))
                    if(node.isVisibleToUser && text.isNotBlank()) candidates.put(candidateJson(text,candidates.length()))
                    if(node.isVisibleToUser && rect.top in 0..250 && text.isNotBlank()) hints.put(text)
                }
                for(i in 0 until node.childCount) node.getChild(i)?.let { visit(it,"$path/$i",depth+1) }
            }
            if(root?.packageName?.toString() == WECHAT) visit(root,"root",0)
            probeStore.record("ACCESSIBILITY_SNAPSHOT","accessibility",JSONObject()
                .put("event_type",event.eventType).put("event_time_elapsed_ms",event.eventTime)
                .put("event_text",JSONArray(event.text.map { it.toString() })).put("event_description",event.contentDescription)
                .put("wechat_window_visible",root?.packageName?.toString() == WECHAT)
                .put("window_id",event.windowId).put("visited_nodes",visited).put("truncated",truncated)
                .put("contact_title_hints_unverified",hints).put("nodes",nodes).put("candidates",candidates)
                .put("message_boundary_status","UNKNOWN: nodes may include titles, dates, controls and historical messages"))
        } catch(e: Exception) { probeStore.record("ACCESSIBILITY_ERROR","accessibility",JSONObject().put("error",e.javaClass.simpleName)) }
    }
    fun screenshot(mode: String = "USER_DELAYED_SAMPLE") {
        if(!probeStore.armed) return
        val id=UUID.randomUUID().toString()
        val window=try {
            if(Build.VERSION.SDK_INT >= 33) clearCache()
            targetWindow()
        } catch(e: Exception) {
            probeStore.record("SCREENSHOT_REQUEST_EXCEPTION","accessibility_ocr",JSONObject().put("mode",mode).put("error",e.javaClass.simpleName))
            return
        }
        if(screenshotBusy || window == null) {
            val reason=if(screenshotBusy) "CAPTURE_ALREADY_RUNNING" else "FOCUSED_WECHAT_WINDOW_NOT_AVAILABLE"
            probeStore.record("SCREENSHOT_REQUEST_REJECTED","accessibility_ocr",JSONObject().put("request_id",id).put("mode",mode).put("reason",reason))
            if(!screenshotBusy && mode == "USER_TRIGGERED_VISIBLE_SAMPLE") {
                CaptureReview.begin(id,"当前微信窗口"); CaptureReview.finish(id,"无法读取：请先打开已授权的微信测试聊天")
            }
            readButton?.text=if(screenshotBusy) "正在读取，请稍候" else "请先打开微信聊天"
            return
        }
        screenshotBusy=true
        val request=CaptureScope(id,probeStore.runId,probeStore.scenario,window.id,navigationEpoch)
        activeRequest=request
        val userTriggered=mode == "USER_TRIGGERED_VISIBLE_SAMPLE"
        if(userTriggered) CaptureReview.begin(id,"当前微信窗口 · 本机 OCR")
        readButton?.text="正在读取，请保持页面"
        val at=System.currentTimeMillis()
        val started=SystemClock.elapsedRealtime()
        val metadata=JSONObject().put("mode",mode).put("request_id",id).put("automatic",!userTriggered)
            .put("screenshot_api",if(Build.VERSION.SDK_INT >= 34) "WINDOW" else "DISPLAY")
            .put("target_window_id",window.id).put("coverage","CURRENT_VISIBLE_WINDOW_ONLY")
            .put("contact_identity","UNCONFIRMED; mandatory human review")
        diagnostic("SCREENSHOT_REQUESTED",request,JSONObject(metadata.toString()))
        // Record node availability independently of whether screenshot/OCR succeeds.
        probeStore.record("USER_READ_NODE_AVAILABILITY","accessibility",JSONObject().put("request_id",id)
            .put("mode",mode).put("root_child_count",window.root.childCount).put("root_text_available",!window.root.text.isNullOrBlank())
            .put("identity_verified",false),request.runId,request.scenario)
        armTimeout(request,10_000,"SCREENSHOT_CALLBACK")
        try {
            val callback=object: TakeScreenshotCallback {
                override fun onSuccess(result: ScreenshotResult) {
                    val buffer=result.hardwareBuffer
                    diagnostic("SCREENSHOT_CALLBACK_SUCCESS",request,JSONObject().put("callback_latency_ms",SystemClock.elapsedRealtime()-started))
                    val reason=rejection(request)
                    if(reason != null) {
                        buffer.close()
                        diagnostic("SCREENSHOT_DISCARDED",request,JSONObject().put("reason",reason))
                        CaptureReview.finish(id,"页面或会话已改变，本次读取已丢弃")
                        if(activeRequest?.requestId == id) finishRequest()
                        return
                    }
                    var wrapped: Bitmap?=null
                    val bitmap=try {
                        wrapped=Bitmap.wrapHardwareBuffer(buffer,result.colorSpace)
                        wrapped?.copy(Bitmap.Config.ARGB_8888,false)
                    } catch(e: Exception) {
                        diagnostic("SCREENSHOT_BITMAP_EXCEPTION",request,JSONObject().put("error",e.javaClass.simpleName)); null
                    } finally { wrapped?.recycle(); buffer.close() }
                    if(bitmap == null) {
                        diagnostic("SCREENSHOT_EMPTY",request)
                        CaptureReview.finish(id,"截图不可用，未取得聊天材料"); finishRequest(); return
                    }
                    armTimeout(request,30_000,"OCR_COMPLETION")
                    OcrCapture.process(this@ProbeAccessibilityService,bitmap,"accessibility_ocr",request.runId,request.scenario,at,
                        metadata,validate={ rejection(request) },previewId=if(userTriggered) id else null) {
                        if(activeRequest?.requestId == id) finishRequest()
                    }
                }
                override fun onFailure(errorCode: Int) {
                    diagnostic("SCREENSHOT_FAILED",request,JSONObject().put("android_error_code",errorCode).put("mode",mode)
                        .put("callback_latency_ms",SystemClock.elapsedRealtime()-started))
                    CaptureReview.finish(id,"系统截图失败，错误码 $errorCode；未生成建议")
                    if(activeRequest?.requestId == id) finishRequest()
                }
            }
            if(Build.VERSION.SDK_INT >= 34) takeScreenshotOfWindow(window.id,mainExecutor,callback)
            else takeScreenshot(Display.DEFAULT_DISPLAY,mainExecutor,callback)
        } catch(e: Exception) {
            diagnostic("SCREENSHOT_EXCEPTION",request,JSONObject().put("error",e.javaClass.simpleName))
            CaptureReview.finish(id,"读取异常：${e.javaClass.simpleName}"); finishRequest()
        }
    }
    fun delayedScreenshot() { handler.postDelayed({ screenshot() },6000) }
    override fun onInterrupt() {
        invalidatePreview("ACCESSIBILITY_INTERRUPTED","无障碍服务已中断，旧预览已清除；请重新授权后读取")
        stopOnDemand("ACCESSIBILITY_INTERRUPTED")
        probeStore.record("ACCESSIBILITY_INTERRUPTED","health")
    }
    override fun onDestroy() {
        stopOnDemand("ACCESSIBILITY_DISCONNECTED")
        if(current === this) {
            invalidatePreview("ACCESSIBILITY_DISCONNECTED","无障碍服务已断开，旧预览已清除；请重新授权后读取")
            instance.clear()
        }
        handler.removeCallbacksAndMessages(null)
        probeStore.record("ACCESSIBILITY_DISCONNECTED","health")
        super.onDestroy()
    }
}
