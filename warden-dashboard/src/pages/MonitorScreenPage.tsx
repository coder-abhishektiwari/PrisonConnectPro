import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import { useToast } from '@/hooks/useToast';
import type { ActiveCall, Inmate, Contact, Wallet, Recording, Device, CallStatistics } from '@/services/api/wardenApi';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, success, error: toastError, removeToast } = useToast();

  const loadMonitorData = useCallback(async () => {
    if (!callId) return;
    setLoadError(null);
    try {
      const [calls, inmates, contacts, wallets, recordings, devices, stats] = await Promise.all([
        wardenApi.getActiveCalls(),
        wardenApi.getInmates(),
        wardenApi.getContacts(),
        wardenApi.getWallets(),
        wardenApi.getRecordings(),
        wardenApi.getDevices(),
        wardenApi.getStatistics(),
      ]);

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
    } catch (err) {
      console.error('Failed to load monitor data:', err);
      setLoadError('Failed to load monitor data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [callId]);

  useEffect(() => { loadMonitorData(); }, [loadMonitorData]);

  useWardenSocket(
    () => { loadMonitorData(); },
    undefined,
    () => { loadMonitorData(); },
    () => { loadMonitorData(); }
  );

  if (isLoading) return <Loading message="Loading monitor screen..." />;

  if (!call && !loadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-neutral-900">Monitor Screen</h1>
          <button onClick={() => navigate('/calls')} className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-lg text-sm hover:bg-neutral-300">Back</button>
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
          <button onClick={() => navigate('/calls')} className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-lg text-sm hover:bg-neutral-300">Back</button>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-error mb-4">{loadError}</p>
            <button onClick={() => { setIsLoading(true); loadMonitorData(); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
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

  return (
    <div className="space-y-6">
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
          <button onClick={() => navigate('/calls')} className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-lg text-sm hover:bg-neutral-300">Back</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Video Area" className="border-l-8 border-slate-300 bg-slate-50">
            <div className="bg-neutral-900 rounded-lg aspect-video flex items-center justify-center relative">
              <div className="text-center text-neutral-400">
                <svg className="w-16 h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Remote Video</p>
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
            <div className="mt-4 bg-neutral-900 rounded-lg aspect-video flex items-center justify-center relative max-h-40">
              <div className="text-center text-neutral-400">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-xs">Local Preview</p>
              </div>
            </div>
          </Card>

          <Card title="Call Controls" className="border-l-8 border-slate-300 bg-slate-50">
            <button onClick={handleForceDisconnect} className="w-full px-4 py-3 bg-error text-white rounded-lg text-sm font-bold hover:bg-error-700">Force Disconnect</button>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Prisoner Information" className="border-l-8 border-slate-300 bg-slate-50">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                  <svg className="w-7 h-7 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900">{inmate ? inmate.name : call.inmateName || call.inmateId}</p>
                  <p className="text-sm text-neutral-600">{inmate?.inmateId || call.inmateId}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Facility</span>
                  <span className="font-medium text-neutral-900">{inmate?.facility || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Cell Block</span>
                  <span className="font-medium text-neutral-900">{inmate?.cellBlock || '—'}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Family Information" className="border-l-8 border-slate-300 bg-slate-50">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                  <svg className="w-7 h-7 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900">{contact?.name || call.familyMemberName || call.contactId}</p>
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

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
