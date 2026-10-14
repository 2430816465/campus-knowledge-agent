package cn.xindong.core

import java.security.MessageDigest
import java.time.OffsetDateTime
import java.util.UUID

fun newId(): String = UUID.randomUUID().toString()
fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
data class Account(val id: String = newId(), val name: String)
data class Streamer(val id: String = newId(), val accountId: String, val name: String)
data class Scope(val accountId: String, val streamerId: String, val contactId: String) {
    init { require(listOf(accountId,streamerId,contactId).all { it.matches(Regex("[A-Za-z0-9_-]{1,80}")) }) }
    val key: String get() = "$accountId/$streamerId/$contactId"
}
data class Contact(val scope: Scope, val name: String, val notes: String = "", val boundaries: String = "",
    val gaps: String = "微信历史完整度未知；屏外、未导入或已删除材料未取得", val aliases: List<String> = emptyList())
enum class Speaker { STREAMER, CONTACT, UNKNOWN }
enum class Kind { TEXT, EMOJI, IMAGE, VOICE, VIDEO, STICKER, REFERENCE, RECALL, OTHER }
enum class ReviewStatus { DRAFT, CONFIRMED }
enum class SourceKind { PASTED_TEXT, TEXT_FILE, SCREENSHOT_OCR, CLICK_OCR, MEDIA, MANUAL, REVIEWED_LATEST }
data class Evidence(val id: String = newId(), val scope: Scope, val batchId: String, val kind: SourceKind,
    val raw: String, val sha256: String, val blobId: String? = null, val createdAt: Long = System.currentTimeMillis())
data class Message(val id: String = newId(), val scope: Scope, val order: Long, val speaker: Speaker, val body: String,
    val kind: Kind = Kind.TEXT, val time: String = "", val evidenceIds: List<String>, val status: ReviewStatus = ReviewStatus.CONFIRMED,
    val actualSent: Boolean = false, val mediaIds: List<String> = emptyList(), val revision: Int = 1,
    val correctedFrom: String? = null, val reviewedAt: Long = System.currentTimeMillis(), val styleExample: Boolean = false)
data class DraftRow(val id: String = newId(), val speaker: Speaker = Speaker.UNKNOWN, val body: String,
    val time: String = "", val kind: Kind = Kind.TEXT, val evidenceIds: List<String>, val mediaIds: List<String> = emptyList(),
    val checked: Boolean = false, val skip: Boolean = false, val overlapWith: String? = null)
data class ImportBatch(val id: String = newId(), val scope: Scope, val rows: List<DraftRow> = emptyList(),
    val evidenceIds: List<String> = emptyList(), val identityConfirmed: Boolean = false, val orderConfirmed: Boolean = false,
    val committed: Boolean = false, val gaps: String = "本批仅覆盖已提供材料，其余历史未知", val createdAt: Long = System.currentTimeMillis())
data class MediaAsset(val id: String = newId(), val scope: Scope, val blobId: String, val mime: String,
    val originalName: String, val sha256: String, val description: String = "内容未知，待人工说明或转写", val verified: Boolean = false)
data class Tag(val id: String = newId(), val scope: Scope, val text: String, val origin: String = "USER",
    val confirmed: Boolean = true, val evidenceMessageIds: List<String> = emptyList())
data class Fact(val id: String = newId(), val scope: Scope, val key: String, val value: String,
    val evidenceMessageIds: List<String>, val at: Long = System.currentTimeMillis(), val origin: String = "USER_NOTE")
data class Conflict(val id: String = newId(), val scope: Scope, val factIds: List<String>, val note: String,
    val resolvedBy: String? = null)
data class Conversation(val contact: Contact, val messages: List<Message> = emptyList(), val evidence: List<Evidence> = emptyList(),
    val batches: List<ImportBatch> = emptyList(), val media: List<MediaAsset> = emptyList(), val tags: List<Tag> = emptyList(),
    val facts: List<Fact> = emptyList(), val conflicts: List<Conflict> = emptyList()) {
    val scope: Scope get() = contact.scope
    fun validate(): Conversation {
        require(messages.all { it.scope == scope } && evidence.all { it.scope == scope } && batches.all { it.scope == scope }) { "跨观众材料被拒绝" }
        require(media.all { it.scope == scope } && tags.all { it.scope == scope } && facts.all { it.scope == scope } && conflicts.all { it.scope == scope }) { "跨账户数据被拒绝" }
        require(messages.map { it.id }.distinct().size == messages.size)
        require(messages.map { it.order }.distinct().size == messages.size)
        require(messages.all { it.order>0 && it.revision>0 && (!it.actualSent || it.speaker==Speaker.STREAMER) &&
            (it.status!=ReviewStatus.CONFIRMED || (it.speaker!=Speaker.UNKNOWN && it.body.isNotBlank() && HistoryImport.validTime(it.time))) }) { "已确认消息的方向、正文或时间无效" }
        listOf(evidence.map { it.id },batches.map { it.id },media.map { it.id },tags.map { it.id },facts.map { it.id },conflicts.map { it.id }).forEach { require(it.distinct().size==it.size) }
        val es = evidence.map { it.id }.toSet(); val ms = media.map { it.id }.toSet(); val ids = messages.map { it.id }.toSet()
        require(messages.all { it.evidenceIds.isNotEmpty() && es.containsAll(it.evidenceIds) && ms.containsAll(it.mediaIds) }) { "消息来源缺失" }
        require(batches.all { es.containsAll(it.evidenceIds) && it.rows.all { row -> es.containsAll(row.evidenceIds) && ms.containsAll(row.mediaIds) } })
        require(facts.all { ids.containsAll(it.evidenceMessageIds) } && tags.all { ids.containsAll(it.evidenceMessageIds) }) { "事实引用越界" }
        require(conflicts.all { conflict -> facts.map { it.id }.containsAll(conflict.factIds) })
        return this
    }
    fun addFact(fact: Fact): Conversation {
        require(fact.scope == scope && fact.key.isNotBlank() && fact.value.isNotBlank())
        val previous = facts.filter { it.key == fact.key && it.value != fact.value }
        return copy(facts=facts+fact, conflicts=if(previous.isEmpty()) conflicts else conflicts+Conflict(scope=scope,
            factIds=previous.map { it.id }+fact.id, note="同一字段存在不同记录，原文均保留；请核对时间和适用范围")).validate()
    }
}

object HistoryImport {
    /** Explicit JSON text-message interchange, always imported into the review queue. */
    fun documentRows(raw: String, evidenceId: String): List<DraftRow> {
        val text=raw.trimStart()
        if(!text.startsWith("[") && !text.startsWith("{")) return textRows(raw,evidenceId)
        val rows=if(text.startsWith("[")) org.json.JSONArray(raw) else org.json.JSONObject(raw).getJSONArray("messages")
        require(rows.length()>0) { "JSON消息列表为空" }
        return (0 until rows.length()).map { i ->
            val row=rows.getJSONObject(i)
            val body=row.getString("body"); require(body.isNotBlank()) { "JSON消息正文为空" }
            val speaker=when(row.optString("speaker")) { "主播","我","STREAMER" -> Speaker.STREAMER; "观众","对方","CONTACT" -> Speaker.CONTACT; else -> Speaker.UNKNOWN }
            val kind=runCatching { Kind.valueOf(row.optString("kind","TEXT")) }.getOrDefault(Kind.OTHER)
            DraftRow(speaker=speaker,body=body,time=row.optString("time"),kind=kind,evidenceIds=listOf(evidenceId))
        }
    }
    fun suggestDraftOverlap(previous: List<DraftRow>, incoming: List<DraftRow>): List<DraftRow> {
        var overlap=0
        for(n in 2..minOf(previous.size,incoming.size)) {
            val tail=previous.takeLast(n); val head=incoming.take(n)
            if(tail.map { it.body }.distinct().size>=2 && tail.zip(head).all { (a,b) -> a.body==b.body && (a.speaker==b.speaker || a.speaker==Speaker.UNKNOWN || b.speaker==Speaker.UNKNOWN) }) overlap=n
        }
        return incoming.mapIndexed { i,row -> if(i<overlap) row.copy(overlapWith=previous[previous.size-overlap+i].id) else row }
    }
    fun textRows(raw: String, evidenceId: String): List<DraftRow> = raw.lineSequence().filter { it.isNotBlank() }.map { line ->
        val parts = line.split('\t',limit=4)
        if(parts.size == 4) DraftRow(speaker=when(parts[1]) { "主播","我","STREAMER" -> Speaker.STREAMER; "观众","对方","CONTACT" -> Speaker.CONTACT; else -> Speaker.UNKNOWN },
            time=parts[0],kind=runCatching { Kind.valueOf(parts[2]) }.getOrDefault(Kind.TEXT),body=parts[3],evidenceIds=listOf(evidenceId))
        else DraftRow(body=line,evidenceIds=listOf(evidenceId))
    }.toList()
    /** A suggestion only. Repeated identical messages are never automatically removed. */
    fun suggestOverlap(existing: List<Message>, rows: List<DraftRow>): List<DraftRow> {
        val history = existing.sortedBy { it.order }
        var overlap = 0
        for(n in 2..minOf(history.size,rows.size)) {
            val tail=history.takeLast(n); val head=rows.take(n)
            if(tail.map { it.body }.distinct().size < 2) continue
            if(tail.zip(head).all { (a,b) -> a.body == b.body && (b.speaker == Speaker.UNKNOWN || a.speaker == b.speaker) }) overlap=n
        }
        return rows.mapIndexed { i,row -> if(i<overlap) row.copy(overlapWith=history[history.size-overlap+i].id) else row }
    }
    fun commit(conversation: Conversation, batch: ImportBatch): Conversation {
        require(conversation.scope == batch.scope && !batch.committed && conversation.batches.singleOrNull { it.id==batch.id }?.committed==false) { "批次身份不符、未保存或已经提交" }
        require(batch.identityConfirmed && batch.orderConfirmed) { "请核对观众身份及本批从旧到新的顺序" }
        val rows=batch.rows.filterNot { it.skip }
        require(rows.isNotEmpty() && rows.all { it.checked && it.speaker != Speaker.UNKNOWN && it.body.isNotBlank() && validTime(it.time) }) { "每条材料须校对正文、说话人和时间；未知时间请留空" }
        val start=conversation.messages.maxOfOrNull { it.order } ?: 0
        val added=rows.mapIndexed { i,row -> Message(scope=batch.scope,order=start+i+1,speaker=row.speaker,body=row.body,
            time=row.time,kind=row.kind,evidenceIds=row.evidenceIds,actualSent=row.speaker==Speaker.STREAMER,mediaIds=row.mediaIds) }
        return conversation.copy(messages=conversation.messages+added,
            batches=conversation.batches.filterNot { it.id==batch.id }+batch.copy(committed=true)).validate()
    }
    fun validTime(value: String): Boolean = value.isBlank() || runCatching { OffsetDateTime.parse(value) }.isSuccess
    fun merge(rows: List<DraftRow>, first: Int): List<DraftRow> {
        require(first in 0 until rows.lastIndex)
        val a=rows[first]; val b=rows[first+1]
        val merged=a.copy(speaker=if(a.speaker==b.speaker) a.speaker else Speaker.UNKNOWN,body=a.body+"\n"+b.body,evidenceIds=(a.evidenceIds+b.evidenceIds).distinct(),
            mediaIds=(a.mediaIds+b.mediaIds).distinct(),checked=false,overlapWith=null)
        return rows.take(first)+merged+rows.drop(first+2)
    }
}
