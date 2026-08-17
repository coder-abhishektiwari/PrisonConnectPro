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
  | 'disconnected'
  | 'ended'
  | 'error';

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  // Initialize call
  useEffect(() => {
    if (!session || !linkToken) {
      setStatus('error');
      setError('Missing session or link token.');
      return;
    }

    initializeCall();
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

  // Socket event listeners
  useEffect(() => {
    const handleNewProducer = async (_event: string, data: any) => {
      console.log('[Call] New producer:', data);
      if (data?.producerId) {
        await webRtcService.consumeRemoteTrack(data.producerId);
      }
    };

    const handlePeerJoined = (_event: string, _data: any) => {
      console.log('[Call] Peer joined');
      if (status === 'waiting') {
        setStatus('connecting');
        setStatusMessage('Connecting...');
      }
    };

    const handlePeerLeft = (_event: string, _data: any) => {
      console.log('[Call] Peer left');
      setStatus('disconnected');
      setStatusMessage('Other participant left');
      addToast('Other participant left the call', 'info');
    };

    const handleCallEnded = (_event: string, _data: any) => {
      console.log('[Call] Call ended');
      setStatus('ended');
      setStatusMessage('Call has ended');
      addToast('Call has ended', 'info');
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
          if (status === 'connected' || status === 'connecting') {
            setStatus('reconnecting');
            setStatusMessage('Reconnecting...');
          }
          break;
        case 'connection_error':
          console.error('[Call] Socket connection error:', data.error);
          break;
      }
    };

    // Register listeners
    socketService.on('new-producer', handleNewProducer);
    socketService.on('peer-joined', handlePeerJoined);
    socketService.on('peer-left', handlePeerLeft);
    socketService.on('call-ended', handleCallEnded);
    socketService.on('system', handleSystemEvent);

    return () => {
      socketService.off('new-producer', handleNewProducer);
      socketService.off('peer-joined', handlePeerJoined);
      socketService.off('peer-left', handlePeerLeft);
      socketService.off('call-ended', handleCallEnded);
      socketService.off('system', handleSystemEvent);
    };
  }, [status, addToast]);

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
      setStatus('connected');
      setStatusMessage('Connected');
    };

    const handleConnectionStateChange = (_event: string, data: unknown) => {
      const state = data as ConnectionState;
      console.log('[Call] Connection state changed:', state);
      setConnectionState(state);

      switch (state) {
        case 'connecting':
          setStatus('connecting');
          setStatusMessage('Establishing connection...');
          break;
        case 'connected':
          setStatus('connected');
          setStatusMessage('Connected');
          break;
        case 'disconnected':
          setStatus('reconnecting');
          setStatusMessage('Connection lost. Reconnecting...');
          break;
        case 'failed':
          setStatus('error');
          setError('Connection failed');
          addToast('Connection failed', 'error');
          break;
        case 'closed':
          setStatus('ended');
          setStatusMessage('Call ended');
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
  }, [addToast]);

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
      setStatusMessage('Waiting for prisoner to connect...');
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
        await webRtcService.handleJoined(response.routerRtpCapabilities);
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

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-success';
      case 'connecting':
      case 'reconnecting':
        return 'text-warning';
      case 'error':
      case 'disconnected':
      case 'ended':
        return 'text-error';
      default:
        return 'text-neutral-600';
    }
  };

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (status === 'error' && error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full">
          <ErrorState
            message={error}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  const isWaiting = status === 'waiting' || status === 'initializing';
  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const isConnected = status === 'connected';
  const isVideoCall = session.callType === 'video';

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
          {isConnected && (
            <>
              <div className="text-sm font-mono">{formatDuration(callDuration)}</div>
              <div className={`text-xs ${getStatusColor()}`}>
                {getConnectionQuality().toUpperCase()}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative bg-black">
        {/* Remote Video (Full Screen) */}
        {isVideoCall && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
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

        {/* Status Overlay */}
        {(isWaiting || isConnecting) && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <div className="text-center text-white">
              {isWaiting && (
                <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              )}
              {isConnecting && (
                <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              )}
              <h2 className="text-2xl font-semibold mb-2">
                {isWaiting && 'Waiting for Prisoner'}
                {isConnecting && status === 'connecting' && 'Connecting...'}
                {isConnecting && status === 'reconnecting' && 'Reconnecting...'}
              </h2>
              <p className="text-neutral-300">{statusMessage}</p>
            </div>
          </div>
        )}

        {/* Recording Notice */}
        {isConnected && (
          <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            REC
          </div>
        )}
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
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors"
            title="End call"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}