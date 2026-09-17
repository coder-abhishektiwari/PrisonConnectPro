import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import { usePageHeader } from '@/context/PageHeaderContext';
import { wardenApi, KioskItem } from '@/services/api/wardenApi';

export function KiosksPage() {
  const [kiosks, setKiosks] = useState<KioskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, removeToast } = useToast();

  const fetchKiosks = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    try {
      const data = await wardenApi.getKiosks();
      setKiosks(data);
    } catch (err) {
      if (!signal?.aborted) {
        console.error('Failed to fetch kiosks:', err);
        setLoadError('Failed to load kiosks');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchKiosks(controller.signal);
    return () => controller.abort();
  }, [fetchKiosks]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return kiosks;
    const q = searchQuery.toLowerCase();
    return kiosks.filter((k) =>
      (k.kioskId || '').toLowerCase().includes(q) ||
      (k.location || '').toLowerCase().includes(q) ||
      (k.ipAddress || '').toLowerCase().includes(q) ||
      (k.deviceSerialNumber || '').toLowerCase().includes(q) ||
      (k.prisonName || k.prisonId || '').toLowerCase().includes(q)
    );
  }, [kiosks, searchQuery]);

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">devices_other</span>, []);

  usePageHeader({
    title: 'Kiosks',
    subtitle: 'All registered kiosk devices in your prison',
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={() => { setIsLoading(true); fetchKiosks(); }} disabled={isLoading} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition">
        {isLoading ? 'Refreshing...' : 'Refresh'}
      </button>
    ), [isLoading, fetchKiosks]),
  });

  if (isLoading) return <Loading message="Loading kiosks..." />;

  if (loadError) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="text-center py-12">
            <p className="text-error mb-4">{loadError}</p>
            <button onClick={() => { setIsLoading(true); fetchKiosks(); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Search */}
      <Card>
        <div className="flex items-center justify-between gap-4 p-4 border-b border-neutral-200">
          <p className="text-sm text-neutral-500">{filtered.length} kiosk{filtered.length !== 1 ? 's' : ''}</p>
          <input type="text" placeholder="Search ID, serial, location..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full sm:w-72 px-3 py-1.5 text-sm border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {filtered.length === 0 ? (
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
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Block / Cell</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Android</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => (
                  <tr key={k.kioskId} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">{k.kioskId}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-neutral-700">{k.deviceSerialNumber || '—'}</td>
                    <td className="py-3 px-4 text-sm text-neutral-700">{k.location || '—'}</td>
                    <td className="py-3 px-4 font-mono text-sm text-neutral-700">{k.ipAddress || '—'}</td>
                    <td className="py-3 px-4 text-sm text-neutral-700">
                      {k.assignedBlock || k.assignedCellArea ? (
                        <span>{k.assignedBlock || '—'} / {k.assignedCellArea || '—'}</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-600">{k.androidVersion || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                        k.status === 'active' ? 'bg-success/10 text-success border border-success/20' :
                        k.status === 'disabled' ? 'bg-error/10 text-error border border-error/20' :
                        'bg-warning/10 text-warning border border-warning/20'
                      }`}>{k.status || 'pending'}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-600">
                      {k.lastSeen ? new Date(k.lastSeen).toLocaleString('en-IN') : '—'}
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
