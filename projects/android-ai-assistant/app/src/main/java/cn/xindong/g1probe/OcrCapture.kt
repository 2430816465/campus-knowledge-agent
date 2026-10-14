package cn.xindong.g1probe

import android.content.Context
import android.graphics.Bitmap
import cn.xindong.probe.EvidenceRules
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject

object OcrCapture {
    private val recognizer by lazy { TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build()) }
    fun process(context: Context, bitmap: Bitmap, source: String, run: String, scene: String, capturedAt: Long,
                metadata: JSONObject, validate: (() -> String?)? = null, previewId: String? = null, complete: ()->Unit) {
        val store=context.probeStore
        fun invalidReason(): String? {
            if(validate != null) return validate()
            return when {
                !store.armed -> "SESSION_STOPPED"
                store.runId != run || store.scenario != scene -> "SESSION_CHANGED"
                ProbeAccessibilityService.current?.wechatVisible() != true -> "WECHAT_WINDOW_UNAVAILABLE"
                else -> null
            }
        }
        fun record(type: String, data: JSONObject = metadata) { store.record(type,source,data,run,scene) }
        fun preview(status: String, text: String = "") { previewId?.let { CaptureReview.finish(it,status,text) } }
        fun discarded(reason: String) {
            record("OCR_DISCARDED",JSONObject(metadata.toString()).put("reason",reason))
            preview("页面或实验已改变，本次结果已丢弃：$reason")
        }
        fun release() { bitmap.recycle(); complete() }
        invalidReason()?.let { discarded(it); release(); return }
        val pixels=IntArray(100) { i -> bitmap.getPixel((i%10)*bitmap.width/10,(i/10)*bitmap.height/10) }
        metadata.put("width",bitmap.width).put("height",bitmap.height).put("captured_at_ms",capturedAt)
        if(EvidenceRules.unusableFrame(pixels)) {
            record("BLACK_OR_UNUSABLE_FRAME",metadata.put("recognition_status","FAILED; protected/black/empty pixels, cause not confirmed"))
            preview("截图为黑屏或不可用，原因尚未确认；未取得聊天材料")
            release(); return
        }
        try {
            record("OCR_STARTED",JSONObject(metadata.toString()))
            recognizer.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener { result ->
                val reason=invalidReason()
                if(reason == null) {
                    val lines=JSONArray(); val candidates=JSONArray()
                    result.textBlocks.forEach { block -> block.lines.forEach { line ->
                        val bounds=line.boundingBox
                        lines.put(JSONObject().put("text",line.text).put("bounds",bounds?.let { JSONArray(listOf(it.left,it.top,it.right,it.bottom)) }))
                        candidates.put(candidateJson(line.text,candidates.length()).put("automatic",metadata.optBoolean("automatic",true)))
                    } }
                    record("OCR_RESULT",metadata.put("lines",lines).put("candidates",candidates)
                        .put("full_visible_text",result.text).put("recognition_status","UNVERIFIED")
                        .put("coverage","CURRENT_VISIBLE_PIXELS_ONLY; line is not necessarily a complete message")
                        .put("historical_or_new","UNKNOWN"))
                    preview(if(result.text.isBlank()) "识别结果为空；未取得聊天文字" else "已取得待核对文字；未绑定联系人、未用于 AI",result.text)
                } else discarded(reason)
            }.addOnFailureListener { e ->
                val reason=invalidReason()
                if(reason == null) {
                    record("OCR_FAILED",metadata.put("error",e.javaClass.simpleName))
                    preview("文字识别失败：${e.javaClass.simpleName}；未生成建议")
                } else discarded(reason)
            }.addOnCompleteListener { release() }
        } catch(e: Exception) {
            val reason=invalidReason()
            if(reason == null) {
                record("OCR_EXCEPTION",metadata.put("error",e.javaClass.simpleName))
                preview("文字识别异常：${e.javaClass.simpleName}")
            } else discarded(reason)
            release()
        }
    }
}
