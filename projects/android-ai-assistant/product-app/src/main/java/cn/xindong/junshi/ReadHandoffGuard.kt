package cn.xindong.junshi

/** Only a brief unknown focus may bridge a transition to the review app. */
internal class ReadHandoffGuard(private val ownPackage: String) {
    private var unknownSince: Long? = null
    private var reviewUntil = 0L

    fun beginReview(now: Long) { unknownSince=null; reviewUntil=now+3000L }
    fun reset() { unknownSince=null; reviewUntil=0L }

    fun mayRetain(focusedPackage: String?, now: Long): Boolean = when(focusedPackage) {
        ownPackage -> { reset(); true }
        "com.tencent.mm" -> { unknownSince=null; true }
        null -> {
            val since=unknownSince ?: now.also { unknownSince=it }
            now < if(reviewUntil>0L) reviewUntil else since+2000L
        }
        else -> { reset(); false }
    }
}
