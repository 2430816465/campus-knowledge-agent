package cn.xindong.probe

import org.junit.Assert.*
import org.junit.Test

class EvidenceRulesTest {
    private fun candidate(event: String = "e1", id: String? = null, contact: String? = null,
                          order: Long? = null, body: String = "好", occurrence: Int = 0,
                          direction: Direction = Direction.UNKNOWN, source: String = "notification") =
        Candidate(body, source, event, occurrence, contact, id, direction, order)

    @Test fun repeatedIdenticalMessagesArePreserved() {
        assertEquals(2, EvidenceRules.conservativeMerge(listOf(candidate("e1"), candidate("e2"))).size)
    }
    @Test fun sameSnapshotTwoEqualBubblesArePreserved() {
        assertEquals(2, EvidenceRules.conservativeMerge(listOf(candidate(occurrence=0), candidate(occurrence=1))).size)
    }
    @Test fun differentChannelsCannotMergeOnBody() {
        assertFalse(EvidenceRules.sameKnownMessage(candidate(), candidate(source="ocr")))
    }
    @Test fun knownSameMessageCanMergeAcrossChannels() {
        val a = candidate(id="msg1", contact="accountA/contactA", order=5, direction=Direction.INBOUND)
        val b = a.copy(source="accessibility", sourceEventId="other")
        assertEquals(1, EvidenceRules.conservativeMerge(listOf(a,b)).size)
    }
    @Test fun sameNicknameIsInsufficient() {
        assertFalse(EvidenceRules.sameKnownMessage(candidate(id="msg1"), candidate(id="msg1")))
    }
    @Test fun differentContactsNeverMerge() {
        val a = candidate(id="m1", contact="a", order=1, direction=Direction.INBOUND)
        assertFalse(EvidenceRules.sameKnownMessage(a,a.copy(contactId="b")))
    }
    @Test fun changedBodyIsConflictNotDuplicate() {
        val a = candidate(id="m1", contact="a", order=1, direction=Direction.INBOUND)
        assertFalse(EvidenceRules.sameKnownMessage(a,a.copy(body="撤回")))
    }
    @Test fun unknownDirectionNeverPassesIdentityJoin() {
        assertFalse(EvidenceRules.sameKnownMessage(candidate(id="m",contact="a",order=1),candidate(id="m",contact="a",order=1)))
    }
    @Test fun missingOrderNeverPassesJoin() {
        val a = candidate(id="m",contact="a",direction=Direction.INBOUND)
        assertFalse(EvidenceRules.sameKnownMessage(a,a))
    }
    @Test fun separateNativeIdsRemainSeparate() {
        val a = candidate(id="m1",contact="a",order=1,direction=Direction.INBOUND)
        assertEquals(2,EvidenceRules.conservativeMerge(listOf(a,a.copy(nativeMessageId="m2",order=2))).size)
    }
    @Test fun chainDetectsPayloadChange() {
        val a=EvidenceRules.eventHash("0","e",1,EvidenceRules.sha256("原文"))
        val b=EvidenceRules.eventHash("0","e",1,EvidenceRules.sha256("修改"))
        assertNotEquals(a,b)
    }
    @Test fun longPauseAndRebootArePossibleGaps() {
        assertTrue(EvidenceRules.possibleGap(1000,500,50000,50000))
        assertTrue(EvidenceRules.possibleGap(1000,50000,2000,100))
        assertFalse(EvidenceRules.possibleGap(0,0,2000,100))
        assertFalse(EvidenceRules.possibleGap(1000,500,2000,1500))
    }
    @Test fun blackFrameIsNotSuccessfulOCR() {
        assertTrue(EvidenceRules.unusableFrame(intArrayOf(0xff000000.toInt(),0xff010101.toInt())))
        assertFalse(EvidenceRules.unusableFrame(intArrayOf(0xffffffff.toInt(),0xff101010.toInt())))
    }
}
