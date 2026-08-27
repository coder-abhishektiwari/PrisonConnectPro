import { useState, useEffect } from 'react';
import { wardenApi, Pricing } from '@/services/api/wardenApi';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ToastContainer';

export function PricingPage() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, success: toastSuccess, error: toastError, removeToast } = useToast();

  const [audioRate, setAudioRate] = useState('');
  const [videoRate, setVideoRate] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [gstPercent, setGstPercent] = useState('');
  const [cgstPercent, setCgstPercent] = useState('');
  const [sgstPercent, setSgstPercent] = useState('');
  const [minCharge, setMinCharge] = useState('');
  const [freeMinutes, setFreeMinutes] = useState('');
  const [maxDaily, setMaxDaily] = useState('');
  const [billingInterval, setBillingInterval] = useState('');

  useEffect(() => { loadPricing(); }, []);

  async function loadPricing() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await wardenApi.getPricing();
      setPricing(data);
      setAudioRate(String(data?.audio?.ratePerMinute ?? ''));
      setVideoRate(String(data?.video?.ratePerMinute ?? ''));
      setCurrency(data?.audio?.currency || 'INR');
      setGstPercent(String(data?.tax?.gstPercentage ?? ''));
      setCgstPercent(String(data?.tax?.cgstPercentage ?? ''));
      setSgstPercent(String(data?.tax?.sgstPercentage ?? ''));
      setMinCharge(String(data?.billingRules?.minimumCharge ?? ''));
      setFreeMinutes(String(data?.billingRules?.freeMinutesBeforeCharge ?? ''));
      setMaxDaily(String(data?.billingRules?.maxDailyCharge ?? ''));
      setBillingInterval(String(data?.billingRules?.billingIntervalSeconds ?? ''));
    } catch (err) {
      console.error('Failed to load pricing:', err);
      setLoadError('Failed to load pricing. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      const updated = await wardenApi.updatePricing({
        audio: { ratePerMinute: parseFloat(audioRate) || 0, currency },
        video: { ratePerMinute: parseFloat(videoRate) || 0, currency },
        tax: {
          gstPercentage: parseFloat(gstPercent) || 0,
          cgstPercentage: parseFloat(cgstPercent) || 0,
          sgstPercentage: parseFloat(sgstPercent) || 0,
        },
        billingRules: {
          minimumCharge: parseFloat(minCharge) || 0,
          freeMinutesBeforeCharge: parseInt(freeMinutes) || 0,
          maxDailyCharge: parseFloat(maxDaily) || 0,
          billingIntervalSeconds: parseInt(billingInterval) || 30,
        },
      });
      setPricing(updated);
      toastSuccess('Pricing updated successfully');
    } catch (err) {
      console.error('Failed to save pricing:', err);
      toastError('Failed to save pricing');
    } finally {
      setSaving(false);
    }
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
          <button onClick={loadPricing} className="mt-2 text-sm text-primary-600 hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pricing Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure call rates, tax rules, and billing policies</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Rates */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Call Rates</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Audio Rate (₹/min)</label>
              <input type="number" step="0.10" value={audioRate} onChange={(e) => setAudioRate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Video Rate (₹/min)</label>
              <input type="number" step="0.10" value={videoRate} onChange={(e) => setVideoRate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500">
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tax Rules */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Tax Rules</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">GST (%)</label>
              <input type="number" step="0.1" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CGST (%)</label>
                <input type="number" step="0.1" value={cgstPercent} onChange={(e) => setCgstPercent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SGST (%)</label>
                <input type="number" step="0.1" value={sgstPercent} onChange={(e) => setSgstPercent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Billing Rules */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Billing Rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Minimum Charge (₹)</label>
              <input type="number" step="0.50" value={minCharge} onChange={(e) => setMinCharge(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Free Minutes Before Charge</label>
              <input type="number" value={freeMinutes} onChange={(e) => setFreeMinutes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Daily Charge (₹)</label>
              <input type="number" step="1" value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Billing Interval (seconds)</label>
              <input type="number" value={billingInterval} onChange={(e) => setBillingInterval(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
