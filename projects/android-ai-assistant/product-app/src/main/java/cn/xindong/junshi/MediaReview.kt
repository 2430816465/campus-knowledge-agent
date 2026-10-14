package cn.xindong.junshi

import android.media.MediaDataSource
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import cn.xindong.core.*
import java.util.concurrent.atomic.AtomicBoolean

/** Authenticated plaintext stays in RAM; playback never writes an unencrypted cache file. */
class MemoryMediaSource(private val bytes: ByteArray): MediaDataSource() {
    private var closed=false
    @Synchronized override fun getSize(): Long { check(!closed); return bytes.size.toLong() }
    @Synchronized override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
        check(!closed); require(position>=0 && offset>=0 && size>=0 && offset.toLong()+size<=buffer.size)
        if(size==0) return 0
        if(position>=bytes.size) return -1
        val n=minOf(size.toLong(),bytes.size-position).toInt(); bytes.copyInto(buffer,offset,position.toInt(),position.toInt()+n); return n
    }
    @Synchronized override fun close() { if(!closed) { bytes.fill(0); closed=true } }
}

@Composable fun MediaReview(c: ProductController, asset: MediaAsset, close: ()->Unit) {
    val app=LocalContext.current.applicationContext as JunshiApp
    var state by remember(asset.id) { mutableStateOf("正在解密原件；内存播放上限32MiB，完整原件始终可导出") }
    var player by remember(asset.id) { mutableStateOf<MediaPlayer?>(null) }
    var prepared by remember(asset.id) { mutableStateOf(false) }
    var playing by remember(asset.id) { mutableStateOf(false) }
    var holder by remember(asset.id) { mutableStateOf<SurfaceHolder?>(null) }
    DisposableEffect(asset.id) {
        val active=AtomicBoolean(true); var source: MemoryMediaSource?=null; var localPlayer: MediaPlayer?=null
        app.io.execute {
            try {
                val bytes=c.vault.blob(asset.scope,asset.blobId)
                Handler(Looper.getMainLooper()).post {
                    if(!active.get() || c.current?.scope!=asset.scope) { bytes.fill(0); return@post }
                    try {
                        source=MemoryMediaSource(bytes)
                        localPlayer=MediaPlayer().apply {
                            setDataSource(source!!); holder?.let { setDisplay(it) }
                            setOnPreparedListener { if(active.get()) { prepared=true; state="原件已就绪 · ${it.duration/1000}秒；点击播放核对" } }
                            setOnCompletionListener { if(active.get()) { playing=false; state="播放完成；描述和转写仍须本人核对" } }
                            setOnErrorListener { _,what,extra -> if(active.get()) { state="此格式无法播放（$what/$extra）；请导出原件核对"; prepared=false; playing=false }; true }
                            prepareAsync()
                        }; player=localPlayer
                    } catch(e: Exception) { state=AnalysisEngine.safeError(e); localPlayer?.release(); source?.close() }
                }
            } catch(e: Exception) { Handler(Looper.getMainLooper()).post { if(active.get()) state=AnalysisEngine.safeError(e)+"；可导出完整原件核对" } }
        }
        onDispose { active.set(false); localPlayer?.release(); source?.close(); player=null }
    }
    AlertDialog(onDismissRequest=close,title={ Text(asset.originalName) },text={ Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text(state)
        if(asset.mime.startsWith("video/")) AndroidView(factory={ context -> SurfaceView(context).apply { this.holder.addCallback(object: SurfaceHolder.Callback {
            override fun surfaceCreated(h: SurfaceHolder) { holder=h; player?.setDisplay(h) }
            override fun surfaceChanged(h: SurfaceHolder, format: Int, width: Int, height: Int) { }
            override fun surfaceDestroyed(h: SurfaceHolder) { player?.setDisplay(null); holder=null }
        }) } },modifier=Modifier.fillMaxWidth().height(220.dp))
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Button(enabled=prepared,onClick={ runCatching { player?.let { if(playing) it.pause() else it.start(); playing=!playing } }.onFailure { state="播放状态失效，请关闭后重试"; prepared=false } }) { Text(if(playing) "暂停" else "播放") }
            OutlinedButton(enabled=prepared,onClick={ runCatching { player?.seekTo(0) } }) { Text("回到开头") }
        }
    } },confirmButton={ TextButton(onClick=close) { Text("关闭并释放内存") } })
}
