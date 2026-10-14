package cn.xindong.core

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

class SealedBox(private val key: SecretKey) {
    private val streamMagic=byteArrayOf(0x58,0x44,0x32,0x4d,0x47,0x43,0x4d,0x01)
    private val chunkSize=1024*1024
    fun sealStream(input: java.io.InputStream, output: java.io.OutputStream, aad: String): Pair<String,Long> {
        val data=java.io.DataOutputStream(output); data.write(streamMagic)
        val digest=MessageDigest.getInstance("SHA-256"); var total=0L; var index=0L; val buffer=ByteArray(chunkSize)
        while(true) {
            var size=0
            while(size<buffer.size) { val n=input.read(buffer,size,buffer.size-size); if(n<0) break; if(n>0) size+=n }
            if(size==0) break
            digest.update(buffer,0,size); total=Math.addExact(total,size.toLong())
            val encrypted=seal(buffer.copyOf(size),"$aad|chunk|$index"); data.writeInt(encrypted.size); data.write(encrypted); index++
        }
        val hash=digest.digest(); val footer=java.nio.ByteBuffer.allocate(48).putLong(index).putLong(total).put(hash).array()
        val encrypted=seal(footer,"$aad|end"); data.writeInt(-1); data.writeInt(encrypted.size); data.write(encrypted); data.flush(); buffer.fill(0)
        return hash.joinToString("") { "%02x".format(it) } to total
    }
    fun openStream(input: java.io.InputStream, aad: String): java.io.InputStream {
        val peek=java.io.PushbackInputStream(input,streamMagic.size); val prefix=ByteArray(streamMagic.size); var length=0
        while(length<prefix.size) { val n=peek.read(prefix,length,prefix.size-length); if(n<0) break; length+=n }
        if(length==streamMagic.size && prefix.contentEquals(streamMagic)) return object: java.io.InputStream() {
            val data=java.io.DataInputStream(peek); val digest=MessageDigest.getInstance("SHA-256")
            var chunk=ByteArray(0); var position=0; var index=0L; var total=0L; var finished=false
            private fun advance(): Boolean {
                if(finished) return false
                chunk.fill(0); position=0
                val n=data.readInt()
                if(n==-1) {
                    val size=data.readInt(); require(size==76) { "媒体结束校验无效" }
                    val cipher=ByteArray(size); data.readFully(cipher); val footer=java.nio.ByteBuffer.wrap(open(cipher,"$aad|end"))
                    require(footer.long==index && footer.long==total) { "媒体分块缺失或顺序错误" }
                    val hash=ByteArray(32); footer.get(hash); require(MessageDigest.isEqual(hash,digest.digest()) && data.read()==-1) { "媒体完整性校验失败" }
                    chunk=ByteArray(0); finished=true; return false
                }
                require(n in 29..chunkSize+28) { "媒体分块长度无效" }; val cipher=ByteArray(n); data.readFully(cipher)
                chunk=open(cipher,"$aad|chunk|$index"); total=Math.addExact(total,chunk.size.toLong()); digest.update(chunk); index++
                return true
            }
            override fun read(): Int { if(position>=chunk.size && !advance()) return -1; return chunk[position++].toInt() and 255 }
            override fun read(bytes: ByteArray, offset: Int, size: Int): Int {
                require(offset>=0 && size>=0 && offset.toLong()+size<=bytes.size); if(size==0) return 0
                if(position>=chunk.size && !advance()) return -1
                val count=minOf(size,chunk.size-position); chunk.copyInto(bytes,offset,position,position+count); position+=count; return count
            }
            override fun close() { chunk.fill(0); data.close(); finished=true }
        }
        peek.unread(prefix,0,length)
        val nonce=ByteArray(12); var offset=0
        while(offset<nonce.size) { val n=peek.read(nonce,offset,nonce.size-offset); require(n>0) { "加密媒体不完整" }; offset+=n }
        val cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,nonce)); cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return javax.crypto.CipherInputStream(peek,cipher)
    }
    fun seal(bytes: ByteArray, aad: String): ByteArray {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key)
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8)); return cipher.iv+cipher.doFinal(bytes)
    }
    fun open(bytes: ByteArray, aad: String): ByteArray {
        require(bytes.size>=28) { "加密记录不完整" }
        val cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes.copyOfRange(0,12)))
        cipher.updateAAD(aad.toByteArray(Charsets.UTF_8)); return cipher.doFinal(bytes.copyOfRange(12,bytes.size))
    }
}
object LocalPin {
    fun salt(): ByteArray = ByteArray(16).also { SecureRandom().nextBytes(it) }
    fun digest(pin: CharArray, salt: ByteArray): ByteArray {
        require(pin.size>=6) { "本地主播账户口令至少6位" }
        val spec=PBEKeySpec(pin,salt,120_000,256)
        return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded } finally { spec.clearPassword() }
    }
    fun matches(pin: CharArray, salt: ByteArray, expected: ByteArray) = MessageDigest.isEqual(digest(pin,salt),expected)
}

/** Scope revisions let UI adapters drop a cancelled result even when a provider finishes late. */
class ScopeSession {
    private var scope: Scope?=null; private var revision=0L; private var cancel=CancelToken()
    @Synchronized fun select(next: Scope?): Long { cancel.cancel(); cancel=CancelToken(); scope=next; return ++revision }
    @Synchronized fun ticket(expected: Scope): Pair<Long,CancelToken> { require(scope==expected); return revision to cancel }
    @Synchronized fun accepts(expected: Scope, epoch: Long) = scope==expected && revision==epoch
    @Synchronized fun invalidate(): Long { cancel.cancel(); cancel=CancelToken(); return ++revision }
}
