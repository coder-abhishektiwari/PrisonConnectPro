import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { LocationLink } from '@/components/LocationLink';
import { SkeletonCards } from '@/components/Skeleton';
import { wardenApi, cacheKeys } from '@/services/api/wardenApi';
import { useCachedResource } from '@/hooks/useCachedResource';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import { usePageHeader } from '@/context/PageHeaderContext';
import { inmateLabel, contactLabel } from '@/utils/names';
import type { ActiveCall, ListParams, PaginatedResponse, Pricing, Settings } from '@/services/api/wardenApi';

const PAGE_SIZE = 20;

export function ActiveCallsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmForceEnd, setConfirmForceEnd] = useState<ActiveCall | null>(null);

  const params = useMemo<ListParams>(() => ({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: search || undefined,
  }), [page, search]);

  const { data, isLoading, error, refresh } = useCachedResource<PaginatedResponse<ActiveCall>>(
    cacheKeys.activeCalls(params),
    () => wardenApi.getActiveCalls(params),
    { ttl: 15_000, pollMs: 15_000 },
  );

  const calls = data?.items ?? [];
  const total = data?.total ?? 0;

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const onCallUpdate = useCallback(() => { refreshRef.current(); }, []);
  useWardenSocket(onCallUpdate, undefined, undefined, undefined);
  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">video_call</span>, []);

  const { data: pricingData } = useCachedResource<Pricing>(
    cacheKeys.pricing(),
    () => wardenApi.getPricing(),
    { ttl: 60_000 },
  );
  const { data: settingsData } = useCachedResource<Settings>(
    cacheKeys.settings(),
    () => wardenApi.getSettings(),
    { ttl: 60_000 },
  );
  const pricing = useMemo(() => ({
    audioRate: Number(pricingData?.audio?.ratePerMinute ?? 1),
    videoRate: Number(pricingData?.video?.ratePerMinute ?? 2.5),
    maxMinutes: settingsData?.callSettings?.maxCallDurationMinutes,
  }), [pricingData, settingsData]);

  usePageHeader({
    title: 'Live Calls',
    subtitle: isLoading && total === 0 ? 'Loading active calls…' : `${total} active calls`,
    icon: headerIcon,
    actions: useMemo(() => (
      <div className="flex gap-2">
        <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold shadow-sm">
          Audio <span className="font-bold text-emerald-950">₹{pricing.audioRate}/min</span>
        </div>
        <div className="px-3.5 py-2 bg-cyan-50 border border-cyan-200 text-cyan-800 rounded-xl text-xs font-semibold shadow-sm">
          Video <span className="font-bold text-cyan-950">₹{pricing.videoRate}/min</span>
        </div>
        {pricing.maxMinutes ? (
          <div className="px-3.5 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold shadow-sm">
            Max <span className="font-bold text-amber-950">{pricing.maxMinutes} min/call</span>
          </div>
        ) : null}
      </div>
    ), [pricing.audioRate, pricing.videoRate, pricing.maxMinutes]),
  });

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

  // Live elapsed clock: ticks every second so each card shows a running
  // HH:MM:SS like a broadcast stopwatch (data itself still refreshes on poll).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedOf = (iso: string) => {
    const start = Date.parse(iso);
    if (!Number.isFinite(start)) return '00:00:00';
    const total = Math.max(0, Math.floor((now - start) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
      refresh();
    } catch (error) {
      console.error('Failed to force end call:', error);
      showToast('Failed to end call');
    }
  };

  const hasContent = calls.length > 0;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
        <div className="flex-1 relative">
          <svg className="w-5 h-5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Search by call ID, inmate, family, kiosk..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading && !hasContent ? (
          <SkeletonCards count={6} />
        ) : error && !hasContent ? (
          <div className="text-center py-16">
            <p className="text-neutral-900 font-semibold">Couldn&apos;t load active calls</p>
            <p className="text-sm text-neutral-500 mt-1">{error}</p>
            <button onClick={() => refresh()} className="mt-4 px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-bold">Retry</button>
          </div>
        ) : calls.length === 0 ? (
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
                  <div className="h-1 bg-gradient-to-r from-primary-600 via-primary-400 to-neutral-900" />
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-neutral-900 truncate">{call.callId}</p>
                        <p className="font-mono text-[11px] text-neutral-400 truncate">{call.roomIdLabel || call.roomId}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-success/10 text-success border border-success/20 rounded-full text-[11px] font-bold shrink-0" title={call.startTime}>
                        <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />Live
                      </span>
                    </div>

                    {/* Live running clock — the broadcast-style core of the card */}
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-neutral-900 px-3.5 py-2.5 shadow-inner">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Elapsed</span>
                      <span className="font-mono text-lg font-bold tabular-nums text-white leading-none">{elapsedOf(call.startTime)}</span>
                    </div>
                    <p className="-mt-1.5 text-[11px] text-neutral-500 flex items-center gap-1.5" title={call.startTime}>
                      <span className="material-icons text-[13px] text-neutral-400">schedule</span>
                      Started {formatStartedAt(call.startTime)}
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2.5 p-3 bg-primary-50/60 rounded-xl border border-primary-100">
                        <div className="w-9 h-9 rounded-full bg-white border border-primary-200 flex items-center justify-center shrink-0">
                          <span className="material-icons text-primary-600 text-lg">person</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-primary-600 uppercase tracking-wide">Inmate</p>
                          <p className="text-sm font-semibold text-neutral-900 truncate leading-tight">{inmateLabel(call)}</p>
                          <p className="text-[11px] text-neutral-500 font-mono truncate" title={`${call.inmateNumber || call.inmateId} • ${call.kioskId}`}>{call.inmateNumber || call.inmateId} • {call.kioskId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 p-3 bg-info/5 rounded-xl border border-info/20">
                        <div className="w-9 h-9 rounded-full bg-white border border-info/30 flex items-center justify-center shrink-0">
                          <span className="material-icons text-info text-lg">face</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-info uppercase tracking-wide">Family</p>
                          <p className="text-sm font-semibold text-neutral-900 truncate leading-tight">{contactLabel(call)}</p>
                          <p className="text-[11px] text-neutral-500 font-mono truncate" title={call.contactId}>{call.contactId}</p>
                        </div>
                      </div>
                    </div>

                    {/* Captured when this call's device was verified - the
                        family side's current location for THIS call. */}
                    <div className="text-xs text-neutral-600 -mt-1">
                      <LocationLink location={call.family?.location} />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wide ${call.type==='video'?'bg-primary-600 text-white border-primary-600':'bg-info text-white border-info'}`}>
                        <span className="material-icons text-[13px]">{call.type==='video'?'videocam':'mic'}</span>
                        {call.type==='video'?'Video':'Audio'}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wide ${getRecordingBadge(call.recordingStatus)}`}>
                        <span className={`material-icons text-[13px] ${call.recordingStatus==='recording'?'animate-pulse':''}`}>fiber_manual_record</span>
                        {call.recordingStatus || '—'}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wide ${getQualityBadge(call.connectionQuality)}`}>
                        <span className="material-icons text-[13px]">signal_cellular_alt</span>
                        {call.connectionQuality || '—'}
                      </span>
                    </div>

                    <div className="mt-auto pt-1">
                      {/* <button onClick={() => navigate(`/monitoring/live/${call.callId}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border-2 border-neutral-900 text-neutral-900 rounded-xl text-xs font-bold hover:bg-neutral-900 hover:text-white transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a9 9 0 11-18 0 9 9 0 0118 0zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Monitor</button> */}
                      <button onClick={() => setConfirmForceEnd(call)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-error text-white rounded-xl text-sm font-bold hover:bg-error-700 focus:outline-none focus:ring-2 focus:ring-error/40 shadow-sm transition-colors">
                        <span className="material-icons text-lg">call_end</span>
                        Disconnect
                      </button>
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
                <span className="font-semibold text-neutral-900">{inmateLabel(confirmForceEnd)}</span> and{' '}
                <span className="font-semibold text-neutral-900">{contactLabel(confirmForceEnd)}</span>.
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
