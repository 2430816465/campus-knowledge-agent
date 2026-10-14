package cn.xindong.probe

import org.junit.Assert.*
import org.junit.Test

class CaptureRulesTest {
    private val request=CaptureScope("request-a","run-a","CLICK",7,1)
    @Test fun stoppedSessionRejectsPendingResult() {
        assertEquals("SESSION_STOPPED",CaptureRules.rejection(request,request,false,"request-a"))
    }
    @Test fun cancelledOrNewerRequestRejectsOldResult() {
        assertEquals("REQUEST_CANCELLED_OR_SUPERSEDED",CaptureRules.rejection(request,request,true,null))
        assertEquals("REQUEST_CANCELLED_OR_SUPERSEDED",CaptureRules.rejection(request,request,true,"request-b"))
    }
    @Test fun newRunOrSceneRejectsOldResult() {
        assertEquals("SESSION_CHANGED",CaptureRules.rejection(request,request.copy(runId="run-b"),true,"request-a"))
        assertEquals("SESSION_CHANGED",CaptureRules.rejection(request,request.copy(scenario="OTHER"),true,"request-a"))
    }
    @Test fun missingOrDifferentWindowRejectsResult() {
        assertEquals("WECHAT_WINDOW_UNAVAILABLE",CaptureRules.rejection(request,null,true,"request-a"))
        assertEquals("WINDOW_CHANGED",CaptureRules.rejection(request,request.copy(windowId=8),true,"request-a"))
    }
    @Test fun observedNavigationRejectsEvenSameWindowId() {
        assertEquals("NAVIGATION_CHANGED",CaptureRules.rejection(request,request.copy(navigationEpoch=2),true,"request-a"))
    }
    @Test fun unchangedScopeAllowsUnverifiedMaterialOnly() {
        assertNull(CaptureRules.rejection(request,request,true,"request-a"))
    }
}
