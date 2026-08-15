package com.prisonconnect.kiosk

import android.app.Application
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
