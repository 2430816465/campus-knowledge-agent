package cn.xindong.core

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Validation diagnostics contain only fixed field names, sizes and a fingerprint, never response text. */
class SkillOutputFailure(component: String, val code: String, text: String, field: String = "") : Exception(
    "$component：" + when(code) {
        "EMPTY_CONTENT" -> "接口返回空正文"
        "INVALID_JSON" -> "接口正文不是约定的JSON对象"
        "FOREIGN_REFERENCE" -> "分析引用了不存在或其他观众的消息"
        else -> "分析字段不符合约定"
    } + "；本轮未生成候选"
) {
    val diagnostic: JSONObject = JSONObject().put("stage","SKILL_OUTPUT_VALIDATION").put("code",code)
        .put("field",field).put("content_chars",text.length).put("content_utf8_bytes",text.toByteArray(Charsets.UTF_8).size)
        .put("content_sha256",sha256(text.toByteArray(Charsets.UTF_8)))
}

object SkillOutput {
    val contract = """
分析过程使用上方Skill的框架；最终输出必须遵守以下JSON约定，不能照搬文档的Markdown输出模板。
只输出一个非空JSON对象，不输出围栏、解释前言或空字符串。字段均须存在；缺乏证据时保留空数组并在unknowns说明，不编造消息ID。
{"facts":[{"text":"有原文支持的事实","evidence_ids":["输入中的本观众消息ID"]}],
"hypotheses":[{"text":"尚未证实的推测","evidence_ids":[]}],"unknowns":["未知信息"],
"strategy":"基于当前资料的建议及理由","risks":[],"disagreements":[]}
facts与hypotheses是对象数组；每个对象的text是非空字符串，evidence_ids是消息ID字符串数组。facts每项必须至少引用一条真实输入消息，hypotheses可以无引用。
unknowns、risks、disagreements是字符串数组；strategy是非空字符串。无可靠事实或推测时相应数组为空。
""".trimIndent()

    fun parse(component: String, text: String, allowedIds: Set<String>): JSONObject {
        fun reject(code: String, field: String = ""): Nothing = throw SkillOutputFailure(component,code,text,field)
        if(text.isBlank()) reject("EMPTY_CONTENT")
        val o=try { JSONObject(text) } catch(_: JSONException) { reject("INVALID_JSON") }
        fun array(key: String): JSONArray = o.opt(key) as? JSONArray ?: reject("SCHEMA",key)
        listOf("facts","hypotheses").forEach { key ->
            val points=array(key)
            repeat(points.length()) { i ->
                val point=points.opt(i) as? JSONObject ?: reject("SCHEMA","$key[*]")
                if((point.opt("text") as? String).isNullOrBlank()) reject("SCHEMA","$key[*].text")
                val ids=point.opt("evidence_ids") as? JSONArray ?: reject("SCHEMA","$key[*].evidence_ids")
                if(key=="facts" && ids.length()==0) reject("SCHEMA","facts[*].evidence_ids")
                repeat(ids.length()) { j ->
                    val id=ids.opt(j) as? String ?: reject("SCHEMA","$key[*].evidence_ids")
                    if(id !in allowedIds) reject("FOREIGN_REFERENCE","$key[*].evidence_ids")
                }
            }
        }
        listOf("unknowns","risks","disagreements").forEach { key ->
            val values=array(key)
            repeat(values.length()) { if(values.opt(it) !is String) reject("SCHEMA",key) }
        }
        if((o.opt("strategy") as? String).isNullOrBlank()) reject("SCHEMA","strategy")
        return o
    }
}
