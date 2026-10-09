package com.prisonconnect.kiosk.upload

import android.util.Base64
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.call.RecordingUploadChunkRequest
import com.prisonconnect.kiosk.models.call.RecordingUploadInitRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pushes one finished call recording to the backend in fixed-size chunks.
 *
 * Design notes:
 *  - the file is hashed (sha256) up front; the server keeps the assembled
 *    partial and hands back how much it already holds, so a retry resumes
 *    where it stopped instead of re-sending everything;
 *  - every chunk is base64 on the wire (JSON body stays well under the
 *    server's 10 MB limit);
 *  - each step retries a few times with backoff, then gives the attempt back
 *    to WorkManager, which retries the whole job with a longer backoff.
 *  - the local file is NEVER deleted here: on the retrieval path it is either
 *    the kiosk's master copy (must survive) or a temp decrypt target the
 *    worker owns. File lifecycle belongs to the caller.
 */
@Singleton
class RecordingUploader @Inject constructor(
    private val apiService: TrustApiService
) {

    /** @return true when the file is fully uploaded. */
    suspend fun upload(file: File, callId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!file.exists()) return@withContext true
            val size = file.length()
            if (size < MIN_USEFUL_BYTES) {
                Logger.d("Uploader: dropping unusable file ${file.name} ($size bytes)")
                file.delete()
                return@withContext true
            }
            if (callId.isBlank()) {
                Logger.e("Uploader: no callId for ${file.name} - keeping file")
                return@withContext false
            }

            val sha256 = sha256Of(file)
            Logger.i("Uploader: ${file.name} size=$size sha256=${sha256.take(12)}…")

            // Init doubles as the resume point: a partial from a previous
            // attempt comes back with receivedBytes > 0.
            val session = retry("upload init") {
                val response = apiService.initRecordingUpload(
                    RecordingUploadInitRequest(
                        callId = callId,
                        fileName = file.name,
                        size = size,
                        sha256 = sha256,
                        chunkSize = CHUNK_BYTES
                    )
                )
                val data = response.data
                if (!response.success || data == null || data.uploadId.isNullOrBlank()) {
                    throw IllegalStateException(response.error?.message ?: "init rejected")
                }
                data
            }
            val uploadId = session.uploadId!!
            var offset = session.receivedBytes.coerceIn(0L, size)
            if (offset > 0 && offset % CHUNK_BYTES != 0L) {
                offset = 0 // partial chunk boundary - restart clean
            }
            if (offset > 0) Logger.i("Uploader: resuming at $offset/$size")

            RandomAccessFile(file, "r").use { raf ->
                val buffer = ByteArray(CHUNK_BYTES)
                while (offset < size) {
                    val len = minOf(CHUNK_BYTES.toLong(), size - offset).toInt()
                    raf.seek(offset)
                    raf.readFully(buffer, 0, len)
                    val encoded = Base64.encodeToString(buffer, 0, len, Base64.NO_WRAP)
                    val index = (offset / CHUNK_BYTES).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()

                    val advancedTo = retry("chunk@$offset") {
                        val response = apiService.sendRecordingChunk(
                            uploadId,
                            RecordingUploadChunkRequest(index = index, offset = offset, data = encoded)
                        )
                        val data = response.data
                        if (!response.success || data == null) {
                            throw IllegalStateException(response.error?.message ?: "chunk rejected")
                        }
                        data.receivedBytes
                    }
                    if (advancedTo <= offset) {
                        Logger.e("Uploader: server did not advance past $offset (got $advancedTo)")
                        return@withContext false
                    }
                    offset = advancedTo
                }
            }

            val completed = retry("upload complete") {
                val response = apiService.completeRecordingUpload(uploadId)
                val data = response.data
                if (!response.success || data == null) {
                    throw IllegalStateException(response.error?.message ?: "complete rejected")
                }
                data
            }
            if (completed.recordingId.isNullOrBlank()) {
                Logger.e("Uploader: server ACK missing recordingId - keeping ${file.name}")
                return@withContext false
            }

            Logger.i("Uploader: done recordingId=${completed.recordingId} file=${file.name}")
            true
        } catch (c: CancellationException) {
            throw c
        } catch (e: Exception) {
            Logger.e("Uploader: failed for ${file.name} - keeping local file", e)
            false
        }
    }

    private suspend fun <T> retry(what: String, block: suspend () -> T): T {
        var last: Throwable? = null
        for (attempt in 1..RETRY_ATTEMPTS) {
            try {
                return block()
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                last = t
                if (attempt == RETRY_ATTEMPTS) {
                    Logger.e("Uploader: $what failed after $RETRY_ATTEMPTS attempts", t)
                } else {
                    Logger.w("Uploader: $what attempt $attempt/$RETRY_ATTEMPTS failed: ${t.message} - retrying")
                    delay(RETRY_BASE_DELAY_MS shl (attempt - 1))
                }
            }
        }
        throw last ?: IllegalStateException("$what failed")
    }

    private fun sha256Of(file: File): String = sha256OfStream(FileInputStream(file))

    companion object {
        /** Raw bytes per request (base64 => ~6.7 MB on the wire, < 10 MB cap). */
        const val CHUNK_BYTES = 5 * 1024 * 1024

        /** Below this a file is a discarded fragment, not a recording. */
        const val MIN_USEFUL_BYTES = 1024L

        private const val RETRY_ATTEMPTS = 4
        private const val RETRY_BASE_DELAY_MS = 1_000L

        /** SHA-256 of a whole stream, hex-encoded lowercase (register + upload must agree). */
        fun sha256OfStream(input: InputStream): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(256 * 1024)
            input.use {
                while (true) {
                    val read = it.read(buffer)
                    if (read < 0) break
                    digest.update(buffer, 0, read)
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
    }
}
