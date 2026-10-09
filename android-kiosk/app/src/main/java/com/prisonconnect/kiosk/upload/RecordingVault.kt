package com.prisonconnect.kiosk.upload

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.prisonconnect.kiosk.core.Logger
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * At-rest encryption for recording master copies on the kiosk.
 *
 * Format (all integers big-endian):
 *   magic "PCENC001" | uint32 chunkSize |
 *   repeated: uint32 plainLen | 12B IV | plainLen+16B ciphertext+GCM-tag
 *
 * Each 64 KB chunk is an independent AES-256-GCM record with a random IV and
 * the chunk index bound in as AAD, so a whole file is never buffered in memory
 * and any truncation/reorder/tamper fails the tag instead of uploading
 * garbage. The key lives in the Android Keystore and never leaves it.
 */
object RecordingVault {

    private const val KEY_ALIAS = "prisonconnect.recording.v1"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12
    private const val TAG_BYTES = 16
    private const val CHUNK_BYTES = 64 * 1024
    private const val IO_BUFFER = 128 * 1024
    private val MAGIC = "PCENC001".toByteArray(Charsets.US_ASCII)

    /** True when [file] carries this vault's header. */
    fun isEncrypted(file: File): Boolean {
        if (!file.isFile || file.length() < MAGIC.size) return false
        return try {
            FileInputStream(file).use { input ->
                val head = ByteArray(MAGIC.size)
                var read = 0
                while (read < head.size) {
                    val n = input.read(head, read, head.size - read)
                    if (n < 0) break
                    read += n
                }
                read == head.size && head.contentEquals(MAGIC)
            }
        } catch (t: Throwable) {
            false
        }
    }

    /**
     * Encrypts [src] into `<src.name>.enc` (temp file + rename) and deletes
     * the plaintext only after the encrypted copy is fully on disk.
     * Returns the encrypted file.
     */
    fun encrypt(src: File): File {
        val dest = File(src.parentFile, src.name + ".enc")
        val tmp = File(src.parentFile, src.name + ".enc.tmp")
        try {
            FileOutputStream(tmp).use { out ->
                DataOutputStream(BufferedOutputStream(out, IO_BUFFER)).use { data ->
                    data.write(MAGIC)
                    data.writeInt(CHUNK_BYTES)
                    val input = BufferedInputStream(FileInputStream(src), IO_BUFFER)
                    input.use {
                        val buf = ByteArray(CHUNK_BYTES)
                        var index = 0L
                        while (true) {
                            val n = readUpTo(it, buf, buf.size)
                            if (n <= 0) break
                            writeChunk(data, buf, n, index)
                            index++
                        }
                    }
                }
            }
            if (dest.exists()) dest.delete()
            if (!tmp.renameTo(dest)) throw IOException("rename to ${dest.name} failed")
        } catch (t: Throwable) {
            tmp.delete()
            throw t
        }
        src.delete()
        Logger.i("Vault: encrypted ${src.name} -> ${dest.name} (${dest.length()} bytes)")
        return dest
    }

    /**
     * Decrypts [enc] into [dest] (plain MP4 the uploader can stream). Throws
     * when a chunk fails authentication — the caller must not upload the
     * result of a failed decryption.
     */
    fun decrypt(enc: File, dest: File) {
        DataInputStream(BufferedInputStream(FileInputStream(enc), IO_BUFFER)).use { input ->
            val magic = ByteArray(MAGIC.size)
            input.readFully(magic)
            if (!magic.contentEquals(MAGIC)) throw IOException("not a vault file: ${enc.name}")
            val chunkSize = input.readInt()
            if (chunkSize < 1 || chunkSize > 1024 * 1024) throw IOException("bad vault chunk size: $chunkSize")
            FileOutputStream(dest).use { out ->
                BufferedOutputStream(out, IO_BUFFER).use { buffered ->
                    val cipher = Cipher.getInstance(TRANSFORMATION)
                    var index = 0L
                    while (true) {
                        val plainLen = try {
                            input.readInt()
                        } catch (e: EOFException) {
                            break // clean end of stream
                        }
                        if (plainLen < 0 || plainLen > chunkSize) throw IOException("bad vault chunk length: $plainLen")
                        val iv = ByteArray(IV_BYTES)
                        input.readFully(iv)
                        val cipherText = ByteArray(plainLen + TAG_BYTES)
                        input.readFully(cipherText)
                        val plain = decryptChunk(cipher, iv, cipherText, index)
                            ?: throw IOException("chunk $index failed authentication")
                        buffered.write(plain)
                        index++
                    }
                }
            }
        }
        Logger.i("Vault: decrypted ${enc.name} -> ${dest.name} (${dest.length()} bytes)")
    }

    private fun writeChunk(out: DataOutputStream, buf: ByteArray, len: Int, index: Long) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(aadFor(index))
        val cipherText = cipher.doFinal(buf, 0, len)
        out.writeInt(len)
        out.write(cipher.iv)
        out.write(cipherText)
    }

    private fun decryptChunk(cipher: Cipher, iv: ByteArray, cipherText: ByteArray, index: Long): ByteArray? {
        return try {
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BYTES * 8, iv))
            cipher.updateAAD(aadFor(index))
            cipher.doFinal(cipherText)
        } catch (t: Throwable) {
            Logger.e("Vault: chunk $index authentication failed", t)
            null
        }
    }

    private fun aadFor(index: Long): ByteArray = byteArrayOf(
        (index ushr 24).toByte(), (index ushr 16).toByte(), (index ushr 8).toByte(), index.toByte()
    )

    @Synchronized
    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    /** Reads up to [want] bytes, blocking until filled or EOF; 0 at EOF. */
    private fun readUpTo(input: InputStream, buf: ByteArray, want: Int): Int {
        var got = 0
        while (got < want) {
            val n = input.read(buf, got, want - got)
            if (n < 0) break
            got += n
        }
        return got
    }
}
