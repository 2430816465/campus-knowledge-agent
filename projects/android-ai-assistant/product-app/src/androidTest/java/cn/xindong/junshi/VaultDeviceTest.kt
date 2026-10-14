package cn.xindong.junshi

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import cn.xindong.core.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Synthetic data only. Running on an emulator does not count as WeChat or Redmi acceptance. */
@RunWith(AndroidJUnit4::class)
class VaultDeviceTest {
    @Test fun encryptedRestartAndStrictAccountIsolation() {
        val context=ApplicationProvider.getApplicationContext<Context>(); val vault=Vault(context)
        val a=vault.createAccount("SYNTHETIC-"+newId(),"test-pin-alpha".toCharArray())
        val host=vault.createStreamer(a.id,"合成主播"); val contact=vault.createContact(host,"同名观众")
        val second=vault.createContact(host,"同名观众"); assertNotEquals(contact.scope.contactId,second.scope.contactId)
        val raw="SYNTHETIC_PRIVATE_CHAT_"+newId(); val e=Evidence(scope=contact.scope,batchId="synthetic",kind=SourceKind.MANUAL,raw=raw,sha256=sha256(raw.toByteArray()))
        vault.save(contact.copy(evidence=listOf(e),messages=listOf(Message(scope=contact.scope,order=1,speaker=Speaker.CONTACT,body=raw,evidenceIds=listOf(e.id)))))
        val config=ModelConfig(name="SYNTHETIC_CONFIG",endpoint="https://invalid.example/api",model="fixture",apiKey="SYNTHETIC_SECRET_"+newId())
        vault.saveSettings(host,AiSettings(profiles=listOf(config)))
        val database=context.getDatabasePath("junshi-sealed.db").readBytes().toString(Charsets.ISO_8859_1)
        assertFalse(database.contains(raw)); assertFalse(database.contains(config.apiKey))
        val restarted=Vault(context); restarted.unlock(a,"test-pin-alpha".toCharArray())
        assertEquals(raw,restarted.conversation(contact.scope).messages.single().body)
        assertEquals(config.apiKey,restarted.settings(host).profiles.single().apiKey)
        val b=restarted.createAccount("SYNTHETIC-"+newId(),"test-pin-beta".toCharArray())
        try { restarted.conversation(contact.scope); fail("Cross-account query must fail") } catch(expected: IllegalArgumentException) { }
        restarted.deleteAccount(b); restarted.unlock(a,"test-pin-alpha".toCharArray()); restarted.deleteAccount(a)
    }
    @Test fun encryptedMediaRoundTripAndDeletion() {
        val context=ApplicationProvider.getApplicationContext<Context>(); val vault=Vault(context)
        val a=vault.createAccount("SYNTHETIC-"+newId(),"test-pin-media".toCharArray()); val host=vault.createStreamer(a.id,"合成主播"); val c=vault.createContact(host,"合成观众")
        val source=File(context.cacheDir,"synthetic-media-"+newId()); val original=ByteArray(256*1024) { (it%251).toByte() }; source.writeBytes(original)
        try {
            val blob=vault.importBlob(c.scope,Uri.fromFile(source)); assertEquals(sha256(original),blob.sha256); assertEquals(original.size.toLong(),blob.bytes)
            val sealed=File(context.filesDir,"sealed-media/${c.scope.key}/${blob.id}").readBytes(); assertFalse(sealed.contentEquals(original))
            assertArrayEquals(original,vault.blobStream(c.scope,blob.id).use { it.readBytes() })
            val asset=MediaAsset(scope=c.scope,blobId=blob.id,mime="application/octet-stream",originalName="synthetic",sha256=blob.sha256)
            vault.save(c.copy(media=listOf(asset))); vault.deleteConversation(c.scope)
            assertFalse(File(context.filesDir,"sealed-media/${c.scope.key}/${blob.id}").exists())
        } finally { source.delete(); vault.deleteAccount(a) }
    }
}
