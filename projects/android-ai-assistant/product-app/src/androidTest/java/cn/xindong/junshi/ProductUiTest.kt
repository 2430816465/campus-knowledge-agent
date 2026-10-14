package cn.xindong.junshi

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test
import cn.xindong.core.*
import org.junit.Assert.*

class ProductUiTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    private val controller get()=(compose.activity.application as JunshiApp).controller
    private fun ready() { compose.waitForIdle(); compose.waitUntil(15_000) { !controller.busy }; compose.waitForIdle() }
    private fun click(text: String) {
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasText(text))
        compose.onNodeWithText(text).performScrollTo()
        // A horizontal action row is the nearest scroll parent. Also scroll the
        // screen with an actual gesture when its button is still below the viewport.
        var attempts=0
        while(!compose.onNodeWithText(text).isDisplayed() && attempts++<12) {
            compose.onNode(hasScrollToIndexAction()).performTouchInput { swipeUp() }
            compose.waitForIdle()
        }
        compose.onNodeWithText(text).assertIsDisplayed().performClick()
    }
    private fun name(value: String) { compose.onNode(hasText("名称") and hasSetTextAction()).performTextInput(value) }
    @Test fun reviewedLatestMessageStartsAnalysisAndMissingConfigShowsRealError() {
        ready()
        compose.runOnUiThread { controller.lock(); controller.createAccount("SYNTHETIC_LATEST_UI_ONLY","synthetic-password") }; ready()
        val account=controller.account!!
        try {
            compose.runOnUiThread { controller.createStreamer("合成主播") }; ready()
            compose.runOnUiThread { controller.createContact("合成新消息观众") }; ready()
            val field="对方最新消息 1（原文）"
            compose.onNode(hasText(field) and hasSetTextAction()).performScrollTo().performTextInput("合成：明天八点见")
            click("确属当前观众 合成新消息观众，不是群聊或其他会话")
            click("以上每条都是对方原文，已修正错字；没有主播文字或界面控件")
            click("这是按顺序排列的最新未回复消息，尚未入库；相同文字也确为新的一次发送")
            click("确认最新消息并自动分析"); ready()
            compose.waitUntil(15_000) { !controller.generating }; compose.waitForIdle()
            assertEquals(1,controller.current!!.messages.size)
            assertEquals("合成：明天八点见",controller.current!!.messages.single().body)
            assertEquals(Speaker.CONTACT,controller.current!!.messages.single().speaker)
            assertTrue(controller.status,controller.status.contains("须先确认云端发送范围"))
            assertNull(controller.result); assertTrue(controller.charges.isEmpty())
            // Replaying the already consumed observation must neither append nor call a model.
            val c=controller.current!!; val observation=c.evidence.single().batchId
            compose.runOnUiThread { controller.confirmLatest(LatestReview(observation,c.scope,listOf("合成：明天八点见"),true,true,true,true)) }; ready()
            assertEquals(1,controller.current!!.messages.size); assertTrue(controller.status.contains("已经入库"))
            assertFalse(controller.generating); assertTrue(controller.charges.isEmpty())
        } finally {
            compose.runOnUiThread { controller.deleteAccount() }; ready()
            assertFalse(ReadBridge.autoRead); assertNull(ReadBridge.preview)
        }
    }
    @Test fun accountHistoryReviewAndLockAreInteractive() {
        ready()
        compose.onNodeWithText("心动军师",useUnmergedTree=true).assertIsDisplayed()
        compose.onNodeWithText("创建本地账户",useUnmergedTree=true).performScrollTo().performClick()
        compose.onNode(hasText("名称") and hasSetTextAction()).performTextInput("SYNTHETIC_UI_ONLY")
        compose.onNode(hasText("本地账户口令（至少6位，请自行保管）") and hasSetTextAction()).performTextInput("synthetic-password")
        compose.onNodeWithText("取消",useUnmergedTree=true).performClick()
        compose.onNodeWithText("创建本地账户",useUnmergedTree=true).assertExists()
        click("创建本地账户"); name("SYNTHETIC_UI_ONLY")
        compose.onNode(hasText("本地账户口令（至少6位，请自行保管）") and hasSetTextAction()).performTextInput("synthetic-password")
        compose.onNodeWithText("创建").performClick(); ready(); val account=controller.account!!
        try {
            click("新建主播"); name("合成主播"); compose.onNodeWithText("创建").performClick(); ready()
            click("新建观众"); name("合成观众"); compose.onNodeWithText("创建").performClick(); ready()
            click("历史")
            compose.onNode(hasText("微信复制文字或逐行消息",substring=true) and hasSetTextAction()).performScrollTo().performTextInput("\t观众\tTEXT\t合成：今天有点累\n\t主播\tTEXT\t那早点休息呀")
            click("导入待校对区"); ready()
            assertEquals(0,controller.current!!.messages.size)
            val batch=controller.current!!.batches.single()
            compose.onNodeWithText(batch.id.take(6)+" · ",substring=true).performScrollTo().performClick()
            compose.onNodeWithText("已逐项核对本批确属当前观众",substring=true).performScrollTo().performClick()
            compose.onNodeWithText("已核对本批从旧到新的顺序",substring=true).performScrollTo().performClick()
            val review="已核对正文、说话人及时间；主播行确认为实际已发送"
            compose.onAllNodesWithText(review)[0].performScrollTo().performClick()
            compose.onAllNodesWithText(review)[1].performScrollTo().performClick()
            compose.onNodeWithText("确认入库").assertIsEnabled(); click("确认入库"); ready()
            assertEquals(controller.status,2,controller.current!!.messages.size); assertTrue(controller.current!!.messages.last().actualSent)
            compose.onNodeWithText("合成：今天有点累").performScrollTo().assertIsDisplayed()
            click("锁定账户"); ready(); assertNull(controller.current); assertNull(controller.vault.unlocked)
            compose.onNodeWithText("创建本地账户").assertExists()
        } finally {
            compose.runOnUiThread { controller.unlock(account,"synthetic-password") }; ready()
            compose.runOnUiThread { controller.deleteAccount() }; ready()
        }
    }
}
