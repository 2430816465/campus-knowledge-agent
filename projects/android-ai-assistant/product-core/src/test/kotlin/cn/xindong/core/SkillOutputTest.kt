package cn.xindong.core

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Protocol fixtures only; no model quality scores or real WeChat evidence. */
class SkillOutputTest {
    private val valid="""{"facts":[{"text":"SYNTHETIC_FACT","evidence_ids":["m1"]}],"hypotheses":[],"unknowns":["SYNTHETIC_UNKNOWN"],"strategy":"SYNTHETIC_STRATEGY","risks":[],"disagreements":[]}"""
    private fun rejected(text: String): SkillOutputFailure {
        try { SkillOutput.parse("狗头军师",text,setOf("m1")); fail("Invalid component output must not be accepted") }
        catch(e: SkillOutputFailure) { return e }
        error("Unreachable")
    }
    @Test fun completeOutputRetainsEvidenceAndExplicitUnknowns() {
        val parsed=SkillOutput.parse("狗头军师",valid,setOf("m1"))
        assertEquals("m1",parsed.getJSONArray("facts").getJSONObject(0).getJSONArray("evidence_ids").getString(0))
        assertEquals("SYNTHETIC_UNKNOWN",parsed.getJSONArray("unknowns").getString(0))
        val noFacts=JSONObject(valid).put("facts",arr(emptyList<Any>())).toString()
        assertEquals(0,SkillOutput.parse("狗头军师",noFacts,setOf("m1")).getJSONArray("facts").length())
    }
    @Test fun incompleteCoercedAndForeignFactsCannotPassAsSuccessfulAnalysis() {
        val bad=listOf("{}",JSONObject(valid).put("facts","wrong type").toString(),
            JSONObject(valid).put("facts",arr(listOf("string instead of fact"))).toString(),
            valid.replace("\"evidence_ids\":[\"m1\"]","\"evidence_ids\":[]"),
            valid.replace("\"m1\"","1"),valid.replace("\"m1\"","\"another-contact-message\""),
            JSONObject(valid).put("unknowns",arr(listOf(JSONObject().put("not","a string")))).toString(),
            JSONObject(valid).put("strategy",JSONObject.NULL).toString())
        bad.forEach { rejected(it) }
        assertEquals("FOREIGN_REFERENCE",rejected(valid.replace("\"m1\"","\"another-contact-message\"")).code)
    }
    @Test fun errorDiagnosticsDistinguishEmptyAndMalformedWithoutLeakingText() {
        assertEquals("EMPTY_CONTENT",rejected(" \n").code)
        val privateFixture="PRIVATE_RESPONSE_AND_KEY_FIXTURE"
        val failure=rejected("```json\n$privateFixture\n```")
        assertEquals("INVALID_JSON",failure.code)
        assertFalse(AnalysisEngine.safeError(failure).contains(privateFixture))
        assertFalse(failure.diagnostic.toString().contains(privateFixture))
        assertEquals(sha256("```json\n$privateFixture\n```".toByteArray()),failure.diagnostic.getString("content_sha256"))
        assertFalse(failure.diagnostic.has("content"))
    }
    @Test fun invalidComponentStopsPipelineWithoutRetryAndPreservesKnownUsageCharge() {
        for(body in listOf("", "{\"facts\":[]}")) {
            var calls=0
            val gateway=object: Gateway {
                override fun chat(config: ModelConfig,system: String,user: String,cancel: CancelToken,progress: (String)->Unit): ModelReply {
                    calls++; return ModelReply(body,"SYNTHETIC_MODEL",Usage(4315,2968))
                }
                override fun jev(config: ModelConfig,state: JSONObject,cancel: CancelToken): ModelReply = error("Disabled Jev must not be called")
            }
            val scope=Scope("fixture-account","fixture-host","fixture-contact")
            val raw="SYNTHETIC_NOT_REAL_WECHAT"
            val evidence=Evidence(id="source",scope=scope,batchId="batch",kind=SourceKind.MANUAL,raw=raw,sha256=sha256(raw.toByteArray()))
            val c=Conversation(Contact(scope,"fixture"),listOf(Message(id="m1",scope=scope,order=1,speaker=Speaker.CONTACT,body=raw,evidenceIds=listOf("source"))),listOf(evidence))
            val model=ModelConfig(id="model",name="SYNTHETIC_FIXTURE",endpoint="https://fixture.invalid/chat",model="fixture",apiKey="SYNTHETIC_KEY",
                contextTokens=100_000,inputRmbPerMillion="2",outputRmbPerMillion="8",cachedRmbPerMillion="0.04",pricingVerified=true,pricingSource="unit test only")
            val settings=AiSettings(listOf(model),model.id,jevEnabled=false,cloudConsent=true,componentNoticeAccepted=true)
            val ledger=Ledger(); val states=mutableListOf<ComponentResult>()
            try {
                AnalysisEngine(gateway,ledger,SkillLibrary("fixture skill","fixture skill")).run(c,Streamer("fixture-host","fixture-account","fixture"),listOf(c),settings,"fixture",CancelToken(),component={ states.add(it) })
                fail("Invalid output must not become a saved round or reach final generation")
            } catch(_: SkillOutputFailure) { /* Expected; fixture is deliberately invalid. */ }
            assertEquals(1,calls); assertEquals("FAILED",states.last().state); assertNotNull(states.last().diagnostic)
            assertFalse(states.any { it.name=="恋爱大师" })
            assertEquals("TOKEN_ESTIMATE",ledger.entries().single().state)
            assertEquals(32374L,ledger.entries().single().chargedMicro)
        }
    }
}
