import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import { usePageHeader } from '@/context/PageHeaderContext';
import type { ActiveCall, ListParams } from '@/services/api/wardenApi';

const PAGE_SIZE = 20;

export function ActiveCallsPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'audio'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmForceEnd, setConfirmForceEnd] = useState<ActiveCall | null>(null);

  const buildParams = useCallback((): ListParams => ({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: search || undefined,
  }), [page, search]);

  const loadCalls = useCallback(async () => {
    try {
      const result = await wardenApi.getActiveCalls(buildParams());
      let filtered = result.items ?? [];
      if (typeFilter !== 'all') filtered = filtered.filter(c => c.type === typeFilter);
      setCalls(filtered);
      setTotal(result.total ?? 0);
    } catch (error) {
      console.error('Failed to load active calls:', error);
    } finally {
      setIsLoading(false);
    }
  }, [buildParams, typeFilter]);

  useEffect(() => { loadCalls(); }, [loadCalls]);
  useWardenSocket(() => { loadCalls(); }, undefined, undefined, undefined);
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  usePageHeader({
    title: 'Live Calls',
    subtitle: `${total} active calls`,
    action: (
      <div className="flex gap-2">
        <button onClick={() => { setTypeFilter('all'); setPage(1); }} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${typeFilter === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
          <span className={`w-2 h-2 rounded-full ${typeFilter === 'all' ? 'bg-white' : 'bg-neutral-400'}`} />All
        </button>
        <button onClick={() => { setTypeFilter('video'); setPage(1); }} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${typeFilter === 'video' ? 'bg-primary-600 text-white' : 'bg-primary-50 border border-primary-200 text-primary-700 hover:bg-primary-100'}`}>Video</button>
        <button onClick={() => { setTypeFilter('audio'); setPage(1); }} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${typeFilter === 'audio' ? 'bg-info text-white' : 'bg-info-50 border border-info/20 text-info hover:bg-info-100'}`}>Audio</button>
      </div>
    ),
  });

  if (isLoading) return <Loading message="Loading active calls..." />;

  const formatDuration = (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes == null) return '00:00';
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return '00:00';
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatStartedAt = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  };

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'bg-success/10 text-success';
      case 'good': return 'bg-info-100 text-info';
      case 'fair': return 'bg-warning/10 text-warning';
      case 'poor': return 'bg-error/10 text-error';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const getRecordingBadge = (status: string) => {
    switch (status) {
      case 'recording': return 'bg-error/10 text-error';
      case 'completed': return 'bg-success/10 text-success';
      case 'failed': return 'bg-error/10 text-error';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const showToast = (message: string) => { setToast(message); setTimeout(() => setToast(null), 3000); };

  const handleForceEnd = async (call: ActiveCall) => {
    try {
      await wardenApi.endCall(call.callId);
      showToast(`Call ${call.callId} force ended`);
      loadCalls();
    } catch (error) {
      console.error('Failed to force end call:', error);
      showToast('Failed to end call');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
        <div className="flex-1 relative">
          <svg className="w-5 h-5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Search by call ID, inmate, family, kiosk..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {calls.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <p className="text-neutral-900 font-semibold">No active calls</p>
            <p className="text-sm text-neutral-500 mt-1">No calls match your filters</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 p-5">
              {calls.map((call) => (
                <div key={call.callId} className="group bg-white border border-neutral-200 rounded-2xl shadow-sm hover:shadow-lg hover:border-neutral-300 transition-all duration-200 flex flex-col overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-primary-600 to-neutral-900" />
                  <div className="p-4 flex flex-col gap-3.5 flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-mono text-xs font-bold text-neutral-900 flex items-center gap-2">{call.callId} <span className="text-[11px] font-normal text-neutral-500">• {call.roomIdLabel || call.roomId}</span></p>
                        <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1.5" title={call.startTime}><span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />Started: {formatStartedAt(call.startTime)}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-success/10 text-success border border-success/20 rounded-full text-xs font-bold">● Active</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                        <div className="w-10 h-10 rounded-xl bg-white border border-neutral-200 flex items-center justify-center shrink-0 shadow-sm">
                          <svg className="w-6 h-6 text-neutral-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-primary-600 uppercase tracking-wide">Inmate</p>
                          <p className="text-sm font-semibold text-neutral-900 truncate">{call.inmateName || call.inmateId}</p>
                          <p className="text-xs text-neutral-500 truncate">{call.inmateId} • {call.kioskId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                        <div className="w-10 h-10 rounded-xl bg-white border border-neutral-200 flex items-center justify-center shrink-0 shadow-sm">
                          <svg className="w-5 h-5 text-neutral-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-info uppercase tracking-wide">Family</p>
                          <p className="text-sm font-semibold text-neutral-900 truncate">{call.familyMemberName || call.contactId}</p>
                          <p className="text-xs text-neutral-500 truncate">{call.contactId}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${call.type==='video'?'bg-primary-600 text-white border-primary-600':'bg-info text-white border-info'}`}>{call.type==='video'?'▶ Video':'● Audio'}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getRecordingBadge(call.recordingStatus)}`}>{call.recordingStatus}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getQualityBadge(call.connectionQuality)}`}>{call.connectionQuality}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 mt-auto pt-2">
                      <button onClick={() => navigate(`/monitoring/live/${call.callId}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border-2 border-neutral-900 text-neutral-900 rounded-xl text-xs font-bold hover:bg-neutral-900 hover:text-white transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a9 9 0 11-18 0 9 9 0 0118 0zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Monitor</button>
                      <button onClick={() => setConfirmForceEnd(call)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-error text-white rounded-xl text-xs font-bold hover:bg-error-700 shadow-sm transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" /></svg> Disconnect</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 bg-neutral-50 border-t border-neutral-200">
                <p className="text-sm text-neutral-600">Showing <span className="font-semibold text-neutral-900">{((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, total)}</span> of <span className="font-semibold text-neutral-900">{total}</span></p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-900 rounded-xl text-sm font-medium hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">Previous</button>
                  <span className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold shadow-sm">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {createPortal(<>
        {confirmForceEnd && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-neutral-200">
              <div className="w-12 h-12 bg-error/10 border border-error/20 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-neutral-900">Force Disconnect?</h3>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                End live call <span className="font-mono font-bold text-neutral-900">{confirmForceEnd.callId}</span> (started {formatStartedAt(confirmForceEnd.startTime)} • {formatDuration(confirmForceEnd.durationMinutes)}) between{' '}
                <span className="font-semibold text-neutral-900">{confirmForceEnd.inmateName || confirmForceEnd.inmateId}</span> and{' '}
                <span className="font-semibold text-neutral-900">{confirmForceEnd.familyMemberName || confirmForceEnd.contactId}</span>.
              </p>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => setConfirmForceEnd(null)} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-900 rounded-xl text-sm font-semibold hover:bg-neutral-50">Cancel</button>
                <button onClick={() => { handleForceEnd(confirmForceEnd); setConfirmForceEnd(null); }} className="px-5 py-2.5 bg-error text-white rounded-xl text-sm font-bold hover:bg-error-700 shadow-sm">Force Disconnect</button>
              </div>
            </div>
          </div>
        )}
        {toast && (
          <div className="fixed bottom-4 right-4 bg-neutral-900 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium z-[999] flex items-center gap-2">
            <span className="w-2 h-2 bg-success rounded-full animate-pulse" />{toast}
          </div>
        )}
      </>, document.body)}
    </div>
  );
}
