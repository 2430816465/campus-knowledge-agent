package cn.xindong.junshi

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.media.MediaPlayer
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Synthetic fixtures only, on the explicitly selected emulator. Never WeChat evidence. */
class MediaAndOcrDeviceTest {
    @Test fun localWavActuallyPreparesAndPlaysFromRam() {
        val samples=ByteArray(16000); val wav=ByteBuffer.allocate(44+samples.size).order(ByteOrder.LITTLE_ENDIAN)
            .put("RIFF".toByteArray()).putInt(36+samples.size).put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
            .putInt(8000).putInt(16000).putShort(2).putShort(16).put("data".toByteArray()).putInt(samples.size).put(samples).array()
        val source=MemoryMediaSource(wav); val prepared=CountDownLatch(1); val completed=CountDownLatch(1); var player: MediaPlayer?=null; var failed=false
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        try {
            instrumentation.runOnMainSync { player=MediaPlayer().apply { setDataSource(source); setOnErrorListener { _,_,_-> failed=true; prepared.countDown(); completed.countDown(); true }; setOnPreparedListener { prepared.countDown() }; setOnCompletionListener { completed.countDown() }; prepareAsync() } }
            assertTrue("Native media prepare timed out",prepared.await(12,TimeUnit.SECONDS)); assertFalse(failed)
            assertTrue(player!!.duration>=900)
            instrumentation.runOnMainSync { player!!.start() }; assertTrue("Playback did not complete",completed.await(8,TimeUnit.SECONDS)); assertFalse(failed)
        } finally { instrumentation.runOnMainSync { player?.release() }; source.close() }
        assertTrue(wav.all { it==0.toByte() })
    }
    @Test fun bundledChineseOcrProducesInspectableSyntheticText() {
        val bitmap=Bitmap.createBitmap(1400,320,Bitmap.Config.ARGB_8888); val canvas=Canvas(bitmap); canvas.drawColor(Color.WHITE)
        canvas.drawText("合成测试 今天有点累 明天再聊",30f,160f,Paint(Paint.ANTI_ALIAS_FLAG).apply { color=Color.BLACK; textSize=76f })
        val recognizer=TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        try { val text=Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap,0)),35,TimeUnit.SECONDS).text
            val expected="合成测试 今天有点累 明天再聊"
            val context=InstrumentationRegistry.getInstrumentation().targetContext
            java.io.File(context.filesDir,"qa-synthetic-ocr.json").writeText(org.json.JSONObject().put("provenance","SYNTHETIC_BITMAP_NOT_WECHAT")
                .put("expected",expected).put("observed",text).put("exact_match",expected==text).put("classification","PIPELINE_SMOKE_NOT_ACCURACY_ACCEPTANCE").toString(2))
            assertTrue("Bundled OCR did not return the known synthetic anchor text: $text",text.contains("今天有点累") && text.contains("明天再聊"))
        } finally { recognizer.close(); bitmap.recycle() }
    }
}
