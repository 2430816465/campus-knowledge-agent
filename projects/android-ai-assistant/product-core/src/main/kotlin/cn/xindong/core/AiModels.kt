package cn.xindong.core

import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URI
import java.time.YearMonth
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicBoolean

enum class ProviderKind { CHAT_COMPLETIONS, JEV }
data class ModelConfig(val id: String = newId(), val name: String, val endpoint: String, val model: String,
    val apiKey: String, val kind: ProviderKind = ProviderKind.CHAT_COMPLETIONS, val contextTokens: Int = 65536,
    val outputTokens: Int = 4096, val inputRmbPerMillion: String = "", val outputRmbPerMillion: String = "",
    val cachedRmbPerMillion: String = "", val pricingVerified: Boolean = false, val pricingSource: String = "",
    val stream: Boolean = false, val jsonMode: Boolean = true, val maxTokensField: String = "max_tokens") {
    override fun toString() = "ModelConfig($id, $name, key=REDACTED)"
    fun validate(): ModelConfig {
        val uri=URI(endpoint)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo==null && uri.fragment==null && uri.query==null) { "API地址须为完整HTTPS端点，不能含密钥、查询参数或用户名" }
        require(apiKey.isNotBlank() && '\n' !in apiKey && '\r' !in apiKey && model.isNotBlank()) { "请配置模型和有效API Key" }
        require(contextTokens>outputTokens+1024 && outputTokens>0 && maxTokensField in listOf("max_tokens","max_completion_tokens")) { "请核验模型上下文和输出容量" }
        require(pricingVerified && pricingSource.isNotBlank()) { "调用前须核验人民币计价和来源；不默认接口免费" }
        rates()
        return this
    }
    fun rates(): Triple<BigDecimal,BigDecimal,BigDecimal> {
        fun rate(s: String) = s.toBigDecimal().also { require(it>=BigDecimal.ZERO) }
        return Triple(rate(inputRmbPerMillion),rate(outputRmbPerMillion),rate(cachedRmbPerMillion.ifBlank { inputRmbPerMillion }))
    }
    fun json() = JSONObject().put("id",id).put("name",name).put("endpoint",endpoint).put("model",model).put("apiKey",apiKey)
        .put("kind",kind.name).put("contextTokens",contextTokens).put("outputTokens",outputTokens).put("inputRmbPerMillion",inputRmbPerMillion)
        .put("outputRmbPerMillion",outputRmbPerMillion).put("cachedRmbPerMillion",cachedRmbPerMillion).put("pricingVerified",pricingVerified)
        .put("pricingSource",pricingSource).put("stream",stream).put("jsonMode",jsonMode).put("maxTokensField",maxTokensField)
    companion object {
        fun parse(o: JSONObject) = ModelConfig(o.getString("id"),o.getString("name"),o.getString("endpoint"),o.getString("model"),o.getString("apiKey"),
            ProviderKind.valueOf(o.getString("kind")),o.getInt("contextTokens"),o.getInt("outputTokens"),o.getString("inputRmbPerMillion"),
            o.getString("outputRmbPerMillion"),o.optString("cachedRmbPerMillion"),o.getBoolean("pricingVerified"),o.getString("pricingSource"),
            o.getBoolean("stream"),o.optBoolean("jsonMode",true),o.optString("maxTokensField","max_tokens"))
    }
}
enum class JevMode(val label: String, val instruction: String) {
    BALANCED("均衡", "根据真实双向交流选择回应强度，共情和边界优先"),
    CAUTIOUS("稳妥", "信息不足时优先核对和留空间，不假定亲密或加快关系"),
    ENGAGED("积极回应", "在对方明确愿意互动时多考虑自然延续；拒绝、休息和事实边界始终优先")
}
data class AiSettings(val profiles: List<ModelConfig> = emptyList(), val modelId: String = "", val jevId: String = "",
    val jevEnabled: Boolean = false, val goutouEnabled: Boolean = true, val lianaiEnabled: Boolean = true,
    val cloudConsent: Boolean = false, val componentNoticeAccepted: Boolean = false, val styleNotes: String = "", val jevMode: JevMode = JevMode.BALANCED) {
    fun profile(id: String, kind: ProviderKind) = profiles.singleOrNull { it.id==id && it.kind==kind }?.validate() ?: error("请先选择并配置$kind 接口")
    fun json() = JSONObject().put("profiles",arr(profiles.map { it.json() })).put("modelId",modelId).put("jevId",jevId).put("jevEnabled",jevEnabled)
        .put("goutouEnabled",goutouEnabled).put("lianaiEnabled",lianaiEnabled).put("cloudConsent",cloudConsent)
        .put("componentNoticeAccepted",componentNoticeAccepted).put("styleNotes",styleNotes).put("jevMode",jevMode.name)
        .put("componentPolicyVersion",COMPONENT_POLICY_VERSION)
    companion object {
        const val COMPONENT_POLICY_VERSION = 2
        fun parse(o: JSONObject) = AiSettings(o.objects("profiles").map(ModelConfig::parse),o.optString("modelId"),o.optString("jevId"),
            o.optBoolean("jevEnabled",false),o.optBoolean("goutouEnabled",true),o.optBoolean("lianaiEnabled",true),
            o.optBoolean("cloudConsent"),o.optBoolean("componentNoticeAccepted"),o.optString("styleNotes"),JevMode.valueOf(o.optString("jevMode","BALANCED")))
        /** CR-20261014-05: migrate the old unconfigured default once; keep explicit opt-in afterwards. */
        fun parsePersisted(o: JSONObject): AiSettings {
            val saved=parse(o)
            val hasJevCredential=saved.profiles.any { it.id==saved.jevId && it.kind==ProviderKind.JEV && it.apiKey.isNotBlank() }
            return if(o.optInt("componentPolicyVersion")<COMPONENT_POLICY_VERSION && saved.jevEnabled && !hasJevCredential)
                saved.copy(jevEnabled=false,cloudConsent=false,componentNoticeAccepted=false)
            else saved
        }
    }
}
data class Usage(val input: Long, val output: Long, val cachedInput: Long = 0) {
    init { require(input>=0 && output>=0 && cachedInput in 0..input) }
}
object Costing {
    /** One micro-yuan per token at one yuan/million. Round up instead of hiding fractions. */
    fun microRmb(config: ModelConfig, usage: Usage): Long {
        val (input,output,cached)=config.rates()
        return input.multiply(BigDecimal(usage.input-usage.cachedInput)).add(cached.multiply(BigDecimal(usage.cachedInput)))
            .add(output.multiply(BigDecimal(usage.output))).setScale(0,RoundingMode.CEILING).longValueExact()
    }
    fun month(now: Long): String = YearMonth.from(java.time.Instant.ofEpochMilli(now).atZone(ZoneId.of("Asia/Shanghai"))).toString()
}
data class Charge(val id: String = newId(), val owner: String, val month: String, val component: String, val model: String,
    val reservedMicro: Long, val chargedMicro: Long = reservedMicro, val usage: Usage? = null, val state: String = "RESERVED",
    val at: Long = System.currentTimeMillis(), val pricingSource: String = "")
interface Budget {
    fun reserve(owner: String, component: String, model: ModelConfig, upperInput: Int): String
    fun settle(id: String, usage: Usage?, model: ModelConfig, rejectedBeforeInference: Boolean = false)
}
/** Caller persists every mutation atomically. Uncertain calls remain counted and block another call. */
class Ledger(initial: List<Charge> = emptyList(), initialLimits: Map<String,Long> = emptyMap(),
    private val persist: (List<Charge>,Map<String,Long>)->Unit = { _,_-> }): Budget {
    private var rows=initial.map { if(it.state=="RESERVED") it.copy(state="UNCERTAIN") else it }; private var limits=initialLimits.toMap()
    init { require(rows.all { it.reservedMicro>=0 && it.chargedMicro>=0 }); if(rows!=initial) persist(rows,limits) }
    @Synchronized fun entries(): List<Charge> = rows.toList()
    @Synchronized fun spent(month: String): Long = rows.filter { it.month==month }.fold(0L) { a,c -> Math.addExact(a,c.chargedMicro) }
    @Synchronized fun limit(month: String): Long = limits[month] ?: 100_000_000L
    @Synchronized fun confirmAnotherHundred(month: String) { val next=limits+(month to Math.addExact(limit(month),100_000_000L)); persist(rows,next); limits=next }
    @Synchronized fun recordExternal(owner: String, actualMicro: Long, note: String) {
        require(actualMicro>=0 && note.isNotBlank()) { "请填写已核对费用及来源说明" }
        val next=rows+Charge(owner=owner,month=Costing.month(System.currentTimeMillis()),component="人工补充外部账单",model="BILLING_ADJUSTMENT",
            reservedMicro=0,chargedMicro=actualMicro,state="USER_VERIFIED_EXTERNAL",pricingSource=note)
        Math.addExact(spent(Costing.month(System.currentTimeMillis())),actualMicro)
        persist(next,limits); rows=next
    }
    @Synchronized fun reconcile(id: String, actualMicro: Long) {
        require(actualMicro>=0 && rows.any { it.id==id && it.state=="UNCERTAIN" }) { "仅用量未知且已结束/中断的调用可核对；正在执行的请求须等待结束" }
        val next=rows.map { if(it.id==id) it.copy(chargedMicro=actualMicro,state="USER_RECONCILED") else it }; persist(next,limits); rows=next
    }
    @Synchronized override fun reserve(owner: String, component: String, model: ModelConfig, upperInput: Int): String {
        model.validate(); require(upperInput>=0)
        require(rows.none { it.state in listOf("RESERVED","UNCERTAIN") }) { "存在用量未知的调用，请先在费用页核对账单，不能按零元继续" }
        val month=Costing.month(System.currentTimeMillis()); val cost=Costing.microRmb(model,Usage(upperInput.toLong(),model.outputTokens.toLong()))
        require(Math.addExact(spent(month),cost)<limit(month)) { "本轮保守费用将达到已确认的月度额度（初始100元）；请在费用页明确确认继续" }
        val charge=Charge(owner=owner,month=month,component=component,model=model.model,reservedMicro=cost,pricingSource=model.pricingSource)
        val next=rows+charge; persist(next,limits); rows=next; return charge.id
    }
    @Synchronized override fun settle(id: String, usage: Usage?, model: ModelConfig, rejectedBeforeInference: Boolean) {
        require(rows.any { it.id==id })
        require(rows.single { it.id==id }.state in listOf("RESERVED","UNCERTAIN")) { "调用已结算，拒绝重复结算" }
        val next=rows.map { if(it.id!=id) it else when {
            usage!=null -> it.copy(chargedMicro=Costing.microRmb(model,usage),usage=usage,state="TOKEN_ESTIMATE")
            rejectedBeforeInference -> it.copy(chargedMicro=0,state="REJECTED_NO_USAGE")
            else -> it.copy(state="UNCERTAIN")
        } }; persist(next,limits); rows=next
    }
    @Synchronized fun limitsSnapshot() = limits.toMap()
}
class CancelToken {
    private val cancelled=AtomicBoolean(false)
    fun cancel() { cancelled.set(true) }
    fun check() { if(cancelled.get() || Thread.currentThread().isInterrupted) throw InterruptedException("任务已取消，旧结果已丢弃") }
}
data class ModelReply(val text: String, val model: String, val usage: Usage?)
data class ComponentResult(val name: String, val state: String, val model: String = "", val content: String = "", val detail: String = "", val diagnostic: JSONObject? = null)
data class Coverage(val availableMessages: Int, val processedMessages: Int, val mode: String, val sourceIds: List<String>,
    val recalledIds: List<String>, val chunks: Int, val gaps: String, val estimateMethod: String = "UTF8_BYTES_CONSERVATIVE_ESTIMATE_NOT_PROVIDER_TOKENIZER") {
    fun json() = JSONObject().put("available",availableMessages).put("processed",processedMessages).put("mode",mode).put("sourceIds",arr(sourceIds))
        .put("recalledIds",arr(recalledIds)).put("chunks",chunks).put("gaps",gaps).put("estimateMethod",estimateMethod)
}
