package cn.xindong.junshi

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import cn.xindong.core.*
import org.json.JSONObject
import java.util.Locale

class MainActivity: ComponentActivity() {
    private var sharedText by mutableStateOf<String?>(null)
    private var reviewRequest by mutableIntStateOf(0)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); receive(intent)
        setContent {
            MaterialTheme(colorScheme=lightColorScheme(primary=Color(0xFF12635B),secondary=Color(0xFF7B5143),background=Color(0xFFF6F7F3),surface=Color.White)) {
                Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background) {
                    ProductScreen((application as JunshiApp).controller,sharedText,reviewRequest) { sharedText=null }
                }
            }
        }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); receive(intent) }
    private fun receive(intent: Intent?) {
        if(intent?.action==Intent.ACTION_SEND && intent.type=="text/plain") sharedText=intent.getStringExtra(Intent.EXTRA_TEXT)
        if(intent?.getBooleanExtra("review_latest",false)==true) { reviewRequest++; intent.removeExtra("review_latest") }
    }
}
@Composable private fun Field(label: String, value: String, change: (String)->Unit, secret: Boolean=false, lines: Int=1) {
    OutlinedTextField(value,change,label={ Text(label) },modifier=Modifier.fillMaxWidth(),minLines=lines,maxLines=if(secret) 1 else maxOf(lines,8),
        visualTransformation=if(secret) PasswordVisualTransformation() else VisualTransformation.None,singleLine=secret,
        keyboardOptions=if(secret) KeyboardOptions(keyboardType=KeyboardType.Password,autoCorrectEnabled=false) else KeyboardOptions.Default)
}
@Composable private fun Check(label: String, value: Boolean, change: (Boolean)->Unit) {
    Row(Modifier.fillMaxWidth().clickable { change(!value) },horizontalArrangement=Arrangement.spacedBy(4.dp)) { Checkbox(value,change); Text(label,Modifier.padding(top=12.dp)) }
}
@Composable private fun Actions(content: @Composable RowScope.()->Unit) { Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp),content=content) }
@Composable private fun BoxCard(title: String, content: @Composable ColumnScope.()->Unit) {
    Card(Modifier.fillMaxWidth(),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) { Text(title,fontWeight=FontWeight.SemiBold,style=MaterialTheme.typography.titleMedium); content() }
    }
}
@Composable private fun <T> Pick(label: String, values: List<T>, selected: T?, name: (T)->String, choose: (T)->Unit) {
    var open by remember { mutableStateOf(false) }
    Box { OutlinedButton(onClick={ open=true }) { Text(label+"："+(selected?.let(name) ?: "请选择")) }
        DropdownMenu(open,{ open=false }) { values.forEach { value -> DropdownMenuItem(text={ Text(name(value)) },onClick={ choose(value); open=false }) } }
    }
}
@Composable private fun AskName(title: String, withPin: Boolean=false, close: ()->Unit, submit: (String,String)->Unit) {
    var name by remember { mutableStateOf("") }; var pin by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest=close,title={ Text(title) },text={ Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Field("名称",name,{ name=it }); if(withPin) Field("本地账户口令（至少6位，请自行保管）",pin,{ pin=it },secret=true)
    } },confirmButton={ TextButton(onClick={ submit(name,pin); pin=""; close() },enabled=name.isNotBlank() && (!withPin || pin.length>=6)) { Text("创建") } },dismissButton={ TextButton(onClick=close) { Text("取消") } })
}
@Composable private fun ProductScreen(c: ProductController, shared: String?, reviewRequest: Int, sharedDone: ()->Unit) {
    val context=LocalContext.current
    var page by remember { mutableStateOf("军师") }; var dialog by remember { mutableStateOf("") }
    LaunchedEffect(reviewRequest) { if(reviewRequest>0) page="军师" }
    var unlockAccount by remember { mutableStateOf<Account?>(null) }
    var exportScope by remember { mutableStateOf<Scope?>(null) }
    val textFile=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let(c::importTextFile) }
    val screenshots=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { if(it.isNotEmpty()) c.importMedia(it,true) }
    val media=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { if(it.isNotEmpty()) c.importMedia(it,false) }
    val export=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri -> val scope=exportScope; if(uri!=null && scope!=null) c.export(scope,uri); exportScope=null }
    LazyColumn(Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal=16.dp),verticalArrangement=Arrangement.spacedBy(12.dp),contentPadding=PaddingValues(top=24.dp,bottom=40.dp)) {
        item { Column { Text("心动军师",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold); Text("你的语气，你来决定",color=MaterialTheme.colorScheme.primary) } }
        item { BoxCard("研发版 · 0.3.2") {
            Text(c.status); if(c.busy || c.generating) LinearProgressIndicator(Modifier.fillMaxWidth())
            Text("首次在历史页提供聊天记录；后续可开启微信前台自动读取。核对对方最新消息后自动分析，缺失历史明确提示。手机稳定性与真实AI质量尚待验收。",style=MaterialTheme.typography.bodySmall)
        } }
        if(c.account==null) {
            item { BoxCard("本地账户") {
                Text("不同账户须各自解锁；同名观众始终使用独立档案。口令无法找回，卸载会删除设备内数据。")
                c.accounts.forEach { a -> OutlinedButton(onClick={ unlockAccount=a },Modifier.fillMaxWidth(),enabled=!c.busy) { Text("解锁 ${a.name}") } }
                Button(onClick={ dialog="account" },enabled=!c.busy) { Text("创建本地账户") }
            } }
        } else {
            item { BoxCard("${c.account!!.name} · 主播与观众") {
                Actions { Pick("主播",c.streamers,c.streamer,{ it.name },c::selectStreamer); OutlinedButton(onClick={ dialog="streamer" }) { Text("新建主播") }; TextButton(onClick=c::lock) { Text("锁定账户") } }
                if(c.streamer!=null) Actions { Pick("观众",c.contacts,c.current,{ it.contact.name+" · "+it.scope.contactId.take(6) },c::selectContact); OutlinedButton(onClick={ dialog="contact" }) { Text("新建观众") } }
                Text("请核对当前微信身份；昵称不会用于自动合并。",style=MaterialTheme.typography.bodySmall)
            } }
            if(c.streamer!=null) {
                item { Actions { listOf("军师","历史","档案","模型","费用").forEach { name -> if(page==name) Button(onClick={ page=name }) { Text(name) } else OutlinedButton(onClick={ page=name; if(name=="费用") c.refreshFees() }) { Text(name) } } } }
                if(page=="模型") item { ModelSettings(c) }
                else if(page=="费用") item { FeeSettings(c) }
                else if(c.current==null) item { BoxCard("先选择观众") { Text("新观众可以没有标签。创建档案后，导入并校对真实材料即可开始。") } }
                else {
                    val scope=c.current!!.scope
                    if(page=="军师") item { key(scope) { Advisor(c) } }
                    if(page=="历史") item { key(scope) { HistoryScreen(c,{ textFile.launch(arrayOf("text/*","application/json")) },{ screenshots.launch(arrayOf("image/*")) },{ media.launch(arrayOf("image/*","audio/*","video/*","application/octet-stream")) }) } }
                    if(page=="档案") item { key(scope) { ProfileScreen(c) } }
                    item { Actions {
                        OutlinedButton(onClick={ dialog="export" },enabled=!c.busy) { Text("导出本观众完整资料") }
                        TextButton(onClick={ dialog="delete-contact" },enabled=!c.busy && !c.generating) { Text("删除此观众") }
                    } }
                }
                item { Actions {
                    OutlinedButton(onClick={ context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }) { Text("授权前台读取") }
                    OutlinedButton(onClick={ ChatReadService.current?.show() ?: run { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) } }) { Text("显示悬浮球") }
                    TextButton(onClick={ ChatReadService.current?.hide() }) { Text("隐藏悬浮球") }
                } }
            }
            item { TextButton(onClick={ dialog="delete-account" },enabled=!c.busy && !c.generating) { Text("删除当前本地账户及全部主播资料") } }
        }
        item { Text("工具不会自动填写或发送微信。模型输出需要本人判断；已确认的原文可在历史页回查。",style=MaterialTheme.typography.bodySmall) }
    }
    if(dialog in listOf("account","streamer","contact")) AskName(when(dialog) { "account" -> "创建本地账户"; "streamer" -> "创建主播"; else -> "创建独立观众档案" },dialog=="account",{ dialog="" }) { name,pin -> when(dialog) { "account" -> c.createAccount(name,pin); "streamer" -> c.createStreamer(name); else -> c.createContact(name) } }
    unlockAccount?.let { a ->
        var pin by remember(a) { mutableStateOf("") }
        AlertDialog(onDismissRequest={ unlockAccount=null },title={ Text("解锁 ${a.name}") },text={ Field("账户口令",pin,{ pin=it },secret=true) },
            confirmButton={ TextButton(onClick={ c.unlock(a,pin); pin=""; unlockAccount=null },enabled=pin.length>=6) { Text("解锁") } },dismissButton={ TextButton(onClick={ unlockAccount=null }) { Text("取消") } })
    }
    if(dialog in listOf("delete-contact","delete-account","export")) {
        AlertDialog(onDismissRequest={ dialog="" },title={ Text(if(dialog=="export") "导出本观众资料" else "确认删除") },
            text={ Text(if(dialog=="export") "ZIP包含本观众原始媒体、聊天及报告的明文。请选择自己的保存位置并妥善保管；模型密钥不会导出。" else "删除后无法撤销。聊天、原始材料和分析记录将从本应用删除；已导出的文件由你自行管理。") },
            confirmButton={ TextButton(onClick={ when(dialog) { "delete-contact" -> c.deleteCurrent(); "delete-account" -> c.deleteAccount(); "export" -> { exportScope=c.current?.scope; export.launch("xindong-${exportScope?.contactId}.zip") } }; dialog="" }) { Text(if(dialog=="export") "选择位置并导出" else "确认删除") } },
            dismissButton={ TextButton(onClick={ dialog="" }) { Text("取消") } })
    }
    if(shared!=null && c.current!=null) AlertDialog(onDismissRequest=sharedDone,title={ Text("导入分享文字至 ${c.current!!.contact.name}") },text={ Text("确认这份材料属于当前观众。导入后仍需逐条校对；不会直接发送给AI。") },confirmButton={ TextButton(onClick={ c.importText(shared); sharedDone(); page="历史" }) { Text("导入待校对区") } },dismissButton={ TextButton(onClick=sharedDone) { Text("取消") } })
}

@Composable private fun Advisor(c: ProductController) {
    val context=LocalContext.current; val conversation=c.current ?: return
    var query by remember { mutableStateOf("请根据全部可用历史判断现在是否需要回复，提供适合我的口吻的候选。") }
    var draft by remember { mutableStateOf<List<String>>(emptyList()) }
    var actual by remember { mutableStateOf("") }; var actualConfirmed by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf(false) }; var identity by remember { mutableStateOf(false) }
    LaunchedEffect(c.result?.id) { if(c.result==null) { draft=emptyList(); expanded=false } }
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        BoxCard("${conversation.contact.name} · 当前材料") {
            Text("已确认 ${conversation.messages.size} 条；待校对 ${conversation.batches.count { !it.committed }} 批；媒体 ${conversation.media.size} 份")
            Text("历史缺口：${conversation.contact.gaps}")
            Text(ReadBridge.status,style=MaterialTheme.typography.bodySmall)
            ReadBridge.preview?.takeIf { it.scope==conversation.scope }?.let { capture ->
                SelectionContainer { Text(capture.text) }
                Check("我确认当前读取属于这个观众；稍后逐条核对说话人、正文、顺序",identity,{ identity=it })
                Button(onClick={ c.importCapture(); identity=false },enabled=identity && !c.busy) { Text("加入待校对批次") }
                TextButton(onClick={ ReadBridge.consumedId=capture.id; ReadBridge.preview=null }) { Text("丢弃本次读取") }
            }
        }
        LatestMessageCard(c)
        BoxCard("主动分析") {
            Field("本轮需求",query,{ query=it },lines=2)
            Text("Jev ${if(c.settings.jevEnabled) "开" else "关"} · 狗头军师 ${if(c.settings.goutouEnabled) "开" else "关"} · 恋爱大师 ${if(c.settings.lianaiEnabled) "开" else "关"}")
            Actions { Button(onClick={ draft=emptyList(); c.generate(query) },enabled=!c.busy && !c.generating && conversation.messages.isNotEmpty()) { Text("分析并生成候选") }; if(c.generating) OutlinedButton(onClick=c::cancel) { Text("取消本轮") } }
            c.components.forEach { Text("${it.name}：${it.state}${if(it.detail.isBlank()) "" else " · "+it.detail}",style=MaterialTheme.typography.bodySmall) }
        }
        c.result?.let { round ->
            BoxCard(if(round.analysis.noReply) "建议暂不回复" else "候选回复") {
                if(round.analysis.noReply) Text(round.analysis.noReplyReason)
                round.analysis.candidates.forEachIndexed { index,candidate ->
                    Text("${index+1}. ${candidate.style}",fontWeight=FontWeight.Bold)
                    candidate.segments.forEachIndexed { i,text -> SelectionContainer { Text("${i+1}｜$text") } }
                    Text(candidate.rationale); if(candidate.risks.isNotEmpty()) Text("风险："+candidate.risks.joinToString("；"))
                    Text("模型自评（非人工验收）：自然${candidate.scores["natural"]} / 口吻${candidate.scores["style_fit"]} / 分段${candidate.scores["segmentation"]} / 长度${candidate.scores["length_fit"]} / 历史${candidate.scores["context_fit"]}",style=MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick={ draft=candidate.segments }) { Text("选择并编辑") }
                    HorizontalDivider()
                }
                TextButton(onClick={ expanded=!expanded }) { Text(if(expanded) "收起军师分析" else "展开完整军师分析") }
                if(expanded) ReportView(c,round.json())
                Text("提交覆盖：${round.coverage.processedMessages}/${round.coverage.availableMessages} 条 · ${round.coverage.mode}；摘要语义完整性需人工核验。",style=MaterialTheme.typography.bodySmall)
                round.analysis.raw.objects("suggested_tags").forEach { t -> OutlinedButton(onClick={ c.mutate { old -> old.copy(tags=old.tags+Tag(scope=old.scope,text=t.getString("text"),origin="AI_CONFIRMED_BY_USER",confirmed=true,evidenceMessageIds=t.strings("evidence_ids"))) } }) { Text("确认标签：${t.getString("text")}") } }
            }
        }
        if(draft.isNotEmpty()) BoxCard("你的草稿 · 尚未发送") {
            draft.forEachIndexed { index,text ->
                Field("第${index+1}条",text,{ value -> draft=draft.mapIndexed { i,s -> if(i==index) value else s } },lines=2)
                Actions { OutlinedButton(onClick={ context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("军师草稿",draft[index])) }) { Text("复制这一条") }; TextButton(onClick={ draft=draft.filterIndexed { i,_ -> i!=index } }) { Text("移除") } }
            }
            TextButton(onClick={ draft=draft+"" }) { Text("增加一条") }
        }
        BoxCard("记录实际发送内容") {
            Text("请在微信本人发送后，粘贴最终文字。一次记录一条实际消息；选中或复制候选不会进入学习。")
            Field("微信已发送的最终原文",actual,{ actual=it; actualConfirmed=false },lines=2)
            Check("我已实际发送这条文字，并确认内容与记录一致",actualConfirmed,{ actualConfirmed=it })
            Button(onClick={ c.actualSent(actual); actual=""; actualConfirmed=false },enabled=actualConfirmed && actual.isNotBlank() && !c.busy && !c.generating) { Text("确认记录并学习") }
        }
        if(c.rounds.isNotEmpty()) BoxCard("已保存的分析") {
            var chosen by remember { mutableStateOf<JSONObject?>(null) }
            Pick("历史报告",c.rounds,chosen,{ java.time.Instant.ofEpochMilli(it.getLong("startedAt")).toString()+" · "+it.getString("model") },{ chosen=it })
            chosen?.let { ReportView(c,it) }
        }
    }
}

@Composable private fun LatestMessageCard(c: ProductController) {
    val conversation=c.current ?: return; val context=LocalContext.current
    val capture=ReadBridge.preview?.takeIf { it.scope==conversation.scope }
    val reviewKey=capture?.id ?: ("paste-"+(conversation.messages.maxOfOrNull { it.order } ?: 0))
    var observation by remember(reviewKey) { mutableStateOf(capture?.id ?: newId()) }
    var bodies by remember(reviewKey) { mutableStateOf(listOf("")) }
    var identity by remember(reviewKey) { mutableStateOf(false) }
    var incoming by remember(reviewKey) { mutableStateOf(false) }
    var latest by remember(reviewKey) { mutableStateOf(false) }
    BoxCard("最新消息 → 回复建议") {
        Check("本次档案开启微信前台自动读取",ReadBridge.autoRead,c::setAutoRead)
        Text("打开微信聊天或可见内容变化后读取一屏；切换档案、锁屏或撤权会暂停。识别可能包含控件和旧消息，请核对最新消息。",style=MaterialTheme.typography.bodySmall)
        Text(if(capture==null) "没有待核对读屏，可在下面粘贴对方最新原文。" else "已有${if(capture.automatic) "自动" else "手动"}读取，原文在上方。请提取并修正对方最新消息，每条单独填写。")
        bodies.forEachIndexed { i,body ->
            Field("对方最新消息 ${i+1}（原文）",body,{ value -> bodies=bodies.mapIndexed { j,s -> if(i==j) value else s }; incoming=false; latest=false },lines=2)
            if(bodies.size>1) TextButton(onClick={ bodies=bodies.filterIndexed { j,_ -> i!=j }; incoming=false; latest=false }) { Text("移除第${i+1}条") }
        }
        Actions {
            OutlinedButton(onClick={
                val clipboard=context.getSystemService(ClipboardManager::class.java)
                val text=clipboard.primaryClip?.takeIf { it.itemCount>0 }?.getItemAt(0)?.text?.toString()
                if(!text.isNullOrBlank()) { bodies=bodies.dropLast(1)+text; incoming=false; latest=false }
            }) { Text("粘贴到最后一条") }
            TextButton(onClick={ bodies=bodies+""; incoming=false; latest=false }) { Text("增加对方连发消息") }
        }
        Check("确属当前观众 ${conversation.contact.name}，不是群聊或其他会话",identity,{ identity=it })
        Check("以上每条都是对方原文，已修正错字；没有主播文字或界面控件",incoming,{ incoming=it })
        Check("这是按顺序排列的最新未回复消息，尚未入库；相同文字也确为新的一次发送",latest,{ latest=it })
        Button(onClick={ c.confirmLatest(LatestReview(observation,conversation.scope,bodies,identity,incoming,latest,latest),capture) },
            enabled=identity && incoming && latest && bodies.all { it.isNotBlank() } && !c.busy && !c.generating) { Text("确认最新消息并自动分析") }
        Text("确认后使用本观众全部已确认历史、档案及当前开启的组件；须先在模型页配置接口和云端授权。失败不会自动反复调用。",style=MaterialTheme.typography.bodySmall)
        TextButton(onClick={ if(capture!=null) { ReadBridge.consumedId=capture.id; ReadBridge.preview=null }; observation=newId(); bodies=listOf(""); identity=false; incoming=false; latest=false }) { Text("清空本次核对") }
    }
}

@Composable private fun HistoryScreen(c: ProductController, textFile: ()->Unit, screenshots: ()->Unit, media: ()->Unit) {
    val conversation=c.current ?: return; var paste by remember { mutableStateOf("") }; var batchId by remember { mutableStateOf<String?>(null) }
    var page by remember { mutableIntStateOf(0) }; var editId by remember { mutableStateOf<String?>(null) }
    var evidence by remember { mutableStateOf<Evidence?>(null) }
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        BoxCard("授权导入") {
            Text("截图按系统返回顺序加入，必须人工核对为从旧到新。重复内容只提供重叠建议，由你决定是否跳过。")
            Actions { OutlinedButton(onClick=textFile,enabled=!c.busy) { Text("文字文件") }; OutlinedButton(onClick=screenshots,enabled=!c.busy) { Text("批量截图OCR") }; OutlinedButton(onClick=media,enabled=!c.busy) { Text("图片/语音/视频/表情原件") } }
            Field("微信复制文字或逐行消息；可用 时间<TAB>主播/观众<TAB>TEXT<TAB>正文",paste,{ paste=it },lines=3)
            Button(onClick={ c.importText(paste); paste="" },enabled=paste.isNotBlank() && !c.busy) { Text("导入待校对区") }
        }
        BoxCard("批次与来源") {
            conversation.batches.forEach { b -> OutlinedButton(onClick={ batchId=b.id },enabled=!b.committed) { Text("${b.id.take(6)} · ${b.rows.size}行 · ${if(b.committed) "已确认" else "待校对"}") } }
            batchId?.let { id -> conversation.batches.firstOrNull { it.id==id && !it.committed }?.let { batch -> key(batch.id) { BatchEditor(c,batch) { batchId=null } } } }
        }
        BoxCard("全部已确认历史 · ${conversation.messages.size}条") {
            val sorted=conversation.messages.sortedBy { it.order }; val pages=maxOf(1,(sorted.size+19)/20); page=page.coerceIn(0,pages-1)
            OutlinedButton(onClick={ c.mutate { old -> old.copy(messages=old.messages.sortedWith(compareBy<Message> { java.time.OffsetDateTime.parse(it.time).toInstant() }.thenBy { it.order }).mapIndexed { i,m -> m.copy(order=i+1L) }) } },enabled=sorted.isNotEmpty() && sorted.all { it.time.isNotBlank() && HistoryImport.validTime(it.time) } && !c.busy) { Text("按全部已核对时间整理顺序") }
            Actions { TextButton(onClick={ page-- },enabled=page>0) { Text("上一页") }; Text("${page+1}/$pages",Modifier.padding(top=14.dp)); TextButton(onClick={ page++ },enabled=page<pages-1) { Text("下一页") } }
            sorted.drop(page*20).take(20).forEach { m ->
                Text("#${m.order} ${if(m.speaker==Speaker.STREAMER) "主播" else "观众"} · ${m.time.ifBlank { "时间未知" }} · ${m.kind}",fontWeight=FontWeight.Bold)
                SelectionContainer { Text(m.body) }
                Text("ID ${m.id} · 修订${m.revision} · ${if(m.actualSent) "主播已发送确认" else "观众材料"}",style=MaterialTheme.typography.bodySmall)
                if(m.actualSent && m.speaker==Speaker.STREAMER && m.kind in listOf(Kind.TEXT,Kind.EMOJI)) TextButton(onClick={ c.mutate { old -> old.copy(messages=old.messages.map { if(it.id==m.id) it.copy(styleExample=!it.styleExample) else it }) } },enabled=!c.busy) { Text(if(m.styleExample) "移出精选风格示例" else "选为本观众的风格示例") }
                Actions { TextButton(onClick={ editId=m.id }) { Text("校正") }; m.evidenceIds.forEachIndexed { index,id -> TextButton(onClick={ evidence=conversation.evidence.single { it.id==id } }) { Text("来源${index+1}") } }
                    TextButton(onClick={ c.mutate { old -> val list=old.messages.sortedBy { it.order }; val i=list.indexOfFirst { it.id==m.id }; require(i>0); val before=list[i-1]; old.copy(messages=old.messages.map { when(it.id) { m.id -> it.copy(order=before.order); before.id -> it.copy(order=m.order); else -> it } }) } },enabled=sorted.firstOrNull()?.id!=m.id && !c.busy) { Text("上移") }
                }; HorizontalDivider()
            }
        }
        if(conversation.media.isNotEmpty()) BoxCard("媒体原件与完整描述/转写") {
            conversation.media.forEach { asset -> key(asset.id) { MediaEditor(c,asset) } }
        }
    }
    editId?.let { id -> conversation.messages.firstOrNull { it.id==id }?.let { m ->
        var body by remember(id) { mutableStateOf(m.body) }; var speaker by remember(id) { mutableStateOf(m.speaker) }; var time by remember(id) { mutableStateOf(m.time) }
        AlertDialog(onDismissRequest={ editId=null },title={ Text("校正消息，原始证据保留") },text={ Column { Field("正文",body,{ body=it },lines=3); Pick("说话人",listOf(Speaker.STREAMER,Speaker.CONTACT),speaker,{ it.name },{ speaker=it }); Field("ISO时间；未知留空",time,{ time=it }) } },
            confirmButton={ TextButton(onClick={ c.mutate { old -> old.copy(messages=old.messages.map { if(it.id==id) it.copy(body=body,speaker=speaker,time=time,actualSent=speaker==Speaker.STREAMER,revision=it.revision+1,correctedFrom=JSONObject().put("previous_body",it.body).put("previous_speaker",it.speaker.name).put("previous_time",it.time).put("previous_revision_chain",it.correctedFrom).toString(),reviewedAt=System.currentTimeMillis()) else it }) }; editId=null },enabled=body.isNotBlank() && HistoryImport.validTime(time)) { Text("已核对，保存校正") } },dismissButton={ TextButton(onClick={ editId=null }) { Text("取消") } })
    } }
    evidence?.let { e -> AlertDialog(onDismissRequest={ evidence=null },title={ Text("原始来源 · ${e.kind}") },text={ Column { SelectionContainer { Text(e.raw) }; Text("SHA256 ${e.sha256}",style=MaterialTheme.typography.bodySmall); e.blobId?.let { SourceImage(c,e.scope,it) } } },confirmButton={ TextButton(onClick={ evidence=null }) { Text("关闭") } }) }
}

@Composable private fun BatchEditor(c: ProductController, original: ImportBatch, close: ()->Unit) {
    var batch by remember { mutableStateOf(original) }; var page by remember { mutableIntStateOf(0) }
    fun row(index: Int, change: (DraftRow)->DraftRow) { batch=batch.copy(rows=batch.rows.mapIndexed { i,r -> if(i==index) change(r) else r }) }
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text("本批 ${batch.rows.size}行；OCR可能包含标题、时间和按钮，须跳过这些控件。")
        Check("已逐项核对本批确属当前观众 ${c.current?.contact?.name}",batch.identityConfirmed,{ batch=batch.copy(identityConfirmed=it) })
        Check("已核对本批从旧到新的顺序；并确认接在现有历史后，较早材料入库后可上移",batch.orderConfirmed,{ batch=batch.copy(orderConfirmed=it) })
        Field("本批缺口与说明",batch.gaps,{ batch=batch.copy(gaps=it) })
        val pages=maxOf(1,(batch.rows.size+9)/10); page=page.coerceIn(0,pages-1)
        Actions { TextButton(onClick={ page-- },enabled=page>0) { Text("上一组") }; Text("${page+1}/$pages",Modifier.padding(top=14.dp)); TextButton(onClick={ page++ },enabled=page<pages-1) { Text("下一组") } }
        batch.rows.drop(page*10).take(10).forEachIndexed { offset,r -> val i=page*10+offset
            key(r.id) {
                Text("第${i+1}行"+(r.overlapWith?.let { " · 可能重叠：${it.take(8)}，请自行核对" } ?: ""),fontWeight=FontWeight.Bold)
                Field("正文",r.body,{ value -> row(i) { it.copy(body=value,checked=false) } },lines=2)
                Pick("说话人",Speaker.entries.toList(),r.speaker,{ it.name },{ value -> row(i) { it.copy(speaker=value,checked=false) } })
                Pick("类型",Kind.entries.toList(),r.kind,{ it.name },{ value -> row(i) { it.copy(kind=value,checked=false) } })
                Field("时间（ISO 8601，例如2026-10-12T10:00:00+08:00；未知留空）",r.time,{ value -> row(i) { it.copy(time=value,checked=false) } })
                Check("跳过这行（控件、重叠或不属于消息）",r.skip,{ value -> row(i) { it.copy(skip=value) } })
                Check("已核对正文、说话人及时间；主播行确认为实际已发送",r.checked,{ value -> row(i) { it.copy(checked=value) } })
                Actions {
                    TextButton(onClick={ val rows=batch.rows.toMutableList(); val previous=rows[i-1]; rows[i-1]=rows[i]; rows[i]=previous; batch=batch.copy(rows=rows,orderConfirmed=false) },enabled=i>0) { Text("上移") }
                    TextButton(onClick={ batch=batch.copy(rows=HistoryImport.merge(batch.rows,i),orderConfirmed=false) },enabled=i<batch.rows.lastIndex) { Text("与下一行合为一条") }
                }; HorizontalDivider()
            }
        }
        OutlinedButton(onClick={ c.updateBatch(batch) },modifier=Modifier.fillMaxWidth(),enabled=!c.busy) { Text("保存校对进度") }
        Button(onClick={ c.commitBatch(batch); close() },modifier=Modifier.fillMaxWidth(),enabled=!c.busy && batch.identityConfirmed && batch.orderConfirmed && batch.rows.any { !it.skip } && batch.rows.filterNot { it.skip }.all { it.checked && it.speaker!=Speaker.UNKNOWN && it.body.isNotBlank() && HistoryImport.validTime(it.time) }) { Text("确认入库") }
        TextButton(onClick=close) { Text("收起") }
    }
}

@Composable private fun SourceImage(c: ProductController, scope: Scope, blob: String) {
    val context=LocalContext.current; var image by remember(blob) { mutableStateOf<ImageBitmap?>(null) }; var state by remember(blob) { mutableStateOf("原件保存在本地加密仓库") }
    OutlinedButton(onClick={
        (context.applicationContext as JunshiApp).io.execute {
            try { val bytes=c.vault.blob(scope,blob); val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true }; BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                val options=BitmapFactory.Options().apply { inSampleSize=maxOf(1,maxOf(bounds.outWidth,bounds.outHeight)/1600) }
                val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)
                android.os.Handler(android.os.Looper.getMainLooper()).post { image=bitmap?.asImageBitmap(); state=if(bitmap==null) "此原件需导出后使用相应音视频播放器核对" else "本地原件预览，缩放不改变保存文件" }
            } catch(e: Exception) { android.os.Handler(android.os.Looper.getMainLooper()).post { state=AnalysisEngine.safeError(e) } }
        }
    }) { Text("查看本地原件") }
    Text(state,style=MaterialTheme.typography.bodySmall); image?.let { Image(it,"授权原始材料",Modifier.fillMaxWidth().heightIn(max=360.dp)) }
}
@Composable private fun MediaEditor(c: ProductController, m: MediaAsset) {
    var playing by remember(m.id) { mutableStateOf(false) }
    var description by remember(m.id,m.description) { mutableStateOf(m.description) }; var checked by remember(m.id,m.verified) { mutableStateOf(m.verified) }
    Text("${m.originalName} · ${m.mime}",fontWeight=FontWeight.Bold); SourceImage(c,m.scope,m.blobId)
    if(m.mime.startsWith("audio/") || m.mime.startsWith("video/")) OutlinedButton(onClick={ playing=true }) { Text("本地播放音视频原件") }
    if(playing) MediaReview(c,m) { playing=false }
    Field("完整文字转写/图片或表情描述；未识别部分写明未知",description,{ description=it; checked=false },lines=3)
    Check("我已核对原件与完整描述/转写",checked,{ checked=it })
    OutlinedButton(onClick={ c.mutate { old -> old.copy(media=old.media.map { if(it.id==m.id) it.copy(description=description,verified=checked) else it }) } },enabled=description.isNotBlank() && !c.busy) { Text("保存媒体说明") }
    HorizontalDivider()
}

@Composable private fun ProfileScreen(c: ProductController) {
    val old=c.current ?: return; var name by remember(old.contact.name) { mutableStateOf(old.contact.name) }; var notes by remember(old.contact.notes) { mutableStateOf(old.contact.notes) }
    var boundaries by remember(old.contact.boundaries) { mutableStateOf(old.contact.boundaries) }; var gaps by remember(old.contact.gaps) { mutableStateOf(old.contact.gaps) }
    var tag by remember { mutableStateOf("") }; var factKey by remember { mutableStateOf("") }; var factValue by remember { mutableStateOf("") }; var factIds by remember { mutableStateOf("") }
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        BoxCard("独立档案") {
            Text("稳定ID：${old.scope.contactId}",style=MaterialTheme.typography.bodySmall)
            Field("显示名称",name,{ name=it }); Field("备注与偏好",notes,{ notes=it },lines=2); Field("此观众的明确交流边界",boundaries,{ boundaries=it },lines=2); Field("完整度核对与历史缺口",gaps,{ gaps=it },lines=2)
            Button(onClick={ c.mutate { it.copy(contact=it.contact.copy(name=name,notes=notes,boundaries=boundaries,gaps=gaps)) } },enabled=name.isNotBlank() && gaps.isNotBlank() && !c.busy) { Text("保存档案") }
        }
        BoxCard("标签 · 没有标签也可分析") {
            old.tags.forEach { t -> var value by remember(t.id,t.text) { mutableStateOf(t.text) }; Field("${t.origin} ${if(t.confirmed) "已确认" else "待确认"}",value,{ value=it })
                Actions { TextButton(onClick={ c.mutate { o -> o.copy(tags=o.tags.map { if(it.id==t.id) it.copy(text=value,confirmed=true) else it }) } },enabled=value.isNotBlank() && !c.busy) { Text("保存确认") }; TextButton(onClick={ c.mutate { o -> o.copy(tags=o.tags.filterNot { it.id==t.id }) } },enabled=!c.busy) { Text("删除标签") } }
            }
            Field("新标签",tag,{ tag=it }); OutlinedButton(onClick={ val value=tag; c.mutate { o -> o.copy(tags=o.tags+Tag(scope=o.scope,text=value)) }; tag="" },enabled=tag.isNotBlank() && !c.busy) { Text("手工添加") }
        }
        BoxCard("事实与矛盾记录") {
            old.facts.forEach { f -> Text("${f.key}：${f.value}\n来源${f.origin} · ${java.time.Instant.ofEpochMilli(f.at)}\n证据${f.evidenceMessageIds.joinToString()}") }
            old.conflicts.forEach { conflict -> Text("矛盾：${conflict.note}\n记录：${conflict.factIds.joinToString()}\n处理：${conflict.resolvedBy ?: "待核对"}")
                var resolution by remember(conflict.id) { mutableStateOf(conflict.resolvedBy ?: "") }; Field("处理说明（原事实均保留）",resolution,{ resolution=it })
                TextButton(onClick={ c.mutate { o -> o.copy(conflicts=o.conflicts.map { if(it.id==conflict.id) it.copy(resolvedBy=resolution) else it }) } },enabled=resolution.isNotBlank() && !c.busy) { Text("保存矛盾说明") }
            }
            Field("事实字段，例如生日/偏好",factKey,{ factKey=it }); Field("事实内容",factValue,{ factValue=it }); Field("证据消息ID，以英文逗号分隔；手工备注可留空",factIds,{ factIds=it })
            OutlinedButton(onClick={ val k=factKey; val v=factValue; val ids=factIds.split(',').map { it.trim() }.filter { it.isNotBlank() }; c.mutate { o -> o.addFact(Fact(scope=o.scope,key=k,value=v,evidenceMessageIds=ids)) }; factKey=""; factValue=""; factIds="" },enabled=factKey.isNotBlank() && factValue.isNotBlank() && !c.busy) { Text("添加记录，保留不同版本") }
        }
    }
}

@Composable private fun ModelSettings(c: ProductController) {
    var edited by remember(c.streamer,c.settings) { mutableStateOf(c.settings) }; var selected by remember { mutableStateOf<ModelConfig?>(null) }; var add by remember { mutableStateOf(false) }
    BoxCard("模型与分析组件") {
        Text("模型由你选择。API Key仅保存在本机加密仓库。调用前须核对服务商端点、窗口容量和人民币单价；不同账号的模型配置独立。")
        edited.profiles.forEach { profile -> Actions { Text(profile.name+" · "+profile.kind,Modifier.padding(top=14.dp)); TextButton(onClick={ selected=profile; add=true }) { Text("编辑") }; TextButton(onClick={ edited=edited.copy(profiles=edited.profiles.filterNot { it.id==profile.id }) }) { Text("移除") } } }
        OutlinedButton(onClick={ selected=null; add=true }) { Text("添加接口配置") }
        Pick("生成模型",edited.profiles.filter { it.kind==ProviderKind.CHAT_COMPLETIONS },edited.profiles.find { it.id==edited.modelId },{ it.name },{ edited=edited.copy(modelId=it.id) })
        Pick("Jev接口",edited.profiles.filter { it.kind==ProviderKind.JEV },edited.profiles.find { it.id==edited.jevId },{ it.name },{ edited=edited.copy(jevId=it.id) })
        Check("Jev：结构化辅助判断（可选，默认关闭）",edited.jevEnabled,{ edited=edited.copy(jevEnabled=it) })
        Text("当前默认使用生成模型＋两个Skill。Jev可后续配置独立接口后开启；开启后若接口失败，本轮会停止。",style=MaterialTheme.typography.bodySmall)
        Pick("分析偏好",JevMode.entries.toList(),edited.jevMode,{ it.label },{ edited=edited.copy(jevMode=it) })
        Text("${edited.jevMode.instruction}。这是本应用提供给组件的偏好，不是服务商的独立模型型号。",style=MaterialTheme.typography.bodySmall)
        Check("狗头军师 Skill：分析视角（默认开启）",edited.goutouEnabled,{ edited=edited.copy(goutouEnabled=it) })
        Check("恋爱大师 Skill：分析视角（默认开启）",edited.lianaiEnabled,{ edited=edited.copy(lianaiEnabled=it) })
        Field("主播风格补充说明（统计仍使用全部已确认发送历史）",edited.styleNotes,{ edited=edited.copy(styleNotes=it) },lines=2)
        Check("我理解这些组件提供分析参考；Jev数值不是观众心理事实，Skill作者不是主播本人",edited.componentNoticeAccepted,{ edited=edited.copy(componentNoticeAccepted=it) })
        Check("允许点击生成或确认最新消息后自动分析时，将本观众已校对文字、档案、媒体描述及主播格式统计发送至我配置的云端接口；不上传其他观众原句",edited.cloudConsent,{ edited=edited.copy(cloudConsent=it) })
        Button(onClick={ c.saveSettings(edited) },enabled=!c.busy && !c.generating) { Text("保存本主播配置") }
        Text("两个Skill按MIT许可集成。关闭组件只在你主动选择后生效；接口失败不会静默改用简化流程。",style=MaterialTheme.typography.bodySmall)
    }
    if(add) ModelEditor(selected,{ add=false }) { config -> edited=edited.copy(profiles=edited.profiles.filterNot { it.id==config.id }+config); add=false }
}
@Composable private fun ModelEditor(original: ModelConfig?, close: ()->Unit, save: (ModelConfig)->Unit) {
    var config by remember { mutableStateOf(original ?: ModelConfig(name="",endpoint="https://api.deepseek.com/chat/completions",model="",apiKey="")) }; var error by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest=close,title={ Text("接口配置") },text={ LazyColumn(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        item { Field("配置名称",config.name,{ config=config.copy(name=it) }); Pick("类型",ProviderKind.entries.toList(),config.kind,{ it.name },{ config=config.copy(kind=it,endpoint=if(it==ProviderKind.JEV) "https://api.typesafe.ai/v1/systemone" else "https://api.deepseek.com/chat/completions",model=if(it==ProviderKind.JEV) "jev-latest" else "") }) }
        item { Field("完整HTTPS请求端点",config.endpoint,{ config=config.copy(endpoint=it.trim()) }); Field("模型标识（以服务商当前文档为准）",config.model,{ config=config.copy(model=it.trim()) }); Field("API Key",config.apiKey,{ config=config.copy(apiKey=it.trim()) },secret=true) }
        item { var context by remember { mutableStateOf(config.contextTokens.toString()) }; var output by remember { mutableStateOf(config.outputTokens.toString()) }; Field("上下文token容量",context,{ context=it; config=config.copy(contextTokens=it.toIntOrNull() ?: 0) }); Field("输出token上限/预留",output,{ output=it; config=config.copy(outputTokens=it.toIntOrNull() ?: 0) }) }
        item { Field("输入价（元/百万token，须换算人民币）",config.inputRmbPerMillion,{ config=config.copy(inputRmbPerMillion=it) }); Field("输出价（元/百万token）",config.outputRmbPerMillion,{ config=config.copy(outputRmbPerMillion=it) }); Field("缓存命中输入价（未知则留空，用普通输入价估计）",config.cachedRmbPerMillion,{ config=config.copy(cachedRmbPerMillion=it) }) }
        item { Field("价格依据链接、日期及汇率依据",config.pricingSource,{ config=config.copy(pricingSource=it) }); Check("我已核对上述价格、币种和模型容量",config.pricingVerified,{ config=config.copy(pricingVerified=it) }) }
        item { if(config.kind==ProviderKind.CHAT_COMPLETIONS) { Check("流式SSE（接口须支持usage）",config.stream,{ config=config.copy(stream=it) }); Check("接口支持JSON输出模式",config.jsonMode,{ config=config.copy(jsonMode=it) }); Pick("输出参数",listOf("max_tokens","max_completion_tokens"),config.maxTokensField,{ it },{ config=config.copy(maxTokensField=it) }) }; Text(error,color=MaterialTheme.colorScheme.error) }
    } },confirmButton={ TextButton(onClick={ try { require(config.name.isNotBlank()); config.validate(); save(config) } catch(e: Exception) { error=AnalysisEngine.safeError(e) } }) { Text("核验并保存") } },dismissButton={ TextButton(onClick=close) { Text("取消") } })
}
private fun yuan(micro: Long) = String.format(Locale.ROOT,"%.6f",micro/1_000_000.0)
@Composable private fun FeeSettings(c: ProductController) {
    var confirm by remember { mutableStateOf(false) }
    var external by remember { mutableStateOf("") }; var note by remember { mutableStateOf("") }; var externalChecked by remember { mutableStateOf(false) }
    BoxCard("月度API费用") {
        Text("本设备本月已记录/预留 ¥${yuan(c.monthSpent)}\n已确认额度 ¥${yuan(c.monthLimit)}",fontWeight=FontWeight.Bold)
        Text("初始100元提醒；保守预估将达到额度时先停止。本页明细仅显示当前主播。费用按接口真实usage乘你核验的价格估算，含未知用量预留，服务商账单为准。上下文预估不是官方tokenizer，不能保证最终账单绝不越额。")
        OutlinedButton(onClick={ confirm=true },enabled=!c.busy && !c.generating) { Text("确认本月再增加100元额度") }
        Text("其他设备/软件的费用无法自动读取。可补录本月尚未计入的账单增量，不能把服务商总额重复加到已有记录。")
        Field("外部账单增量（元）",external,{ external=it; externalChecked=false })
        Field("账单来源与核对日期",note,{ note=it; externalChecked=false })
        Check("我已核对这笔增量，没有重复计入",externalChecked,{ externalChecked=it })
        OutlinedButton(onClick={ c.recordExternal(external,note); external=""; note=""; externalChecked=false },enabled=externalChecked && note.isNotBlank() && external.toBigDecimalOrNull()?.let { it>=java.math.BigDecimal.ZERO && it.scale()<=6 && it<=java.math.BigDecimal("100000000") }==true && !c.busy && !c.generating) { Text("计入本月提醒") }
        c.charges.sortedByDescending { it.at }.forEach { charge ->
            Text("${charge.component} · ${charge.model}\n${charge.state} · ¥${yuan(charge.chargedMicro)}\n${charge.usage?.let { "输入${it.input} / 输出${it.output} / 缓存${it.cachedInput}" } ?: if(charge.state=="USER_VERIFIED_EXTERNAL") "人工核对的账单增量" else "用量未取得；按预留计入，不能当成免费"}\n${charge.pricingSource}")
            if(charge.state in listOf("UNCERTAIN","RESERVED")) {
                var bill by remember(charge.id) { mutableStateOf("") }; var verified by remember(charge.id) { mutableStateOf(false) }
                Field("查服务商账单后的实际人民币费用",bill,{ bill=it; verified=false }); Check("我已核对该调用账单，确认这个金额",verified,{ verified=it })
                TextButton(onClick={ c.reconcile(charge,bill) },enabled=charge.state=="UNCERTAIN" && verified && bill.toBigDecimalOrNull()?.let { it>=java.math.BigDecimal.ZERO }==true && !c.busy && !c.generating) { Text(if(charge.state=="RESERVED") "请求仍在执行，请稍后核对" else "确认账单核对结果") }
            }; HorizontalDivider()
        }
    }
    if(confirm) AlertDialog(onDismissRequest={ confirm=false },title={ Text("确认增加本月额度") },text={ Text("你允许本设备本月的API费用提醒额度增加100元。不会修改历史范围或关闭组件；未知用量仍需核对账单。") },confirmButton={ TextButton(onClick={ c.continueBudget(); confirm=false }) { Text("我确认继续") } },dismissButton={ TextButton(onClick={ confirm=false }) { Text("取消") } })
}
@Composable private fun ReportView(c: ProductController, round: JSONObject) {
    val result=round.getJSONObject("result"); val analysis=result.getJSONObject("analysis"); val current=c.current ?: return
    var source by remember(round.optString("id")) { mutableStateOf<Message?>(null) }
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text("模型版本：${round.getString("model")}",style=MaterialTheme.typography.bodySmall)
        round.optJSONObject("reply_target")?.let { target -> Text("本轮回复目标（用户已核对）",fontWeight=FontWeight.Bold); target.objects("messages").forEach { Text(it.getString("body")) } }
        listOf("facts" to "事实与原文证据","hypotheses" to "推测（尚未证实）").forEach { (field,label) ->
            Text(label,fontWeight=FontWeight.Bold)
            analysis.objects(field).forEach { point ->
                Text(point.getString("text")); Actions { point.strings("evidence_ids").forEach { id -> TextButton(onClick={ source=current.messages.firstOrNull { it.id==id } }) { Text("回查 ${id.takeLast(8)}") } } }
            }
        }
        listOf("emotion" to "情绪判断","relationship" to "关系与不确定性","strategy" to "建议策略","history_limits" to "历史限制").forEach { (field,label) -> Text(label,fontWeight=FontWeight.Bold); Text(analysis.getString(field)) }
        listOf("unknowns" to "未知信息","disagreements" to "组件分歧与取舍","next_steps" to "下一步建议").forEach { (field,label) -> Text(label,fontWeight=FontWeight.Bold); analysis.strings(field).forEach { Text("• $it") } }
        Text("可选新话题",fontWeight=FontWeight.Bold); result.strings("new_topics").forEach { Text("• $it") }
        if(result.getBoolean("no_reply")) Text("建议不回复：${result.getString("no_reply_reason")}")
        round.objects("components").forEach { component ->
            var show by remember(component.getString("name"),round.optString("id")) { mutableStateOf(false) }
            TextButton(onClick={ show=!show }) { Text("${component.getString("name")} · ${component.getString("state")} · ${if(show) "收起" else "展开原始分析"}") }
            if(show) SelectionContainer { Text(component.optString("content")) }
        }
        val coverage=round.getJSONObject("coverage")
        Text("本轮提交 ${coverage.getInt("processed")}/${coverage.getInt("available")} 条；原文回查 ${coverage.strings("recalledIds").size} 条；分块 ${coverage.getInt("chunks")}；${coverage.getString("mode")}\n${coverage.getString("gaps")}",style=MaterialTheme.typography.bodySmall)
        Text("原始材料与完整覆盖清单随资料导出；提交记录不等于摘要语义验收。",style=MaterialTheme.typography.bodySmall)
    }
    source?.let { m -> AlertDialog(onDismissRequest={ source=null },title={ Text("原文回查 · ${m.speaker}") },text={ Column(Modifier.verticalScroll(rememberScrollState())) { Text(m.id,style=MaterialTheme.typography.bodySmall); Text(m.time.ifBlank { "时间未知" }); SelectionContainer { Text(m.body) }; m.evidenceIds.forEach { id -> current.evidence.firstOrNull { it.id==id }?.let { e -> Text("来源 ${e.kind} · ${e.sha256}",style=MaterialTheme.typography.bodySmall); e.blobId?.let { SourceImage(c,m.scope,it) } } } } },confirmButton={ TextButton(onClick={ source=null }) { Text("关闭") } }) }
}
