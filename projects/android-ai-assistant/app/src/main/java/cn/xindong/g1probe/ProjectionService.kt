package cn.xindong.g1probe

import android.app.Activity
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject

class ProjectionService: Service() {
    companion object { @Volatile var active=false }
    private val handler=Handler(Looper.getMainLooper())
    private var projection: MediaProjection?=null
    private var display: VirtualDisplay?=null
    private var reader: ImageReader?=null
    private var width=0; private var height=0
    private var busy=false; private var lastSample=0L; private var closing=false
    private val callback=object: MediaProjection.Callback() {
        override fun onStop() { probeStore.record("PROJECTION_REVOKED_OR_STOPPED","health"); stopSelf() }
        override fun onCapturedContentResize(w: Int, h: Int) {
            if(w>0 && h>0 && (w!=width || h!=height) && !closing) {
                try { resize(w,h) } catch(e: Exception) { failure("RESIZE_FAILED",e) }
            }
        }
        override fun onCapturedContentVisibilityChanged(isVisible: Boolean) {
            probeStore.record("PROJECTION_VISIBILITY","health",JSONObject().put("visible",isVisible))
        }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(!probeStore.armed) { stopSelf(); return START_NOT_STICKY }
        if(projection != null) { probeStore.record("PROJECTION_DUPLICATE_START_REJECTED","health"); return START_NOT_STICKY }
        try {
            startForeground(102,ongoingNotification(this,"心动 G1：已授权屏幕 OCR","g1_projection"),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            val resultCode=intent?.getIntExtra("result_code",Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
            val consent=if(Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra("consent",Intent::class.java) else {
                @Suppress("DEPRECATION") intent?.getParcelableExtra("consent")
            }
            if(resultCode != Activity.RESULT_OK || consent == null) { probeStore.record("PROJECTION_CONSENT_MISSING","health"); stopSelf(); return START_NOT_STICKY }
            val p=getSystemService(MediaProjectionManager::class.java).getMediaProjection(resultCode,consent)
                ?: throw IllegalStateException("Projection token unavailable")
            projection=p
            p.registerCallback(callback,handler)
            val metrics=resources.displayMetrics
            resize(metrics.widthPixels,metrics.heightPixels)
            // Exactly one createVirtualDisplay per newly granted token.
            display=p.createVirtualDisplay("G1 local evidence",width,height,metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader!!.surface,null,handler)
            active=true
            probeStore.record("PROJECTION_STARTED","health",JSONObject().put("consent_reused",false).put("note","OCR requires visible WeChat root; hidden chats remain inaccessible"))
        } catch(e: Exception) { failure("PROJECTION_START_FAILED",e) }
        return START_NOT_STICKY
    }
    private fun failure(type: String,e: Exception) {
        probeStore.record(type,"projection_ocr",JSONObject().put("error",e.javaClass.simpleName))
        stopSelf()
    }
    private fun resize(w: Int,h: Int) {
        require(w in 1..8192 && h in 1..8192)
        display?.surface=null
        reader?.close()
        width=w; height=h
        reader=ImageReader.newInstance(w,h,PixelFormat.RGBA_8888,2).apply {
            setOnImageAvailableListener({ r ->
                val image=try { r.acquireLatestImage() } catch(_: IllegalStateException) { null } ?: return@setOnImageAvailableListener
                try {
                    if(!probeStore.armed) { stopSelf(); return@setOnImageAvailableListener }
                    if(busy || SystemClock.elapsedRealtime()-lastSample<2000) return@setOnImageAvailableListener
                    // Never OCR other apps. Unknown/disabled accessibility means no screen OCR.
                    if(ProbeAccessibilityService.current?.wechatVisible() != true) return@setOnImageAvailableListener
                    lastSample=SystemClock.elapsedRealtime()
                    val run=probeStore.runId; val scene=probeStore.scenario; val at=System.currentTimeMillis()
                    val plane=image.planes.first()
                    if(plane.pixelStride != 4) throw IllegalStateException("Unsupported pixel stride")
                    val paddedWidth=plane.rowStride/plane.pixelStride
                    val padded=Bitmap.createBitmap(paddedWidth,image.height,Bitmap.Config.ARGB_8888)
                    val bitmap=try {
                        padded.copyPixelsFromBuffer(plane.buffer)
                        Bitmap.createBitmap(padded,0,0,image.width,image.height).let {
                            if(it === padded) padded.copy(Bitmap.Config.ARGB_8888,false) else it
                        }
                    } finally { padded.recycle() }
                    busy=true
                    OcrCapture.process(this@ProjectionService,bitmap,"projection_ocr",run,scene,at,
                        JSONObject().put("mode","USER_CONSENTED_SESSION_AUTOMATIC_VISIBLE_SAMPLE")) { busy=false }
                } catch(e: Exception) { probeStore.record("PROJECTION_FRAME_ERROR","projection_ocr",JSONObject().put("error",e.javaClass.simpleName)) }
                finally { image.close() }
            },handler)
        }
        display?.resize(w,h,resources.displayMetrics.densityDpi)
        display?.surface=reader!!.surface
        probeStore.record("PROJECTION_SIZE","health",JSONObject().put("width",w).put("height",h))
    }
    override fun onBind(intent: Intent?): IBinder?=null
    override fun onDestroy() {
        closing=true; active=false
        projection?.unregisterCallback(callback)
        display?.release(); display=null
        reader?.close(); reader=null
        projection?.stop(); projection=null
        stopForeground(STOP_FOREGROUND_REMOVE)
        probeStore.record("PROJECTION_ENDED","health",JSONObject().put("resume","New user consent required"))
        super.onDestroy()
    }
}
