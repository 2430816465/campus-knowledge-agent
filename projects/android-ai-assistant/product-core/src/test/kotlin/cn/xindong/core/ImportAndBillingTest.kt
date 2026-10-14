package cn.xindong.core

import org.junit.Assert.*
import org.junit.Test

class ImportAndBillingTest {
    @Test fun structuredMessagesRequireReviewAndUseNewSource() {
        val rows=HistoryImport.documentRows("""{"messages":[{"body":"合成旧文","speaker":"CONTACT","time":""},{"body":"合成回复","speaker":"STREAMER","kind":"EMOJI"}]}""","new-source")
        assertEquals(2,rows.size); assertTrue(rows.none { it.checked }); assertTrue(rows.all { it.evidenceIds==listOf("new-source") })
        assertEquals(Speaker.CONTACT,rows.first().speaker); assertEquals(Kind.EMOJI,rows.last().kind)
        assertEquals(Speaker.UNKNOWN,HistoryImport.documentRows("""[{"body":"未标方向"}]""","e").single().speaker)
    }
    @Test fun invalidStructuredFileDoesNotBecomePlainHistory() {
        try { HistoryImport.documentRows("""{"apiKey":"not-history"}""","e"); fail() } catch(_: org.json.JSONException) { }
        assertEquals(2,HistoryImport.documentRows("普通正文\n下一条","e").size)
    }
    @Test fun decisionModePersistsWithoutDisablingComponents() {
        val settings=AiSettings(jevEnabled=true,jevMode=JevMode.CAUTIOUS)
        val restored=AiSettings.parse(settings.json())
        assertEquals(JevMode.CAUTIOUS,restored.jevMode)
        assertTrue(restored.jevEnabled && restored.goutouEnabled && restored.lianaiEnabled)
        assertEquals(JevMode.BALANCED,AiSettings.parse(settings.json().apply { remove("jevMode") }).jevMode)
    }
    @Test fun externalBillIsCountedAndCannotSilentlyRaiseLimit() {
        var writes=0; val ledger=Ledger(persist={ _,_->writes++ }); val month=Costing.month(System.currentTimeMillis())
        ledger.recordExternal("synthetic-owner",100_000_000,"synthetic bill adjustment")
        assertEquals(100_000_000,ledger.spent(month)); assertEquals(100_000_000,ledger.limit(month)); assertEquals(1,writes)
        assertEquals("USER_VERIFIED_EXTERNAL",ledger.entries().single().state)
        try { ledger.recordExternal("synthetic-owner",-1,"invalid"); fail() } catch(_: IllegalArgumentException) { }
        assertEquals(1,ledger.entries().size)
    }
}
