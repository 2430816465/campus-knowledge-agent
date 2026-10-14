package cn.xindong.core

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Input coverage and isolation checks using labelled fixtures. These do not score AI quality. */
class HistoryPipelineTest {
    @Test fun reviewedLatestTargetReachesEveryEnabledComponentWithFullHistory() {
        val original=c(20,1); val review=LatestReview("synthetic-new",scope,listOf("合成最新消息"),true,true,true,true)
        val (updated,target)=LatestIntake.append(original,review,"合成窗口OCR")
        val m=model(180000); val j=model(180000,"j").copy(kind=ProviderKind.JEV); val spy=Spy(report())
        val settings=AiSettings(listOf(m,j),m.id,j.id,jevEnabled=true,cloudConsent=true,componentNoticeAccepted=true)
        val r=AnalysisEngine(spy,Ledger(),SkillLibrary("fixture","fixture")).run(updated,Streamer("s","a","host"),listOf(updated),settings,"最新消息",CancelToken(),replyTarget=target)
        assertEquals(4,spy.allUsers.size)
        spy.allUsers.forEach { input -> val data=JSONObject(input)
            assertEquals(21,data.getJSONArray("history").length())
            assertEquals(target.messageIds,data.getJSONObject("reply_target").strings("message_ids"))
            assertEquals("合成最新消息",data.getJSONObject("reply_target").objects("messages").single().getString("body"))
        }
        assertEquals(21,r.coverage.processedMessages); assertNotNull(r.json().optJSONObject("reply_target"))
    }
    private val scope=Scope("a","s","c")
    private fun c(n: Int, size: Int): Conversation {
        val e=Evidence(id="source",scope=scope,batchId="synthetic",kind=SourceKind.MANUAL,raw="SYNTHETIC",sha256=sha256("SYNTHETIC".toByteArray()))
        return Conversation(Contact(scope,"合成观众"),List(n) { i -> Message(id="id${i+1}",scope=scope,order=i+1L,speaker=Speaker.CONTACT,
            body=when(i+1) { 35 -> "合成：生日5月18日"; 410 -> "合成：对咖啡过敏"; 899 -> "合成：下周三9点体检"; else -> "合成材料".repeat(size) },evidenceIds=listOf("source")) },listOf(e))
    }
    private fun model(context: Int, id: String="m") = ModelConfig(id=id,name="SYNTHETIC",endpoint="https://invalid.example",model="fixture",apiKey="not-a-key",contextTokens=context,outputTokens=4096,
        inputRmbPerMillion="0.1",outputRmbPerMillion="0.1",pricingVerified=true,pricingSource="unit fixture only")
    private fun report() = """{"analysis":{"facts":[],"hypotheses":[],"unknowns":["合成数据"],"emotion":"未知","relationship":"未知","disagreements":[],"strategy":"格式夹具","next_steps":[],"history_limits":"合成"},"no_reply":false,"no_reply_reason":"","candidates":[{"id":"c","style":"fixture","segments":["fixture only"],"rationale":"格式夹具","risks":[],"scores":{"natural":1,"style_fit":1,"segmentation":1,"length_fit":1,"context_fit":1},"evidence_ids":[]}],"new_topics":[],"suggested_tags":[]}"""
    private class Spy(private val finalReport: String): Gateway {
        val memoryInputs=mutableListOf<JSONObject>(); val allUsers=mutableListOf<String>(); var finalHistorySize=0
        override fun chat(config: ModelConfig, system: String, user: String, cancel: CancelToken, progress: (String)->Unit): ModelReply {
            allUsers.add(user)
            val text=if(system.contains("整理全部历史")) {
                val items=JSONArray(user); val ids=mutableListOf<String>()
                for(i in 0 until items.length()) { val item=items.getJSONObject(i); if(item.has("id")) { memoryInputs.add(item); ids.add(item.getString("id")) } else ids.addAll(item.objects("points").flatMap { it.strings("evidence_ids") }) }
                JSONObject().put("points",arr(if(ids.isEmpty()) emptyList() else listOf(JSONObject().put("text","合成摘要，不代表真实记忆质量").put("evidence_ids",arr(listOf(ids.first())))))).put("unknowns",arr(listOf("合成夹具"))).toString()
            } else if(system.contains("candidates")) { finalHistorySize=JSONObject(user).getJSONArray("history").length(); finalReport }
            else "{\"facts\":[],\"hypotheses\":[],\"unknowns\":[],\"strategy\":\"fixture\",\"risks\":[],\"disagreements\":[]}"
            return ModelReply(text,"fixture",Usage(1,1))
        }
        override fun jev(config: ModelConfig, state: JSONObject, cancel: CancelToken): ModelReply { allUsers.add(state.toString()); return ModelReply("{}","fixture-jev",Usage(1,1)) }
    }
    @Test fun allThousandMessagesActuallySubmittedAcrossChunks() {
        val c=c(1000,30); val m=model(120000); val j=model(120000,"j").copy(kind=ProviderKind.JEV); val spy=Spy(report())
        val settings=AiSettings(listOf(m,j),m.id,j.id,jevEnabled=true,cloudConsent=true,componentNoticeAccepted=true)
        val r=AnalysisEngine(spy,Ledger(),SkillLibrary("fixture","fixture")).run(c,Streamer("s","a","host"),listOf(c),settings,"核对长期关键事实",CancelToken())
        assertEquals(c.messages.map { it.id }.toSet(),spy.memoryInputs.map { it.getString("id") }.toSet()); assertTrue(r.coverage.chunks>1)
        listOf("id35","id410","id899").forEach { id -> assertTrue(spy.memoryInputs.any { it.getString("id")==id }) }
        assertEquals(1000,r.coverage.processedMessages); assertEquals(1000,r.coverage.sourceIds.size); assertTrue(spy.finalHistorySize<1000)
    }
    @Test fun finalModelGetsFullOriginalWhenOnlyAuxiliaryWindowIsSmall() {
        val c=c(200,20); val m=model(180000); val j=model(60000,"j").copy(kind=ProviderKind.JEV); val spy=Spy(report())
        val r=AnalysisEngine(spy,Ledger(),SkillLibrary("fixture","fixture")).run(c,Streamer("s","a","host"),listOf(c),AiSettings(listOf(m,j),m.id,j.id,jevEnabled=true,cloudConsent=true,componentNoticeAccepted=true),"合成",CancelToken())
        assertTrue(r.coverage.chunks>0); assertEquals(200,spy.finalHistorySize); assertEquals("COMPONENT_MEMORY_FINAL_FULL_IMPORTED_HISTORY",r.coverage.mode)
    }
    @Test fun otherContactOriginalTextNeverEntersCurrentCloudRequests() {
        val c=c(3,1); val otherScope=scope.copy(contactId="other"); val other=c.copy(contact=c.contact.copy(scope=otherScope),evidence=c.evidence.map { it.copy(scope=otherScope) },messages=c.messages.map { it.copy(scope=otherScope,speaker=Speaker.STREAMER,actualSent=true,body="OTHER_CONTACT_PRIVATE_ORIGINAL_DO_NOT_UPLOAD") })
        val m=model(180000); val spy=Spy(report())
        AnalysisEngine(spy,Ledger(),SkillLibrary("fixture","fixture")).run(c,Streamer("s","a","host"),listOf(c,other),AiSettings(listOf(m),m.id,jevEnabled=false,cloudConsent=true,componentNoticeAccepted=true),"合成",CancelToken())
        assertFalse(spy.allUsers.any { "OTHER_CONTACT_PRIVATE_ORIGINAL_DO_NOT_UPLOAD" in it })
    }
    @Test fun foreignMemoryCitationRejected() {
        try { AnalysisEngine.validateMemory("{\"points\":[{\"text\":\"foreign\",\"evidence_ids\":[\"foreign-id\"]}],\"unknowns\":[]}",setOf("own-id")); fail("must reject") } catch(expected: IllegalArgumentException) { }
    }
    @Test fun restartMarksUnfinishedBillingUncertainAndBlocksAnotherCall() {
        val original=Charge(owner="a",month=Costing.month(System.currentTimeMillis()),component="fixture",model="fixture",reservedMicro=10,state="RESERVED")
        var persisted: List<Charge> = emptyList(); val restarted=Ledger(listOf(original),persist={ rows,_-> persisted=rows })
        assertEquals("UNCERTAIN",restarted.entries().single().state); assertEquals("UNCERTAIN",persisted.single().state)
        try { restarted.reserve("a","another",model(65536),10); fail("must block") } catch(expected: IllegalArgumentException) { }
    }
    @Test fun cannotReconcileActiveNetworkRequest() { val ledger=Ledger(); val id=ledger.reserve("a","fixture",model(65536),10)
        try { ledger.reconcile(id,0); fail("active reservation must not be manually settled") } catch(expected: IllegalArgumentException) { }
    }
    @Test fun adjacentScreenshotOverlapSuggestionsPreserveAllRows() {
        val a=HistoryImport.textRows("第一条\n第二条\n第三条","source"); val b=HistoryImport.textRows("第二条\n第三条\n第四条","source")
        val suggested=HistoryImport.suggestDraftOverlap(a,b); assertEquals(3,suggested.size); assertEquals(2,suggested.count { it.overlapWith!=null }); assertTrue(suggested.none { it.skip })
    }
    @Test fun streamingEncryptionPreservesEntireOriginal() {
        val key=javax.crypto.KeyGenerator.getInstance("AES").apply { init(256) }.generateKey(); val box=SealedBox(key)
        val bytes=ByteArray(100000) { (it%253).toByte() }; val encrypted=java.io.ByteArrayOutputStream()
        val info=box.sealStream(bytes.inputStream(),encrypted,"scope-source"); assertEquals(sha256(bytes),info.first); assertEquals(bytes.size.toLong(),info.second)
        assertArrayEquals(bytes,box.openStream(encrypted.toByteArray().inputStream(),"scope-source").use { it.readBytes() })
    }
    @Test fun chunkedMediaRejectsTruncationTamperingAndForeignScope() {
        val key=javax.crypto.KeyGenerator.getInstance("AES").apply { init(256) }.generateKey(); val box=SealedBox(key)
        val bytes=ByteArray(2*1024*1024+17) { (it%251).toByte() }; val out=java.io.ByteArrayOutputStream(); box.sealStream(bytes.inputStream(),out,"scope")
        val sealed=out.toByteArray(); assertArrayEquals(bytes,box.openStream(sealed.inputStream(),"scope").use { it.readBytes() })
        for((data,aad) in listOf(sealed.copyOf(sealed.size-10) to "scope",sealed.clone().apply { this[150]=(this[150].toInt() xor 1).toByte() } to "scope",sealed to "foreign")) {
            var rejected=false; try { box.openStream(data.inputStream(),aad).use { it.readBytes() } } catch(expected: Exception) { rejected=true }; assertTrue(rejected)
        }
        assertArrayEquals(bytes,box.openStream(box.seal(bytes,"legacy").inputStream(),"legacy").use { it.readBytes() })
    }
    @Test fun reportFingerprintInvalidatedByHistoryAndStyleButNotKeyRotation() {
        val original=c(3,1); val settings=AiSettings(listOf(model(65536)),"m"); val hash=RoundInput.fingerprint(original,settings,listOf(original))
        val changed=original.copy(contact=original.contact.copy(notes="新事实"))
        assertNotEquals(hash,RoundInput.fingerprint(changed,settings,listOf(changed)))
        assertEquals(hash,RoundInput.fingerprint(original,settings.copy(profiles=settings.profiles.map { it.copy(apiKey="rotated") }),listOf(original)))
        assertNotEquals(hash,RoundInput.fingerprint(original,settings.copy(styleNotes="换风格"),listOf(original)))
    }
    @Test fun curatedExamplesDoNotReplaceAllHistoryStyleStatistics() {
        val base=c(12,1); val original=base.copy(messages=base.messages.mapIndexed { i,m -> m.copy(speaker=Speaker.STREAMER,actualSent=true,styleExample=i==0) })
        val profile=StyleLearning.profile(Streamer("s","a","host"),listOf(original),scope)
        assertEquals(12,profile.getInt("confirmed_sent_count")); assertEquals("id1",profile.objects("current_contact_examples_only").single().getString("id"))
        assertTrue(HistoryJson.parse(original.json().toString()).messages.first().styleExample)
    }
    @Test fun incompleteReportSchemaCannotMasqueradeAsFullAnalysis() {
        val raw=JSONObject(report()); raw.getJSONObject("analysis").remove("facts")
        var rejected=false; try { AnalysisFormat.parse(raw.toString(),emptySet()) } catch(expected: Exception) { rejected=true }; assertTrue(rejected)
    }
}
