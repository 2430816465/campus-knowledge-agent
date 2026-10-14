package cn.xindong.g1probe

import android.app.Notification
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

class ProbeNotificationService: NotificationListenerService() {
    companion object { @Volatile var connected=false }
    override fun onListenerConnected() { connected=true; probeStore.record("NOTIFICATION_LISTENER_CONNECTED","health") }
    override fun onListenerDisconnected() { connected=false; probeStore.record("NOTIFICATION_LISTENER_DISCONNECTED","health") }
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if(sbn == null || sbn.packageName != WECHAT || !probeStore.armed || probeStore.onDemandOnly) return
        try {
            val n=sbn.notification; val extras=n.extras
            val title=extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            val text=extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            val big=extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            val lines=extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.map { it.toString() }.orEmpty()
            val style=NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
            val messages=JSONArray(); val candidates=JSONArray()
            style?.messages?.forEachIndexed { index, m ->
                messages.put(JSONObject().put("body",m.text).put("timestamp",m.timestamp)
                    .put("person_key_hint",m.person?.key).put("person_uri_hint",m.person?.uri)
                    .put("person_name_hint",m.person?.name).put("mime",m.dataMimeType).put("has_data_uri",m.dataUri != null))
                m.text?.toString()?.let { candidates.put(candidateJson(it,index,m.person?.name?.toString())) }
            }
            if(candidates.length() == 0) {
                val texts=if(lines.isNotEmpty()) lines else listOfNotNull(big ?: text)
                texts.forEachIndexed { index, body -> candidates.put(candidateJson(body,index,title)) }
            }
            probeStore.record("NOTIFICATION_POSTED","notification",JSONObject()
                .put("notification_key",sbn.key).put("notification_id",sbn.id).put("post_time_ms",sbn.postTime)
                .put("title",title).put("text",text).put("big_text",big).put("lines",JSONArray(lines))
                .put("is_group_summary",n.flags and Notification.FLAG_GROUP_SUMMARY != 0)
                .put("notification_when_ms",n.`when`).put("shortcut_id_hint",n.shortcutId)
                .put("messaging_style",messages).put("candidates",candidates)
                .put("identity_status","UNKNOWN: nickname/person/shortcut hints need device-specific verification; notification key is not a message ID"))
        } catch(e: Exception) { probeStore.record("NOTIFICATION_PARSE_ERROR","notification",JSONObject().put("error",e.javaClass.simpleName)) }
    }
    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if(sbn?.packageName == WECHAT && probeStore.armed && !probeStore.onDemandOnly) probeStore.record("NOTIFICATION_REMOVED","notification",JSONObject().put("notification_key",sbn.key))
    }
}
