package cn.xindong.junshi

import android.app.Application
import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import cn.xindong.core.*
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class JunshiApp: Application() {
    val io=Executors.newSingleThreadExecutor()
    val ai=Executors.newSingleThreadExecutor()
    val session=ScopeSession()
    val vault by lazy { Vault(this) }
    val controller by lazy { ProductController(this) }
}
private class Database(context: Context): SQLiteOpenHelper(context,"junshi-sealed.db",null,1) {
    override fun onCreate(db: SQLiteDatabase) { db.execSQL("CREATE TABLE records(kind TEXT NOT NULL,scope TEXT NOT NULL,id TEXT NOT NULL,cipher BLOB NOT NULL,PRIMARY KEY(kind,scope,id))") }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { error("不支持的数据库版本；原始文件保留") }
}
data class AccountEntry(val account: Account, val salt: String, val digest: String)
data class ImportedBlob(val id: String, val sha256: String, val bytes: Long)
class Vault(private val context: Context) {
    private val database=Database(context)
    @Volatile var unlocked: String?=null; private set
    private val box: SealedBox by lazy {
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }; val alias="xindong-product-v1"
        val key=if(store.containsAlias(alias)) store.getKey(alias,null) as SecretKey else {
            // Never replace a missing key when encrypted records already exist.
            database.readableDatabase.rawQuery("SELECT COUNT(*) FROM records",null).use { it.moveToFirst(); require(it.getLong(0)==0L) { "设备密钥缺失，无法解密旧数据；未删除或覆盖" } }
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
                init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
            }.generateKey()
        }; SealedBox(key)
    }
    @Synchronized private fun put(kind: String, scope: String, id: String, json: JSONObject) {
        val cipher=box.seal(json.toString().toByteArray(Charsets.UTF_8),"$kind|$scope|$id")
        val row=ContentValues().apply { put("kind",kind); put("scope",scope); put("id",id); put("cipher",cipher) }
        require(database.writableDatabase.insertWithOnConflict("records",null,row,SQLiteDatabase.CONFLICT_REPLACE)!=-1L) { "本地保存失败" }
    }
    @Synchronized private fun read(kind: String, scope: String, id: String): JSONObject? = database.readableDatabase.query("records",arrayOf("cipher"),
        "kind=? AND scope=? AND id=?",arrayOf(kind,scope,id),null,null,null).use { c ->
        if(!c.moveToFirst()) null else JSONObject(String(box.open(c.getBlob(0),"$kind|$scope|$id"),Charsets.UTF_8))
    }
    @Synchronized private fun list(kind: String, scope: String): List<JSONObject> = database.readableDatabase.query("records",arrayOf("id","cipher"),
        "kind=? AND scope=?",arrayOf(kind,scope),null,null,"id").use { c ->
        buildList { while(c.moveToNext()) add(JSONObject(String(box.open(c.getBlob(1),"$kind|$scope|${c.getString(0)}"),Charsets.UTF_8))) }
    }
    private fun owner(account: String) { require(unlocked==account) { "请先解锁对应本地账户" } }
    fun accounts(): List<AccountEntry> = list("account","catalog").map { AccountEntry(Account(it.getString("id"),it.getString("name")),it.getString("salt"),it.getString("digest")) }
    fun createAccount(name: String, pin: CharArray): Account {
        require(name.isNotBlank()); val salt=LocalPin.salt(); val digest=LocalPin.digest(pin,salt); val account=Account(name=name)
        put("account","catalog",account.id,JSONObject().put("id",account.id).put("name",name)
            .put("salt",Base64.encodeToString(salt,Base64.NO_WRAP)).put("digest",Base64.encodeToString(digest,Base64.NO_WRAP)))
        unlocked=account.id; return account
    }
    private var failedUnlocks=0; private var nextUnlock=0L
    @Synchronized fun unlock(account: Account, pin: CharArray) {
        require(android.os.SystemClock.elapsedRealtime()>=nextUnlock) { "口令尝试过于频繁，请稍后再试" }
        val entry=accounts().single { it.account.id==account.id }
        if(!LocalPin.matches(pin,Base64.decode(entry.salt,Base64.NO_WRAP),Base64.decode(entry.digest,Base64.NO_WRAP))) {
            failedUnlocks++; nextUnlock=android.os.SystemClock.elapsedRealtime()+minOf(60_000L,1000L*failedUnlocks*failedUnlocks); error("本地账户口令不正确")
        }; failedUnlocks=0; unlocked=account.id
        streamers(account.id).forEach { host -> conversations(host).forEach(::purgeUnreferencedBlobs) }
    }
    fun lock() { unlocked=null }
    fun streamers(account: String): List<Streamer> { owner(account); return list("streamer",account).map { Streamer(it.getString("id"),account,it.getString("name")) } }
    fun createStreamer(account: String, name: String): Streamer {
        owner(account); require(name.isNotBlank()); val s=Streamer(accountId=account,name=name)
        put("streamer",account,s.id,JSONObject().put("id",s.id).put("name",name)); return s
    }
    fun conversations(streamer: Streamer): List<Conversation> {
        owner(streamer.accountId); return list("conversation",streamer.accountId+"/"+streamer.id).map { HistoryJson.parse(it.toString()).also { c -> require(c.scope.streamerId==streamer.id && c.scope.accountId==streamer.accountId) } }
    }
    fun conversation(scope: Scope): Conversation { owner(scope.accountId); return HistoryJson.parse(read("conversation",scope.accountId+"/"+scope.streamerId,scope.contactId)?.toString() ?: error("档案不存在")).also { require(it.scope==scope) } }
    fun save(c: Conversation) { owner(c.scope.accountId); c.validate(); put("conversation",c.scope.accountId+"/"+c.scope.streamerId,c.scope.contactId,c.json()); purgeUnreferencedBlobs(c) }
    fun createContact(streamer: Streamer, name: String): Conversation {
        owner(streamer.accountId); require(name.isNotBlank()); return Conversation(Contact(Scope(streamer.accountId,streamer.id,newId()),name)).also(::save)
    }
    fun settings(s: Streamer): AiSettings {
        owner(s.accountId)
        val saved=read("settings",s.accountId,s.id) ?: return AiSettings()
        return AiSettings.parsePersisted(saved).also {
            if(saved.optInt("componentPolicyVersion")<AiSettings.COMPONENT_POLICY_VERSION) saveSettings(s,it)
        }
    }
    fun saveSettings(s: Streamer, settings: AiSettings) { owner(s.accountId); put("settings",s.accountId,s.id,settings.json()) }
    fun saveRound(round: RoundResult) { owner(round.scope.accountId); put("round",round.scope.key,round.id,round.json()) }
    fun rounds(scope: Scope): List<JSONObject> { owner(scope.accountId); return list("round",scope.key).sortedByDescending { it.optLong("startedAt") } }
    fun saveAudit(scope: Scope, id: String, audit: JSONObject) { owner(scope.accountId); put("audit",scope.key,id,audit) }
    fun ledger(): Ledger {
        val o=read("ledger","device","v1") ?: JSONObject(); val limits=o.optJSONObject("limits") ?: JSONObject()
        val rows=o.objects("rows").map { r -> Charge(r.getString("id"),r.getString("owner"),r.getString("month"),r.getString("component"),r.getString("model"),
            r.getLong("reserved"),r.getLong("charged"),r.optJSONObject("usage")?.let { Usage(it.getLong("input"),it.getLong("output"),it.getLong("cached")) },r.getString("state"),r.getLong("at"),r.optString("pricingSource")) }
        return Ledger(rows,limits.keys().asSequence().associateWith { limits.getLong(it) }) { charges, caps ->
            put("ledger","device","v1",JSONObject().put("limits",JSONObject(caps)).put("rows",arr(charges.map { r ->
                JSONObject().put("id",r.id).put("owner",r.owner).put("month",r.month).put("component",r.component).put("model",r.model)
                    .put("reserved",r.reservedMicro).put("charged",r.chargedMicro).put("state",r.state).put("at",r.at).put("pricingSource",r.pricingSource)
                    .put("usage",r.usage?.let { JSONObject().put("input",it.input).put("output",it.output).put("cached",it.cachedInput) })
            })))
        }
    }
    // Only one instance may reserve/settle on the device; reuse it across streamer switches.
    val budget: Ledger by lazy { ledger() }
    private fun blobFile(scope: Scope, id: String): File {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,80}")))
        val root=File(context.filesDir,"sealed-media").canonicalFile
        val file=File(root,scope.key+"/"+id).canonicalFile
        require(file.path.startsWith(root.path+File.separator)); return file
    }
    fun importBlob(scope: Scope, uri: Uri): ImportedBlob {
        owner(scope.accountId)
        val id=newId(); val file=blobFile(scope,id); file.parentFile?.mkdirs()
        val temporary=File(file.path+".writing")
        try {
            val info=context.contentResolver.openInputStream(uri)?.use { input -> temporary.outputStream().use { output -> box.sealStream(input,output,"blob|${scope.key}|$id") } } ?: error("无法取得授权文件")
            require(temporary.renameTo(file)) { "媒体加密后保存失败" }; return ImportedBlob(id,info.first,info.second)
        } finally { if(temporary.exists()) temporary.delete() }
    }
    fun blobStream(scope: Scope, id: String): java.io.InputStream { owner(scope.accountId); return box.openStream(blobFile(scope,id).inputStream(),"blob|${scope.key}|$id") }
    fun blob(scope: Scope, id: String): ByteArray = blobStream(scope,id).use { it.readBytesBounded(32*1024*1024) }
    fun assertOriginals(c: Conversation) {
        owner(c.scope.accountId)
        (c.evidence.mapNotNull { it.blobId }+c.media.map { it.blobId }).distinct().forEach { id ->
            require(blobFile(c.scope,id).let { it.isFile && it.length()>=28 }) { "部分原始媒体缺失，先修复或在来源记录中核对；本轮未调用AI" }
        }
    }
    fun purgeUnreferencedBlobs(c: Conversation) {
        owner(c.scope.accountId)
        val directory=blobFile(c.scope,"directory-check").parentFile!!
        val kept=(c.evidence.mapNotNull { it.blobId }+c.media.map { it.blobId }).toSet()
        directory.listFiles()?.filter { it.name !in kept }?.forEach { file ->
            require(file.canonicalFile.parentFile==directory && file.isFile) { "媒体清理路径无效" }
            require(file.delete()) { "无引用的加密媒体清理失败" }
        }
    }
    private fun deleteScopedMedia(scope: Scope) {
        val directory=blobFile(scope,"directory-check").parentFile!!
        directory.listFiles()?.forEach { file -> require(file.canonicalFile.parentFile==directory && file.isFile); require(file.delete()) { "媒体清理失败" } }
        if(directory.exists()) require(directory.delete()) { "媒体目录清理失败" }
    }
    fun saveBytes(scope: Scope, bytes: ByteArray): String {
        owner(scope.accountId); val id=newId(); val file=blobFile(scope,id); file.parentFile?.mkdirs()
        file.outputStream().use { it.write(box.seal(bytes,"blob|${scope.key}|$id")) }; return id
    }
    fun deleteConversation(scope: Scope) {
        owner(scope.accountId); conversation(scope)
        deleteScopedMedia(scope)
        database.writableDatabase.beginTransaction()
        try {
            database.writableDatabase.delete("records","kind=? AND scope=? AND id=?",arrayOf("conversation",scope.accountId+"/"+scope.streamerId,scope.contactId))
            database.writableDatabase.delete("records","scope=?",arrayOf(scope.key)); database.writableDatabase.setTransactionSuccessful()
        } finally { database.writableDatabase.endTransaction() }
    }
    fun deleteAccount(account: Account) {
        owner(account.id); streamers(account.id).forEach { s -> conversations(s).forEach { deleteConversation(it.scope) } }
        database.writableDatabase.delete("records","scope=?",arrayOf(account.id))
        database.writableDatabase.delete("records","kind=? AND scope=? AND id=?",arrayOf("account","catalog",account.id)); lock()
    }
}
