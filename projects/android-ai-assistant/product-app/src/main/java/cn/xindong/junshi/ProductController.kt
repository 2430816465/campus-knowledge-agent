package cn.xindong.junshi

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import cn.xindong.core.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import org.json.JSONObject
import java.time.OffsetDateTime
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class ProductController(private val app: JunshiApp) {
    private val main=Handler(Looper.getMainLooper())
    val vault get()=app.vault
    var accounts by mutableStateOf<List<Account>>(emptyList()); private set
    var account by mutableStateOf<Account?>(null); private set
    var streamers by mutableStateOf<List<Streamer>>(emptyList()); private set
    var streamer by mutableStateOf<Streamer?>(null); private set
    var contacts by mutableStateOf<List<Conversation>>(emptyList()); private set
    var current by mutableStateOf<Conversation?>(null); private set
    var settings by mutableStateOf(AiSettings()); private set
    var status by mutableStateOf("正在打开本地加密仓库"); private set
    var busy by mutableStateOf(false); private set
    var generating by mutableStateOf(false); private set
    var result by mutableStateOf<RoundResult?>(null); private set
    var components by mutableStateOf<List<ComponentResult>>(emptyList()); private set
    var rounds by mutableStateOf<List<JSONObject>>(emptyList()); private set
    var charges by mutableStateOf<List<Charge>>(emptyList()); private set
    var monthSpent by mutableStateOf(0L); private set
    var monthLimit by mutableStateOf(100_000_000L); private set
    private var pendingWork=0
    private var ownerRevision=0L
    private fun beginWork() { pendingWork++; busy=true }
    private fun endWork() { pendingWork--; busy=pendingWork>0 }
    init {
        ReadBridge.invalidation={ invalidate() }
        work({ vault.accounts().map { it.account } }) { accounts=it; status="开发版：手机稳定性和真实AI质量尚待验收" }
    }
    private fun invalidate() { app.session.invalidate(); result=null; components=emptyList(); generating=false; ReadBridge.candidates=emptyList(); ChatReadService.current?.invalidatePanel(preserveMenu=true) }
    private fun <T> work(task: ()->T, done: (T)->Unit = {}) {
        beginWork()
        val ownerAtStart=ownerRevision
        app.io.execute {
            try { val value=task(); main.post { endWork(); if(ownerRevision==ownerAtStart) done(value) } }
            catch(e: Exception) { main.post { endWork(); if(ownerRevision==ownerAtStart) status=AnalysisEngine.safeError(e) } }
        }
    }
    fun createAccount(name: String, pin: String) = work({ vault.createAccount(name,pin.toCharArray()) }) { account=it; accounts=accounts+it; streamers=emptyList(); status="账户已创建，请建立主播档案" }
    fun unlock(a: Account, pin: String) = work({ vault.unlock(a,pin.toCharArray()); vault.streamers(a.id) }) { account=a; streamers=it; status="已解锁，请选择主播" }
    fun lock() { ownerRevision++; invalidate(); ReadBridge.select(null); ChatReadService.current?.hide(); vault.lock(); account=null; streamer=null; current=null; streamers=emptyList(); contacts=emptyList(); settings=AiSettings(); rounds=emptyList(); charges=emptyList(); status="已锁定本地账户" }
    fun createStreamer(name: String) { val a=account ?: return; work({ vault.createStreamer(a.id,name) }) { streamers=streamers+it; selectStreamer(it) } }
    fun selectStreamer(s: Streamer) {
        require(s.accountId==account?.id) { "主播不属于已解锁账户" }
        invalidate(); ReadBridge.select(null); app.session.select(null); streamer=s; current=null; contacts=emptyList(); rounds=emptyList()
        work({ vault.conversations(s) to vault.settings(s) }) { if(streamer==s) { contacts=it.first; settings=it.second; refreshFees(); status="已选择主播 ${s.name}" } }
    }
    fun createContact(name: String) { val s=streamer ?: return; work({ vault.createContact(s,name) }) { if(streamer==s) { contacts=contacts+it; selectContact(it) } } }
    fun selectContact(c: Conversation) {
        require(c.scope.accountId==account?.id && c.scope.streamerId==streamer?.id) { "观众不属于当前主播" }
        invalidate(); ReadBridge.select(c.scope,c.contact.name); app.session.select(c.scope); current=c; rounds=emptyList()
        work({ vault.rounds(c.scope) }) { if(current?.scope==c.scope) rounds=it }
    }
    fun mutate(change: (Conversation)->Conversation) {
        val scope=current?.scope ?: return; val epoch=app.session.ticket(scope).first
        work({ require(app.session.accepts(scope,epoch)) { "档案已切换，修改已取消" }; val next=change(vault.conversation(scope)).validate()
            require(app.session.accepts(scope,epoch)); vault.save(next); next }) { next ->
            if(current?.scope==scope) { invalidate(); ReadBridge.contactName=next.contact.name; current=next; contacts=contacts.map { if(it.scope==scope) next else it }; status="已保存，分析须重新点击生成" }
        }
    }
    fun importText(raw: String, kind: SourceKind = SourceKind.PASTED_TEXT) {
        if(raw.isBlank()) { status="没有可导入的文字"; return }
        mutate { c -> val batchId=newId(); val e=Evidence(scope=c.scope,batchId=batchId,kind=kind,raw=raw,sha256=sha256(raw.toByteArray()))
            val rows=HistoryImport.suggestOverlap(c.messages,if(kind==SourceKind.TEXT_FILE) HistoryImport.documentRows(raw,e.id) else HistoryImport.textRows(raw,e.id))
            c.copy(evidence=c.evidence+e,batches=c.batches+ImportBatch(batchId,c.scope,rows,listOf(e.id))) }
    }
    fun importTextFile(uri: Uri) {
        val scope=current?.scope ?: return
        work({
            val raw=app.contentResolver.openInputStream(uri)?.use { input ->
                val bytes=input.readBytesBounded(16*1024*1024)
                Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString().removePrefix("\uFEFF")
            } ?: error("无法打开授权文字文件"); require(raw.isNotBlank()); raw
        }) { if(current?.scope==scope) importText(it,SourceKind.TEXT_FILE) }
    }
    fun importCapture() {
        val capture=ReadBridge.preview ?: return; if(current?.scope!=capture.scope) { status="读取归属与当前档案不同，请重新读取"; return }
        mutate { c ->
            val blob=vault.saveBytes(c.scope,capture.png); val batchId=newId()
            val e=Evidence(scope=c.scope,batchId=batchId,kind=SourceKind.CLICK_OCR,raw=capture.text,sha256=sha256(capture.png),blobId=blob,createdAt=capture.at)
            val rows=HistoryImport.suggestOverlap(c.messages,HistoryImport.textRows(capture.text,e.id))
            c.copy(evidence=c.evidence+e,batches=c.batches+ImportBatch(batchId,c.scope,rows,listOf(e.id),gaps=capture.detail))
        }; ReadBridge.consumedId=capture.id; ReadBridge.preview=null
    }
    fun setAutoRead(enabled: Boolean) {
        if(enabled && (current==null || ChatReadService.current==null)) { status="请先选择观众并在系统设置授权读取服务"; return }
        ReadBridge.autoRead=enabled
        ChatReadService.current?.autoModeChanged()
        status=if(enabled) "本次档案的前台自动读取已开启；OCR须核对，确认最新消息后自动分析" else "前台自动读取已暂停"
    }
    fun confirmLatest(review: LatestReview, capture: Captured? = null) {
        if(busy || generating) return
        val scope=current?.scope ?: return
        if(review.scope!=scope || (capture!=null && (ReadBridge.preview?.id!=capture.id || capture.scope!=scope || review.observationId!=capture.id))) {
            status="读取或档案已变化，请重新核对"; return
        }
        val epoch=app.session.ticket(scope).first
        work({
            require(app.session.accepts(scope,epoch)) { "档案或页面已改变，本次确认取消" }
            val old=vault.conversation(scope)
            // Validate the entire review and reject duplicates before saving any screenshot blob.
            LatestIntake.validate(old,review)
            val blob=capture?.let { vault.saveBytes(scope,it.png) }
            val pair=LatestIntake.append(old,review,capture?.text ?: review.bodies.joinToString("\n"),blob,
                capture?.let { sha256(it.png) } ?: sha256(review.bodies.joinToString("\n").toByteArray()),capture?.at ?: System.currentTimeMillis())
            require(app.session.accepts(scope,epoch)) { "档案或页面已改变，本次确认取消" }
            vault.save(pair.first); pair
        }) { (next,target) ->
            if(current?.scope==scope && app.session.accepts(scope,epoch)) {
                invalidate(); current=next; contacts=contacts.map { if(it.scope==scope) next else it }
                if(capture!=null && ReadBridge.preview?.id==capture.id) { ReadBridge.consumedId=capture.id; ReadBridge.preview=null }
                ReadBridge.status="最新消息已核对入库；正在核验模型与费用配置"
                generate("结合全部已确认历史与档案，针对reply_target中的最新对方消息提供适合主播口吻的回复；缺口明确说明，允许不回复。",target)
            }
        }
    }
    fun importMedia(uris: List<Uri>, screenshot: Boolean) {
        val scope=current?.scope ?: return; val ticket=app.session.ticket(scope)
        beginWork()
        app.io.execute {
            val recognizer=if(screenshot) TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build()) else null
            try {
                var c=vault.conversation(scope); val batchId=newId(); val es=mutableListOf<Evidence>(); val rows=mutableListOf<DraftRow>(); val media=mutableListOf<MediaAsset>()
                uris.forEachIndexed { index,uri ->
                    ticket.second.check(); require(app.session.accepts(scope,ticket.first))
                    val blob=vault.importBlob(scope,uri); val mime=app.contentResolver.getType(uri) ?: "application/octet-stream"
                    val name=app.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use { if(it.moveToFirst()) it.getString(0) else null } ?: "材料${index+1}"
                    val eId=newId(); var raw="授权媒体：$name；类型：$mime；内容未知，须人工完整描述/转写"
                    if(screenshot) {
                        require(mime.startsWith("image/")) { "截图导入仅接受图片；请改用媒体入口" }
                        val bounds=android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds=true }
                        app.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it,null,bounds) }
                        require(bounds.outWidth>0 && bounds.outHeight>0) { "图片格式无效" }
                        var sample=1; while(bounds.outWidth/sample>2560 || bounds.outHeight/sample>2560) sample*=2
                        val bitmap=app.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it,null,android.graphics.BitmapFactory.Options().apply { inSampleSize=sample }) } ?: error("图片解码失败")
                        val task=recognizer!!.process(InputImage.fromBitmap(bitmap,0)).addOnCompleteListener { bitmap.recycle() }
                        raw=com.google.android.gms.tasks.Tasks.await(task,40,java.util.concurrent.TimeUnit.SECONDS).text
                        require(raw.isNotBlank()) { "第${index+1}张未取得文字；本批未提交，可改用媒体入口人工校对" }
                    }
                    val asset=MediaAsset(scope=scope,blobId=blob.id,mime=mime,originalName=name,sha256=blob.sha256)
                    media.add(asset)
                    es.add(Evidence(eId,scope,batchId,if(screenshot) SourceKind.SCREENSHOT_OCR else SourceKind.MEDIA,raw,asset.sha256,blob.id))
                    if(screenshot) rows.addAll(HistoryImport.suggestDraftOverlap(rows,HistoryImport.textRows(raw,eId).map { it.copy(mediaIds=listOf(asset.id)) })) else rows.add(DraftRow(body=raw,evidenceIds=listOf(eId),mediaIds=listOf(asset.id),kind=when { mime.startsWith("audio/") -> Kind.VOICE; mime.startsWith("video/") -> Kind.VIDEO; mime.startsWith("image/") -> Kind.IMAGE; else -> Kind.OTHER }))
                }
                ticket.second.check(); require(app.session.accepts(scope,ticket.first))
                c=c.copy(evidence=c.evidence+es,media=c.media+media,batches=c.batches+ImportBatch(batchId,scope,HistoryImport.suggestOverlap(c.messages,rows),es.map { it.id }))
                vault.save(c.validate()); val finished=c
                main.post { endWork(); if(current?.scope==scope) { invalidate(); ReadBridge.candidates=emptyList(); current=finished; contacts=contacts.map { if(it.scope==scope) finished else it }; status="已保存${uris.size}份原件和待校对批次；时间顺序/说话人必须核对" } }
            } catch(e: Exception) { runCatching { vault.purgeUnreferencedBlobs(vault.conversation(scope)) }; main.post { endWork(); status=AnalysisEngine.safeError(e) } }
            finally { recognizer?.close() }
        }
    }
    fun updateBatch(batch: ImportBatch) = mutate { c -> require(c.batches.single { it.id==batch.id }.committed==false); c.copy(batches=c.batches.map { if(it.id==batch.id) batch else it }) }
    fun commitBatch(batch: ImportBatch) = mutate { c -> HistoryImport.commit(c,batch) }
    fun actualSent(text: String) = mutate { c ->
        require(text.isNotBlank()); val e=Evidence(scope=c.scope,batchId=newId(),kind=SourceKind.MANUAL,raw=text,sha256=sha256(text.toByteArray()))
        c.copy(evidence=c.evidence+e,messages=c.messages+Message(scope=c.scope,order=(c.messages.maxOfOrNull { it.order } ?: 0)+1,
            speaker=Speaker.STREAMER,body=text,time=OffsetDateTime.now().toString(),evidenceIds=listOf(e.id),actualSent=true))
    }
    fun saveSettings(next: AiSettings) { val s=streamer ?: return; work({ vault.saveSettings(s,next) }) { if(streamer==s) { settings=next; invalidate(); status="模型设置已保存，下次生成采用新配置" } } }
    fun generate(query: String, replyTarget: ReplyTarget? = current?.let { ReplyTarget.lastReviewed(it) }) {
        if(generating || busy) return
        val c=current ?: return; val s=streamer ?: return; val config=settings
        app.session.invalidate(); val ticket=app.session.ticket(c.scope); generating=true; result=null; components=emptyList(); ReadBridge.candidates=emptyList()
        status="核验配置和全部可用历史，尚未得到AI结果"
        val auditId=newId(); val events=mutableListOf<JSONObject>()
        app.ai.execute {
            try {
                val own=vault.conversations(s)
                vault.assertOriginals(c)
                val engine=AnalysisEngine(HttpGateway(),vault.budget,SkillLibrary.bundled())
                val round=engine.run(c,s,own,config,query,ticket.second,progress={ message ->
                    main.post { if(app.session.accepts(c.scope,ticket.first)) status=message }
                },component={ state ->
                    events.add(JSONObject().put("name",state.name).put("state",state.state).put("model",state.model).put("detail",state.detail).put("diagnostic",state.diagnostic ?: JSONObject.NULL).put("at",System.currentTimeMillis()))
                    main.post { if(app.session.accepts(c.scope,ticket.first)) components=components.filterNot { it.name==state.name }+state }
                },replyTarget=replyTarget)
                ticket.second.check(); require(app.session.accepts(c.scope,ticket.first))
                vault.saveRound(round)
                main.post { if(app.session.accepts(c.scope,ticket.first)) { result=round; generating=false; ReadBridge.candidates=round.analysis.candidates; status="分析完成；候选尚未发送，完整报告可展开"; refreshRounds(); refreshFees() } }
            } catch(e: Exception) {
                val error=AnalysisEngine.safeError(e)
                runCatching { vault.saveAudit(c.scope,auditId,JSONObject().put("state","FAILED_OR_CANCELLED").put("scope",c.scope.json()).put("error",error).put("events",arr(events))) }
                main.post { if(app.session.accepts(c.scope,ticket.first)) { status=error; generating=false; refreshFees() } }
            }
        }
    }
    fun cancel() { invalidate(); ReadBridge.candidates=emptyList(); status="已取消；网络中断前可能产生费用，请在费用页核对" }
    private fun refreshRounds() { val scope=current?.scope ?: return; work({ vault.rounds(scope) }) { if(current?.scope==scope) rounds=it } }
    fun refreshFees() { val s=streamer ?: return; work({ val ledger=vault.budget; val month=Costing.month(System.currentTimeMillis()); Triple(ledger.entries().filter { it.owner==s.accountId+"/"+s.id },ledger.spent(month),ledger.limit(month)) }) { if(streamer==s) { charges=it.first; monthSpent=it.second; monthLimit=it.third } } }
    fun continueBudget() = work({ vault.budget.confirmAnotherHundred(Costing.month(System.currentTimeMillis())) }) { refreshFees(); status="已明确确认本月再增加100元额度" }
    fun reconcile(charge: Charge, yuan: String) = work({ vault.budget.reconcile(charge.id,yuan.toBigDecimal().multiply(java.math.BigDecimal(1_000_000)).longValueExact()) }) { refreshFees() }
    fun recordExternal(yuan: String, note: String) {
        val s=streamer ?: return
        work({ vault.budget.recordExternal(s.accountId+"/"+s.id,yuan.toBigDecimal().multiply(java.math.BigDecimal(1_000_000)).longValueExact(),note) }) { refreshFees(); status="已计入本设备月度提醒；请勿重复计入同一账单" }
    }
    fun deleteCurrent() { val scope=current?.scope ?: return; invalidate(); work({ vault.deleteConversation(scope) }) { if(current?.scope==scope) { current=null; ReadBridge.select(null); app.session.select(null); contacts=contacts.filterNot { it.scope==scope }; rounds=emptyList(); status="观众档案、报告及关联媒体已删除" } } }
    fun deleteAccount() { val a=account ?: return; invalidate(); work({ vault.deleteAccount(a) }) { accounts=accounts.filterNot { it.id==a.id }; lock(); status="本地账户及主播资料已删除；设备费用台账保留用于防止重复花费" } }
    fun export(scope: Scope, uri: Uri) = work({
        val c=vault.conversation(scope)
        app.contentResolver.openOutputStream(uri,"w")?.use { output -> ZipOutputStream(output).use { zip ->
            zip.putNextEntry(ZipEntry("conversation.json")); zip.write(c.json().toString(2).toByteArray()); zip.closeEntry()
            (c.evidence.mapNotNull { it.blobId }+c.media.map { it.blobId }).distinct().forEach { id -> zip.putNextEntry(ZipEntry("media/$id")); vault.blobStream(scope,id).use { it.copyTo(zip) }; zip.closeEntry() }
            vault.rounds(scope).forEach { round -> zip.putNextEntry(ZipEntry("rounds/${round.getString("id")}.json")); zip.write(round.toString(2).toByteArray()); zip.closeEntry() }
        } } ?: error("无法写入选择的导出位置")
    }) { status="已导出本观众的原始材料、历史及分析报告；该ZIP含明文，请自行保管" }
}
fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
    val out=java.io.ByteArrayOutputStream(); val buffer=ByteArray(8192); var total=0
    while(true) { val n=read(buffer); if(n<0) break; total+=n; require(total<=limit) { "文件超过导入容量；未截断" }; out.write(buffer,0,n) }; return out.toByteArray()
}
