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
import com.prisonconnect.kiosk.core.Logger
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Uploads one finished recording file. Enqueued the moment a call's MP4 is
 * finalised, and re-enqueued for every leftover file found at process start,
 * so a crash or network outage can never strand a recording on the device:
 * WorkManager retries with exponential backoff and the uploader resumes each
 * attempt where the server left off.
 */
class RecordingUploadWorker(
    appContext: Context,
    params: WorkerParameters,
    private val uploader: RecordingUploader
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val path = inputData.getString(KEY_PATH) ?: return Result.success()
        val callId = inputData.getString(KEY_CALL_ID).orEmpty()
        val file = File(path)
        if (!file.exists()) return Result.success()

        val ok = try {
            uploader.upload(file, callId)
        } catch (c: kotlinx.coroutines.CancellationException) {
            throw c
        } catch (t: Throwable) {
            Logger.e("UploadWorker: unexpected failure for ${file.name}", t)
            false
        }

        return when {
            ok -> Result.success()
            runAttemptCount < MAX_ATTEMPTS -> Result.retry()
            else -> {
                // File stays on disk; the next process start enqueues it again.
                Logger.e("UploadWorker: giving up on ${file.name} after $runAttemptCount attempts - kept locally")
                Result.failure()
            }
        }
    }

    /** Hilt wiring without androidx-hilt-work: plain entry point + factory. */
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun recordingUploader(): RecordingUploader
    }

    companion object {
        private const val KEY_PATH = "path"
        private const val KEY_CALL_ID = "callId"
        private const val MAX_ATTEMPTS = 8

        /** The file of a call that is still being recorded must not be sent. */
        private const val MIN_FILE_AGE_MS = 2 * 60 * 1000L

        fun enqueue(context: Context, file: File, callId: String) {
            val request = OneTimeWorkRequestBuilder<RecordingUploadWorker>()
                .setInputData(
                    workDataOf(
                        KEY_PATH to file.absolutePath,
                        KEY_CALL_ID to callId
                    )
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "recording-upload-${file.name}",
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request
            )
        }

        /**
         * Crash/restart recovery: every finished, still-local recording is
         * queued again. Files that are recent (mid-call) or trivially small
         * are skipped.
         */
        fun scanPending(context: Context) {
            try {
                val dir = context.getExternalFilesDir("Recordings") ?: return
                val now = System.currentTimeMillis()
                dir.listFiles()?.forEach { f ->
                    if (!f.isFile || !f.name.startsWith("rec-")) return@forEach
                    if (f.length() < 1024L) return@forEach
                    if (now - f.lastModified() < MIN_FILE_AGE_MS) return@forEach
                    Logger.i("UploadWorker: re-queueing pending ${f.name}")
                    enqueue(context, f, callIdOf(f.name))
                }
            } catch (t: Throwable) {
                Logger.w("UploadWorker: pending scan failed: ${t.message}")
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
        return RecordingUploadWorker(appContext, workerParameters, deps.recordingUploader())
    }
}
