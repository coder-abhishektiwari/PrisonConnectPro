package com.prisonconnect.kiosk

import android.app.Application
import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.config.Environment
import dagger.hilt.android.HiltAndroidApp

/**
 * PrisonConnect Inmate Kiosk Entry Application Class.
 */
@HiltAndroidApp
class PrisonKioskApp : Application() {

    override fun onCreate() {
        super.onCreate()
    }
}
