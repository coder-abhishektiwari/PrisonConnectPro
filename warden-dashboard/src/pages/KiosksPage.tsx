import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card } from '@/components/Card';
import { SkeletonRows, SkeletonText } from '@/components/Skeleton';
import { ToastContainer } from '@/components/ToastContainer';
import { KioskReportPanel } from '@/components/KioskReportPanel';
import { useToast } from '@/hooks/useToast';
import { usePageHeader } from '@/context/PageHeaderContext';
import { useCachedResource } from '@/hooks/useCachedResource';
import { wardenApi, cacheKeys, KioskItem } from '@/services/api/wardenApi';

// Kiosk status is two-level: an admin-level Active/Deactivated (the stored
// flag a warden flips), and under Active a heartbeat-driven Online/Offline.
// `disabled` on the wire is the Deactivated state; 'active' is a legacy
// heartbeat-less online alias kept for old rows.
const isDeactivated = (status?: string) => status === 'disabled';
const isDeviceActive = (status?: string) => status === 'online' || status === 'active' || status === 'offline' || status === 'maintenance';

const STATUS_STYLES: Record<string, string> = {
  online: 'bg-success/10 text-success border border-success/20',
  active: 'bg-success/10 text-success border border-success/20',
  offline: 'bg-neutral-100 text-neutral-500 border border-neutral-300',
  disabled: 'bg-error/10 text-error border border-error/20',
  maintenance: 'bg-warning/10 text-warning border border-warning/20',
  pending: 'bg-warning/10 text-warning border border-warning/20',
};

const STATUS_LABELS: Record<string, string> = {
  disabled: 'Deactivated',
};

const statusLabel = (status?: string) => STATUS_LABELS[status || ''] || status || 'pending';
const statusStyle = (status?: string) => STATUS_STYLES[status || ''] || STATUS_STYLES.pending;

type StatusFilter = 'all' | 'active' | 'deactivated';

// A live kiosk has just reported in, so the timestamp is noise; anything else
// needs to say when the device was last heard from.
const isLive = (status?: string) => status === 'online' || status === 'active';

export function KiosksPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showStatusFilter) return;
    const onDown = (e: MouseEvent) => {
      if (!statusFilterRef.current?.contains(e.target as Node)) setShowStatusFilter(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [showStatusFilter]);
  const [selected, setSelected] = useState<KioskItem | null>(null);
  const { toasts, removeToast } = useToast();

  const { data, isLoading, error, refresh } = useCachedResource<KioskItem[]>(
    cacheKeys.kiosks(),
    () => wardenApi.getKiosks(),
    { ttl: 30_000, pollMs: 15_000 },
  );
  const kiosks = data ?? [];

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    const list = (() => {
      let rows = kiosks;
      if (statusFilter === 'active') rows = rows.filter((k) => isDeviceActive(k.status));
      else if (statusFilter === 'deactivated') rows = rows.filter((k) => isDeactivated(k.status));
      if (!searchQuery.trim()) return rows;
      const q = searchQuery.toLowerCase();
      return rows.filter((k) =>
        (k.kioskId || '').toLowerCase().includes(q) ||
        (k.location || '').toLowerCase().includes(q) ||
        (k.ipAddress || '').toLowerCase().includes(q) ||
        (k.deviceSerialNumber || '').toLowerCase().includes(q) ||
        (k.prisonName || k.prisonId || '').toLowerCase().includes(q)
      );
    })();
    // Live devices (online/active) pin to the top; the rest keep their
    // original order below. Array.sort is stable, so ties don't shuffle.
    return [...list].sort((a, b) => Number(isLive(b.status)) - Number(isLive(a.status)));
  }, [kiosks, searchQuery, statusFilter]);

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">devices_other</span>, []);

  usePageHeader({
    title: 'Kiosks',
    subtitle: 'All registered kiosk devices in your prison',
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={handleRefresh} disabled={isRefreshing} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition">
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    ), [handleRefresh, isRefreshing]),
  });

  if (error && kiosks.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="text-center py-12">
            <p className="text-error mb-4">{error}</p>
            <button onClick={() => refresh()} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      {selected && (
        <KioskReportPanel
          kiosk={selected}
          onClose={() => setSelected(null)}
          onStatusChanged={(updated) => {
            setSelected(updated);
            handleRefresh();
          }}
        />
      )}

      {/* Search */}
      <Card>
        <div className="flex items-center justify-between gap-4 p-4 border-b border-neutral-200">
          <div>
            <p className="text-sm text-neutral-500">
              {isLoading && kiosks.length === 0 ? <SkeletonText /> : `${filtered.length} kiosk${filtered.length !== 1 ? 's' : ''}`}
            </p>
            <p className="text-xs text-neutral-400">Click a kiosk to open its full report</p>
          </div>
          <input type="text" placeholder="Search ID, serial, location..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full sm:w-72 px-3 py-1.5 text-sm border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {filtered.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <span className="material-icons text-4xl text-neutral-300 mb-2">devices_other</span>
            <p className="text-neutral-600">{kiosks.length === 0 ? 'No kiosks registered in your prison yet.' : 'No kiosks match your search.'}</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Kiosk ID</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Serial</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Location</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">IP Address</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-900">Inmates</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">
                    <div ref={statusFilterRef} className="relative inline-block">
                      <button
                        onClick={() => setShowStatusFilter((v) => !v)}
                        className="flex items-center gap-1 hover:text-primary-600"
                      >
                        Status
                        <span className="material-icons text-sm">arrow_drop_down</span>
                      </button>
                      {showStatusFilter && (
                        <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                          {([
                            ['all', 'All'],
                            ['active', 'Active'],
                            ['deactivated', 'Deactivated'],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              onClick={() => { setStatusFilter(value); setShowStatusFilter(false); }}
                              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50 ${statusFilter === value ? 'font-bold text-primary-600' : 'text-neutral-700'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && filtered.length === 0 ? (
                  <SkeletonRows rows={6} cols={7} />
                ) : filtered.map((k) => (
                  <tr
                    key={k.kioskId}
                    onClick={() => setSelected(k)}
                    title="View kiosk report"
                    className="border-b border-neutral-100 hover:bg-primary-50/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">{k.kioskId}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-neutral-700">{k.deviceSerialNumber || '—'}</td>
                    <td className="py-3 px-4 text-sm text-neutral-700">{k.location || '—'}</td>
                    <td className="py-3 px-4 font-mono text-sm text-neutral-700">{k.ipAddress || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-block min-w-8 px-2 py-0.5 rounded-full text-xs font-bold bg-info/10 text-info text-center">
                        {k.registeredInmates ?? 0}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${statusStyle(k.status)}`}>{statusLabel(k.status)}</span>
                      {!isLive(k.status) && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {k.lastSeen ? `Last seen at ${new Date(k.lastSeen).toLocaleString('en-IN')}` : 'Last seen at —'}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
