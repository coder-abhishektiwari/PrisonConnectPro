import { useState, useEffect } from 'react';
import { wardenApi } from '@/services/api/wardenApi';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ToastContainer';

interface Subscription {
  id: string;
  prisonId: string;
  customer: string;
  plan: string;
  expiry: string;
  license: string;
  renewalDate: string;
  status: string;
}

export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, removeToast } = useToast();

  useEffect(() => { loadSubscriptions(); }, []);

  async function loadSubscriptions() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await wardenApi.getSubscriptions();
      setSubscriptions(data);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setLoadError('Failed to load subscriptions. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function getDaysUntilExpiry(expiry: string): number {
    const now = new Date();
    const exp = new Date(expiry);
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  function getExpiryColor(expiry: string): string {
    const days = getDaysUntilExpiry(expiry);
    if (days < 0) return 'text-red-600 dark:text-red-400';
    if (days < 30) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  }

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
          <button onClick={loadSubscriptions} className="mt-2 text-sm text-primary-600 hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscriptions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage facility subscription plans and licenses</p>
      </div>

      {subscriptions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">No subscriptions found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subscriptions.map((sub) => {
            const daysLeft = getDaysUntilExpiry(sub.expiry);
            return (
              <div key={sub.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{sub.customer}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{sub.prisonId}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    sub.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {sub.status}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Plan</span>
                    <span className="font-medium text-slate-900 dark:text-white">{sub.plan}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">License</span>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{sub.license}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Expiry</span>
                    <span className={`font-medium ${getExpiryColor(sub.expiry)}`}>
                      {new Date(sub.expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {daysLeft >= 0 && ` (${daysLeft}d)`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Renewal</span>
                    <span className="text-slate-900 dark:text-white">
                      {new Date(sub.renewalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
