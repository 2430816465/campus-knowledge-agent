package cn.xindong.core

import org.json.JSONArray
import org.json.JSONObject

fun arr(values: Collection<*>): JSONArray = JSONArray(values)
fun JSONObject.objects(key: String): List<JSONObject> = optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } } ?: emptyList()
fun JSONObject.strings(key: String): List<String> = optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
fun JSONObject.nullable(key: String): String? = if(has(key) && !isNull(key)) getString(key) else null
fun Scope.json(): JSONObject = JSONObject().put("accountId",accountId).put("streamerId",streamerId).put("contactId",contactId)
fun JSONObject.scope(): Scope = getJSONObject("scope").let { Scope(it.getString("accountId"),it.getString("streamerId"),it.getString("contactId")) }
private fun base(id: String, scope: Scope) = JSONObject().put("id",id).put("scope",scope.json())
fun Contact.json() = JSONObject().put("scope",scope.json()).put("name",name).put("notes",notes).put("boundaries",boundaries).put("gaps",gaps).put("aliases",arr(aliases))
fun Evidence.json() = base(id,scope).put("batchId",batchId).put("kind",kind.name).put("raw",raw).put("sha256",sha256).put("blobId",blobId).put("createdAt",createdAt)
fun Message.json() = base(id,scope).put("order",order).put("speaker",speaker.name).put("body",body).put("kind",kind.name).put("time",time)
    .put("evidenceIds",arr(evidenceIds)).put("status",status.name).put("actualSent",actualSent).put("mediaIds",arr(mediaIds))
    .put("revision",revision).put("correctedFrom",correctedFrom).put("reviewedAt",reviewedAt).put("styleExample",styleExample)
fun DraftRow.json() = JSONObject().put("id",id).put("speaker",speaker.name).put("body",body).put("time",time).put("kind",kind.name)
    .put("evidenceIds",arr(evidenceIds)).put("mediaIds",arr(mediaIds)).put("checked",checked).put("skip",skip).put("overlapWith",overlapWith)
fun ImportBatch.json() = base(id,scope).put("rows",arr(rows.map { it.json() })).put("evidenceIds",arr(evidenceIds))
    .put("identityConfirmed",identityConfirmed).put("orderConfirmed",orderConfirmed).put("committed",committed).put("gaps",gaps).put("createdAt",createdAt)
fun MediaAsset.json() = base(id,scope).put("blobId",blobId).put("mime",mime).put("originalName",originalName).put("sha256",sha256).put("description",description).put("verified",verified)
fun Tag.json() = base(id,scope).put("text",text).put("origin",origin).put("confirmed",confirmed).put("evidenceMessageIds",arr(evidenceMessageIds))
fun Fact.json() = base(id,scope).put("key",key).put("value",value).put("evidenceMessageIds",arr(evidenceMessageIds)).put("at",at).put("origin",origin)
fun Conflict.json() = base(id,scope).put("factIds",arr(factIds)).put("note",note).put("resolvedBy",resolvedBy)
fun Conversation.json() = JSONObject().put("schema",1).put("contact",contact.json()).put("messages",arr(messages.map { it.json() }))
    .put("evidence",arr(evidence.map { it.json() })).put("batches",arr(batches.map { it.json() })).put("media",arr(media.map { it.json() }))
    .put("tags",arr(tags.map { it.json() })).put("facts",arr(facts.map { it.json() })).put("conflicts",arr(conflicts.map { it.json() }))
object HistoryJson {
    fun message(o: JSONObject) = Message(o.getString("id"),o.scope(),o.getLong("order"),Speaker.valueOf(o.getString("speaker")),o.getString("body"),
        Kind.valueOf(o.getString("kind")),o.optString("time"),o.strings("evidenceIds"),ReviewStatus.valueOf(o.getString("status")),o.optBoolean("actualSent"),o.strings("mediaIds"),
        o.optInt("revision",1),o.nullable("correctedFrom"),o.getLong("reviewedAt"),o.optBoolean("styleExample"))
    fun row(o: JSONObject) = DraftRow(o.getString("id"),Speaker.valueOf(o.getString("speaker")),o.getString("body"),o.optString("time"),Kind.valueOf(o.getString("kind")),
        o.strings("evidenceIds"),o.strings("mediaIds"),o.optBoolean("checked"),o.optBoolean("skip"),o.nullable("overlapWith"))
    fun batch(o: JSONObject) = ImportBatch(o.getString("id"),o.scope(),o.objects("rows").map(::row),o.strings("evidenceIds"),o.optBoolean("identityConfirmed"),
        o.optBoolean("orderConfirmed"),o.optBoolean("committed"),o.optString("gaps"),o.getLong("createdAt"))
    fun parse(raw: String): Conversation {
        val o=JSONObject(raw); require(o.getInt("schema")==1) { "不支持此历史格式" }
        val c=o.getJSONObject("contact")
        return Conversation(Contact(c.scope(),c.getString("name"),c.optString("notes"),c.optString("boundaries"),c.getString("gaps"),c.strings("aliases")),
            o.objects("messages").map(::message),o.objects("evidence").map { e -> Evidence(e.getString("id"),e.scope(),e.getString("batchId"),SourceKind.valueOf(e.getString("kind")),
                e.getString("raw"),e.getString("sha256"),e.nullable("blobId"),e.getLong("createdAt")) },o.objects("batches").map(::batch),
            o.objects("media").map { m -> MediaAsset(m.getString("id"),m.scope(),m.getString("blobId"),m.getString("mime"),m.getString("originalName"),m.getString("sha256"),m.getString("description"),m.getBoolean("verified")) },
            o.objects("tags").map { t -> Tag(t.getString("id"),t.scope(),t.getString("text"),t.getString("origin"),t.getBoolean("confirmed"),t.strings("evidenceMessageIds")) },
            o.objects("facts").map { f -> Fact(f.getString("id"),f.scope(),f.getString("key"),f.getString("value"),f.strings("evidenceMessageIds"),f.getLong("at"),f.getString("origin")) },
            o.objects("conflicts").map { f -> Conflict(f.getString("id"),f.scope(),f.strings("factIds"),f.getString("note"),f.nullable("resolvedBy")) }).validate()
    }
}
