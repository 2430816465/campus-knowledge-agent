package cn.xindong.core

import org.junit.Assert.*
import org.junit.Test

class StyleLearningTest {
    private val scope=Scope("account","host","viewer")
    private val owner=Streamer("host","account","合成统计测试主播")
    @Test fun punctuationProbabilitiesAndBmpHeartExcludeUnusedDraftAndSupplementaryHan() {
        val messages=listOf("呀！！❤️","𠮷","收到").mapIndexed { i,body ->
            Message(id="s$i",scope=scope,order=i.toLong(),speaker=Speaker.STREAMER,body=body,evidenceIds=emptyList(),actualSent=true)
        }
        val unused=messages.last().copy(id="draft",order=3,body="未用😂！",status=ReviewStatus.DRAFT)
        val style=StyleLearning.profile(owner,listOf(Conversation(Contact(scope,"合成观众"),messages+unused)),scope)
        assertEquals(3,style.getInt("confirmed_sent_count"))
        assertEquals(2,style.getJSONObject("punctuation").getInt("！"))
        assertEquals(1.0/3,style.getJSONObject("punctuation_message_probability").getDouble("！"),1e-12)
        assertEquals(8L,style.getLong("character_count"))
        assertEquals(.25,style.getJSONObject("punctuation_character_probability").getDouble("！"),1e-12)
        assertEquals(1,style.getInt("emoji_message_count"))
        val distribution=style.getJSONObject("consecutive_sent_group_distribution").getJSONObject("3")
        assertEquals(1,distribution.getInt("count")); assertEquals(1.0,distribution.getDouble("probability"),0.0)
    }
    @Test fun noConfirmedSentMessagesProducesFiniteZeroStatistics() {
        val style=StyleLearning.profile(owner,listOf(Conversation(Contact(scope,"新观众"))),scope)
        assertEquals(0,style.getInt("confirmed_sent_count")); assertEquals(0,style.getInt("emoji_message_count"))
        assertEquals(0.0,style.getJSONObject("punctuation_message_probability").getDouble("！"),0.0)
        assertEquals(0.0,style.getJSONObject("punctuation_character_probability").getDouble("！"),0.0)
        assertEquals(0,style.getJSONObject("consecutive_sent_group_distribution").length())
        assertFalse(style.toString().contains("NaN"))
    }
}
