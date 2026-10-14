package cn.xindong.core

import org.json.JSONObject
import java.nio.channels.FileChannel
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.security.SecureRandom

/** Desktop-only real calls; no fixture or simulated model output can be selected. */
fun main(args: Array<String>) {
    if(args.isEmpty()) {
        println("Real-model runner, NOT executed. --config private/config.local.json --action run|status|confirm-budget|reconcile. run: --cases cases.jsonl --out private/run-dir --limit 1..100 [--resume true]. reconcile: --charge ID --actual-yuan AMOUNT")
        return
    }
    try {
        val parts=args.toList().chunked(2); require(parts.all { it.size==2 } && parts.map { it[0] }.distinct().size==parts.size)
        qualityRun(parts.associate { it[0] to it[1] })
    } catch(e: Exception) { System.err.println("质量实验停止："+AnalysisEngine.safeError(e)); kotlin.system.exitProcess(2) }
}
private fun atomicJson(path: Path, json: JSONObject) {
    Files.createDirectories(path.parent); val temporary=path.resolveSibling(path.fileName.toString()+".tmp")
    Files.write(temporary,json.toString(2).toByteArray(Charsets.UTF_8))
    try { Files.move(temporary,path,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE) }
    catch(e: java.nio.file.AtomicMoveNotSupportedException) { Files.move(temporary,path,StandardCopyOption.REPLACE_EXISTING) }
}
private fun chargeJson(r: Charge) = JSONObject().put("id",r.id).put("owner",r.owner).put("month",r.month).put("component",r.component).put("model",r.model)
    .put("reserved",r.reservedMicro).put("charged",r.chargedMicro).put("state",r.state).put("at",r.at).put("pricingSource",r.pricingSource)
    .put("usage",r.usage?.let { JSONObject().put("input",it.input).put("output",it.output).put("cached",it.cachedInput) })
private fun qualityRun(opts: Map<String,String>) {
    require(opts.keys.all { it in setOf("--config","--action","--cases","--out","--limit","--resume","--charge","--actual-yuan") }) { "存在未知参数" }
    val configPath=Path.of(opts["--config"] ?: error("缺少私有配置路径")).toAbsolutePath().normalize()
    require(configPath.any { it.toString()=="private" }) { "密钥路径须位于名为private的目录" }
    val config=JSONObject(Files.readString(configPath,Charsets.UTF_8)); val action=opts["--action"] ?: "run"
    require(action in setOf("run","status","confirm-budget","reconcile"))
    val ledgerPath=configPath.parent.resolve("quality-ledger.json")
    FileChannel.open(configPath.parent.resolve("quality-ledger.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE).use { channel ->
        val lock=channel.tryLock() ?: error("另一个实验进程正在使用费用台账，请等待结束")
        lock.use {
            if(action=="status" && !Files.exists(ledgerPath)) { println("尚无实验费用台账；未调用接口。"); return }
            require(config.getBoolean("billingReviewed")) { "先在本地配置核对服务商本月已有费用；桌面与手机调用应合并核对账单" }
            val saved=if(Files.exists(ledgerPath)) JSONObject(Files.readString(ledgerPath,Charsets.UTF_8)) else JSONObject()
            val rows=saved.objects("rows").map { r -> Charge(r.getString("id"),r.getString("owner"),r.getString("month"),r.getString("component"),r.getString("model"),r.getLong("reserved"),r.getLong("charged"),
                r.optJSONObject("usage")?.let { Usage(it.getLong("input"),it.getLong("output"),it.getLong("cached")) },r.getString("state"),r.getLong("at"),r.optString("pricingSource")) }
            val caps=saved.optJSONObject("limits") ?: JSONObject()
            val starting=if(Files.exists(ledgerPath)) rows else listOf(Charge(owner="external-reviewed-billing",month=Costing.month(System.currentTimeMillis()),component="用户核对的本月已有账单",model="external",reservedMicro=config.getLong("previousMonthMicroRmb"),state="USER_RECONCILED"))
            val budget=Ledger(starting,caps.keys().asSequence().associateWith { caps.getLong(it) }) { charges,limits -> atomicJson(ledgerPath,JSONObject().put("rows",arr(charges.map(::chargeJson))).put("limits",JSONObject(limits))) }
            val month=Costing.month(System.currentTimeMillis())
            when(action) {
                "status" -> { println("本月记录微元=${budget.spent(month)}；确认额度微元=${budget.limit(month)}（配置单价估算，非服务商发票）")
                    budget.entries().filter { it.state=="UNCERTAIN" }.forEach { println("待核账调用ID=${it.id}，保留微元=${it.chargedMicro}") } }
                "confirm-budget" -> { budget.confirmAnotherHundred(month); println("已按显式命令增加本月100元提醒额度；未知用量仍阻断调用。") }
                "reconcile" -> { val amount=(opts["--actual-yuan"] ?: error("缺少核对后实际人民币金额")).toBigDecimal().multiply(java.math.BigDecimal(1_000_000)).longValueExact()
                    budget.reconcile(opts["--charge"] ?: error("缺少待核账调用ID"),amount); println("已保存用户核对金额；没有调用模型。") }
                else -> generatePairs(opts,config,budget,ledgerPath)
            }
        }
    }
}
private fun generatePairs(opts: Map<String,String>, config: JSONObject, budget: Ledger, ledgerPath: Path) {
    val casesPath=Path.of(opts["--cases"] ?: error("缺少测试集合路径")).toAbsolutePath().normalize()
    val out=Path.of(opts["--out"] ?: error("缺少私有输出目录")).toAbsolutePath().normalize()
    require(out.any { it.toString()=="private" }) { "真实结果须位于private目录，避免混入公开交付" }
    val limit=(opts["--limit"] ?: "1").toInt(); require(limit in 1..100)
    val settings=AiSettings.parse(config.getJSONObject("settings"))
    val architecture=config.optString("architecture","JEV_DUAL_SKILL_V1")
    require(architecture in setOf("DUAL_SKILL_V1","JEV_DUAL_SKILL_V1")) { "请明确选择双Skill或Jev＋双Skill实验架构" }
    require(settings.cloudConsent && settings.componentNoticeAccepted && settings.goutouEnabled && settings.lianaiEnabled &&
        settings.jevEnabled==(architecture=="JEV_DUAL_SKILL_V1")) { "已启用组件须与明确选择的实验架构一致，并确认云端数据范围" }
    val expectedComponents=if(settings.jevEnabled) listOf("Jev","狗头军师","恋爱大师") else listOf("狗头军师","恋爱大师")
    val model=settings.profile(settings.modelId,ProviderKind.CHAT_COMPLETIONS)
    if(settings.jevEnabled) settings.profile(settings.jevId,ProviderKind.JEV)
    val publicSettings=settings.json().also { it.objects("profiles").forEach { profile -> profile.remove("apiKey") } }
    val settingsHash=sha256(publicSettings.toString().toByteArray(Charsets.UTF_8)); val casesHash=sha256(Files.readAllBytes(casesPath))
    val lines=Files.readAllLines(casesPath,Charsets.UTF_8).filter { it.isNotBlank() }.map(::JSONObject).take(limit)
    require(lines.size==limit && lines.map { it.getString("id") }.distinct().size==limit)
    val manifestPath=out.resolve("run-plan.json")
    val manifest=if(Files.exists(out)) {
        require(opts["--resume"]=="true" && Files.exists(manifestPath)) { "输出目录已存在；恢复须显式 --resume true，避免重复付费" }
        JSONObject(Files.readString(manifestPath,Charsets.UTF_8)).also {
            require(it.optString("runner_protocol")=="LATEST_REPLY_TARGET_COMPONENTS_V2" && it.optString("architecture")==architecture) { "实验流程或组件架构已变化，请使用新实验目录；不能复用旧结果" }
            require(it.getString("cases_sha256")==casesHash && it.getString("settings_sha256")==settingsHash) { "输入或非密钥模型配置已变化，请使用新实验目录" }
            require(limit>=it.getInt("requested")) { "恢复不能缩小原实验集合" }
        }
    } else JSONObject().put("runner_protocol","LATEST_REPLY_TARGET_COMPONENTS_V2").put("architecture",architecture)
        .put("expected_components",arr(expectedComponents)).put("cases_sha256",casesHash).put("settings_sha256",settingsHash).put("plans",arr(emptyList<Any>()))
    val plans=manifest.objects("plans").toMutableList(); val random=SecureRandom()
    lines.forEach { case -> if(plans.none { it.getString("id")==case.getString("id") }) {
        val ordinary=if(random.nextBoolean()) "A" else "B"
        plans.add(JSONObject().put("id",case.getString("id")).put("ordinary",ordinary).put("full",if(ordinary=="A") "B" else "A"))
    } }
    manifest.put("plans",arr(plans)).put("requested",limit); atomicJson(manifestPath,manifest)
    val blinded=out.resolve("grading"); Files.createDirectories(blinded)
    val gateway=HttpGateway(); val skills=SkillLibrary.bundled(); val mappings=mutableListOf<JSONObject>()
    val cancel=CancelToken(); val shutdown=Thread { cancel.cancel() }; Runtime.getRuntime().addShutdownHook(shutdown)
    fun saveSummary(state: String, error: String="") = atomicJson(out.resolve("run-summary.json"),JSONObject().put("state",state).put("cases",mappings.size).put("requested",limit)
        .put("quality_pass",JSONObject.NULL).put("architecture",architecture).put("cases_sha256",casesHash).put("settings_sha256",settingsHash).put("ledger",ledgerPath.toString()).put("real_interface_calls",mappings.isNotEmpty()).put("error",error))
    try {
        lines.forEachIndexed { index,case ->
            val id=case.getString("id"); require(id.matches(Regex("[A-Za-z0-9_-]+")))
            val conversation=HistoryJson.parse(case.getJSONObject("conversation").toString())
            val tail=conversation.messages.filter { it.status==ReviewStatus.CONFIRMED }.sortedBy { it.order }.takeLastWhile { it.speaker==Speaker.CONTACT }
            require(tail.isNotEmpty()) { "最新消息实验须以已确认的对方消息结束" }
            val target=ReplyTarget(conversation.scope,tail.map { it.id },tail.map { it.revision }).validate(conversation)
            val host=Streamer(conversation.scope.streamerId,conversation.scope.accountId,"合成测试主播")
            val query=case.getString("query"); val inputHash=sha256(case.toString().toByteArray(Charsets.UTF_8))
            val plan=plans.single { it.getString("id")==id }; val ordinaryLabel=plan.getString("ordinary"); val fullLabel=plan.getString("full")
            println("真实实验 ${index+1}/$limit；已完成且哈希一致的方案复用，不输出聊天和密钥")
            fun plain(): JSONObject {
                val path=out.resolve("$id-ordinary-audit.json")
                if(Files.exists(path)) { val saved=JSONObject(Files.readString(path,Charsets.UTF_8)); require(saved.getString("input_sha256")==inputHash); return AnalysisFormat.parse(saved.getJSONObject("result").toString(),conversation.messages.map { it.id }.toSet(),AnalysisFormat.explicitPause(conversation)).raw }
                val user=JSONObject().put("profile",Contexts.metadata(conversation)).put("host_style",StyleLearning.profile(host,listOf(conversation),conversation.scope))
                    .put("host_style_notes",settings.styleNotes).put("request",query).put("history",arr(Contexts.history(conversation))).put("reply_target",target.json(conversation))
                val reply=ChargedGateway(gateway,budget,"quality").chat("普通模型对照",model,AnalysisEngine.common+"\n"+AnalysisFormat.contract,user.toString(),cancel)
                val analysis=AnalysisFormat.parse(reply.text,conversation.messages.map { it.id }.toSet(),AnalysisFormat.explicitPause(conversation))
                atomicJson(path,JSONObject().put("model",reply.model).put("input_sha256",inputHash).put("reply_target",target.json(conversation)).put("result",analysis.raw)); return analysis.raw
            }
            fun full(): JSONObject {
                val path=out.resolve("$id-full-audit.json")
                if(Files.exists(path)) { val saved=JSONObject(Files.readString(path,Charsets.UTF_8)); require(saved.getString("case_input_sha256")==inputHash)
                    require(saved.getString("inputFingerprint")==RoundInput.fingerprint(conversation,settings,listOf(conversation)))
                    require(expectedComponents.all { name -> saved.objects("components").any { it.getString("name")==name && it.getString("state")=="SUCCEEDED" } })
                    if(!settings.jevEnabled) require(saved.objects("components").any { it.getString("name")=="Jev" && it.getString("state")=="USER_DISABLED" })
                    return AnalysisFormat.parse(saved.getJSONObject("result").toString(),conversation.messages.map { it.id }.toSet(),AnalysisFormat.explicitPause(conversation)).raw }
                val round=AnalysisEngine(gateway,budget,skills).run(conversation,host,listOf(conversation),settings,query,cancel,replyTarget=target)
                atomicJson(path,round.json().put("case_input_sha256",inputHash)); return round.analysis.raw
            }
            val first=if(ordinaryLabel=="A") plain() else full(); val second=if(ordinaryLabel=="A") full() else plain()
            fun blind(o: JSONObject) = JSONObject().put("no_reply",o.getBoolean("no_reply")).put("no_reply_reason",o.getString("no_reply_reason"))
                .put("candidates",arr(o.objects("candidates").map { candidate -> JSONObject().put("style",candidate.getString("style")).put("segments",candidate.getJSONArray("segments")) }))
            val gradingPath=blinded.resolve("$id.json")
            val pair=JSONObject().put("id",id).put("provenance",case.getString("provenance")).put("input_sha256",inputHash)
                .put("conversation",case.getJSONObject("conversation")).put("query",query).put("rubric",case.getJSONObject("rubric")).put("A",blind(first)).put("B",blind(second))
            if(!Files.exists(gradingPath)) atomicJson(gradingPath,pair)
            else require(JSONObject(Files.readString(gradingPath,Charsets.UTF_8)).similar(pair)) { "盲评文件与已保存的真实输出不一致，拒绝覆盖" }
            mappings.add(JSONObject().put("id",id).put("ordinary",ordinaryLabel).put("full",fullLabel).put("input_sha256",inputHash).put("grading_sha256",sha256(Files.readAllBytes(gradingPath))))
            atomicJson(out.resolve("blind-mapping.json"),JSONObject().put("rows",arr(mappings))); saveSummary("IN_PROGRESS")
        }
        saveSummary("GENERATED_AWAITING_HUMAN_GRADING"); println("真实输出已保存；等待人工盲评，未自动宣布质量合格。")
    } catch(e: Exception) { saveSummary("INCOMPLETE",AnalysisEngine.safeError(e)); throw e }
    finally { Runtime.getRuntime().removeShutdownHook(shutdown) }
}
