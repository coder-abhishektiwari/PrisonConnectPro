package com.prisonconnect.kiosk.upload

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.BackoffPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.core.Logger
import com.prisonconnect.kiosk.models.auth.PendingRetrieval
import com.prisonconnect.kiosk.models.call.RecordingRegisterRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.util.concurrent.TimeUnit

/**
 * Background owner of a finished recording's whole on-device lifecycle.
 *
 * Two jobs, both retried with exponential backoff by WorkManager so a crash
 * or network outage can never strand a recording:
 *
 *  - REGISTER: called the moment a call's MP4 is finalised (and again for
 *    leftovers found at process start). Posts the metadata to
 *    `POST /recordings/register` — the dashboard row appears immediately —
 *    then encrypts the file in place with [RecordingVault]. The master copy
 *    stays on the device; nothing is uploaded yet.
 *
 *  - RETRIEVE: enqueued when the heartbeat reports a warden asked for this
 *    recording. Decrypts (if needed) and pushes the file to the backend via
 *    the existing chunked, resumable uploader. The master copy is kept.
 */
class RecordingUploadWorker(
    appContext: Context,
    params: WorkerParameters,
    private val uploader: RecordingUploader,
    private val apiService: TrustApiService
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return if (inputData.getString(KEY_MODE) == MODE_RETRIEVE) doRetrieve() else doRegister()
    }

    // ---- register: metadata to the backend, then encrypt the local master ----

    private suspend fun doRegister(): Result {
        val path = inputData.getString(KEY_PATH) ?: return Result.success()
        val callId = inputData.getString(KEY_CALL_ID).orEmpty()
        val duration = inputData.getInt(KEY_DURATION_SECONDS, -1).takeIf { it > 0 }
        val file = File(path)
        // Plain file gone => a previous attempt already encrypted it.
        if (!file.exists()) return Result.success()
        if (file.length() < RecordingUploader.MIN_USEFUL_BYTES) {
            Logger.d("RegisterWorker: dropping unusable file ${file.name}")
            file.delete()
            return Result.success()
        }
        if (callId.isBlank()) {
            Logger.e("RegisterWorker: no callId for ${file.name} - keeping file")
            return Result.failure()
        }

        val ok = registerAndEncrypt(file, callId, duration)
        return when {
            ok -> Result.success()
            runAttemptCount < MAX_ATTEMPTS -> Result.retry()
            else -> {
                // File stays plaintext and is re-queued at the next process start.
                Logger.e("RegisterWorker: giving up on ${file.name} after $runAttemptCount attempts - kept locally")
                Result.failure()
            }
        }
    }

    private suspend fun registerAndEncrypt(file: File, callId: String, durationSeconds: Int?): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val size = file.length()
                val sha256 = RecordingUploader.sha256OfStream(FileInputStream(file))
                Logger.i("RegisterWorker: ${file.name} size=$size sha256=${sha256.take(12)}…")

                val response = apiService.registerRecording(
                    RecordingRegisterRequest(
                        callId = callId,
                        fileName = file.name,
                        size = size,
                        sha256 = sha256,
                        durationSeconds = durationSeconds
                    )
                )
                val data = response.data
                if (!response.success || data?.recordingId.isNullOrBlank()) {
                    Logger.e("RegisterWorker: register rejected: ${response.error?.message}")
                    return@withContext false
                }
                Logger.i("RegisterWorker: registered ${data?.recordingId} storage=kiosk")

                // Encrypt only once the backend knows this recording exists.
                if (!RecordingVault.isEncrypted(file)) {
                    RecordingVault.encrypt(file)
                }
                true
            } catch (c: kotlinx.coroutines.CancellationException) {
                throw c
            } catch (t: Throwable) {
                Logger.e("RegisterWorker: failed for ${file.name}", t)
                false
            }
        }

    // ---- retrieve: push the master copy to a warden's request ----

    private suspend fun doRetrieve(): Result {
        val recordingId = inputData.getString(KEY_RECORDING_ID) ?: return Result.success()
        val callId = inputData.getString(KEY_CALL_ID).orEmpty()
        val localName = inputData.getString(KEY_LOCAL_FILE)?.takeIf { it.isNotBlank() }
        if (callId.isBlank()) return Result.failure()

        val ok = try {
            retrieve(recordingId, callId, localName)
        } catch (c: kotlinx.coroutines.CancellationException) {
            throw c
        } catch (t: Throwable) {
            Logger.e("RetrieveWorker: failed for $recordingId", t)
            false
        }

        return when {
            ok -> Result.success()
            runAttemptCount < MAX_ATTEMPTS -> Result.retry()
            else -> {
                Logger.e("RetrieveWorker: giving up on $recordingId after $runAttemptCount attempts")
                Result.failure()
            }
        }
    }

    private suspend fun retrieve(recordingId: String, callId: String, localName: String?): Boolean {
        val dir = applicationContext.getExternalFilesDir("Recordings")
            ?: File(applicationContext.filesDir, "Recordings")
        val enc = locate(dir, localName, callId, encrypted = true)
        val plain = locate(dir, localName, callId, encrypted = false)

        return when {
            enc != null -> {
                val tmp = File(dir, ".retrieve-${recordingId}.mp4")
                try {
                    RecordingVault.decrypt(enc, tmp)
                    uploader.upload(tmp, callId)
                } finally {
                    tmp.delete()
                }
            }
            plain != null -> uploader.upload(plain, callId)
            else -> {
                // Nothing on disk (already swept or never written): don't spin.
                Logger.w("RetrieveWorker: no local file for $recordingId (callId=$callId)")
                true
            }
        }
    }

    /** Prefers the exact registered name, then any `rec-<callId>-*` file. */
    private fun locate(dir: File, localName: String?, callId: String, encrypted: Boolean): File? {
        if (!localName.isNullOrBlank()) {
            val direct = File(dir, if (encrypted) "$localName.enc" else localName)
            if (direct.isFile) return direct
        }
        return dir.listFiles()?.firstOrNull { f ->
            f.isFile &&
                f.name.startsWith("rec-$callId-") &&
                !f.name.endsWith(".tmp") &&
                !f.name.startsWith(".retrieve-") &&
                if (encrypted) f.name.endsWith(".enc") else !f.name.endsWith(".enc")
        }
    }

    /** Hilt wiring without androidx-hilt-work: plain entry point + factory. */
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun recordingUploader(): RecordingUploader
        fun trustApiService(): TrustApiService
    }

    companion object {
        private const val KEY_MODE = "mode"
        private const val KEY_PATH = "path"
        private const val KEY_CALL_ID = "callId"
        private const val KEY_DURATION_SECONDS = "durationSeconds"
        private const val KEY_RECORDING_ID = "recordingId"
        private const val KEY_LOCAL_FILE = "localFile"

        private const val MODE_REGISTER = "register"
        private const val MODE_RETRIEVE = "retrieve"

        private const val MAX_ATTEMPTS = 8

        /** The file of a call that is still being recorded must not be sent. */
        private const val MIN_FILE_AGE_MS = 2 * 60 * 1000L

        /** Call ended: register metadata, then encrypt the master in place. */
        fun enqueueRegister(context: Context, file: File, callId: String, durationSeconds: Int? = null) {
            val request = OneTimeWorkRequestBuilder<RecordingUploadWorker>()
                .setInputData(
                    workDataOf(
                        KEY_MODE to MODE_REGISTER,
                        KEY_PATH to file.absolutePath,
                        KEY_CALL_ID to callId,
                        KEY_DURATION_SECONDS to (durationSeconds ?: -1)
                    )
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "recording-register-${file.name}",
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request
            )
        }

        /** A warden asked for this recording over the heartbeat: push it up. */
        fun enqueueRetrieve(context: Context, pending: PendingRetrieval) {
            val request = OneTimeWorkRequestBuilder<RecordingUploadWorker>()
                .setInputData(
                    workDataOf(
                        KEY_MODE to MODE_RETRIEVE,
                        KEY_RECORDING_ID to pending.recordingId,
                        KEY_CALL_ID to pending.callId,
                        KEY_LOCAL_FILE to (pending.fileName ?: "")
                    )
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            // KEEP: the heartbeat repeats this request every 30s while it is
            // still pending/running; duplicates must not queue up.
            WorkManager.getInstance(context).enqueueUniqueWork(
                "recording-retrieve-${pending.recordingId}",
                ExistingWorkPolicy.KEEP,
                request
            )
        }

        /**
         * Crash/restart recovery: every unregistered plaintext recording is
         * queued for register+encrypt again. Encrypted files are already
         * registered by construction (encrypt only runs after a 201), and
         * files that are recent (mid-call) or trivially small are skipped.
         */
        fun scanPending(context: Context) {
            try {
                val dir = context.getExternalFilesDir("Recordings") ?: return
                val now = System.currentTimeMillis()
                dir.listFiles()?.forEach { f ->
                    if (!f.isFile || !f.name.startsWith("rec-")) return@forEach
                    if (f.name.endsWith(".enc") || f.name.endsWith(".tmp")) return@forEach
                    if (f.length() < 1024L) return@forEach
                    if (now - f.lastModified() < MIN_FILE_AGE_MS) return@forEach
                    Logger.i("RegisterWorker: re-queueing pending ${f.name}")
                    enqueueRegister(context, f, callIdOf(f.name), null)
                }
            } catch (t: Throwable) {
                Logger.w("RegisterWorker: pending scan failed: ${t.message}")
            }
        }

        /** `rec-<roomId>-<millis>.mp4` -> `<roomId>` (backend accepts both). */
        private fun callIdOf(fileName: String): String =
            fileName.removePrefix("rec-").substringBeforeLast('-')
    }
}

class RecordingUploadWorkerFactory(
    private val app: android.app.Application
) : WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters
    ): androidx.work.ListenableWorker? {
        if (workerClassName != RecordingUploadWorker::class.java.name) return null
        val deps = dagger.hilt.android.EntryPointAccessors.fromApplication(
            app,
            RecordingUploadWorker.Deps::class.java
        )
        return RecordingUploadWorker(
            appContext,
            workerParameters,
            deps.recordingUploader(),
            deps.trustApiService()
        )
    }
}
