import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import type {
  ActiveCall,
  Inmate,
  Contact,
  Wallet,
  Recording,
  Device,
  CallStatistics,
  Incident,
  SecurityStatus,
} from '@/services/api/wardenApi';

interface TimelineEvent {
  id: string;
  label: string;
  time: string;
  type: 'start' | 'join' | 'ice' | 'recording' | 'warning' | 'end';
}

interface StatHistory {
  packetLoss: number[];
  latency: number[];
  bitrate: number[];
  jitter: number[];
  audioLevel: number[];
  fps: number[];
}

const MAX_HISTORY = 30;

/**
 * Monitor Screen - Dedicated monitoring page for a single active call.
 * Shows video placeholders, participant info, wallet, timeline, controls,
 * live statistics graphs, recording panel, security panel, and incident report.
 */
export function MonitorScreenPage() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [inmate, setInmate] = useState<Inmate | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [statistics, setStatistics] = useState<CallStatistics | null>(null);
  const [statHistory, setStatHistory] = useState<StatHistory>({
    packetLoss: [],
    latency: [],
    bitrate: [],
    jitter: [],
    audioLevel: [],
    fps: [],
  });
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Incident form state
  const [incidentForm, setIncidentForm] = useState({
    category: 'security',
    severity: 'medium',
    remarks: '',
    officerName: 'warden-001',
  });

  // Control states (UI only)
  const [controls, setControls] = useState({
    mutePrisoner: false,
    muteFamily: false,
    cameraDisabled: false,
    recordingPaused: false,
  });

  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMonitorData = useCallback(async () => {
    if (!callId) return;
    try {
      const [calls, inmates, contacts, wallets, recordings, devices, stats, incidentsData] = await Promise.all([
        wardenApi.getActiveCalls(),
        wardenApi.getInmates(),
        wardenApi.getContacts(),
        wardenApi.getWallets(),
        wardenApi.getRecordings(),
        wardenApi.getDevices(),
        wardenApi.getStatistics(),
        wardenApi.getIncidents(),
      ]);

      const foundCall = calls.find((c) => c.callId === callId) || null;
      setCall(foundCall);

      if (foundCall) {
        setInmate(inmates.find((i) => i.inmateId === foundCall.inmateId) || null);
        setContact(contacts.find((c) => c.id === foundCall.contactId) || null);
        setWallet(wallets.find((w) => w.inmateId === foundCall.inmateId) || null);
        setRecording(recordings.find((r) => r.callId === foundCall.callId) || null);
        setDevice(devices.find((d) => d.deviceId === foundCall.kioskId) || null);
        setStatistics(stats.find((s) => s.callId === foundCall.callId) || null);
      }

      setIncidents(incidentsData.filter((i) => i.callId === callId));
    } catch (error) {
      console.error('Failed to load monitor data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    loadMonitorData();
  }, [loadMonitorData]);

  // Build initial timeline from call data
  useEffect(() => {
    if (!call) return;
    const events: TimelineEvent[] = [
      {
        id: '1',
        label: 'Call Started',
        time: call.startTime,
        type: 'start',
      },
      {
        id: '2',
        label: 'Participant Joined',
        time: call.startTime,
        type: 'join',
      },
      {
        id: '3',
        label: 'ICE Connected',
        time: call.iceState === 'connected' ? call.startTime : '',
        type: 'ice',
      },
    ];

    if (call.recordingStatus === 'recording') {
      events.push({
        id: '4',
        label: 'Recording Started',
        time: call.startTime,
        type: 'recording',
      });
    }

    if (call.connectionQuality === 'poor' || call.packetLoss > 5) {
      events.push({
        id: '5',
        label: 'Warning: Poor connection detected',
        time: new Date().toISOString(),
        type: 'warning',
      });
    }

    setTimeline(events);
  }, [call]);

  // Live statistics simulation - continuously update mock values
  useEffect(() => {
    if (!call) return;

    const baseStats: CallStatistics = statistics || {
      callId: call.callId,
      packetLoss: call.packetLoss,
      latency: 50,
      bitrate: call.bitrate,
      jitter: call.jitter,
      audioLevel: 60,
      fps: call.type === 'video' ? 30 : 0,
      networkHealth: call.connectionQuality,
      timestamp: new Date().toISOString(),
    };

    statsIntervalRef.current = setInterval(() => {
      const jitterBase = (val: number, range: number) => {
        const next = val + (Math.random() - 0.5) * range;
        return Math.max(0, Math.round(next * 10) / 10);
      };

      const newStats: CallStatistics = {
        callId: call.callId,
        packetLoss: jitterBase(baseStats.packetLoss, 0.5),
        latency: Math.round(jitterBase(baseStats.latency, 20)),
        bitrate: Math.round(jitterBase(baseStats.bitrate, 200)),
        jitter: Math.round(jitterBase(baseStats.jitter, 10)),
        audioLevel: Math.round(jitterBase(baseStats.audioLevel, 15)),
        fps: call.type === 'video' ? Math.round(jitterBase(baseStats.fps, 5)) : 0,
        networkHealth: baseStats.networkHealth,
        timestamp: new Date().toISOString(),
      };

      setStatistics(newStats);

      // Update history for graphs
      setStatHistory((prev) => ({
        packetLoss: [...prev.packetLoss, newStats.packetLoss].slice(-MAX_HISTORY),
        latency: [...prev.latency, newStats.latency].slice(-MAX_HISTORY),
        bitrate: [...prev.bitrate, newStats.bitrate].slice(-MAX_HISTORY),
        jitter: [...prev.jitter, newStats.jitter].slice(-MAX_HISTORY),
        audioLevel: [...prev.audioLevel, newStats.audioLevel].slice(-MAX_HISTORY),
        fps: [...prev.fps, newStats.fps].slice(-MAX_HISTORY),
      }));

      // Sync to mock backend
      wardenApi.updateCallStatistics(call.callId, newStats).catch(() => {});
    }, 2000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call]);

  // Listen for real-time updates
  useWardenSocket(
    () => { loadMonitorData(); },
    undefined,
    () => { loadMonitorData(); },
    () => { loadMonitorData(); }
  );

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  if (isLoading) {
    return <Loading message="Loading monitor screen..." />;
  }

  if (!call) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-neutral-900">Monitor Screen</h1>
          <button
            onClick={() => navigate('/monitoring/live')}
            className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-lg text-sm hover:bg-neutral-300"
          >
            Back to Live Monitoring
          </button>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-neutral-600">Call not found or no longer active</p>
          </div>
        </Card>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const kbs = bytes / 1024;
    if (kbs < 1024) return `${Math.round(kbs)} KB`;
    const mbs = kbs / 1024;
    return `${mbs.toFixed(1)} MB`;
  };

  // Calculate call charges (mock: ₹2 per minute)
  const ratePerMinute = 2;
  const callCharges = call.durationMinutes * ratePerMinute;
  const maxDuration = 30;
  const timeRemaining = Math.max(0, maxDuration - call.durationMinutes);

  // Security status (mock - derived from device and call data)
  const securityStatus: SecurityStatus = {
    faceVerification: 'verified',
    rfidVerification: 'verified',
    otpVerification: 'verified',
    browserVerification: 'verified',
    deviceFingerprint: device?.deviceId || 'unknown',
    ipAddress: device?.ipAddress || '—',
    location: device?.location || '—',
    vpnStatus: 'not_detected',
    developerMode: 'disabled',
  };

  // Call control handlers (UI only - update mock backend)
  const handleControl = async (action: string, target?: string) => {
    try {
      await wardenApi.sendCallControl(call.callId, action, target);
      showToast(`Action sent: ${action}`);
    } catch (error) {
      console.error('Failed to send control:', error);
    }
  };

  const handleMutePrisoner = () => {
    setControls((p) => ({ ...p, mutePrisoner: !p.mutePrisoner }));
    handleControl('mute', 'prisoner');
  };

  const handleMuteFamily = () => {
    setControls((p) => ({ ...p, muteFamily: !p.muteFamily }));
    handleControl('mute', 'family');
  };

  const handleDisableCamera = () => {
    setControls((p) => ({ ...p, cameraDisabled: !p.cameraDisabled }));
    handleControl('disable_camera');
  };

  const handlePauseRecording = async () => {
    setControls((p) => ({ ...p, recordingPaused: true }));
    if (recording) {
      try {
        await wardenApi.stopRecording(recording.recordingId);
        showToast('Recording paused');
      } catch (error) {
        console.error('Failed to pause recording:', error);
      }
    }
  };

  const handleResumeRecording = async () => {
    setControls((p) => ({ ...p, recordingPaused: false }));
    if (recording) {
      try {
        await wardenApi.startRecording(recording.recordingId);
        showToast('Recording resumed');
      } catch (error) {
        console.error('Failed to resume recording:', error);
      }
    }
  };

  const handleForceDisconnect = async () => {
    try {
      await wardenApi.endCall(call.callId);
      showToast('Call force disconnected');
      navigate('/monitoring/live');
    } catch (error) {
      console.error('Failed to force disconnect:', error);
    }
  };

  const handleGenerateIncident = () => {
    document.getElementById('incident-report')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCreateIncident = async () => {
    try {
      const newIncident = await wardenApi.createIncident({
        ...incidentForm,
        time: new Date().toISOString(),
        callId: call.callId,
      });
      setIncidents((prev) => [newIncident, ...prev]);
      setIncidentForm({ ...incidentForm, remarks: '' });
      showToast(`Incident ${newIncident.incidentId} created`);
    } catch (error) {
      console.error('Failed to create incident:', error);
    }
  };

  // Mini sparkline graph component
  const Sparkline = ({ data, color, label, unit }: { data: number[]; color: string; label: string; unit: string }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const points = data.map((val, i) => {
      const x = (i / (MAX_HISTORY - 1)) * 100;
      const y = 100 - ((val - min) / range) * 100;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="bg-neutral-50 rounded-lg p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium text-neutral-600">{label}</span>
          <span className={`text-sm font-bold ${color}`}>
            {data.length > 0 ? data[data.length - 1] : 0} {unit}
          </span>
        </div>
        {data.length > 1 ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-16">
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={color}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="h-16 flex items-center justify-center text-xs text-neutral-400">Collecting data...</div>
        )}
      </div>
    );
  };

  const getTimelineIcon = (type: string) => {
    switch (type) {
      case 'start': return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'join': return 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z';
      case 'ice': return 'M13 10V3L4 14h7v7l9-11h-7z';
      case 'recording': return 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
      case 'warning': return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
      case 'end': return 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 9h6v6H9V9z';
      default: return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  };

  const getTimelineColor = (type: string) => {
    switch (type) {
      case 'start': return 'bg-primary-100 text-primary-600';
      case 'join': return 'bg-info-100 text-info';
      case 'ice': return 'bg-success/10 text-success';
      case 'recording': return 'bg-error/10 text-error';
      case 'warning': return 'bg-warning/10 text-warning';
      case 'end': return 'bg-neutral-100 text-neutral-600';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const getSecurityBadge = (status: string) => {
    if (status === 'verified' || status === 'not_detected' || status === 'disabled') {
      return 'bg-success/10 text-success';
    }
    if (status === 'detected' || status === 'enabled') {
      return 'bg-error/10 text-error';
    }
    return 'bg-neutral-100 text-neutral-600';
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-error/10 text-error';
      case 'medium': return 'bg-warning/10 text-warning';
      case 'low': return 'bg-info-100 text-info';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Monitor Screen</h1>
          <p className="text-neutral-600 mt-1">Call {call.callId} — {call.inmateName || call.inmateId}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success rounded-lg text-sm font-medium">
            <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
            Live
          </span>
          <button
            onClick={() => navigate('/monitoring/live')}
            className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-lg text-sm hover:bg-neutral-300"
          >
            Back
          </button>
        </div>
      </div>

      {/* Main Layout: Video Area + Right Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Remote Video Placeholder */}
          <Card title="Video Area">
            <div className="bg-neutral-900 rounded-lg aspect-video flex items-center justify-center relative">
              <div className="text-center text-neutral-400">
                <svg className="w-16 h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Remote Video</p>
                <p className="text-xs text-neutral-500 mt-1">WebRTC integration pending</p>
              </div>
              {call.recordingStatus === 'recording' && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-error text-white px-3 py-1 rounded-full text-xs font-medium">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  REC
                </div>
              )}
              <div className="absolute top-3 right-3 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-medium">
                {formatDuration(call.durationMinutes * 60)}
              </div>
            </div>

            {/* Local Preview Placeholder */}
            <div className="mt-4 bg-neutral-900 rounded-lg aspect-video flex items-center justify-center relative max-h-40">
              <div className="text-center text-neutral-400">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-xs">Local Preview</p>
              </div>
              <div className="absolute bottom-2 right-2 bg-black/50 text-white px-2 py-0.5 rounded text-xs">
                Warden (Muted)
              </div>
            </div>
          </Card>

          {/* Call Controls */}
          <Card title="Call Controls">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={handleMutePrisoner}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  controls.mutePrisoner
                    ? 'bg-error text-white'
                    : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                {controls.mutePrisoner ? 'Unmute Prisoner' : 'Mute Prisoner'}
              </button>
              <button
                onClick={handleMuteFamily}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  controls.muteFamily
                    ? 'bg-error text-white'
                    : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                {controls.muteFamily ? 'Unmute Family' : 'Mute Family'}
              </button>
              <button
                onClick={handleDisableCamera}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  controls.cameraDisabled
                    ? 'bg-error text-white'
                    : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                {controls.cameraDisabled ? 'Enable Camera' : 'Disable Camera'}
              </button>
              {controls.recordingPaused ? (
                <button
                  onClick={handleResumeRecording}
                  className="px-3 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success-700"
                >
                  Resume Recording
                </button>
              ) : (
                <button
                  onClick={handlePauseRecording}
                  className="px-3 py-2 bg-warning text-white rounded-lg text-sm font-medium hover:bg-warning-700"
                >
                  Pause Recording
                </button>
              )}
              <button
                onClick={handleForceDisconnect}
                className="px-3 py-2 bg-error text-white rounded-lg text-sm font-medium hover:bg-error-700"
              >
                Force Disconnect
              </button>
              <button
                onClick={handleGenerateIncident}
                className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                Generate Incident Report
              </button>
            </div>
          </Card>

          {/* Call Statistics - Live Graphs */}
          <Card title="Call Statistics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Sparkline data={statHistory.packetLoss} color="text-error" label="Packet Loss" unit="%" />
              <Sparkline data={statHistory.latency} color="text-info" label="Latency" unit="ms" />
              <Sparkline data={statHistory.bitrate} color="text-success" label="Bitrate" unit="kbps" />
              <Sparkline data={statHistory.jitter} color="text-warning" label="Jitter" unit="ms" />
              <Sparkline data={statHistory.audioLevel} color="text-primary-600" label="Audio Level" unit="%" />
              <Sparkline data={statHistory.fps} color="text-info" label="FPS" unit="fps" />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3">
              <span className="text-sm text-neutral-600">Network Health</span>
              <span className={`text-sm font-medium capitalize ${
                statistics?.networkHealth === 'excellent' ? 'text-success' :
                statistics?.networkHealth === 'good' ? 'text-info' :
                statistics?.networkHealth === 'fair' ? 'text-warning' : 'text-error'
              }`}>
                {statistics?.networkHealth || call.connectionQuality}
              </span>
            </div>
          </Card>

          {/* Session Timeline */}
          <Card title="Session Timeline">
            <div className="space-y-4">
              {timeline.map((event, index) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getTimelineColor(event.type)}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getTimelineIcon(event.type)} />
                      </svg>
                    </div>
                    {index < timeline.length - 1 && <div className="w-px flex-1 bg-neutral-200" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium text-neutral-900">{event.label}</p>
                    <p className="text-sm text-neutral-600">{formatTime(event.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Prisoner Information */}
          <Card title="Prisoner Information">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {inmate?.photoUrl && (
                  <img src={inmate.photoUrl} alt={inmate?.firstName} className="w-12 h-12 rounded-full" />
                )}
                <div>
                  <p className="font-semibold text-neutral-900">
                    {inmate ? `${inmate.firstName} ${inmate.lastName}` : call.inmateName || call.inmateId}
                  </p>
                  <p className="text-sm text-neutral-600">{inmate?.inmateId || call.inmateId}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Facility</span>
                  <span className="font-medium text-neutral-900">{inmate?.facility || 'Central Prison'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Cell Block</span>
                  <span className="font-medium text-neutral-900">{inmate?.cellBlock || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Security Level</span>
                  <span className="font-medium text-neutral-900">{inmate?.securityLevel || '—'}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Family Information */}
          <Card title="Family Information">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {contact?.photoUrl && (
                  <img src={contact.photoUrl} alt={contact.fullName} className="w-12 h-12 rounded-full" />
                )}
                <div>
                  <p className="font-semibold text-neutral-900">
                    {contact?.fullName || call.familyMemberName || call.contactId}
                  </p>
                  <p className="text-sm text-neutral-600">{contact?.relationship || 'Family Member'}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Phone</span>
                  <span className="font-medium text-neutral-900">{contact?.phoneNumber || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Contact ID</span>
                  <span className="font-medium text-neutral-900">{call.contactId}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Wallet & Charges */}
          <Card title="Wallet & Charges">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Wallet Balance</span>
                <span className="font-bold text-success">₹{wallet?.balance.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Call Charges</span>
                <span className="font-medium text-neutral-900">₹{callCharges.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Rate</span>
                <span className="font-medium text-neutral-900">₹{ratePerMinute}/min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Time Remaining</span>
                <span className="font-medium text-neutral-900">{timeRemaining} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Remaining Minutes</span>
                <span className="font-medium text-neutral-900">{wallet?.remainingMinutes || 0}</span>
              </div>
            </div>
          </Card>

          {/* Recording Status */}
          <Card title="Recording Status">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Status</span>
                <span className={`font-medium capitalize ${
                  call.recordingStatus === 'recording' ? 'text-error' :
                  call.recordingStatus === 'completed' ? 'text-success' : 'text-neutral-600'
                }`}>
                  {call.recordingStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Recording ID</span>
                <span className="font-medium text-neutral-900">{recording?.recordingId || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Duration</span>
                <span className="font-medium text-neutral-900">
                  {recording ? formatDuration(recording.duration) : formatDuration(call.durationMinutes * 60)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">File Size</span>
                <span className="font-medium text-neutral-900">{recording ? formatSize(recording.size) : '0 B'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Encryption</span>
                <span className="font-medium text-neutral-900">{recording?.encryption || 'AES-256-GCM'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Retention Policy</span>
                <span className="font-medium text-neutral-900">{recording?.retentionDays || 365} days</span>
              </div>
              <div className="border-t border-neutral-200 pt-2 mt-2">
                <button
                  disabled
                  className="w-full px-3 py-2 bg-neutral-100 text-neutral-400 rounded-lg text-sm cursor-not-allowed"
                >
                  Download (Disabled)
                </button>
              </div>
            </div>
          </Card>

          {/* Security Panel */}
          <Card title="Security Panel">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Face Verification</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSecurityBadge(securityStatus.faceVerification)}`}>
                  {securityStatus.faceVerification}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">RFID Verification</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSecurityBadge(securityStatus.rfidVerification)}`}>
                  {securityStatus.rfidVerification}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">OTP Verification</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSecurityBadge(securityStatus.otpVerification)}`}>
                  {securityStatus.otpVerification}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Browser Verification</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSecurityBadge(securityStatus.browserVerification)}`}>
                  {securityStatus.browserVerification}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Device Fingerprint</span>
                <span className="font-medium text-neutral-900 text-xs">{securityStatus.deviceFingerprint}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">IP Address</span>
                <span className="font-medium text-neutral-900">{securityStatus.ipAddress}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Location</span>
                <span className="font-medium text-neutral-900">{securityStatus.location}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">VPN Status</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSecurityBadge(securityStatus.vpnStatus)}`}>
                  {securityStatus.vpnStatus}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Developer Mode</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSecurityBadge(securityStatus.developerMode)}`}>
                  {securityStatus.developerMode}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Incident Report Section */}
      <div id="incident-report">
        <Card title="Incident Report">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-neutral-900">Create New Incident</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
                  <select
                    value={incidentForm.category}
                    onChange={(e) => setIncidentForm({ ...incidentForm, category: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="security">Security</option>
                    <option value="network">Network</option>
                    <option value="recording">Recording</option>
                    <option value="behavioral">Behavioral</option>
                    <option value="hardware">Hardware</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Severity</label>
                  <select
                    value={incidentForm.severity}
                    onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Officer Name</label>
                <input
                  type="text"
                  value={incidentForm.officerName}
                  onChange={(e) => setIncidentForm({ ...incidentForm, officerName: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Remarks</label>
                <textarea
                  value={incidentForm.remarks}
                  onChange={(e) => setIncidentForm({ ...incidentForm, remarks: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Describe the incident..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Time</label>
                <p className="text-sm text-neutral-900">{new Date().toLocaleString('en-IN')}</p>
              </div>
              <button
                onClick={handleCreateIncident}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                Submit Incident
              </button>
            </div>

            {/* Incident List */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-900 mb-3">Incidents for this Call ({incidents.length})</h4>
              {incidents.length === 0 ? (
                <p className="text-sm text-neutral-600">No incidents reported for this call</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {incidents.map((incident) => (
                    <div key={incident.incidentId} className="bg-neutral-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-neutral-900">{incident.incidentId}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityBadge(incident.severity)}`}>
                          {incident.severity}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 capitalize">Category: {incident.category}</p>
                      {incident.remarks && <p className="text-sm text-neutral-600 mt-1">{incident.remarks}</p>}
                      <div className="flex justify-between mt-2 text-xs text-neutral-500">
                        <span>Officer: {incident.officerName}</span>
                        <span>{new Date(incident.time).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-neutral-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}