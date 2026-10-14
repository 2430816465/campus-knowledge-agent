package cn.xindong.g1probe

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import cn.xindong.probe.EvidenceRules
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

const val WECHAT = "com.tencent.mm"

class ProbeStore(private val context: Context) : SQLiteOpenHelper(context,"evidence.db",null,1) {
    private val worker = Executors.newSingleThreadExecutor()
    private val prefs = context.getSharedPreferences("test_session",Context.MODE_PRIVATE)
    @Volatile var error: String? = null
        private set
    val armed get() = prefs.getBoolean("armed",false)
    val runId get() = prefs.getString("run_id","") ?: ""
    val scenario get() = prefs.getString("scenario","") ?: ""
    var autoScreenshot: Boolean
        get() = prefs.getBoolean("auto_screenshot",false)
        set(value) { prefs.edit().putBoolean("auto_screenshot",value).apply() }
    val onDemandOnly get() = prefs.getBoolean("on_demand_only",true)
    private val evidenceKey: SecretKey by lazy { loadOrCreateKey() }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, at_ms INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL, source TEXT NOT NULL, sealed TEXT NOT NULL, payload_sha256 TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        error="Unsupported database version; evidence was preserved."
        throw IllegalStateException("No destructive evidence migration")
    }
    private fun loadOrCreateKey(): SecretKey {
        val ks=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey("g1_evidence_v1",null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("g1_evidence_v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun seal(raw: String): String {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,evidenceKey) }
        return Base64.encodeToString(cipher.iv+cipher.doFinal(raw.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)
    }
    private fun open(sealed: String): String {
        val bytes=Base64.decode(sealed,Base64.NO_WRAP)
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE,evidenceKey,GCMParameterSpec(128,bytes.copyOfRange(0,12))) }
        return cipher.doFinal(bytes.copyOfRange(12,bytes.size)).toString(Charsets.UTF_8)
    }
    fun begin(run: String, scene: String, onDemandOnly: Boolean = true) {
        require(run.isNotBlank() && scene.isNotBlank())
        require(!armed) { "Stop the existing scene before starting another" }
        // Idle time between frozen scenes is not a gap inside the new scene.
        prefs.edit().putString("run_id",run).putString("scenario",scene).putBoolean("armed",true)
            .putLong("last_wall",0).putLong("last_elapsed",0).putBoolean("auto_screenshot",false)
            .putBoolean("on_demand_only",onDemandOnly).commit()
        record("SESSION_START","session",JSONObject().put("device",deviceBaseline(context)).put("test_only_consent",true)
            .put("capture_policy",if(onDemandOnly) "USER_CLICK_ONLY" else "LEGACY_AUTOMATIC_DIAGNOSTIC"))
    }
    fun end(reason: String = "user_stop") {
        record("SESSION_END","session",JSONObject().put("reason",reason))
        prefs.edit().putBoolean("armed",false).putBoolean("auto_screenshot",false).commit()
    }
    fun record(type: String, source: String, payload: JSONObject = JSONObject(), run: String = runId, scene: String = scenario) {
        val at=System.currentTimeMillis()
        val elapsed=SystemClock.elapsedRealtime()
        val id=UUID.randomUUID().toString()
        val raw=JSONObject().put("schema",1).put("event_id",id).put("at_ms",at)
            .put("elapsed_ms",elapsed).put("source",source).put("type",type).put("run_id",run)
            .put("scenario",scene).put("armed",armed).put("data",payload).toString()
        worker.execute {
            try { synchronized(this) {
                val db=writableDatabase
                db.beginTransaction()
                try {
                    val previous=db.rawQuery("SELECT hash FROM events ORDER BY seq DESC LIMIT 1",null).use { if(it.moveToFirst()) it.getString(0) else "0" }
                    val payloadHash=EvidenceRules.sha256(raw)
                    val values=ContentValues().apply {
                        put("event_id",id); put("at_ms",at); put("elapsed_ms",elapsed); put("source",source)
                        put("sealed",seal(raw)); put("payload_sha256",payloadHash); put("prev_hash",previous)
                        put("hash",EvidenceRules.eventHash(previous,id,at,payloadHash))
                    }
                    db.insertOrThrow("events",null,values)
                    db.setTransactionSuccessful()
                } finally { db.endTransaction() }
            } } catch(e: Exception) { error="Evidence storage failed: ${e.javaClass.simpleName}" }
        }
    }
    fun heartbeat(status: JSONObject) {
        val wall=System.currentTimeMillis(); val elapsed=SystemClock.elapsedRealtime()
        val previousWall=prefs.getLong("last_wall",0); val previousElapsed=prefs.getLong("last_elapsed",0)
        if(EvidenceRules.possibleGap(previousWall,previousElapsed,wall,elapsed)) {
            record("POSSIBLE_OBSERVATION_GAP","health",JSONObject().put("last_heartbeat_ms",previousWall).put("resumed_at_ms",wall)
                .put("reason","process pause, reboot, or clock change; messages during gap are unknown"))
        }
        prefs.edit().putLong("last_wall",wall).putLong("last_elapsed",elapsed).apply()
        record("HEARTBEAT","health",status)
    }
    @Synchronized fun count(): Long = readableDatabase.rawQuery("SELECT COUNT(*) FROM events",null).use { it.moveToFirst(); it.getLong(0) }
    @Synchronized fun recent(): List<String> = readableDatabase.rawQuery("SELECT at_ms,source,sealed FROM events ORDER BY seq DESC LIMIT 30",null).use { c ->
        buildList { while(c.moveToNext()) {
            val p=JSONObject(open(c.getString(2)))
            add("${c.getLong(0)}  ${c.getString(1)} / ${p.optString("type")}\n${p.optJSONObject("data")}")
        } }
    }
    fun export(output: OutputStream, completed: (Boolean)->Unit) {
        worker.execute {
            try { synchronized(this) {
                output.bufferedWriter(Charsets.UTF_8).use { writer ->
                    val total=count()
                    val lastHash=readableDatabase.rawQuery("SELECT hash FROM events ORDER BY seq DESC LIMIT 1",null)
                        .use { if(it.moveToFirst()) it.getString(0) else "0" }
                    val exportId=UUID.randomUUID().toString()
                    writer.write(JSONObject().put("export_schema",2).put("record_type","EXPORT_START")
                        .put("export_id",exportId).put("expected_event_count",total).put("last_event_hash",lastHash).toString())
                    writer.newLine()
                    readableDatabase.rawQuery("SELECT * FROM events ORDER BY seq",null).use { c ->
                        while(c.moveToNext()) {
                            val row=JSONObject()
                            for(i in 0 until c.columnCount) {
                                val name=c.getColumnName(i)
                                when(name) {
                                    "sealed" -> row.put("payload_json",open(c.getString(i)))
                                    "seq","at_ms","elapsed_ms" -> row.put(name,c.getLong(i))
                                    else -> row.put(name,c.getString(i))
                                }
                            }
                            writer.write(row.toString()); writer.newLine()
                        }
                    }
                    writer.write(JSONObject().put("export_schema",2).put("record_type","EXPORT_END")
                        .put("export_id",exportId).put("event_count",total).put("last_event_hash",lastHash).toString())
                    writer.newLine()
                }
            }; completed(true) } catch(e: Exception) { error="Export failed: ${e.javaClass.simpleName}"; completed(false) }
        }
    }
}

fun candidateJson(body: String, index: Int, contactHint: String? = null, directionHint: String = "UNKNOWN"): JSONObject = JSONObject()
    .put("body",body).put("occurrence",index).put("contact_hint",contactHint ?: JSONObject.NULL)
    .put("contact_id",JSONObject.NULL).put("native_message_id",JSONObject.NULL)
    .put("direction",directionHint).put("order",JSONObject.NULL).put("automatic",true)
    .put("identity_verified",false).put("direction_verified",false).put("order_verified",false)
    .put("message_boundary_verified",false).put("status","UNRESOLVED_OBSERVATION")

fun jsonArray(values: Iterable<JSONObject>): JSONArray = JSONArray().apply { values.forEach { put(it) } }
