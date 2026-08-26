package com.prisonconnect.kiosk.ui.call

import android.content.Context
import androidx.lifecycle.ViewModel
import com.prisonconnect.kiosk.models.call.SocketStatus
import com.prisonconnect.kiosk.models.call.SignalingStatus
import com.prisonconnect.kiosk.models.contacts.Contact
import com.prisonconnect.kiosk.models.inmate.InmateProfile
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.StateFlow
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack
import javax.inject.Inject

/**
 * Thin per-screen wrapper around the singleton [CallEngine]. Both the call
 * progress screen and the actual call screen share the same engine instance,
 * so navigating between them never tears down an active session.
 */
@HiltViewModel
class CallViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    val engine: CallEngine
) : ViewModel() {

    val callState: StateFlow<CallUIState> = engine.callState
    val familyStage: StateFlow<FamilyStage> = engine.familyStage
    val timerSeconds: StateFlow<Int> = engine.timerSeconds
    val isMuted: StateFlow<Boolean> = engine.isMuted
    val isCameraOn: StateFlow<Boolean> = engine.isCameraOn
    val isSpeakerOn: StateFlow<Boolean> = engine.isSpeakerOn
    val inmateProfile: StateFlow<InmateProfile?> = engine.inmateProfile
    val contactProfile: StateFlow<Contact?> = engine.contactProfile
    val socketStatus: StateFlow<SocketStatus> = engine.socketStatus
    val signalingStatus: StateFlow<SignalingStatus> = engine.signalingStatus
    val localVideoTrack: StateFlow<VideoTrack?> = engine.localVideoTrack
    val remoteVideoTrack: StateFlow<VideoTrack?> = engine.remoteVideoTrack
    val rtcConnectionState: StateFlow<PeerConnection.PeerConnectionState> = engine.rtcConnectionState
    val isNetworkAvailable: StateFlow<Boolean> = engine.isNetworkAvailable
    val isRecording: StateFlow<Boolean> = engine.isRecording
    val deviceVerifyFailed: StateFlow<Boolean> = engine.deviceVerifyFailed
    val otpVerifyFailed: StateFlow<Boolean> = engine.otpVerifyFailed
    val familyLeft: StateFlow<Boolean> = engine.familyLeft
    val liveCost: StateFlow<Double> = engine.liveCost
    val maxCallSeconds: StateFlow<Int> = engine.maxCallSeconds

    val eglContext: EglBase.Context
        get() = engine.eglContext

    fun initCall(context: Context, roomId: String, isVideoCall: Boolean = true) {
        engine.initCall(context, roomId, isVideoCall, AppConfigBridge.lastCallId)
    }

    fun endCall() {
        engine.endCall(appContext)
    }

    fun toggleMute() = engine.toggleMute()
    fun toggleCamera() = engine.toggleCamera()
    fun toggleSpeaker() = engine.toggleSpeaker()
    fun switchCamera() = engine.switchCamera()
}
