package com.prisonconnect.kiosk.core

import android.content.Context
import com.prisonconnect.kiosk.recordings.RecordingVault
import java.io.File

/**
 * Local-only view of the kiosk's recording vault. Masters live in
 * `getExternalFilesDir("Recordings")` as `rec-<callId>-<millis>.mp4` and are
 * encrypted in place by [RecordingVault] once finalized. The Call History
 * screen uses this to answer "does this call have a recording on this kiosk"
 * and to obtain a plain playback copy — nothing here talks to the network.
 */
object LocalRecordings {

    fun dirOf(context: Context): File =
        context.getExternalFilesDir("Recordings") ?: File(context.filesDir, "Recordings")

    /** Call ids (roomIds) that have any local master, encrypted or plain. */
    fun callIds(context: Context): Set<String> =
        dirOf(context).listFiles()
            ?.asSequence()
            ?.filter { isMaster(it) }
            ?.mapNotNull { callIdOf(it.name) }
            ?.toSet()
            ?: emptySet()

    /** Resolves the local master for [callId], preferring a plain file. */
    fun findFor(context: Context, callId: String): File? {
        val candidates = dirOf(context).listFiles()?.filter {
            isMaster(it) && it.name.startsWith("rec-$callId-")
        } ?: return null
        return candidates.firstOrNull { !it.name.endsWith(".enc") }
            ?: candidates.firstOrNull()
    }

    /**
     * Returns a file the caller can hand to a MediaPlayer. Encrypted masters
     * are decrypted into the cache dir (caller deletes that temp copy when
     * playback ends); plain files are returned as-is and must NOT be deleted.
     *
     * [onProgress] (if set) receives `(bytesDone, bytesTotal)` while the
     * decrypt runs; plain files report completion immediately.
     */
    fun materializeForPlay(
        context: Context,
        callId: String,
        onProgress: ((Long, Long) -> Unit)? = null
    ): File? {
        val master = findFor(context, callId) ?: return null
        if (!master.name.endsWith(".enc")) {
            onProgress?.invoke(1L, 1L)
            return master
        }
        val dest = File(context.cacheDir, "play-$callId.mp4")
        if (dest.exists()) dest.delete()
        RecordingVault.decrypt(master, dest, onProgress)
        return dest
    }

    private fun isMaster(file: File): Boolean =
        file.isFile &&
            file.name.startsWith("rec-") &&
            !file.name.endsWith(".tmp") &&
            !file.name.startsWith(".")

    /** `rec-<callId>-<millis>.mp4[.enc]` -> callId. */
    private fun callIdOf(fileName: String): String? {
        val callId = fileName.removePrefix("rec-").substringBeforeLast('-')
        return callId.takeIf { it.isNotBlank() }
    }
}
