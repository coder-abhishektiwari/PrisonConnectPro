package com.prisonconnect.kiosk.navigation

import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.prisonconnect.kiosk.ui.SplashScreen
import com.prisonconnect.kiosk.ui.auth.LoginScreen
import com.prisonconnect.kiosk.ui.call.AudioCallScreen
import com.prisonconnect.kiosk.ui.call.CallProgressScreen
import com.prisonconnect.kiosk.ui.call.ScheduleCallScreen
import com.prisonconnect.kiosk.ui.call.VideoCallScreen
import com.prisonconnect.kiosk.ui.dashboard.DashboardScreen
import com.prisonconnect.kiosk.models.call.ScheduledCall
import com.prisonconnect.kiosk.ui.admin.AddPrisonerScreen
import com.prisonconnect.kiosk.ui.admin.AdminDashboardScreen
import com.prisonconnect.kiosk.ui.admin.DeviceInfoScreen
import com.prisonconnect.kiosk.ui.admin.ManagePrisonersScreen
import com.prisonconnect.kiosk.ui.receipt.CallSummaryScreen
import com.prisonconnect.kiosk.ui.MainViewModel
import com.prisonconnect.kiosk.ui.call.CallViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.currentBackStackEntryAsState
import android.net.Uri
import com.prisonconnect.kiosk.MainActivity

object KioskRoutes {
    const val SPLASH = "splash"
    const val REGISTRATION = "registration"
    const val LOGIN = "login"
    const val UNAUTHORIZED = "unauthorized"
    const val DASHBOARD = "dashboard"
    const val ADMIN_DASHBOARD = "admin_dashboard"
    const val ADMIN_ADD_PRISONER = "admin_add_prisoner"
    const val ADMIN_MANAGE_PRISONERS = "admin_manage_prisoners"
    const val ADMIN_EDIT_PRISONER = "admin_edit_prisoner/{prisonerId}"
    const val ADMIN_PRISONER_CONTACTS = "admin_prisoner_contacts/{prisonerId}"
    const val ADMIN_DEVICE_INFO = "admin_device_info"
    const val WALLET = "wallet"
    const val SCHEDULE = "schedule/{contactId}/{contactName}/{callType}"
    const val VIDEO_CALL = "video_call/{contactName}/{roomId}"
    const val AUDIO_CALL = "audio_call/{contactName}/{roomId}"
    const val CALL_SUMMARY = "call_summary/{contactName}/{total}/{duration}/{callType}"
}

@Composable
fun KioskNavHost(
    navController: NavHostController = rememberNavController(),
    windowSizeClass: WindowSizeClass,
    viewModel: MainViewModel = hiltViewModel()
) {
    val isDeviceAuthorized by viewModel.isDeviceAuthorized.collectAsState()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val context = LocalContext.current

    // Tell MainActivity to skip auto-logout during lobby/call
    LaunchedEffect(currentRoute) {
        val activity = context as? MainActivity
        activity?.isInCall = currentRoute != null && (
            currentRoute!!.startsWith("call_progress") ||
            currentRoute!!.startsWith("video_call") ||
            currentRoute!!.startsWith("audio_call")
        )
    }

    LaunchedEffect(isDeviceAuthorized) {
        if (!isDeviceAuthorized && currentRoute != KioskRoutes.UNAUTHORIZED && currentRoute != KioskRoutes.SPLASH && currentRoute != KioskRoutes.REGISTRATION) {
            navController.navigate(KioskRoutes.UNAUTHORIZED) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(navController = navController, startDestination = KioskRoutes.SPLASH) {
        composable(KioskRoutes.SPLASH) {
            SplashScreen(
                onNavigateToRegistration = {
                    navController.navigate(KioskRoutes.REGISTRATION) {
                        popUpTo(KioskRoutes.SPLASH) { inclusive = true }
                    }
                },
                onNavigateToLogin = {
                    navController.navigate(KioskRoutes.LOGIN) {
                        popUpTo(KioskRoutes.SPLASH) { inclusive = true }
                    }
                },
                onNavigateToUnauthorized = {
                    navController.navigate(KioskRoutes.UNAUTHORIZED) {
                        popUpTo(KioskRoutes.SPLASH) { inclusive = true }
                    }
                },
                onNavigateToDashboard = {
                    navController.navigate(KioskRoutes.DASHBOARD) {
                        popUpTo(KioskRoutes.SPLASH) { inclusive = true }
                    }
                }
            )
        }
        composable(KioskRoutes.REGISTRATION) {
            val regViewModel: com.prisonconnect.kiosk.ui.registration.KioskRegistrationViewModel = hiltViewModel()
            com.prisonconnect.kiosk.ui.registration.KioskRegistrationScreen(
                viewModel = regViewModel,
                onRegistrationApproved = {
                    navController.navigate(KioskRoutes.SPLASH) {
                        popUpTo(KioskRoutes.REGISTRATION) { inclusive = true }
                    }
                }
            )
        }

        composable(KioskRoutes.UNAUTHORIZED) {
            LoginScreen(
                windowSizeClass = windowSizeClass,
                onLoginSuccess = {
                    navController.navigate(KioskRoutes.DASHBOARD) {
                        popUpTo(KioskRoutes.UNAUTHORIZED) { inclusive = true }
                    }
                },
                onAdminLoginSuccess = {
                    navController.navigate(KioskRoutes.ADMIN_DASHBOARD) {
                        popUpTo(KioskRoutes.UNAUTHORIZED) { inclusive = true }
                    }
                }
            )
        }
        composable(KioskRoutes.LOGIN) {
            LoginScreen(
                windowSizeClass = windowSizeClass,
                onLoginSuccess = {
                    navController.navigate(KioskRoutes.DASHBOARD) {
                        popUpTo(KioskRoutes.LOGIN) { inclusive = true }
                    }
                },
                onAdminLoginSuccess = {
                    navController.navigate(KioskRoutes.ADMIN_DASHBOARD) {
                        popUpTo(KioskRoutes.LOGIN) { inclusive = true }
                    }
                }
            )
        }
        composable(KioskRoutes.DASHBOARD) {
            DashboardScreen(
                windowSizeClass = windowSizeClass,
                onContactClick = { _, _, _ -> },
                onScheduledCallClick = { _: ScheduledCall -> },
                onWalletClick = {
                    navController.navigate(KioskRoutes.WALLET)
                },
                onLogoutClick = {
                    navController.navigate(KioskRoutes.LOGIN) {
                        popUpTo(KioskRoutes.DASHBOARD) { inclusive = true }
                    }
                },
                onScheduleCall = { contactId, contactName ->
                    navController.navigate("schedule/${Uri.encode(contactId)}/${Uri.encode(contactName)}/Video")
                },
                onStartCall = { contactId, contactName, roomId, isVideo ->
                    navController.navigate("call_progress/${Uri.encode(contactName)}/$roomId/$isVideo")
                }
            )
        }
        composable(KioskRoutes.ADMIN_DASHBOARD) {
            AdminDashboardScreen(
                windowSizeClass = windowSizeClass,
                onAddPrisonerClick = {
                    navController.navigate(KioskRoutes.ADMIN_ADD_PRISONER)
                },
                onManagePrisonersClick = {
                    navController.navigate(KioskRoutes.ADMIN_MANAGE_PRISONERS)
                },
                onDeviceInfoClick = {
                    navController.navigate(KioskRoutes.ADMIN_DEVICE_INFO)
                },
                onLogoutClick = {
                    navController.navigate(KioskRoutes.LOGIN) {
                        popUpTo(KioskRoutes.ADMIN_DASHBOARD) { inclusive = true }
                    }
                }
            )
        }
        composable(KioskRoutes.ADMIN_ADD_PRISONER) {
            AddPrisonerScreen(
                windowSizeClass = windowSizeClass,
                onBackClick = { navController.popBackStack() },
                onComplete = {
                    navController.navigate(KioskRoutes.ADMIN_DASHBOARD) {
                        popUpTo(KioskRoutes.ADMIN_DASHBOARD) { inclusive = true }
                    }
                }
            )
        }
        composable(KioskRoutes.ADMIN_MANAGE_PRISONERS) {
            ManagePrisonersScreen(
                windowSizeClass = windowSizeClass,
                onBackClick = { navController.popBackStack() },
                onPrisonerClick = { prisonerId ->
                    navController.navigate("admin_edit_prisoner/$prisonerId")
                },
                onManageContactsClick = { prisonerId ->
                    navController.navigate("admin_prisoner_contacts/$prisonerId")
                }
            )
        }
        composable(KioskRoutes.ADMIN_EDIT_PRISONER) { backStackEntry ->
            val prisonerId = backStackEntry.arguments?.getString("prisonerId") ?: ""
            com.prisonconnect.kiosk.ui.admin.EditPrisonerScreen(
                prisonerId = prisonerId,
                windowSizeClass = windowSizeClass,
                onBackClick = { navController.popBackStack() }
            )
        }
        composable(KioskRoutes.ADMIN_PRISONER_CONTACTS) { backStackEntry ->
            val prisonerId = backStackEntry.arguments?.getString("prisonerId") ?: ""
            com.prisonconnect.kiosk.ui.admin.ManageContactsScreen(
                prisonerId = prisonerId,
                onBackClick = { navController.popBackStack() }
            )
        }
        composable(KioskRoutes.ADMIN_DEVICE_INFO) {
            DeviceInfoScreen(
                windowSizeClass = windowSizeClass,
                onBackClick = { navController.popBackStack() }
            )
        }
        composable(KioskRoutes.WALLET) {
            com.prisonconnect.kiosk.ui.wallet.WalletScreen(
                windowSizeClass = windowSizeClass,
                onBackClick = { navController.popBackStack() }
            )
        }
        composable(KioskRoutes.SCHEDULE) { backStackEntry ->
            val contactId = backStackEntry.arguments?.getString("contactId") ?: ""
            val contactName = backStackEntry.arguments?.getString("contactName") ?: ""
            val callType = backStackEntry.arguments?.getString("callType") ?: "Video"
            ScheduleCallScreen(
                contactId = contactId,
                contactName = contactName,
                initialCallType = callType,
                windowSizeClass = windowSizeClass,
                onSlotSelected = { _, _, _ ->
                    // Success logic handled inside the screen with dialog
                },
                onBackToHome = {
                    navController.navigate(KioskRoutes.DASHBOARD) {
                        popUpTo(KioskRoutes.DASHBOARD) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable("call_progress/{contactName}/{roomId}/{isVideo}") { backStackEntry ->
            val contactName = backStackEntry.arguments?.getString("contactName") ?: ""
            val roomId = backStackEntry.arguments?.getString("roomId") ?: ""
            val isVideo = backStackEntry.arguments?.getString("isVideo")?.toBoolean() ?: true
            CallProgressScreen(
                contactName = contactName,
                roomId = roomId,
                isVideoCall = isVideo,
                onConnected = {
                    // Media is live ��� only now enter the actual call screen.
                    navController.navigate(
                        if (isVideo) "video_call/$contactName/$roomId"
                        else "audio_call/$contactName/$roomId"
                    ) {
                        popUpTo("call_progress/$contactName/$roomId/$isVideo") { inclusive = true }
                    }
                },
                onFailed = { navController.popBackStack() },
                onCancel = { navController.popBackStack() }
            )
        }
        composable(KioskRoutes.VIDEO_CALL) { backStackEntry ->
            val contactName = backStackEntry.arguments?.getString("contactName") ?: ""
            val roomId = backStackEntry.arguments?.getString("roomId") ?: ""
            // Same singleton engine as the call screens — real live billing.
            val callViewModel: CallViewModel = hiltViewModel()
            val liveCost by callViewModel.liveCost.collectAsState()
            val timerSeconds by callViewModel.timerSeconds.collectAsState()
            VideoCallScreen(
                contactName = contactName,
                roomId = roomId,
                windowSizeClass = windowSizeClass,
                onEndCall = {
                    val duration = (timerSeconds / 60).toString()
                    navController.navigate("call_summary/$contactName/${String.format("%.2f", liveCost)}/$duration/video") {
                        popUpTo(KioskRoutes.VIDEO_CALL) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable(KioskRoutes.AUDIO_CALL) { backStackEntry ->
            val contactName = backStackEntry.arguments?.getString("contactName") ?: ""
            val roomId = backStackEntry.arguments?.getString("roomId") ?: ""
            val callViewModel: CallViewModel = hiltViewModel()
            val liveCost by callViewModel.liveCost.collectAsState()
            val timerSeconds by callViewModel.timerSeconds.collectAsState()
            AudioCallScreen(
                contactName = contactName,
                roomId = roomId,
                windowSizeClass = windowSizeClass,
                onEndCall = {
                    val duration = (timerSeconds / 60).toString()
                    navController.navigate("call_summary/$contactName/${String.format("%.2f", liveCost)}/$duration/audio") {
                        popUpTo(KioskRoutes.AUDIO_CALL) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable(KioskRoutes.CALL_SUMMARY) { backStackEntry ->
            val contactName = backStackEntry.arguments?.getString("contactName") ?: ""
            val total = backStackEntry.arguments?.getString("total") ?: "0.00"
            val duration = backStackEntry.arguments?.getString("duration") ?: "0"
            val callType = backStackEntry.arguments?.getString("callType") ?: "video"
            CallSummaryScreen(
                contactName = contactName,
                duration = duration,
                totalCharged = total,
                callType = callType,
                windowSizeClass = windowSizeClass,
                onBackToHome = {
                    navController.navigate(KioskRoutes.DASHBOARD) {
                        popUpTo(KioskRoutes.DASHBOARD) { inclusive = true }
                    }
                }
            )
        }
    }
}


