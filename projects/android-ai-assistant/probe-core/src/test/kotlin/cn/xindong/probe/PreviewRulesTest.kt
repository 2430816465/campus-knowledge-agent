package cn.xindong.probe

import org.junit.Assert.*
import org.junit.Test

class PreviewRulesTest {
    private val pending=ReadPreview("request-a","pending","current window")

    @Test fun validResultRemainsUnboundSourceMaterial() {
        val ready=PreviewRules.completed(pending,"request-a","unverified","real OCR text")
        assertEquals("real OCR text",ready.text)
        assertEquals("current window",ready.source)
    }
    @Test fun completionFromEarlierRequestCannotOverwriteNewRequest() {
        val newer=pending.copy(requestId="request-b")
        assertEquals(newer,PreviewRules.completed(newer,"request-a","done","other chat"))
    }
    @Test fun navigationOrRevocationClearsTextAndPreventsLateCompletion() {
        val ready=PreviewRules.completed(pending,"request-a","unverified","old chat")
        val invalidated=PreviewRules.invalidated("page changed")
        assertTrue(ready.text.isNotBlank())
        assertEquals("",invalidated.text)
        assertEquals("",invalidated.source)
        assertEquals(invalidated,PreviewRules.completed(invalidated,"request-a","done","late old chat"))
    }
    @Test fun clearingPreviewPreventsLateResultFromRestoringIt() {
        assertEquals(ReadPreview(),PreviewRules.completed(ReadPreview(),"request-a","done","late text"))
    }
    @Test fun emptyRequestNeverCreatesMaterial() {
        assertEquals(ReadPreview(),PreviewRules.completed(ReadPreview(),"","done","unscoped text"))
    }
}
