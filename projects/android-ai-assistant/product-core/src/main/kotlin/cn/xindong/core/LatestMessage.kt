package cn.xindong.core

import org.json.JSONObject

/** A screen contains controls and both speakers. OCR alone never creates this review. */
data class LatestReview(val observationId: String, val scope: Scope, val bodies: List<String>,
    val identityChecked: Boolean, val incomingChecked: Boolean, val latestUnansweredChecked: Boolean,
    val newOccurrenceChecked: Boolean)

data class ReplyTarget(val scope: Scope, val messageIds: List<String>, val revisions: List<Int>) {
    companion object {
        fun lastReviewed(c: Conversation): ReplyTarget? {
            val ordered=c.messages.filter { it.status==ReviewStatus.CONFIRMED }.sortedBy { it.order }
            val last=ordered.lastOrNull()?.takeIf { it.speaker==Speaker.CONTACT } ?: return null
            val evidence=last.evidenceIds.singleOrNull()?.takeIf { id -> c.evidence.any { it.id==id && it.kind==SourceKind.REVIEWED_LATEST } } ?: return null
            val tail=ordered.takeLastWhile { it.speaker==Speaker.CONTACT && it.evidenceIds==listOf(evidence) }
            return ReplyTarget(c.scope,tail.map { it.id },tail.map { it.revision })
        }
    }
    fun validate(c: Conversation): ReplyTarget {
        require(scope==c.scope && messageIds.isNotEmpty() && messageIds.distinct().size==messageIds.size)
        val tail=c.messages.filter { it.status==ReviewStatus.CONFIRMED }.sortedBy { it.order }.takeLast(messageIds.size)
        require(tail.map { it.id }==messageIds && tail.map { it.revision }==revisions && tail.all { it.speaker==Speaker.CONTACT }) {
            "回复目标已改变或已有主播回复，请核对最新消息"
        }
        return this
    }
    fun json(c: Conversation): JSONObject {
        validate(c)
        return JSONObject().put("scope",scope.json()).put("message_ids",arr(messageIds)).put("revisions",arr(revisions))
            .put("messages",arr(messageIds.map { id -> c.messages.single { it.id==id }.let {
                JSONObject().put("id",it.id).put("body",it.body).put("time",it.time).put("speaker",it.speaker.name)
            } })).put("verified_by","USER_REVIEW").put("instruction","针对这些最新且尚未回复的对方消息给出建议；全部可用历史仍是上下文；允许建议不回复")
    }
}

object LatestIntake {
    fun evidenceId(scope: Scope, observationId: String) = "latest-"+sha256((scope.key+"/"+observationId).toByteArray())
    fun validate(c: Conversation, review: LatestReview) {
        c.validate()
        require(review.scope==c.scope && review.observationId.isNotBlank()) { "读取归属与当前档案不同" }
        require(review.identityChecked && review.incomingChecked && review.latestUnansweredChecked && review.newOccurrenceChecked) {
            "请核对身份、对方原文、最新未回复状态及是否已入库"
        }
        require(review.bodies.isNotEmpty() && review.bodies.all { it.isNotBlank() }) { "请逐条填写对方最新原文" }
        val id=evidenceId(c.scope,review.observationId)
        require(c.evidence.none { it.id==id }) { "本次读取已经入库；不会重复追加或自动扣费，请回查已保存记录" }
    }
    /** Idempotence is by observation, never by text: two real occurrences of '好的' are distinct. */
    fun append(c: Conversation, review: LatestReview, original: String, blobId: String? = null,
        originalHash: String = sha256(original.toByteArray()), observedAt: Long = System.currentTimeMillis()): Pair<Conversation,ReplyTarget> {
        validate(c,review)
        val id=evidenceId(c.scope,review.observationId)
        val raw=JSONObject().put("observation_id",review.observationId).put("original",original)
            .put("reviewed_bodies",arr(review.bodies)).put("identity_checked",true).put("incoming_checked",true)
            .put("latest_unanswered_checked",true).put("new_occurrence_checked",true).put("reviewed_at",System.currentTimeMillis()).toString()
        val e=Evidence(id,c.scope,review.observationId,SourceKind.REVIEWED_LATEST,raw,originalHash,blobId,observedAt)
        val order=c.messages.maxOfOrNull { it.order } ?: 0
        val messages=review.bodies.mapIndexed { i,body -> Message(scope=c.scope,order=order+i+1,speaker=Speaker.CONTACT,
            body=body,evidenceIds=listOf(id)) }
        val next=c.copy(evidence=c.evidence+e,messages=c.messages+messages).validate()
        return next to ReplyTarget(c.scope,messages.map { it.id },messages.map { it.revision }).validate(next)
    }
}
