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
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Auto-hiding controls: visible on any interaction, hidden after 3s idle.
  const [controlsVisible, setControlsVisible] = useState(true);
  const [endingCall, setEndingCall] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const bumpInteraction = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (status !== 'connected') return;
    bumpInteraction();
    window.addEventListener('pointerdown', bumpInteraction);
    window.addEventListener('pointermove', bumpInteraction);
    return () => {
      window.removeEventListener('pointerdown', bumpInteraction);
      window.removeEventListener('pointermove', bumpInteraction);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [status, bumpInteraction]);

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

    const handleCallEnded = (_event: string, data: any) => {
      // Ignore the echo of OUR OWN hang-up.
      if (data?.sender && data.sender === peerIdRef.current) return;
      console.log('[Call] Call ended remotely');
      wasConnectedRef.current = false;
      reconnectingRef.current = true; // stop any in-flight reconnect loop
      setEndingCall(true);
      // Show "Ending call..." briefly on the call screen itself, then blank.
      setTimeout(() => {
        webRtcService.close();
        socketService.leaveRoom(session!.roomId, peerIdRef.current);
        socketService.disconnect();
        joinStartedRef.current = false;
        goToBlank();
      }, 1500);
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
  const audioElRef = useRef<HTMLAudioElement>(null);
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
    // Diagnostics: prove whether the kiosk's audio track actually arrived.
    if (remote) {
      remote.getTracks().forEach((t) =>
        console.log(`[AudioDiag] remote ${t.kind}: enabled=${t.enabled} muted=${t.muted} readyState=${t.readyState}`)
      );
    }
    const v = remoteVideoRef.current;
    const a = audioElRef.current;
    if (v) {
      // Video element stays SILENT — the dedicated <audio> element carries
      // output so the same stream is never played twice.
      if (remote && v.srcObject !== remote) v.srcObject = remote;
      v.muted = true;
      v.play().catch(() => {});
    }
    if (a) {
      if (remote && a.srcObject !== remote) a.srcObject = remote;
      a.muted = !speakerOn;
      a.volume = 1;
      a.play().catch((e) => console.warn('[AudioDiag] audio.play() blocked:', e));
    }
  }, [status, speakerOn]);

  // Autoplay fallback: if the browser blocked audible playback, the first tap
  // or keypress (OTP typing counts) unlocks it — retry once.
  useEffect(() => {
    if (status !== 'connected') return;
    const unlock = () => {
      const a = audioElRef.current;
      if (a && (a.paused || a.muted)) {
        a.muted = !speakerOn;
        a.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [status, speakerOn]);

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

  const toggleAudio = useCallback(() => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    webRtcService.toggleAudio(newState);
  }, [audioEnabled]);

  /** Speaker toggle = mute/unmute the REMOTE audio output on this device. */
  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((prev) => !prev);
  }, []);

  const endCall = useCallback(async () => {
    try {
      wasConnectedRef.current = false;
      // Tell the kiosk IMMEDIATELY so its call ends at the same moment.
      socketService.send('call-ended', { reason: 'family hung up' });
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

  // ---- Fully connected: immersive call screen ----
  // Video fills the whole viewport (portrait gets full height, letterboxed);
  // header and controls float above it and auto-hide after 3s idle.
  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden select-none">
      {/* Remote video — object-contain: the WHOLE frame is always visible.
          Output is MUTED here; the hidden <audio> element below carries sound. */}
      {isVideoCall && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}
      {/* Hidden audio sink for remote audio (reliable across browsers) */}
      <audio ref={audioElRef} autoPlay className="hidden" />

      {/* Audio-only call placeholder */}
      {!isVideoCall && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="w-28 h-28 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-14 h-14 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-lg">{session.inmateName}</p>
          </div>
        </div>
      )}

      {/* Local Video (Picture-in-Picture) — shrinks when controls hide */}
      {isVideoCall && (
        <div
          className={`absolute right-4 bg-neutral-900 rounded-xl overflow-hidden shadow-lg border border-neutral-700 transition-all duration-300 ${
            controlsVisible ? 'bottom-32 w-28 h-36' : 'bottom-6 w-16 h-20 opacity-70'
          }`}
        >
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>
      )}

      {/* "Ending call..." overlay when the inmate hangs up */}
      {endingCall && (
        <div className="absolute inset-0 z-20 bg-black/80 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-semibold text-white">Ending call...</p>
          </div>
        </div>
      )}

      {/* Top overlay */}
      <div
        className={`absolute top-0 inset-x-0 z-10 flex items-start justify-between px-4 pt-4 pb-10 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="text-white">
          <p className="text-base font-semibold leading-tight">{session.inmateName}</p>
          <p className="text-xs text-neutral-300">Secure monitored call</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-red-600 text-white px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            REC
          </span>
          <span className="text-white font-mono text-sm bg-black/40 rounded-md px-2 py-1">
            {formatDuration(callDuration)}
          </span>
        </div>
      </div>

      {/* Bottom controls — mic | END (center) | speaker */}
      <div
        className={`absolute bottom-0 inset-x-0 z-10 pb-10 pt-14 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="relative flex items-center justify-center h-16 max-w-md mx-auto">
          {/* Mic toggle (left) */}
          <button
            onClick={toggleAudio}
            className={`absolute left-8 w-13 h-13 p-3.5 rounded-full flex items-center justify-center transition-colors ${
              audioEnabled ? 'bg-neutral-800/90 text-white' : 'bg-red-600 text-white'
            }`}
            title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {audioEnabled ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>

          {/* End Call (dead center) */}
          <button
            onClick={() => {
              endCall();
              goToBlank();
            }}
            className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 active:scale-95 transition-all shadow-lg"
            title="End call"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>

          {/* Speaker (output) toggle (right) */}
          <button
            onClick={toggleSpeaker}
            className={`absolute right-8 w-13 h-13 p-3.5 rounded-full flex items-center justify-center transition-colors ${
              speakerOn ? 'bg-neutral-800/90 text-white' : 'bg-red-600 text-white'
            }`}
            title={speakerOn ? 'Turn off speaker' : 'Turn on speaker'}
          >
            {speakerOn ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
