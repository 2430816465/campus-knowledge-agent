package cn.xindong.core

import org.json.JSONObject
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/** Finite dual-Skill diagnostics. Kept separate from the 100-pair acceptance runner. */
object SampleCli {
    @JvmStatic fun main(args: Array<String>) {
        try { run(args) }
        catch(e: Exception) { System.err.println("小样本实验停止："+AnalysisEngine.safeError(e)); kotlin.system.exitProcess(2) }
    }
    private fun write(path: Path, json: JSONObject) {
        val temp=path.resolveSibling(path.fileName.toString()+".tmp")
        Files.writeString(temp,json.toString(2),Charsets.UTF_8)
        try { Files.move(temp,path,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING) }
        catch(_: java.nio.file.AtomicMoveNotSupportedException) { Files.move(temp,path,StandardCopyOption.REPLACE_EXISTING) }
    }
    private fun charge(c: Charge) = JSONObject().put("id",c.id).put("owner",c.owner).put("month",c.month).put("component",c.component)
        .put("model",c.model).put("reserved",c.reservedMicro).put("charged",c.chargedMicro).put("state",c.state).put("at",c.at)
        .put("usage",c.usage?.let { JSONObject().put("input",it.input).put("output",it.output).put("cached",it.cachedInput) })
        .put("pricingSource",c.pricingSource)
    private fun run(args: Array<String>) {
        val pairs=args.toList().chunked(2)
        require(pairs.all { it.size==2 } && pairs.map { it[0] }.distinct().size==pairs.size) { "参数不完整或重复" }
        val opts=pairs.associate { it[0] to it[1] }
        require(opts.keys.all { it in setOf("--config","--cases","--out","--action") })
        val action=opts["--action"] ?: "check"; require(action in setOf("check","run"))
        val configPath=Path.of(opts["--config"] ?: error("缺少配置路径")).toAbsolutePath().normalize()
        require(configPath.any { it.toString()=="private" }) { "配置须存放private目录" }
        val config=JSONObject(Files.readString(configPath,Charsets.UTF_8))
        val initial=AiSettings.parse(config.getJSONObject("settings"))
        val key=System.getenv("XINDONG_SAMPLE_KEY")
        val settings=if(key.isNullOrBlank()) initial else initial.copy(profiles=initial.profiles.map { if(it.id==initial.modelId) it.copy(apiKey=key) else it })
        require(!settings.jevEnabled && settings.goutouEnabled && settings.lianaiEnabled) { "本工具仅测试双Skill；100组对照须使用Run-Quality" }
        val model=settings.profile(settings.modelId,ProviderKind.CHAT_COMPLETIONS)
        val casesPath=Path.of(opts["--cases"] ?: error("缺少样本路径")).toAbsolutePath().normalize()
        val cases=Files.readAllLines(casesPath,Charsets.UTF_8).filter { it.isNotBlank() }.map(::JSONObject)
        require(cases.size in 1..6 && cases.map { it.getString("id") }.distinct().size==cases.size) { "只允许1至6个不同样本" }
        val conversations=cases.map { case ->
            require(case.getString("provenance")=="SYNTHETIC_NOT_REAL_WECHAT") { "只允许明确标识的虚构样本" }
            require(case.getString("id").matches(Regex("[A-Za-z0-9_-]+")))
            HistoryJson.parse(case.getJSONObject("conversation").toString()).also {
                require(it.messages.last().speaker==Speaker.CONTACT)
            }
        }
        val skills=SkillLibrary.bundled()
        val publicSettings=settings.json().also { it.objects("profiles").forEach { profile -> profile.remove("apiKey") } }
        val check=JSONObject().put("protocol","SYNTHETIC_DUAL_SKILL_SAMPLE_V2").put("architecture","DUAL_SKILL_V1").put("case_count",cases.size)
            .put("cases_sha256",sha256(Files.readAllBytes(casesPath))).put("settings",publicSettings)
            .put("settings_sha256",sha256(publicSettings.toString().toByteArray(Charsets.UTF_8)))
            .put("skill_sha256",JSONObject().put("goutou",sha256(skills.goutou.toByteArray(Charsets.UTF_8)))
                .put("lianai",sha256(skills.lianai.toByteArray(Charsets.UTF_8))))
            .put("provider_bill_verified",false).put("formal_acceptance",false)
        if(action=="check") { println(check.toString(2)); println("本地配置校验完成；未调用模型。"); return }
        require(config.optBoolean("dualSkillCloudTestAuthorized") && settings.cloudConsent && settings.componentNoticeAccepted) {
            "须取得本批双Skill虚构材料云端测试授权；不因Jev可选而绕过云端范围确认"
        }
        val cap=config.getLong("sampleCapMicroRmb"); require(cap in 1..2_000_000L)
        val out=Path.of(opts["--out"] ?: error("缺少输出目录")).toAbsolutePath().normalize()
        require(out.any { it.toString()=="private" }) { "输出须存放private目录" }
        Files.createDirectories(out.parent)
        Files.createDirectory(out) // Never overwrite or automatically retry an already attempted paid batch.
        val month=Costing.month(System.currentTimeMillis())
        val ledger=Ledger(initialLimits=mapOf(month to cap)) { rows,limits ->
            write(out.resolve("ledger.json"),JSONObject().put("rows",arr(rows.map(::charge))).put("limits",JSONObject(limits)))
        }
        val audit=check.put("started_at",System.currentTimeMillis()).put("sample_cap_micro_rmb",cap)
            .put("known_previous_phone_estimate_micro_rmb",config.optLong("knownPreviousPhoneEstimateMicroRmb"))
            .put("phone_config_modified",false).put("formal_pairs_generated",0)
        write(out.resolve("plan.json"),audit)
        val completed=mutableListOf<String>(); val attempted=mutableListOf<String>(); val states=mutableListOf<JSONObject>()
        val cancel=CancelToken(); val shutdown=Thread { cancel.cancel() }; Runtime.getRuntime().addShutdownHook(shutdown)
        fun summary(state: String, error: String="") = write(out.resolve("summary.json"),JSONObject()
            .put("state",state).put("completed",arr(completed)).put("attempted",arr(attempted)).put("requested",cases.size)
            .put("calls",ledger.entries().size).put("usage_estimate_micro_rmb",ledger.spent(month)).put("provider_bill_verified",false)
            .put("formal_acceptance",false).put("human_grading",false).put("error",error).put("updated_at",System.currentTimeMillis()))
        try {
            cases.forEachIndexed { index,case ->
                val id=case.getString("id"); attempted.add(id); summary("IN_PROGRESS")
                println("虚构对话小样本 ${index+1}/${cases.size} $id；真实接口，非正式验收")
                val c=conversations[index]
                val tail=c.messages.sortedBy { it.order }.takeLastWhile { it.speaker==Speaker.CONTACT }
                val target=ReplyTarget(c.scope,tail.map { it.id },tail.map { it.revision }).validate(c)
                val round=AnalysisEngine(HttpGateway(),ledger,skills).run(c,Streamer(c.scope.streamerId,c.scope.accountId,"虚构测试主播"),
                    listOf(c),settings,case.getString("query"),cancel,progress={ println("$id $it") },component={ component ->
                        states.add(JSONObject().put("case",id).put("name",component.name).put("state",component.state)
                            .put("detail",component.detail).put("diagnostic",component.diagnostic ?: JSONObject.NULL))
                        write(out.resolve("components.json"),JSONObject().put("rows",arr(states)))
                        println("$id ${component.name} ${component.state}")
                    },replyTarget=target)
                write(out.resolve("$id.json"),round.json().put("case_input_sha256",sha256(case.toString().toByteArray(Charsets.UTF_8))))
                completed.add(id); summary("IN_PROGRESS")
            }
            summary("GENERATED_AWAITING_REVIEW")
            println("本批完成${completed.size}组，费用估算微元=${ledger.spent(month)}；等待逐条审阅，不自动宣布质量通过。")
        } catch(e: Exception) { summary("INCOMPLETE",AnalysisEngine.safeError(e)); throw e }
        finally { Runtime.getRuntime().removeShutdownHook(shutdown) }
    }
}
