package cn.xindong.probe

data class CaptureScope(
    val requestId: String,
    val runId: String,
    val scenario: String,
    val windowId: Int,
    val navigationEpoch: Long,
)

/** A window id cannot identify a contact. Every accepted sample still needs human review. */
object CaptureRules {
    fun rejection(expected: CaptureScope, current: CaptureScope?, armed: Boolean, activeRequest: String?): String? = when {
        !armed -> "SESSION_STOPPED"
        activeRequest != expected.requestId -> "REQUEST_CANCELLED_OR_SUPERSEDED"
        current == null -> "WECHAT_WINDOW_UNAVAILABLE"
        current.runId != expected.runId || current.scenario != expected.scenario -> "SESSION_CHANGED"
        current.windowId != expected.windowId -> "WINDOW_CHANGED"
        current.navigationEpoch != expected.navigationEpoch -> "NAVIGATION_CHANGED"
        else -> null
    }
}
