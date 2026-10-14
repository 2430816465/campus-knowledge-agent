package cn.xindong.core

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Synthetic intake/target invariants, not evidence of WeChat or real AI accuracy. */
class LatestMessageTest {
    private val scope=Scope("account","host","viewer")
    private fun empty()=Conversation(Contact(scope,"合成观众"))
    private fun review(id: String="screen-1", bodies: List<String> = listOf("好的"))=LatestReview(id,scope,bodies,true,true,true,true)
    private fun rejected(action: ()->Unit) { try { action(); fail("must reject") } catch(expected: IllegalArgumentException) { } }
    @Test fun uncheckedMaterialNeverBecomesHistory() {
        val r=review()
        listOf(r.copy(identityChecked=false),r.copy(incomingChecked=false),r.copy(latestUnansweredChecked=false),r.copy(newOccurrenceChecked=false)).forEach {
            rejected { LatestIntake.append(empty(),it,"未核对OCR") }
        }
    }
    @Test fun rawControlsAndOwnMessagesDoNotBecomeReplyTarget() {
        val original="合成观众\n我：上次已回复\n好的\n发送"
        val (c,target)=LatestIntake.append(empty(),review(),original)
        assertEquals(listOf("好的"),c.messages.map { it.body }); assertTrue(c.messages.none { it.actualSent })
        assertEquals("",c.messages.single().time) // Screenshot time does not invent a message timestamp.
        assertEquals(original,JSONObject(c.evidence.single().raw).getString("original"))
        assertEquals("好的",target.json(c).objects("messages").single().getString("body"))
    }
    @Test fun duplicateObservationStillRejectedAfterRestart() {
        val (c,_)=LatestIntake.append(empty(),review(),"合成原件")
        val restored=HistoryJson.parse(c.json().toString())
        rejected { LatestIntake.append(restored,review(bodies=listOf("改字也不能重放")),"合成原件") }
    }
    @Test fun repeatedTextWithDifferentRealOccurrenceIsPreserved() {
        val (a,_)=LatestIntake.append(empty(),review(),"好的")
        val (b,target)=LatestIntake.append(a,review("screen-2"),"好的")
        assertEquals(listOf("好的","好的"),b.messages.map { it.body }); assertEquals(2,b.messages.map { it.id }.distinct().size)
        assertEquals(b.messages.last().id,target.messageIds.single())
    }
    @Test fun orderedBurstIsOneTargetAndOldHistorySurvives() {
        val (a,_)=LatestIntake.append(empty(),review(),"旧原文")
        val (b,target)=LatestIntake.append(a,review("screen-2",listOf("明天有空吗","八点见")),"合成截图")
        assertEquals(3,b.messages.size); assertEquals(listOf(2L,3L),b.messages.takeLast(2).map { it.order })
        assertEquals(listOf("明天有空吗","八点见"),target.json(b).objects("messages").map { it.getString("body") })
        assertEquals(target,ReplyTarget.lastReviewed(HistoryJson.parse(b.json().toString())))
    }
    @Test fun editsAndNewIncomingMessageInvalidateTarget() {
        val (a,target)=LatestIntake.append(empty(),review(),"合成")
        rejected { target.validate(a.copy(messages=a.messages.map { it.copy(body="修正",revision=2) })) }
        val (b,_)=LatestIntake.append(a,review("screen-2"),"合成")
        rejected { target.validate(b) }
    }
    @Test fun actualOwnReplyStopsPendingTarget() {
        val (a,target)=LatestIntake.append(empty(),review(),"合成")
        val b=a.copy(messages=a.messages+Message(scope=scope,order=2,speaker=Speaker.STREAMER,body="已发",evidenceIds=a.messages.single().evidenceIds,actualSent=true))
        rejected { target.validate(b) }; assertNull(ReplyTarget.lastReviewed(b))
    }
    @Test fun foreignScopeAndEmptyMessagesAreRejected() {
        rejected { LatestIntake.append(empty(),review().copy(scope=scope.copy(contactId="another")),"合成") }
        rejected { LatestIntake.append(empty(),review(bodies=emptyList()),"合成") }
        rejected { LatestIntake.append(empty(),review(bodies=listOf(" ")),"合成") }
        val (c,target)=LatestIntake.append(empty(),review(),"合成")
        rejected { target.copy(scope=scope.copy(contactId="another")).validate(c) }
    }
}
