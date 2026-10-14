package cn.xindong.probe

import java.security.MessageDigest

enum class Direction { INBOUND, OUTBOUND, UNKNOWN }

data class Candidate(
    val body: String,
    val source: String,
    val sourceEventId: String,
    val occurrence: Int,
    val contactId: String? = null,
    val nativeMessageId: String? = null,
    val direction: Direction = Direction.UNKNOWN,
    val order: Long? = null,
)

/** A notification key, a nickname, an OCR box, and a body hash are NOT message IDs. */
object EvidenceRules {
    fun sameKnownMessage(a: Candidate, b: Candidate): Boolean =
        !a.nativeMessageId.isNullOrBlank() && a.nativeMessageId == b.nativeMessageId &&
        !a.contactId.isNullOrBlank() && a.contactId == b.contactId &&
        a.direction != Direction.UNKNOWN && a.direction == b.direction &&
        a.order != null && a.order == b.order && a.body == b.body

    /** Keep ambiguous occurrences: false merges would hide real omissions. */
    fun conservativeMerge(items: List<Candidate>): List<Candidate> =
        items.fold(mutableListOf()) { kept, item ->
            if (kept.none { sameKnownMessage(it, item) }) kept.add(item)
            kept
        }

    fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    fun eventHash(previous: String, id: String, at: Long, payloadHash: String): String =
        sha256("$previous|$id|$at|$payloadHash")

    fun possibleGap(lastWall: Long, lastElapsed: Long, wall: Long, elapsed: Long): Boolean =
        lastWall > 0 && (elapsed < lastElapsed || wall < lastWall || wall - lastWall > 45_000)

    fun unusableFrame(samples: IntArray): Boolean {
        if (samples.isEmpty()) return true
        val gray = samples.map { ((it shr 16 and 255) + (it shr 8 and 255) + (it and 255)) / 3 }
        return gray.count { it < 8 }.toDouble() / gray.size > 0.99
    }
}
