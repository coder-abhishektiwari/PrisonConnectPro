package com.prisonconnect.kiosk.recordings

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.prisonconnect.kiosk.core.Logger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * On-device owner of a finished recording's lifecycle: drop what is unusable,
 * then encrypt the master in place with [RecordingVault].
 *
 * WorkManager retries with exponential backoff so a crash can never strand a
 * plaintext master. The master never leaves this kiosk — Call History plays it
 * back through [com.prisonconnect.kiosk.core.LocalRecordings].
 */
class RecordingVaultWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val path = inputData.getString(KEY_PATH) ?: return Result.success()
        val file = File(path)

        // Plain file gone => a previous attempt already encrypted it.
        if (!file.exists()) return Result.success()
        if (file.length() < MIN_USEFUL_BYTES) {
            Logger.d("VaultWorker: dropping unusable file ${file.name}")
            file.delete()
            return Result.success()
        }

        val ok = encryptInPlace(file)
        return when {
            ok -> Result.success()
            runAttemptCount < MAX_ATTEMPTS -> Result.retry()
            else -> {
                // File stays plaintext and is re-queued at the next process start.
                Logger.e("VaultWorker: giving up on ${file.name} after $runAttemptCount attempts - kept locally")
                Result.failure()
            }
        }
    }

    private suspend fun encryptInPlace(file: File): Boolean =
        withContext(Dispatchers.IO) {
            try {
                if (!RecordingVault.isEncrypted(file)) RecordingVault.encrypt(file)
                Logger.i("VaultWorker: encrypted ${file.name} (kept on kiosk)")
                true
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                Logger.e("VaultWorker: failed for ${file.name}", t)
                false
            }
        }

    companion object {
        private const val KEY_PATH = "path"

        private const val MAX_ATTEMPTS = 8

        /** A recording that is still being written must never be touched. */
        private const val MIN_USEFUL_BYTES = 1024L

        private const val MIN_FILE_AGE_MS = 2 * 60 * 1000L

        /** Call ended: encrypt the master in place. */
        fun enqueueEncrypt(context: Context, file: File) {
            val request = OneTimeWorkRequestBuilder<RecordingVaultWorker>()
                .setInputData(workDataOf(KEY_PATH to file.absolutePath))
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "recording-encrypt-${file.name}",
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request
            )
        }

        /**
         * Crash/restart recovery: every plaintext master left on disk is queued
         * for encryption again. Encrypted files and files that are recent
         * (mid-call) or trivially small are skipped.
         */
        fun scanPending(context: Context) {
            try {
                val dir = context.getExternalFilesDir("Recordings") ?: return
                val now = System.currentTimeMillis()
                dir.listFiles()?.forEach { f ->
                    if (!f.isFile || !f.name.startsWith("rec-")) return@forEach
                    if (f.name.endsWith(".enc") || f.name.endsWith(".tmp")) return@forEach
                    if (f.length() < MIN_USEFUL_BYTES) return@forEach
                    if (now - f.lastModified() < MIN_FILE_AGE_MS) return@forEach
                    Logger.i("VaultWorker: re-queueing pending ${f.name}")
                    enqueueEncrypt(context, f)
                }
            } catch (t: Throwable) {
                Logger.w("VaultWorker: pending scan failed: ${t.message}")
            }
        }
    }
}
