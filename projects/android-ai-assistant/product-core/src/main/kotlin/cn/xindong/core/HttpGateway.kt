package cn.xindong.core

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class ApiFailure(val status: Int, val beforeInference: Boolean, message: String): Exception(message)
interface Gateway {
    fun chat(config: ModelConfig, system: String, user: String, cancel: CancelToken, progress: (String)->Unit = {}): ModelReply
    fun jev(config: ModelConfig, state: JSONObject, cancel: CancelToken): ModelReply
}
/** The production factory opens the configured HTTPS URL. A factory can be injected only by JVM tests. */
class HttpGateway(private val connect: (URL)->HttpURLConnection = { it.openConnection() as HttpURLConnection }): Gateway {
    override fun chat(config: ModelConfig, system: String, user: String, cancel: CancelToken, progress: (String)->Unit): ModelReply {
        require(config.kind==ProviderKind.CHAT_COMPLETIONS); config.validate()
        val body=JSONObject().put("model",config.model).put("messages",JSONArray()
            .put(JSONObject().put("role","system").put("content",system))
            .put(JSONObject().put("role","user").put("content",user)))
            .put(config.maxTokensField,config.outputTokens).put("stream",config.stream)
        if(config.jsonMode) body.put("response_format",JSONObject().put("type","json_object"))
        if(config.stream) body.put("stream_options",JSONObject().put("include_usage",true))
        return post(config,body,cancel) { reader ->
            if(config.stream) parseSse(reader,cancel,progress) else parseChat(JSONObject(readLimited(reader,cancel)))
        }
    }
    override fun jev(config: ModelConfig, state: JSONObject, cancel: CancelToken): ModelReply {
        require(config.kind==ProviderKind.JEV); config.validate()
        val questions=JSONObject()
            .put("boundary_respect",JSONObject().put("type","noul").put("instructions","基于证据，是否需要降低互动强度并尊重对方的拒绝或休息意愿？未知不假定亲密。")
                .put("criteria",JSONObject().put("true","有拒绝、休息、压力或明确边界证据").put("false","上下文显示轻松且主动的双向互动")))
            .put("strategy",JSONObject().put("type","choice").put("instructions","选择当前最稳妥的回复策略，结合state.analysis_preference的应用判断偏好；拒绝与休息始终优先，不推断未表达的恋爱意愿。")
                .put("criteria",JSONObject().put("pause","明确拒绝联系或需要空间").put("acknowledge","需要共情或简短回应").put("clarify","存在事实矛盾或关键信息不足").put("continue","适合自然延续话题")))
            .put("intensity",JSONObject().put("type","score").put("instructions","评估适宜互动强度；分数只是辅助判断。")
                .put("criteria",JSONArray(listOf("低强度，留空间","自然回应","积极延续但不施压"))))
        return post(config,JSONObject().put("model",config.model).put("state",state).put("questions",questions),cancel) { reader ->
            val o=JSONObject(readLimited(reader,cancel)); val answers=o.getJSONObject("answers")
            val boundary=answers.getJSONObject("boundary_respect").getDouble("noul")
            require(boundary.isFinite() && boundary in 0.0..1.0) { "Jev返回了无效概率" }
            require(answers.getJSONObject("strategy").getString("choice") in listOf("pause","acknowledge","clarify","continue"))
            val intensity=answers.getJSONObject("intensity").getDouble("score")
            require(intensity.isFinite() && intensity in 0.0..2.0)
            ModelReply(answers.toString(),o.getString("model"),usage(o.optJSONObject("usage")))
        }
    }
    private fun <T> post(config: ModelConfig, body: JSONObject, cancel: CancelToken, parse: (BufferedReader)->T): T {
        cancel.check()
        val connection=connect(URL(config.endpoint))
        try {
            connection.requestMethod="POST"; connection.instanceFollowRedirects=false
            connection.connectTimeout=15_000; connection.readTimeout=120_000; connection.doOutput=true
            connection.setRequestProperty("Authorization","Bearer ${config.apiKey}")
            connection.setRequestProperty("Content-Type","application/json; charset=utf-8")
            connection.setRequestProperty("Accept",if(config.stream && config.kind==ProviderKind.CHAT_COMPLETIONS) "text/event-stream" else "application/json")
            val bytes=body.toString().toByteArray(Charsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { cancel.check(); it.write(bytes) }
            val status=connection.responseCode
            if(status !in 200..299) throw ApiFailure(status,status in listOf(400,401,403,404,422,429),
                when(status) { 401,403 -> "接口鉴权失败，请核对本地密钥和权限"; 429 -> "接口限流"; in 300..399 -> "拒绝接口重定向，避免密钥转发"; else -> "模型接口失败 HTTP $status；未显示服务器正文以保护隐私" })
            return connection.inputStream.bufferedReader(Charsets.UTF_8).use(parse)
        } finally { connection.disconnect() }
    }
    companion object {
        private const val MAX_CHARS=4*1024*1024
        fun usage(o: JSONObject?): Usage? {
            if(o==null) return null
            val input=when { o.has("prompt_tokens") -> o.getLong("prompt_tokens"); o.has("input_tokens") -> o.getLong("input_tokens"); else -> return null }
            val output=when { o.has("completion_tokens") -> o.getLong("completion_tokens"); o.has("output_tokens") -> o.getLong("output_tokens"); else -> return null }
            val cached=o.optLong("prompt_cache_hit_tokens",o.optJSONObject("prompt_tokens_details")?.optLong("cached_tokens",0) ?: 0)
            return Usage(input,output,cached)
        }
        fun readLimited(reader: BufferedReader, cancel: CancelToken): String {
            val result=StringBuilder(); val buffer=CharArray(4096)
            while(true) { cancel.check(); val n=reader.read(buffer); if(n<0) break
                require(result.length+n<=MAX_CHARS) { "模型响应超过安全容量，未截断冒充完整结果" }; result.append(buffer,0,n)
            }; return result.toString()
        }
        fun parseChat(o: JSONObject): ModelReply {
            val choice=o.getJSONArray("choices").getJSONObject(0)
            require(choice.getString("finish_reason")=="stop") { "模型输出未完整结束（可能达到长度限制或被过滤），本轮不可采用" }
            val message=choice.getJSONObject("message")
            require(message.optString("refusal").isBlank()) { "模型拒绝了本轮请求" }
            return ModelReply(message.getString("content"),o.getString("model"),usage(o.optJSONObject("usage")))
        }
        fun parseSse(reader: BufferedReader, cancel: CancelToken, progress: (String)->Unit = {}): ModelReply {
            val result=StringBuilder(); val data=mutableListOf<String>(); var model=""; var usage: Usage?=null
            var finish=""; var done=false; var readChars=0
            fun event() {
                if(data.isEmpty()) return
                val payload=data.joinToString("\n"); data.clear()
                if(payload=="[DONE]") { done=true; return }
                val o=JSONObject(payload); require(!o.has("error")) { "流式接口返回错误，不能采用部分结果" }
                if(o.has("model")) model=o.getString("model")
                usage(o.optJSONObject("usage"))?.let { usage=it }
                val choices=o.optJSONArray("choices") ?: return
                if(choices.length()==0) return
                val c=choices.getJSONObject(0)
                if(!c.isNull("finish_reason")) finish=c.getString("finish_reason")
                c.optJSONObject("delta")?.let { delta ->
                    require(delta.optString("refusal").isBlank()) { "模型拒绝了本轮请求" }
                    val part=delta.optString("content")
                    if(part.isNotEmpty()) { result.append(part); progress(part) }
                }
            }
            while(!done) { cancel.check(); val line=reader.readLine() ?: break; readChars+=line.length
                require(readChars<=MAX_CHARS) { "流式响应超过容量，未采用截断结果" }
                if(line.isEmpty()) event() else if(line.startsWith("data:")) data.add(line.substring(5).removePrefix(" "))
            }
            if(!done) event()
            require(done && finish=="stop" && model.isNotBlank()) { "流式连接未完整结束，部分结果已拒绝" }
            return ModelReply(result.toString(),model,usage)
        }
    }
}

/** Each retry has its own persisted reservation. Unknown billing is never treated as zero. */
class ChargedGateway(private val raw: Gateway, private val budget: Budget, private val owner: String) {
    fun chat(name: String, config: ModelConfig, system: String, user: String, cancel: CancelToken, progress: (String)->Unit = {}): ModelReply =
        invoke(name,config,Contexts.estimate(system)+Contexts.estimate(user)+1024,cancel) { raw.chat(config,system,user,cancel,progress) }
    fun jev(config: ModelConfig, state: JSONObject, cancel: CancelToken): ModelReply =
        invoke("Jev",config,Contexts.estimate(state.toString())+2048,cancel) { raw.jev(config,state,cancel) }
    private fun invoke(name: String, config: ModelConfig, input: Int, cancel: CancelToken, call: ()->ModelReply): ModelReply {
        require(input+config.outputTokens<config.contextTokens) { "$name 上下文容量不足，没有丢弃历史继续调用" }
        for(attempt in 0..2) {
            cancel.check(); val id=budget.reserve(owner,name,config,input)
            val reply=try { call() } catch(e: Exception) {
                budget.settle(id,null,config,(e as? ApiFailure)?.beforeInference==true)
                if(e is ApiFailure && e.status==429 && attempt<2) {
                    repeat(10*(1 shl attempt)) { cancel.check(); Thread.sleep(100) }; continue
                }; throw e
            }
            budget.settle(id,reply.usage,config); cancel.check(); return reply
        }; error("接口重试失败")
    }
}
