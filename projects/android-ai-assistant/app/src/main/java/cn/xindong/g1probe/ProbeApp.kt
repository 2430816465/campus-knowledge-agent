package cn.xindong.g1probe

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import org.json.JSONObject

class ProbeApp : Application() {
    val store by lazy { ProbeStore(this) }
    override fun onCreate() {
        super.onCreate()
        store.record("PROCESS_START","health",JSONObject().put("device",deviceBaseline(this)))
        val filter=IntentFilter().apply { addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_USER_PRESENT) }
        val receiver=object: BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if(store.armed) store.record("SCREEN_STATE","health",JSONObject().put("action",intent.action))
            }
        }
        if(Build.VERSION.SDK_INT >= 33) registerReceiver(receiver,filter,RECEIVER_NOT_EXPORTED) else registerReceiver(receiver,filter)
        try {
            getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(object: ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { if(store.armed) store.record("NETWORK_AVAILABLE","health") }
                override fun onLost(network: Network) { if(store.armed) store.record("NETWORK_LOST","health") }
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    if(store.armed) store.record("NETWORK_CAPABILITIES","health",JSONObject()
                        .put("validated",caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))
                        .put("wifi",caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))
                        .put("cellular",caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)))
                }
            })
        } catch(e: Exception) { store.record("NETWORK_MONITOR_ERROR","health",JSONObject().put("error",e.javaClass.simpleName)) }
    }
}
val Context.probeStore: ProbeStore get() = (applicationContext as ProbeApp).store

fun deviceBaseline(context: Context): JSONObject {
    val data=JSONObject().put("manufacturer",Build.MANUFACTURER).put("brand",Build.BRAND).put("model",Build.MODEL)
        .put("device",Build.DEVICE).put("android",Build.VERSION.RELEASE).put("sdk",Build.VERSION.SDK_INT)
        .put("build_display",Build.DISPLAY).put("security_patch",Build.VERSION.SECURITY_PATCH)
    try {
        @Suppress("DEPRECATION") val info=context.packageManager.getPackageInfo(WECHAT,0)
        data.put("wechat_version",info.versionName).put("wechat_version_code",info.longVersionCode)
    } catch(_: PackageManager.NameNotFoundException) { data.put("wechat_version",JSONObject.NULL) }
    return data
}

fun accessibilityEnabled(context: Context): Boolean {
    val component=ComponentName(context,ProbeAccessibilityService::class.java)
    return Settings.Secure.getString(context.contentResolver,Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        .split(':').any { ComponentName.unflattenFromString(it) == component }
}

fun permissionStatus(context: Context): JSONObject {
    val enabled=accessibilityEnabled(context)
    val listener=context.getSystemService(NotificationManager::class.java)
        .isNotificationListenerAccessGranted(ComponentName(context,ProbeNotificationService::class.java))
    return JSONObject().put("accessibility_permission",enabled).put("accessibility_connected",ProbeAccessibilityService.current != null)
        .put("notification_permission",listener).put("notification_connected",ProbeNotificationService.connected)
        .put("projection_active",ProjectionService.active).put("monitor_active",MonitorService.active)
        .put("auto_accessibility_screenshot",context.probeStore.autoScreenshot)
        .put("capture_policy",if(context.probeStore.onDemandOnly) "USER_CLICK_ONLY" else "LEGACY_AUTOMATIC_DIAGNOSTIC")
}

fun ongoingNotification(context: Context, title: String, id: String): Notification {
    val manager=context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(id,"G1 本地实验",NotificationManager.IMPORTANCE_LOW))
    val open=PendingIntent.getActivity(context,0,Intent(context,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return Notification.Builder(context,id).setSmallIcon(android.R.drawable.ic_menu_info_details)
        .setContentTitle(title).setContentText("仅在已启动测试中记录证据；点击返回停止").setContentIntent(open).setOngoing(true).build()
}

class MonitorService: Service() {
    companion object { @Volatile var active=false }
    private val handler=Handler(Looper.getMainLooper())
    private val tick=object: Runnable {
        override fun run() {
            if(!probeStore.armed) { stopSelf(); return }
            probeStore.heartbeat(permissionStatus(this@MonitorService))
            handler.postDelayed(this,15_000)
        }
    }
    override fun onCreate() {
        super.onCreate()
        startForeground(101,ongoingNotification(this,"心动 G1：测试监测中","g1_monitor"))
        active=true
        handler.post(tick)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onTaskRemoved(rootIntent: Intent?) { probeStore.record("TASK_REMOVED","health"); super.onTaskRemoved(rootIntent) }
    override fun onDestroy() {
        active=false; handler.removeCallbacksAndMessages(null)
        probeStore.record("MONITOR_STOPPED","health")
        super.onDestroy()
    }
}

class BootReceiver: BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if(intent.action != Intent.ACTION_BOOT_COMPLETED) return
        context.probeStore.record("BOOT_OBSERVED","health",JSONObject().put("note","No capture was restarted. Gap before receiver is unknown. Resume manually."))
        if(context.probeStore.armed) context.probeStore.end("reboot_requires_manual_resume")
    }
}
