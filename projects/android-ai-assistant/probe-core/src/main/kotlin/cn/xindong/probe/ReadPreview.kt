package cn.xindong.probe

/** Unbound source material. A preview is never a confirmed contact or message. */
data class ReadPreview(
    val requestId: String = "",
    val status: String = "尚未点击读取",
    val source: String = "",
    val text: String = "",
)

object PreviewRules {
    fun completed(current: ReadPreview, requestId: String, status: String, text: String): ReadPreview =
        if(requestId.isNotBlank() && current.requestId == requestId) current.copy(status=status,text=text) else current

    fun invalidated(status: String): ReadPreview = ReadPreview(status=status)
}
