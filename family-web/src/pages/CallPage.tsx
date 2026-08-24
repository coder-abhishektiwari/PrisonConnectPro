import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { ErrorState } from '@/components/States';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/components/Toast';
import { socketService } from '@/services/socket';
import { webRtcService, type ConnectionState } from '@/services/webrtc';

type CallStatus =
  | 'initializing'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'error';

const RECONNECT_MAX_ATTEMPTS = 6;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Leave this world entirely — the link is dead once the kiosk hangs up. */
function goToBlank() {
  try {
    window.location.replace('about:blank');
  } catch (_) {
    /* ignore */
  }
}

async function waitForSocket(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (socketService.isConnected()) return true;
    await wait(250);
  }
  return socketService.isConnected();
}

export function CallPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const { session, otpResult, clear } = useSession();
  const { addToast } = useToast();

  // Call state
  const [status, setStatus] = useState<CallStatus>('initializing');
  const [statusMessage, setStatusMessage] = useState('Initializing call...');
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval>>();
  const peerIdRef = useRef(`family-${Date.now()}`);
  const joinStartedRef = useRef(false);
  const statusRef = useRef<CallStatus>('initializing');
  const wasConnectedRef = useRef(false);
  const reconnectingRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize call
  useEffect(() => {
    if (!session || !linkToken) {
      setStatus('error');
      setError('Missing session or link token.');
      return;
    }

    initializeCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, linkToken]);

  // Call timer
  useEffect(() => {
    if (status === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [status]);

  /**
   * Network dropped mid-call. Probe the signaling room: if the kiosk is still
   * sitting in it, rebuild the media path automatically; if it is gone, the
   * call is over — blank the page entirely.
   */
  const startReconnect = useCallback(() => {
    if (reconnectingRef.current || !wasConnectedRef.current) return;
    reconnectingRef.current = true;
    setStatus('reconnecting');
    setStatusMessage('Connection lost. Checking if the call is still active...');
    void (async () => {
      for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
        if (!wasConnectedRef.current) return; // call ended elsewhere
        try {
          setStatusMessage(`Restoring your call... (attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS})`);
          await wait(attempt === 1 ? 1500 : 3000);

          if (!socketService.isConnected()) {
            socketService.connect(session!, otpResult?.sessionToken);
            const ok = await waitForSocket(10000);
            if (!ok) continue;
          }

          const resp = await socketService.joinRoom(session!.roomId, peerIdRef.current);
          const peers: string[] = Array.isArray(resp?.existingPeers) ? resp.existingPeers : [];
          if (!resp?.success || peers.length === 0) {
            // Kiosk is no longer on the call — nothing to return to.
            goToBlank();
            return;
          }

          // Kiosk still waiting — rebuild the peer connection from scratch.
          webRtcService.close();
          await webRtcService.setupLocalMedia({ video: true, audio: true });
          await webRtcService.initialize(session!, []);
          joinStartedRef.current = true;
          await webRtcService.handleJoined(resp);

          // Give ICE a chance; if it lands, the 'connected' state handler
          // clears reconnectingRef and flips us back into the call UI.
          const deadline = Date.now() + 12000;
          while (Date.now() < deadline && wasConnectedRef.current) {
            await wait(500);
            if (webRtcService.getConnectionState() === 'connected') {
              reconnectingRef.current = false;
              return;
            }
          }
        } catch (err) {
          console.warn('[Call] Reconnect attempt failed:', err);
        }
      }
      // Exhausted every attempt without reaching the kiosk — blank out.
      goToBlank();
    })();
  }, [session, otpResult]);

  // Socket event listeners
  useEffect(() => {
    const handlePeerJoined = (_event: string, _data: any) => {
      console.log('[Call] Peer joined');
      if (statusRef.current === 'waiting') {
        setStatus('connecting');
        setStatusMessage('Connecting...');
      }
    };

    const handlePeerLeft = (_event: string, _data: any) => {
      console.log('[Call] Peer left');
      // Could be a network blip on the kiosk side — probe the room. If it is
      // truly gone the reconnect loop blanks the page.
      startReconnect();
    };

    const handleCallEnded = (_event: string, _data: any) => {
      console.log('[Call] Call ended');
      wasConnectedRef.current = false;
      setStatus('ended');
      setTimeout(goToBlank, 800);
    };

    const handleSystemEvent = (_event: string, data: any) => {
      switch (data.type) {
        case 'connected':
          console.log('[Call] Socket connected');
          if (!joinStartedRef.current) {
            joinRoom();
          }
          break;
        case 'disconnected':
          console.log('[Call] Socket disconnected:', data.reason);
          if (statusRef.current === 'connected' || statusRef.current === 'connecting') {
            startReconnect();
          }
          break;
        case 'connection_error':
          console.error('[Call] Socket connection error:', data.error);
          break;
      }
    };

    // Register listeners
    socketService.on('peer-joined', handlePeerJoined);
    socketService.on('peer-left', handlePeerLeft);
    socketService.on('call-ended', handleCallEnded);
    socketService.on('system', handleSystemEvent);

    return () => {
      socketService.off('peer-joined', handlePeerJoined);
      socketService.off('peer-left', handlePeerLeft);
      socketService.off('call-ended', handleCallEnded);
      socketService.off('system', handleSystemEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startReconnect]);

  // WebRTC event listeners
  useEffect(() => {
    const handleLocalStream = (_event: string, data: unknown) => {
      const stream = data as MediaStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    };

    const handleRemoteStream = (_event: string, data: unknown) => {
      const stream = data as MediaStream;
      console.log('[Call] Remote stream received');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    const handleConnectionStateChange = (_event: string, data: unknown) => {
      const state = data as ConnectionState;
      console.log('[Call] Connection state changed:', state);
      setConnectionState(state);

      switch (state) {
        case 'connecting':
          if (statusRef.current !== 'connected') {
            setStatus('connecting');
            setStatusMessage('Establishing connection...');
          }
          break;
        case 'connected':
          wasConnectedRef.current = true;
          reconnectingRef.current = false;
          setStatus('connected');
          setStatusMessage('Connected');
          break;
        case 'disconnected':
          startReconnect();
          break;
        case 'failed':
          if (wasConnectedRef.current) {
            startReconnect();
          } else {
            setStatus('error');
            setError('Could not reach the prison kiosk.');
            addToast('Connection failed', 'error');
          }
          break;
        case 'closed':
          if (!reconnectingRef.current) {
            setStatus('ended');
          }
          break;
      }
    };

    webRtcService.on('local-stream', handleLocalStream);
    webRtcService.on('remote-stream', handleRemoteStream);
    webRtcService.on('connection-state', handleConnectionStateChange);

    return () => {
      webRtcService.off('local-stream', handleLocalStream);
      webRtcService.off('remote-stream', handleRemoteStream);
      webRtcService.off('connection-state', handleConnectionStateChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startReconnect]);

  // Streams can arrive BEFORE the call UI mounts (tracks fire at
  // setRemoteDescription, long before ICE reaches 'connected'). Re-attach
  // them once the video elements actually exist, then force playback so
  // remote AUDIO is actually audible (autoplay policies can silently block).
  useEffect(() => {
    if (status !== 'connected') return;
    const remote = webRtcService.getRemoteStream();
    const local = webRtcService.getLocalStream();
    if (remote && remoteVideoRef.current && remoteVideoRef.current.srcObject !== remote) {
      remoteVideoRef.current.srcObject = remote;
    }
    if (local && localVideoRef.current && localVideoRef.current.srcObject !== local) {
      localVideoRef.current.srcObject = local;
    }
    const v = remoteVideoRef.current;
    if (v) {
      v.muted = false;
      v.volume = 1;
      v.play().catch((e) => console.warn('[Call] video.play() blocked:', e));
    }
  }, [status]);

  // Autoplay fallback: if the browser blocked audible playback, the first tap
  // or keypress (OTP typing counts) unlocks it — retry once.
  useEffect(() => {
    if (status !== 'connected') return;
    const unlock = () => {
      const v = remoteVideoRef.current;
      if (v && (v.paused || v.muted)) {
        v.muted = false;
        v.volume = 1;
        v.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [status]);

  const initializeCall = async () => {
    try {
      setStatus('initializing');
      setStatusMessage('Requesting media permissions...');

      // Request media permissions
      await webRtcService.setupLocalMedia({
        video: true,
        audio: true,
      });

      // Initialize WebRTC
      await webRtcService.initialize(session!, []);

      // Connect to socket with the verified family session token
      socketService.connect(session!, otpResult?.sessionToken);

      setStatus('waiting');
      setStatusMessage(`Calling ${session!.inmateName}...`);
    } catch (error) {
      console.error('[Call] Initialization error:', error);

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setError('Camera and microphone permissions are required for this call.');
          addToast('Please grant camera and microphone permissions', 'error');
        } else if (error.name === 'NotFoundError') {
          setError('No camera or microphone found on this device.');
          addToast('No camera or microphone found', 'error');
        } else {
          setError(error.message);
          addToast('Failed to initialize call', 'error');
        }
      } else {
        setError('Failed to initialize call');
        addToast('Failed to initialize call', 'error');
      }

      setStatus('error');
    }
  };

  const joinRoom = async () => {
    if (joinStartedRef.current) return;
    joinStartedRef.current = true;
    try {
      setStatus('connecting');
      setStatusMessage('Joining room...');

      // Media join happens over the socket 'join-room' event below. The REST
      // /rooms/join endpoint requires a persisted room record the kiosk never
      // creates, so skip it.
      const response = await socketService.joinRoom(session!.roomId, peerIdRef.current);

      if (response?.success) {
        setStatus('connecting');
        setStatusMessage('Establishing connection...');
        // Pure P2P: the join ACK carries existingPeers + iceServers (no
        // routerRtpCapabilities). If the kiosk is already waiting, WE offer.
        await webRtcService.handleJoined(response);
      } else {
        setStatus('error');
        setError(response?.message || 'Failed to join room');
        addToast(response?.message || 'Failed to join room', 'error');
      }
    } catch (error) {
      joinStartedRef.current = false;
      console.error('[Call] Failed to join room:', error);
      setStatus('error');
      setError(error instanceof Error ? error.message : 'Failed to join room');
      addToast('Failed to join room', 'error');
    }
  };

  const toggleVideo = useCallback(() => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    webRtcService.toggleVideo(newState);
  }, [videoEnabled]);

  const toggleAudio = useCallback(() => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    webRtcService.toggleAudio(newState);
  }, [audioEnabled]);

  const endCall = useCallback(async () => {
    try {
      wasConnectedRef.current = false;
      socketService.leaveRoom(session!.roomId, peerIdRef.current);
      socketService.disconnect();
      webRtcService.close();
      joinStartedRef.current = false;
      clear();
      setStatus('ended');
    } catch (error) {
      console.error('[Call] Error while ending call:', error);
    }
  }, [session, clear]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getConnectionQuality = (): 'excellent' | 'good' | 'poor' | 'unknown' => {
    switch (connectionState) {
      case 'connected':
        return 'excellent';
      case 'connecting':
        return 'good';
      case 'disconnected':
      case 'failed':
        return 'poor';
      default:
        return 'unknown';
    }
  };

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (status === 'error' && error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  const isVideoCall = session.callType === 'video';
  const isConnected = status === 'connected';

  if (status === 'ended') {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
        <p className="text-lg font-semibold text-white">Call ended</p>
      </div>
    );
  }

  // ---- Gate: the actual call UI appears ONLY once media is fully connected ----
  if (!isConnected) {
    const isReconnecting = status === 'reconnecting';
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <span className="absolute inset-0 rounded-full bg-primary-500 animate-ping opacity-30" />
            <span className="absolute inset-2 rounded-full bg-neutral-800 flex items-center justify-center">
              {isReconnecting ? (
                <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-10 h-10 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              )}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">
            {isReconnecting ? 'Hold on...' : 'Connecting'}
          </h1>
          <p className="text-sm text-neutral-400">{statusMessage}</p>
        </div>
      </div>
    );
  }

  // ---- Fully connected: real call screen ----
  return (
    <div className="flex flex-col h-screen bg-neutral-900">
      {/* Header */}
      <div className="bg-neutral-800 text-white p-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Secure Call</h1>
          <p className="text-sm text-neutral-300">
            {session.inmateName} ↔ {session.contactName}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono">{formatDuration(callDuration)}</div>
          <div className="text-xs text-success">{getConnectionQuality().toUpperCase()}</div>
        </div>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative bg-black">
        {/* Remote Video (Full Screen) — object-contain so the WHOLE frame is
            always visible; letterbox bars are fine, cropping/scrolling is not */}
        {isVideoCall && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {/* Placeholder when no video */}
        {(!isVideoCall || !remoteVideoRef.current?.srcObject) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-24 h-24 bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-lg">{session.inmateName}</p>
            </div>
          </div>
        )}

        {/* Local Video (Picture-in-Picture) */}
        {isVideoCall && (
          <div className="absolute bottom-24 right-4 w-32 h-40 bg-neutral-800 rounded-lg overflow-hidden shadow-lg border-2 border-neutral-700">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Recording Notice */}
        <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          REC
        </div>
      </div>

      {/* Controls */}
      <div className="bg-neutral-800 p-6">
        <div className="flex items-center justify-center gap-4 max-w-md mx-auto">
          {/* Video Toggle */}
          {isVideoCall && (
            <button
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                videoEnabled
                  ? 'bg-neutral-700 text-white hover:bg-neutral-600'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
              title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {videoEnabled ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
            </button>
          )}

          {/* Audio Toggle */}
          <button
            onClick={toggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              audioEnabled
                ? 'bg-neutral-700 text-white hover:bg-neutral-600'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>

          {/* End Call */}
          <button
            onClick={() => {
              endCall();
              goToBlank();
            }}
            className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors"
            title="End call"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
