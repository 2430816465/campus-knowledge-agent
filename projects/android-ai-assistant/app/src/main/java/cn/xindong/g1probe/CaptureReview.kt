package cn.xindong.g1probe

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import cn.xindong.probe.PreviewRules
import cn.xindong.probe.ReadPreview

/** Local preview only. It never creates confirmed messages, contact bindings, or AI replies. */
object CaptureReview {
    var current by mutableStateOf(ReadPreview())
        private set
    fun begin(id: String, source: String) { current=ReadPreview(id,"正在读取，请保持当前聊天不动",source) }
    fun finish(id: String, status: String, text: String = "") {
        current=PreviewRules.completed(current,id,status,text)
    }
    fun invalidate(reason: String): Boolean {
        if(current.requestId.isBlank()) return false
        current=PreviewRules.invalidated(reason)
        return true
    }
    fun clear() { current=ReadPreview() }
}
