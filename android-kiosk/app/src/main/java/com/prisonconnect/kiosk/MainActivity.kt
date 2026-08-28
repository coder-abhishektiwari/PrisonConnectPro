package com.prisonconnect.kiosk

import android.os.Bundle
import android.view.MotionEvent
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.rememberNavController
import com.prisonconnect.kiosk.BuildConfig
import com.prisonconnect.kiosk.core.SessionManager
import com.prisonconnect.kiosk.navigation.KioskNavHost
import com.prisonconnect.kiosk.ui.theme.PrisonKioskTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Single-activity entry point hosting the Compose navigation graph.
 */
@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    @Inject lateinit var sessionManager: SessionManager

    private var inactivityJob: Job? = null
    private val AUTO_LOGOUT_TIMEOUT_MS = BuildConfig.AUTO_LOGOUT_TIMEOUT_MS

    /** Set by KioskNavHost when lobby/call screens are active — timer skips logout. */
    @Volatile var isInCall: Boolean = false

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Enable Kiosk Mode: Full screen immersive experience
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        setContent {
            PrisonKioskTheme {
                val windowSizeClass = calculateWindowSizeClass(this)
                Surface(modifier = Modifier.fillMaxSize()) {
                    val navController = rememberNavController()
                    KioskNavHost(
                        navController = navController,
                        windowSizeClass = windowSizeClass
                    )
                }
            }
        }

        resetInactivityTimer()
    }

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        resetInactivityTimer()
        return super.dispatchTouchEvent(ev)
    }

    private fun resetInactivityTimer() {
        inactivityJob?.cancel()
        inactivityJob = lifecycleScope.launch {
            // Only start timer if user is actually logged in
            val hasSession = sessionManager.hasValidSession()
            if (!hasSession) return@launch

            delay(AUTO_LOGOUT_TIMEOUT_MS)
            // Skip logout during active call/lobby
            if (isInCall) return@launch
            // Re-check session before logout (user may have logged in during delay)
            val stillLoggedIn = sessionManager.hasValidSession()
            if (stillLoggedIn) {
                sessionManager.clearAuthOnly()
                recreate()
            }
        }
    }

    override fun onPause() {
        super.onPause()
        inactivityJob?.cancel()
    }

    override fun onResume() {
        super.onResume()
        resetInactivityTimer()
    }
}
