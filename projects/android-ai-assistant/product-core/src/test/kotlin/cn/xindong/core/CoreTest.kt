package cn.xindong.core

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.StringReader
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.KeyGenerator

class CoreTest {
    private val scope=Scope("account","host","viewer")
    private fun conversation(n: Int=3): Conversation {
        val e=Evidence(id="source",scope=scope,batchId="batch",kind=SourceKind.MANUAL,raw="synthetic-test-only",sha256=sha256("synthetic-test-only".toByteArray()))
        return Conversation(Contact(scope,"合成测试观众"),List(n) { i -> Message(id="m${i+1}",scope=scope,order=i+1L,speaker=if(i%2==0) Speaker.CONTACT else Speaker.STREAMER,
            body="合成消息${i+1}",evidenceIds=listOf(e.id),actualSent=i%2==1) },listOf(e))
    }
    private fun config(context: Int=200_000) = ModelConfig(id="model",name="合成协议测试配置",endpoint="https://invalid.example/chat/completions",model="test-not-real-ai",apiKey="not-a-real-key",contextTokens=context,
        inputRmbPerMillion="1",outputRmbPerMillion="2",pricingVerified=true,pricingSource="synthetic unit-test rates, not vendor prices")
    private fun rejects(block: ()->Unit) { try { block(); fail("Expected validation failure") } catch(e: Exception) { /* Expected: test assertions are AssertionError, not caught here. */ } }
    private fun validReport(id: String="m1", noReply: Boolean=false): String = JSONObject().put("analysis",JSONObject()
        .put("facts",arr(listOf(JSONObject().put("text","合成事实").put("evidence_ids",arr(listOf(id)))))).put("hypotheses",arr(emptyList<Any>()))
        .put("unknowns",arr(listOf("未取得真实微信全部历史"))).put("emotion","未知").put("relationship","未知").put("disagreements",arr(emptyList<Any>()))
        .put("strategy","测试JSON格式").put("next_steps",arr(emptyList<Any>())).put("history_limits","合成测试"))
        .put("no_reply",noReply).put("no_reply_reason",if(noReply) "明确拒绝" else "")
        .put("candidates",arr(if(noReply) emptyList() else listOf(JSONObject().put("id","c1").put("style","测试").put("segments",arr(listOf("测试文案")))
            .put("rationale","合成协议夹具").put("risks",arr(emptyList<Any>())).put("scores",JSONObject(AnalysisFormat.scoreKeys.associateWith { 4 })).put("evidence_ids",arr(listOf(id))))))
        .put("new_topics",arr(emptyList<Any>())).put("suggested_tags",arr(emptyList<Any>())).toString()
    @Test fun scopeRejectsPathTraversal() { rejects { Scope("../a","b","c") } }
    @Test fun sameNicknameDoesNotMerge() { val a=Contact(scope,"同名"); val b=Contact(scope.copy(contactId="other"),"同名"); assertNotEquals(a.scope,b.scope) }
    @Test fun foreignMessageRejected() { val c=conversation(); rejects { c.copy(messages=c.messages+ c.messages.first().copy(id="foreign",order=99,scope=scope.copy(contactId="other"))).validate() } }
    @Test fun sourceMustExist() { rejects { conversation().copy(evidence=emptyList()).validate() } }
    @Test fun duplicateOrderRejected() { val c=conversation(); rejects { c.copy(messages=c.messages+c.messages.first().copy(id="different")).validate() } }
    @Test fun duplicateSourceIdRejected() { val c=conversation(); rejects { c.copy(evidence=c.evidence+c.evidence).validate() } }
    @Test fun repeatedIdenticalMessagesPreserved() {
        val rows=HistoryImport.textRows("好的\n好的\n好的","source"); assertEquals(3,rows.size)
        assertTrue(HistoryImport.suggestOverlap(conversation().messages.map { it.copy(body="好的") },rows).none { it.skip || it.overlapWith!=null })
    }
    @Test fun overlapSuggestionNeverSkips() {
        val c=conversation(); val rows=c.messages.takeLast(2).map { DraftRow(body=it.body,speaker=it.speaker,evidenceIds=listOf("source")) }
        val suggested=HistoryImport.suggestOverlap(c.messages,rows); assertTrue(suggested.all { it.overlapWith!=null && !it.skip })
    }
    @Test fun unknownSpeakerCannotCommit() {
        val c=conversation(); val b=ImportBatch(id="b",scope=scope,rows=listOf(DraftRow(body="原文",evidenceIds=listOf("source"),checked=true)),identityConfirmed=true,orderConfirmed=true)
        rejects { HistoryImport.commit(c.copy(batches=listOf(b)),b) }
    }
    @Test fun committedBatchCannotReplayFromOldObject() {
        val c=conversation(); val b=ImportBatch(id="b",scope=scope,rows=listOf(DraftRow(body="原文",speaker=Speaker.CONTACT,evidenceIds=listOf("source"),checked=true)),identityConfirmed=true,orderConfirmed=true)
        val first=HistoryImport.commit(c.copy(batches=listOf(b)),b); assertEquals(4,first.messages.size); rejects { HistoryImport.commit(first,b) }
    }
    @Test fun sourceSnapshotRoundTripsWithoutLosingMediaOrCorrections() {
        val c=conversation().copy(media=listOf(MediaAsset(id="media",scope=scope,blobId="blob",mime="audio/test",originalName="source",sha256="hash")))
        assertEquals(c,HistoryJson.parse(c.json().toString()))
    }
    @Test fun mergingMixedSpeakersRequiresReview() {
        val rows=listOf(DraftRow(speaker=Speaker.CONTACT,body="a",evidenceIds=listOf("source")),DraftRow(speaker=Speaker.STREAMER,body="b",evidenceIds=listOf("source")))
        val merged=HistoryImport.merge(rows,0).single(); assertEquals(Speaker.UNKNOWN,merged.speaker); assertFalse(merged.checked); assertEquals("a\nb",merged.body)
    }
    @Test fun conflictingFactsAreBothKept() {
        val c=conversation().addFact(Fact(scope=scope,key="偏好",value="茶",evidenceMessageIds=listOf("m1")))
            .addFact(Fact(scope=scope,key="偏好",value="咖啡",evidenceMessageIds=listOf("m3")))
        assertEquals(2,c.facts.size); assertEquals(2,c.conflicts.single().factIds.size)
    }
    @Test fun foreignFactEvidenceRejected() { rejects { conversation().addFact(Fact(scope=scope,key="k",value="v",evidenceMessageIds=listOf("other-account-message"))) } }
    @Test fun timeMustBeKnownIsoOrExplicitlyUnknown() { assertTrue(HistoryImport.validTime("")); assertTrue(HistoryImport.validTime("2026-10-12T10:00:00+08:00")); assertFalse(HistoryImport.validTime("昨天大概十点")) }
    @Test fun styleUsesAllConfirmedSentMessagesOnly() {
        val c=conversation(1000); val other=c.copy(contact=c.contact.copy(scope=scope.copy(streamerId="other")),messages=emptyList(),evidence=emptyList())
        val draft=c.messages.first().copy(id="unadopted-ai",order=1001,speaker=Speaker.STREAMER,body="不可学习",actualSent=true,status=ReviewStatus.DRAFT)
        val style=StyleLearning.profile(Streamer("host","account","主播"),listOf(c.copy(messages=c.messages+draft),other),scope)
        assertEquals(500,style.getInt("confirmed_sent_count")); assertEquals(8,style.getJSONArray("current_contact_examples_only").length()); assertFalse(style.toString().contains("不可学习"))
    }
    @Test fun unverifiedMediaTextNotSentAsFact() {
        val c=conversation(); val asset=MediaAsset(id="a",scope=scope,blobId="b",mime="audio",originalName="n",sha256="s",description="未经核对的转写",verified=false)
        val changed=c.copy(media=listOf(asset),messages=c.messages.map { it.copy(mediaIds=listOf("a")) })
        assertFalse(Contexts.history(changed).first().toString().contains("未经核对的转写"))
    }
    @Test fun thousandMessageChunksPreserveEverySourceAndBodyIncludingEarlyMemory() {
        val c=conversation(1000); val history=Contexts.history(c); val pieces=Contexts.chunks(history,4096).flatten()
        assertEquals(history.map { it.getString("id") },pieces.map { it.getString("id") }); assertEquals("合成消息35",pieces[34].getString("body")); assertEquals("合成消息410",pieces[409].getString("body")); assertEquals("合成消息899",pieces[898].getString("body"))
    }
    @Test fun oversizedUnicodeMessageSplitsWithoutDroppingCharacters() {
        val body="测试😀".repeat(4000); val c=conversation(1).let { it.copy(messages=listOf(it.messages.single().copy(body=body))) }
        val parts=Contexts.chunks(Contexts.history(c),4096).flatten(); assertTrue(parts.size>1); assertEquals(body,parts.joinToString("") { it.getString("body") }); assertTrue(parts.all { it.getString("id")=="m1" })
    }
    @Test fun citedSourceIsRecalledAheadOfRecentMessages() { val c=conversation(1000); val recall=Contexts.recall(c,setOf("m35"),"unrelated",600); assertTrue(recall.any { it.getString("id")=="m35" }) }
    @Test fun candidatesAreDynamicAndGrouped() { val analysis=AnalysisFormat.parse(validReport(),setOf("m1")); assertEquals(1,analysis.candidates.size); assertEquals(1,analysis.candidates.single().segments.size) }
    @Test fun nonexistentAiCitationRejected() { rejects { AnalysisFormat.parse(validReport("foreign"),setOf("m1")) } }
    @Test fun explicitRefusalRequiresNoReply() { rejects { AnalysisFormat.parse(validReport(),setOf("m1"),true) }; assertTrue(AnalysisFormat.parse(validReport(noReply=true),setOf("m1"),true).noReply) }
    @Test fun cancelledOldScopeCannotAcceptLateResult() { val s=ScopeSession(); s.select(scope); val ticket=s.ticket(scope); s.select(scope.copy(contactId="different")); assertFalse(s.accepts(scope,ticket.first)); rejects { ticket.second.check() } }
    @Test fun sameScopeNewEpochAlsoDropsOldResult() { val s=ScopeSession(); s.select(scope); val ticket=s.ticket(scope); s.invalidate(); assertFalse(s.accepts(scope,ticket.first)) }
    @Test fun aesGcmRejectsWrongOwnerAndModifiedCiphertext() {
        val key=KeyGenerator.getInstance("AES").apply { init(256) }.generateKey(); val box=SealedBox(key); val sealed=box.seal("private history".toByteArray(),scope.key)
        assertEquals("private history",String(box.open(sealed,scope.key))); rejects { box.open(sealed,scope.copy(contactId="other").key) }; sealed[sealed.lastIndex]=(sealed.last().toInt() xor 1).toByte(); rejects { box.open(sealed,scope.key) }
    }
    @Test fun passwordVerificationIsSalted() { val salt=LocalPin.salt(); val digest=LocalPin.digest("abcdef".toCharArray(),salt); assertTrue(LocalPin.matches("abcdef".toCharArray(),salt,digest)); assertFalse(LocalPin.matches("abcdeg".toCharArray(),salt,digest)); assertFalse(digest.contentEquals(LocalPin.digest("abcdef".toCharArray(),LocalPin.salt()))) }
    @Test fun costIncludesCacheAndRoundsUp() { val c=config().copy(inputRmbPerMillion="1.1",outputRmbPerMillion="2",cachedRmbPerMillion="0.1"); assertEquals(26,Costing.microRmb(c,Usage(10,10,5))) }
    @Test fun missingPriceDoesNotAssumeFree() { rejects { config().copy(pricingVerified=false).validate() }; rejects { config().copy(inputRmbPerMillion="").validate() } }
    @Test fun hundredYuanThresholdStopsUntilExplicitConfirmation() {
        val month=Costing.month(System.currentTimeMillis()); val c=config().copy(inputRmbPerMillion="1000000",outputRmbPerMillion="1000000",outputTokens=1)
        val ledger=Ledger(listOf(Charge(owner="a",month=month,component="x",model="m",reservedMicro=99_000_000,chargedMicro=99_000_000,state="TOKEN_ESTIMATE")))
        rejects { ledger.reserve("a","test",c,0) }; ledger.confirmAnotherHundred(month); assertTrue(ledger.reserve("a","test",c,0).isNotBlank())
    }
    @Test fun unknownUsageRetainsReservationAndBlocksNextCall() {
        val ledger=Ledger(); val c=config(); val id=ledger.reserve("a","test",c,100); ledger.settle(id,null,c)
        assertEquals("UNCERTAIN",ledger.entries().single().state); assertTrue(ledger.spent(Costing.month(System.currentTimeMillis()))>0)
        rejects { ledger.reserve("a","another",c,1) }; ledger.reconcile(id,1); assertTrue(ledger.reserve("a","another",c,1).isNotEmpty())
    }
    @Test fun failedPersistenceCannotStartUnrecordedCall() { val ledger=Ledger(persist={ _,_-> error("disk full fixture") }); rejects { ledger.reserve("a","test",config(),10) }; assertTrue(ledger.entries().isEmpty()) }
    @Test fun duplicateSettlementRejected() { val l=Ledger(); val c=config(); val id=l.reserve("a","test",c,10); l.settle(id,Usage(1,1),c); rejects { l.settle(id,Usage(0,0),c) } }
    @Test fun plainChatRejectsLengthTruncation() { val o=JSONObject("""{"model":"fixture","choices":[{"finish_reason":"length","message":{"content":"partial"}}]}"""); rejects { HttpGateway.parseChat(o) } }
    @Test fun sseCollectsUsageAndRequiresDone() {
        val raw="data: {\"model\":\"fixture\",\"choices\":[{\"delta\":{\"content\":\"hello\"},\"finish_reason\":null}]}\n\ndata: {\"model\":\"fixture\",\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: {\"model\":\"fixture\",\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n"
        val reply=HttpGateway.parseSse(StringReader(raw).buffered(),CancelToken()); assertEquals("hello",reply.text); assertEquals(Usage(10,2),reply.usage)
        rejects { HttpGateway.parseSse(StringReader(raw.substringBefore("data: [DONE]")).buffered(),CancelToken()) }
    }
    @Test fun keyNeverAppearsInModelToString() { assertFalse(config().toString().contains("not-a-real-key")) }
    @Test fun nonHttpsOrKeyInUrlRejected() { rejects { config().copy(endpoint="http://invalid.example").validate() }; rejects { config().copy(endpoint="https://secret@invalid.example/x").validate() }; rejects { config().copy(endpoint="https://invalid.example/x?key=secret").validate() } }
    @Test fun bundledSkillsAreActualPinnedDocuments() { val s=SkillLibrary.bundled(); assertTrue(s.goutou.length>1000 && s.lianai.length>1000); assertTrue(s.goutou.contains("name:")); assertTrue(s.lianai.contains("name:")) }
    @Test fun enabledComponentsRunEvenForSimpleQuestionAndDisabledAreExplicit() {
        val calls=AtomicInteger(); val gateway=object: Gateway {
            override fun chat(config: ModelConfig, system: String, user: String, cancel: CancelToken, progress: (String)->Unit): ModelReply { calls.incrementAndGet(); return ModelReply(if(system.contains("candidates")) validReport() else "{\"facts\":[],\"hypotheses\":[],\"unknowns\":[],\"strategy\":\"fixture\",\"risks\":[],\"disagreements\":[]}","fixture-model",Usage(1,1)) }
            override fun jev(config: ModelConfig, state: JSONObject, cancel: CancelToken): ModelReply { calls.incrementAndGet(); return ModelReply("{\"fixture\":true}","fixture-jev",Usage(1,1)) }
        }
        val model=config(); val jev=config().copy(id="jev",kind=ProviderKind.JEV); val settings=AiSettings(listOf(model,jev),model.id,jev.id,jevEnabled=true,cloudConsent=true,componentNoticeAccepted=true)
        val c=conversation(); val engine=AnalysisEngine(gateway,Ledger(),SkillLibrary("fixture skill","fixture skill"))
        val r=engine.run(c,Streamer("host","account","主播"),listOf(c),settings,"你好",CancelToken())
        assertEquals(4,calls.get()); assertTrue(r.components.all { it.state=="SUCCEEDED" }); assertEquals(3,r.coverage.processedMessages)
        calls.set(0)
        val dual=engine.run(c,Streamer("host","account","主播"),listOf(c),AiSettings(listOf(model),model.id,cloudConsent=true,componentNoticeAccepted=true),"你好",CancelToken())
        assertEquals(3,calls.get()); assertEquals("USER_DISABLED",dual.components.single { it.name=="Jev" }.state)
        assertTrue(dual.components.filter { it.name!="Jev" }.all { it.state=="SUCCEEDED" })
        calls.set(0); val compatible=engine.run(c,Streamer("host","account","主播"),listOf(c),settings.copy(jevEnabled=false,goutouEnabled=false,lianaiEnabled=false),"你好",CancelToken())
        assertEquals(1,calls.get()); assertTrue(compatible.components.all { it.state=="USER_DISABLED" })
    }
    @Test fun enabledComponentFailureCannotSilentlyGenerateCandidates() {
        val finalCalls=AtomicInteger(); val gateway=object: Gateway {
            override fun chat(config: ModelConfig, system: String, user: String, cancel: CancelToken, progress: (String)->Unit): ModelReply { finalCalls.incrementAndGet(); error("should never generate") }
            override fun jev(config: ModelConfig, state: JSONObject, cancel: CancelToken): ModelReply { throw ApiFailure(401,true,"synthetic authentication failure") }
        }
        val m=config(); val j=m.copy(id="j",kind=ProviderKind.JEV); val states=mutableListOf<ComponentResult>()
        rejects { AnalysisEngine(gateway,Ledger(),SkillLibrary("skill","skill")).run(conversation(),Streamer("host","account","主播"),listOf(conversation()),AiSettings(listOf(m,j),m.id,j.id,jevEnabled=true,cloudConsent=true,componentNoticeAccepted=true),"test",CancelToken(),component={ states.add(it) }) }
        assertEquals(0,finalCalls.get()); assertEquals("FAILED",states.last().state)
    }
}
