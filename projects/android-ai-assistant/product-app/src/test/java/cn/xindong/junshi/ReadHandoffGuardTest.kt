package cn.xindong.junshi

import org.junit.Assert.*
import org.junit.Test

class ReadHandoffGuardTest {
    private val own="cn.xindong.junshi"
    @Test fun transientUnknownFocusCanReachReviewApp() {
        val guard=ReadHandoffGuard(own)
        assertTrue(guard.mayRetain("com.tencent.mm",100))
        assertTrue(guard.mayRetain(null,200))
        assertTrue(guard.mayRetain(own,900))
    }
    @Test fun explicitReviewHasBoundedThreeSecondGrace() {
        val guard=ReadHandoffGuard(own)
        guard.beginReview(100)
        assertTrue(guard.mayRetain(null,200))
        assertTrue(guard.mayRetain(null,3000))
        assertFalse(guard.mayRetain(null,3100))
    }
    @Test fun knownOtherAppClearsImmediatelyEvenDuringReview() {
        val guard=ReadHandoffGuard(own)
        guard.beginReview(100)
        assertFalse(guard.mayRetain("com.android.launcher",101))
    }
    @Test fun lateFirstUnknownFocusCannotExtendReviewDeadline() {
        val guard=ReadHandoffGuard(own)
        guard.beginReview(100)
        assertTrue(guard.mayRetain(null,3000))
        assertFalse(guard.mayRetain(null,3100))
    }
    @Test fun repeatedUnknownFocusCannotExtendGrace() {
        val guard=ReadHandoffGuard(own)
        assertTrue(guard.mayRetain(null,100))
        assertTrue(guard.mayRetain(null,2099))
        assertFalse(guard.mayRetain(null,2100))
        assertFalse(guard.mayRetain(null,5000))
    }
    @Test fun successfulReviewConsumesItsExtraGrace() {
        val guard=ReadHandoffGuard(own)
        guard.beginReview(100)
        assertTrue(guard.mayRetain(own,200))
        assertTrue(guard.mayRetain(null,300))
        assertFalse(guard.mayRetain(null,2300))
    }
    @Test fun resetRevokesReviewGrace() {
        val guard=ReadHandoffGuard(own)
        guard.beginReview(100)
        guard.reset()
        assertTrue(guard.mayRetain(null,200))
        assertFalse(guard.mayRetain(null,2200))
    }
}
