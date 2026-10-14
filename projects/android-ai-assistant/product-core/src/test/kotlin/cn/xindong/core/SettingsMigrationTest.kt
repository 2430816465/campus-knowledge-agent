package cn.xindong.core

import org.junit.Assert.*
import org.junit.Test

class SettingsMigrationTest {
    private fun model(id: String="m", kind: ProviderKind=ProviderKind.CHAT_COMPLETIONS) = ModelConfig(id=id,name="fixture",
        endpoint="https://invalid.example",model="fixture",apiKey="fixture-not-a-real-key",kind=kind)

    @Test fun unconfiguredLegacyJevDefaultMigratesOnceWithoutLosingGeneratorOrGrantingConsent() {
        val original=AiSettings(listOf(model()),"m",jevEnabled=true,cloudConsent=true,componentNoticeAccepted=true,styleNotes="保留本人风格说明")
        val legacy=original.json().also { it.remove("componentPolicyVersion") }
        val updated=AiSettings.parsePersisted(legacy)
        assertFalse(updated.jevEnabled); assertTrue(updated.goutouEnabled && updated.lianaiEnabled)
        assertFalse(updated.cloudConsent || updated.componentNoticeAccepted)
        assertEquals(original.profiles,updated.profiles); assertEquals(original.modelId,updated.modelId); assertEquals(original.styleNotes,updated.styleNotes)
        assertEquals(updated,AiSettings.parsePersisted(updated.json()))
    }
    @Test fun explicitJevOptInAfterMigrationIsPreservedEvenWhenCredentialIsMissing() {
        val explicit=AiSettings(jevEnabled=true,cloudConsent=true,componentNoticeAccepted=true)
        assertEquals(explicit,AiSettings.parsePersisted(explicit.json()))
    }
    @Test fun legacyConfiguredJevOptInAndExplicitSkillChoicesArePreserved() {
        val original=AiSettings(listOf(model(),model("j",ProviderKind.JEV)),"m","j",jevEnabled=true,goutouEnabled=false,
            cloudConsent=true,componentNoticeAccepted=true)
        val legacy=original.json().also { it.remove("componentPolicyVersion") }
        assertEquals(original,AiSettings.parsePersisted(legacy))
    }
}
