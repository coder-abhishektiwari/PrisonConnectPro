import { useState, useEffect } from 'react';
import { wardenApi } from '@/services/api/wardenApi';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ToastContainer';

interface Prison {
  prisonId: string;
  name: string;
  code: string;
  state: string;
  district: string;
  address: string;
  status: string;
  capacity: number;
  currentInmateCount: number;
  wardenIds: string[];
  kioskIds: string[];
}

export function PrisonsPage() {
  const [prisons, setPrisons] = useState<Prison[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { toasts, success: toastSuccess, error: toastError, removeToast } = useToast();

  useEffect(() => { loadPrisons(); }, []);

  async function loadPrisons() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await wardenApi.getPrisons();
      setPrisons(data);
    } catch (err) {
      console.error('Failed to load prisons:', err);
      setLoadError('Failed to load prisons. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const filtered = prisons.filter(p => {
    return p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.state.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{loadError}</p>
          <button onClick={loadPrisons} className="mt-2 text-sm text-primary-600 hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Prisons</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">View and manage prison facilities</p>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, code, district, or state..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500"
      />

      {/* Prison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <p className="col-span-full text-center text-slate-500 dark:text-slate-400 py-8">No prisons found</p>
        ) : filtered.map((prison) => {
          const utilization = prison.capacity > 0 ? Math.round((prison.currentInmateCount / prison.capacity) * 100) : 0;
          return (
            <div key={prison.prisonId} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{prison.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{prison.code}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  prison.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {prison.status}
                </span>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{prison.district}, {prison.state}</p>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Capacity</span>
                  <span className="font-medium text-slate-900 dark:text-white">{prison.currentInmateCount}/{prison.capacity}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      utilization > 80 ? 'bg-red-500' : utilization > 50 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Wardens</span>
                  <span className="font-medium text-slate-900 dark:text-white">{prison.wardenIds.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Kiosks</span>
                  <span className="font-medium text-slate-900 dark:text-white">{prison.kioskIds.length}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
