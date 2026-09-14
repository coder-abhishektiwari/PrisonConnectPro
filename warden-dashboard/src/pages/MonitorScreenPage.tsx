import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import { useToast } from '@/hooks/useToast';
import { getStoredUser } from '@/services/auth/tokenStorage';
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
  Settings,
  Pricing,
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, success, error: toastError, removeToast } = useToast();
  const storedUser = getStoredUser();

  // Incident form state
  const [incidentForm, setIncidentForm] = useState({
    category: 'security',
    severity: 'medium',
    remarks: '',
    officerName: storedUser?.name || '',
  });

  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMonitorData = useCallback(async () => {
    if (!callId) return;
    setLoadError(null);
    try {
      const [calls, inmates, contacts, wallets, recordings, devices, stats, incidentsData, settingsData, pricingData] = await Promise.all([
        wardenApi.getActiveCalls(),
        wardenApi.getInmates(),
        wardenApi.getContacts(),
        wardenApi.getWallets(),
        wardenApi.getRecordings(),
        wardenApi.getDevices(),
        wardenApi.getStatistics(),
        wardenApi.getIncidents(),
        wardenApi.getSettings(),
        wardenApi.getPricing(),
      ]);

      setSettings(settingsData ?? null);
      setPricing(pricingData ?? null);

      const foundCall = calls.find((c) => c.callId === callId) || null;
      setCall(foundCall);

      if (foundCall) {
        setInmate(inmates.find((i) => i.inmateId === foundCall.inmateId) || null);
        setContact(contacts.find((c) => c.contactId === foundCall.contactId) || null);
        setWallet(wallets.find((w) => w.inmateId === foundCall.inmateId) || null);
        setRecording(recordings.find((r) => r.callId === foundCall.callId) || null);
        setDevice(devices.find((d) => d.deviceId === foundCall.kioskId) || null);
        setStatistics(stats.find((s) => s.callId === foundCall.callId) || null);
      }

      setIncidents(incidentsData.filter((i) => i.callId === callId));
    } catch (err) {
      console.error('Failed to load monitor data:', err);
      setLoadError('Failed to load monitor data. Please try again.');
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

  if (isLoading) {
    return <Loading message="Loading monitor screen..." />;
  }

  if (!call && !loadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-neutral-900">Monitor Screen</h1>
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/calls'))}
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

  if (loadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-neutral-900">Monitor Screen</h1>
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/calls'))}
            className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-lg text-sm hover:bg-neutral-300"
          >
            Back to Live Monitoring
          </button>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-error mb-4">{loadError}</p>
            <button
              onClick={() => { setIsLoading(true); loadMonitorData(); }}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
            >
              Retry
            </button>
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

  // Calculate call charges from dynamic pricing + settings
  const ratePerMinute = call.type === 'video'
    ? (Number(pricing?.video?.ratePerMinute) || 2.5)
    : (Number(pricing?.audio?.ratePerMinute) || 1.0);
  const callCharges = call.durationMinutes * ratePerMinute;
  const maxDuration = Number(settings?.callSettings?.maxCallDurationMinutes) || 15;
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

  const handleForceDisconnect = async () => {
    try {
      await wardenApi.endCall(call.callId);
      success('Call force disconnected');
      navigate('/calls');
    } catch (err) {
      console.error('Failed to force disconnect:', err);
      toastError('Failed to disconnect call');
    }
  };

  const handleCreateIncident = async () => {
    if (!incidentForm.remarks.trim()) {
      toastError('Please enter remarks for the incident');
      return;
    }
    try {
      const newIncident = await wardenApi.createIncident({
        ...incidentForm,
        time: new Date().toISOString(),
        callId: call.callId,
      });
      setIncidents((prev) => [newIncident, ...prev]);
      setIncidentForm({ ...incidentForm, remarks: '' });
      success(`Incident ${newIncident.incidentId} created`);
    } catch (err) {
      console.error('Failed to create incident:', err);
      toastError('Failed to create incident');
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
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/calls'))}
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
          <Card title="Video Area" className="border-l-8 border-slate-300 bg-slate-50">
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
          <Card title="Call Controls" className="border-l-8 border-slate-300 bg-slate-50">
            <div className="flex">
              <button
                onClick={handleForceDisconnect}
                className="w-full px-4 py-3 bg-error text-white rounded-lg text-sm font-bold hover:bg-error-700"
              >
                Force Disconnect
              </button>
            </div>
          </Card>

        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Prisoner Information */}
          <Card title="Prisoner Information" className="border-l-8 border-slate-300 bg-slate-50">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                  <svg className="w-7 h-7 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900">
                    {inmate ? `${inmate.name}` : call.inmateName || call.inmateId}
                  </p>
                  <p className="text-sm text-neutral-600">{inmate?.inmateId || call.inmateId}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Facility</span>
                  <span className="font-medium text-neutral-900">{inmate?.facility || inmate?.prisonId || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Cell Block</span>
                  <span className="font-medium text-neutral-900">{inmate?.cellBlock || '—'}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Family Information */}
          <Card title="Family Information" className="border-l-8 border-slate-300 bg-slate-50">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                  <svg className="w-7 h-7 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900">
                    {contact?.name || contact?.fullName || call.familyMemberName || call.contactId}
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






        </div>
      </div>



      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}