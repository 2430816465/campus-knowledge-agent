package cn.xindong.core

import org.json.JSONObject

object StyleLearning {
    fun profile(owner: Streamer, conversations: List<Conversation>, current: Scope): JSONObject {
        require(current.streamerId==owner.id && current.accountId==owner.accountId)
        val own=conversations.filter { it.scope.streamerId==owner.id && it.scope.accountId==owner.accountId }
        val messages=own.flatMap { it.messages }.filter { it.speaker==Speaker.STREAMER && it.actualSent && it.status==ReviewStatus.CONFIRMED && it.kind in listOf(Kind.TEXT,Kind.EMOJI) }
        val lengths=messages.map { it.body.codePointCount(0,it.body.length) }.sorted()
        fun percentile(p: Double) = lengths.getOrNull(((lengths.size-1)*p).toInt().coerceAtLeast(0)) ?: 0
        val habits=listOf("哈哈","嗯嗯","好呀","好哒","晚安","早呀","啊","呀","啦","嘿嘿","谢谢","没事")
        val currentMessages=messages.filter { it.scope==current }.sortedBy { it.order }
        val examples=currentMessages.filter { it.styleExample }.ifEmpty { currentMessages.takeLast(8) }
        val marks=listOf("。","！","!","？","?","～","~","…","，",",","：",":","；",";","、","“","”","\"","（","）","(",")"," ","\n")
        val punctuation=marks.associateWith { p -> messages.sumOf { it.body.windowed(p.length).count { s -> s==p } } }
        val totalCharacters=lengths.sumOf { it.toLong() }
        fun fraction(n: Long, denominator: Long) = if(denominator==0L) 0.0 else n.toDouble()/denominator
        val groups=own.flatMap { conversation ->
            val result=mutableListOf<Int>(); var n=0
            conversation.messages.sortedBy { it.order }.forEach { m ->
                if(m.actualSent && m.speaker==Speaker.STREAMER && m.status==ReviewStatus.CONFIRMED && m.kind in listOf(Kind.TEXT,Kind.EMOJI)) n++
                else if(n>0) { result.add(n); n=0 }
            }; if(n>0) result.add(n); result
        }
        return JSONObject().put("confirmed_sent_count",messages.size).put("p10_length",percentile(.1)).put("median_length",percentile(.5)).put("p90_length",percentile(.9))
            .put("punctuation",JSONObject(punctuation))
            .put("punctuation_message_probability",JSONObject().also { o -> marks.forEach { p -> o.put(p,fraction(messages.count { p in it.body }.toLong(),messages.size.toLong())) } })
            .put("punctuation_character_probability",JSONObject().also { o -> punctuation.forEach { (p,n) -> o.put(p,fraction(n.toLong(),totalCharacters)) } })
            .put("character_count",totalCharacters)
            .put("habits",JSONObject().also { o -> habits.forEach { p -> o.put(p,messages.count { p in it.body }) } })
            .put("emoji_message_count",messages.count { m -> m.kind==Kind.EMOJI || m.body.codePoints().anyMatch { it in 0x1F000..0x1FAFF || it in 0x2600..0x27BF || it==0x20E3 } })
            .put("emoji_count_method","表情类型或Unicode表情/符号区间估计，非完整Unicode Emoji词典；不将增补汉字当作表情")
            .put("consecutive_sent_groups",arr(groups))
            .put("consecutive_sent_group_distribution",JSONObject().also { o -> groups.groupingBy { it }.eachCount().forEach { (size,n) -> o.put(size.toString(),JSONObject().put("count",n).put("probability",fraction(n.toLong(),groups.size.toLong()))) } })
            .put("probability_definition","标点消息概率=含该字符的已确认发送消息数/消息数；字符概率=出现次数/Unicode码点总数；分条按会话内相邻已确认发送记录统计，未知时间不推断真实连发间隔")
            .put("current_contact_examples_only",arr(examples.map { JSONObject().put("id",it.id).put("body",it.body) }))
            .put("boundary","统计使用全部已确认主播发送文字；其他观众内容和未发送AI候选不学习。其他观众原句不上传，仅发送格式统计。")
    }
}
object Contexts {
    fun estimate(text: String): Int = Math.addExact(text.toByteArray(Charsets.UTF_8).size,64)
    fun history(conversation: Conversation): List<JSONObject> {
        conversation.validate()
        return conversation.messages.filter { it.status==ReviewStatus.CONFIRMED }.sortedBy { it.order }.map { m ->
            JSONObject().put("id",m.id).put("order",m.order).put("speaker",m.speaker.name).put("body",m.body).put("time",m.time)
                .put("kind",m.kind.name).put("media",arr(conversation.media.filter { it.id in m.mediaIds }.map {
                    JSONObject().put("id",it.id).put("description",if(it.verified) it.description else "内容未知，说明尚未校对").put("verified",it.verified).put("original_blob_reference",it.blobId)
                }))
        }
    }
    fun metadata(conversation: Conversation) = JSONObject().put("scope",conversation.scope.json()).put("viewer",conversation.contact.name)
        .put("notes",conversation.contact.notes).put("boundaries",conversation.contact.boundaries).put("history_gaps",conversation.contact.gaps)
        .put("tags",arr(conversation.tags.filter { it.confirmed }.map { it.json() }))
        .put("facts",arr(conversation.facts.map { it.json() })).put("conflicts",arr(conversation.conflicts.map { it.json() }))
        .put("pending_material_rows",conversation.batches.filterNot { it.committed }.sumOf { it.rows.count { row -> !row.skip } })
    /** Split every character of oversized messages; source IDs and part numbers remain attached. */
    fun chunks(history: List<JSONObject>, budget: Int): List<List<JSONObject>> {
        require(budget>=1024) { "上下文容量不足，请配置更大窗口或减少固定提示开销；没有截断历史" }
        val pieces=history.flatMap { item ->
            if(estimate(item.toString())<budget-128) listOf(item) else {
                val body=item.getString("body"); val out=mutableListOf<JSONObject>(); var start=0; var part=1
                while(start<body.length) {
                    var end=minOf(body.length,start+maxOf(1,(budget-512)/4))
                    if(end<body.length && Character.isHighSurrogate(body[end-1])) end--
                    require(end>start)
                    val copy=JSONObject(item.toString()).put("body",body.substring(start,end)).put("part",part++)
                    require(estimate(copy.toString())<budget) { "单条媒体元数据超出容量，需人工精简说明，原件保留" }
                    out.add(copy); start=end
                }; out
            }
        }
        val result=mutableListOf<List<JSONObject>>(); var current=mutableListOf<JSONObject>(); var size=2
        pieces.forEach { item -> val cost=estimate(item.toString())+1
            if(current.isNotEmpty() && size+cost>budget) { result.add(current); current=mutableListOf(); size=2 }
            current.add(item); size+=cost
        }; if(current.isNotEmpty()) result.add(current)
        return result
    }
    fun recall(conversation: Conversation, evidenceIds: Set<String>, query: String, budget: Int): List<JSONObject> {
        val history=history(conversation)
        val terms=query.lowercase().split(Regex("[^\\p{L}\\p{N}]+")).filter { it.length>=2 }.toSet()
        val ranked=history.sortedWith(compareByDescending<JSONObject> { if(it.getString("id") in evidenceIds) 100 else 0 }
            .thenByDescending { item -> terms.count { it in item.getString("body").lowercase() } }.thenByDescending { it.getLong("order") })
        val chosen=mutableListOf<JSONObject>(); var used=2
        ranked.forEach { item -> val cost=estimate(item.toString())+1
            if(used+cost<=budget) { chosen.add(item); used+=cost }
        }
        return chosen.sortedBy { it.getLong("order") }
    }
}
