import { useState, useEffect, useCallback, useMemo } from 'react';
import { wardenApi, KioskItem, KioskStats } from '@/services/api/wardenApi';
import { StatCard } from '@/components/ui/StatCard';

interface KioskReportPanelProps {
  kiosk: KioskItem;
  onClose: () => void;
}

const PHONE_PATH = 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z';
const CALENDAR_PATH = 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z';
const PEOPLE_PATH = 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-6.9 4 4 0 004 6.9zm6-3a3 3 0 10-3-5.2';
const MIC_PATH = 'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4m-4 0h8';
const VIDEO_PATH = 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z';
const CLOCK_PATH = 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-neutral-800 truncate">{value || '—'}</p>
    </div>
  );
}

function statusClasses(status?: string) {
  if (status === 'online' || status === 'active') return 'bg-success/10 text-success border border-success/20';
  if (status === 'offline') return 'bg-neutral-100 text-neutral-500 border border-neutral-300';
  if (status === 'disabled') return 'bg-error/10 text-error border border-error/20';
  return 'bg-warning/10 text-warning border border-warning/20';
}

function split(p?: { audio?: number; video?: number }) {
  return p ? `${p.audio ?? 0} audio · ${p.video ?? 0} video` : '';
}

export function KioskReportPanel({ kiosk, onClose }: KioskReportPanelProps) {
  const [stats, setStats] = useState<KioskStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    setIsLoading(true);
    try {
      const data = await wardenApi.getKioskStats(kiosk.kioskId);
      if (signal?.aborted) return;
      setStats(data ?? null);
      if (!data) setLoadError('No report available for this kiosk');
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Failed to fetch kiosk stats:', err);
      setLoadError('Failed to load kiosk report');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [kiosk.kioskId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal);
    return () => controller.abort();
  }, [fetchStats]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      { title: "Today's calls", value: stats.today.total, subtitle: split(stats.today), icon: PHONE_PATH, color: 'primary' as const },
      { title: 'Calls this month', value: stats.month.total, subtitle: split(stats.month), icon: CALENDAR_PATH, color: 'info' as const },
          { title: 'Registered Inmates', value: stats.registeredInmates, icon: PEOPLE_PATH, color: 'success' as const },
      { title: 'Audio calls', value: stats.allTime.audio, subtitle: 'All time', icon: MIC_PATH, color: 'warning' as const },
      { title: 'Video calls', value: stats.allTime.video, subtitle: 'All time', icon: VIDEO_PATH, color: 'primary' as const },
      { title: 'Call minutes', value: stats.allTime.minutes, subtitle: `${stats.allTime.total} calls total`, icon: CLOCK_PATH, color: 'info' as const },
    ];
  }, [stats]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/50 p-4 sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Kiosk report for ${kiosk.kioskId}`}
        className="w-full max-w-4xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="material-icons text-primary-600">monitor_heart</span>
              <h2 className="text-lg font-semibold text-neutral-900">Kiosk Report</h2>
              <span className="font-mono text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">{kiosk.kioskId}</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${statusClasses(stats?.status ?? kiosk.status)}`}>
                {stats?.status ?? kiosk.status ?? 'pending'}
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500 truncate">
              {stats?.location ?? kiosk.location ?? 'No location set'} · {stats?.prisonName ?? kiosk.prisonName ?? '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close report"
            className="shrink-0 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <span className="material-icons text-xl">close</span>
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {loadError && !stats ? (
            <div className="py-10 text-center">
              <p className="text-error mb-4">{loadError}</p>
              <button
                onClick={() => fetchStats()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <Meta label="Serial" value={stats?.deviceSerialNumber ?? kiosk.deviceSerialNumber} />
                <Meta label="IP address" value={stats?.ipAddress ?? kiosk.ipAddress} />
                <Meta label="Android" value={stats?.androidVersion ?? kiosk.androidVersion} />
                <Meta label="Last seen" value={stats?.lastSeen ? new Date(stats.lastSeen).toLocaleString('en-IN') : kiosk.lastSeen ? new Date(kiosk.lastSeen).toLocaleString('en-IN') : null} />
                <Meta label="Approved" value={stats?.authorizationStatus ?? kiosk.authorizationStatus} />
                <Meta label="Last call" value={stats?.lastCallAt ? new Date(stats.lastCallAt).toLocaleString('en-IN') : null} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <StatCard key={i} title="" value="" loading />)
                  : cards.map((c) => <StatCard key={c.title} {...c} />)}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-2">Recent calls</h3>
                {!stats || stats.recentCalls.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4 text-center border border-dashed border-neutral-200 rounded-lg">
                    No calls recorded from this kiosk yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Time</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Inmate</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Family</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Type</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Status</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-neutral-600">Minutes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recentCalls.map((c) => (
                          <tr key={c.callId} className="border-b border-neutral-100 last:border-0">
                            <td className="py-2 px-3 text-xs text-neutral-600 whitespace-nowrap">
                              {c.startTime ? new Date(c.startTime).toLocaleString('en-IN') : '—'}
                            </td>
                            <td className="py-2 px-3 text-xs text-neutral-800">{c.inmateName || '—'}</td>
                            <td className="py-2 px-3 text-xs text-neutral-800">{c.familyMemberName || '—'}</td>
                            <td className="py-2 px-3 text-xs capitalize text-neutral-700">{c.type}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                                c.status === 'completed' ? 'bg-success/10 text-success' :
                                c.status === 'failed' ? 'bg-error/10 text-error' :
                                c.status === 'active' ? 'bg-info/10 text-info' : 'bg-neutral-100 text-neutral-600'
                              }`}>{c.status}</span>
                            </td>
                            <td className="py-2 px-3 text-xs text-neutral-700 text-right">{c.minutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
