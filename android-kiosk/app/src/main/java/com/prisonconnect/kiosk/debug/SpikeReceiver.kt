package com.prisonconnect.kiosk.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.prisonconnect.kiosk.BuildConfig

/**
 * adb-triggered harness for [RecorderSpike]. Exported so `adb shell am
 * broadcast` can reach it, but a no-op in release builds.
 */
class SpikeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!BuildConfig.DEBUG) return
        if (intent.action != ACTION) return
        val pending = goAsync()
        Thread {
            try {
                RecorderSpike.run(context.applicationContext)
            } catch (e: Throwable) {
                com.prisonconnect.kiosk.core.Logger.e("RecorderSpike crashed", e)
            } finally {
                pending.finish()
            }
        }.start()
    }

    companion object {
        const val ACTION = "com.prisonconnect.kiosk.action.RECORDER_SPIKE"
    }
}
