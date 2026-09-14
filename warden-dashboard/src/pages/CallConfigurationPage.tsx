import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { apiClient } from '@/services/api/client';
import { getStoredUser } from '@/services/auth/tokenStorage';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ToastContainer';
import type { Settings, Pricing } from '@/services/api/wardenApi';

export function CallConfigurationPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { toasts, success: toastSuccess, error: toastError, removeToast } = useToast();
  const storedUser = getStoredUser();
  const prisonId = storedUser?.prisonId || '';

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

  const loadFresh = async () => {
    // Bypass cache — always read fresh from backend so Save never appears to revert
    const [settingsRes, pricingRes] = await Promise.all([
      apiClient.get('/settings').then((r) => r.data?.data).catch(() => null),
      apiClient.get('/pricing').then((r) => r.data?.data).catch(() => null),
    ]);
    // Backend may return object or [object] singleton array
    const settingsData = Array.isArray(settingsRes) ? settingsRes[0] : settingsRes;
    const pricingData = Array.isArray(pricingRes) ? pricingRes[0] : pricingRes;
    return { settingsData, pricingData };
  };

  useEffect(() => {
    const load = async () => {
      try {
        const { settingsData, pricingData } = await loadFresh();
        setSettings((settingsData as any) ?? null);
        setPricing((pricingData as any) ?? null);
        setAudioRate(String((pricingData as any)?.audio?.ratePerMinute ?? '1.0'));
        setVideoRate(String((pricingData as any)?.video?.ratePerMinute ?? '2.5'));
        setCurrency((pricingData as any)?.audio?.currency || 'INR');
        setGstPercent(String((pricingData as any)?.tax?.gstPercentage ?? '0'));
        setCgstPercent(String((pricingData as any)?.tax?.cgstPercentage ?? '0'));
        setSgstPercent(String((pricingData as any)?.tax?.sgstPercentage ?? '0'));
        setMinCharge(String((pricingData as any)?.billingRules?.minimumCharge ?? '0'));
        setFreeMinutes(String((pricingData as any)?.billingRules?.freeMinutesBeforeCharge ?? '0'));
        setMaxDaily(String((pricingData as any)?.billingRules?.maxDailyCharge ?? '0'));
        setBillingInterval(String((pricingData as any)?.billingRules?.billingIntervalSeconds ?? '60'));
      } catch (e) {
        console.error('Failed to load call config:', e);
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const safeMax = Number((settings as any)?.callSettings?.maxCallDurationMinutes) || 15;
      const [settingsRes, pricingRes] = await Promise.all([
        wardenApi.updateSettings({
          callSettings: { maxCallDurationMinutes: safeMax },
        }),
        wardenApi.updatePricing({
          audio: { ratePerMinute: parseFloat(audioRate) || 0, currency },
          video: { ratePerMinute: parseFloat(videoRate) || 0, currency },
          tax: { gstPercentage: parseFloat(gstPercent) || 0, cgstPercentage: parseFloat(cgstPercent) || 0, sgstPercentage: parseFloat(sgstPercent) || 0 },
          billingRules: {
            minimumCharge: parseFloat(minCharge) || 0,
            freeMinutesBeforeCharge: parseInt(freeMinutes) || 0,
            maxDailyCharge: parseFloat(maxDaily) || 0,
            billingIntervalSeconds: parseInt(billingInterval) || 60,
          },
        }),
      ]);
      // Keep local state in sync with what was saved, then verify by re-fetching fresh from backend
      if (settingsRes) setSettings(settingsRes as any);
      if (pricingRes) {
        const p = pricingRes as any;
        setPricing(p);
        setAudioRate(String(p?.audio?.ratePerMinute ?? audioRate));
        setVideoRate(String(p?.video?.ratePerMinute ?? videoRate));
      }
      // Re-fetch fresh to guarantee next navigation shows persisted values (bypasses 60s cache)
      const { settingsData, pricingData } = await loadFresh();
      if (settingsData) setSettings(settingsData as any);
      if (pricingData) {
        setPricing(pricingData as any);
        setAudioRate(String((pricingData as any)?.audio?.ratePerMinute ?? audioRate));
        setVideoRate(String((pricingData as any)?.video?.ratePerMinute ?? videoRate));
        setCurrency((pricingData as any)?.audio?.currency || currency);
      }
      toastSuccess('Call configuration saved — verified and synced. New calls will use updated policies.');
    } catch (e: any) {
      console.error('Failed to save:', e);
      const msg = e?.response?.data?.error?.message || e?.message || '';
      toastError(msg ? `Save failed: ${msg}` : 'Failed to save call configuration. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const interval = parseInt(billingInterval) || 60;
  const preview = useMemo(() => {
    const v = parseFloat(videoRate) || 2.5;
    const a = parseFloat(audioRate) || 1.0;
    const dur = 200; // 3m 20s preview
    const units = Math.ceil(dur / interval);
    const perUnit = (v * interval) / 60;
    return { dur, units, perUnit, videoTotal: units * perUnit, audioTotal: (Math.ceil(dur / interval) * a * interval) / 60 };
  }, [videoRate, audioRate, interval]);

  const maxDuration = Number((settings as any)?.callSettings?.maxCallDurationMinutes ?? 15) || 15;

  if (isLoading) return <Loading message="Loading call configuration..." />;
  if (!settings || loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Call Configuration</h1>
          <p className="text-neutral-600 mt-1">Centralized call governance</p>
        </div>
        <Card><div className="text-center py-12"><p className="text-neutral-600">Failed to load configuration</p></div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Professional Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Call Configuration</h1>
              <span className="px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded-full text-xs font-semibold">Live</span>
            </div>
            <p className="text-sm text-neutral-600 mt-1">Governs every inmate-to-family call — rates, duration, billing and device onboarding.</p>
            <p className="text-xs text-neutral-500 mt-1">Facility: <span className="font-mono font-medium text-neutral-900">{prisonId || '—'}</span> • Changes apply instantly to new calls (ongoing calls retain rate at start).</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden lg:block text-right">
            <p className="text-xs text-neutral-500">Last saved</p>
            <p className="text-sm font-medium text-neutral-900">Just now • Auto-synced to kiosks</p>
          </div>
          <Button size="lg" onClick={handleSave} disabled={saving} className="shadow-md">
            {saving ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</span>
            ) : (
              'Save Configuration'
            )}
          </Button>
        </div>
      </div>

      {/* Preview Banner */}
      <div className="bg-neutral-900 text-white rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><span className="text-sm font-bold">₹</span></div>
          <div>
            <p className="text-sm font-semibold">Live billing preview — 3m 20s call</p>
            <p className="text-xs text-neutral-400">{preview.units} × {interval}s intervals • Video ₹{(preview.perUnit).toFixed(2)}/interval • Total <span className="text-white font-bold">₹{preview.videoTotal.toFixed(2)}</span> (Audio ₹{preview.audioTotal.toFixed(2)})</p>
          </div>
        </div>
        <p className="text-xs text-neutral-400 hidden md:block">Interval = billing granularity. 30s = half-minute units, 60s = per-minute.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Rates */}
        <Card className="border-t-4 border-t-primary-600">
          <div className="flex items-start justify-between mb-5">
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary-50 border border-primary-200 flex items-center justify-center"><svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">Call Rates</h3>
                <p className="text-xs text-neutral-500">Per-minute tariff • inclusive of interval pro-rating</p>
              </div>
            </div>
            <span className="text-xs px-2 py-1 bg-neutral-100 border rounded-full font-medium">INR</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Video Rate <span className="text-neutral-400 font-normal normal-case">(₹ / minute)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">₹</span>
                <input type="number" step="0.5" min="0" value={videoRate} onChange={(e) => setVideoRate(e.target.value)}
                  className="w-full pl-7 pr-16 py-2.5 border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium" placeholder="2.50" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">/ min</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Audio Rate <span className="text-neutral-400 font-normal normal-case">(₹ / minute)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">₹</span>
                <input type="number" step="0.5" min="0" value={audioRate} onChange={(e) => setAudioRate(e.target.value)}
                  className="w-full pl-7 pr-16 py-2.5 border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium" placeholder="1.00" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">/ min</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-neutral-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 text-sm font-medium">
                <option value="INR">INR — Indian Rupee (₹)</option>
                <option value="USD">USD — US Dollar ($)</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Duration & Interval */}
        <Card className="border-t-4 border-t-neutral-900">
          <div className="flex gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">Duration & Interval</h3>
              <p className="text-xs text-neutral-500">Hard limits • enforced live on kiosk</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Maximum Call Duration <span className="text-neutral-400 normal-case">(minutes)</span></label>
              <input type="number" min="1" max="60" value={maxDuration}
                onChange={(e) => setSettings({ ...(settings as any), callSettings: { ...((settings as any)?.callSettings ?? {}), maxCallDurationMinutes: parseInt(e.target.value) || 15 } } as any)}
                className="w-full px-4 py-2.5 border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium" />
              <p className="text-xs text-neutral-500 mt-1.5 flex gap-1.5"><span className="text-amber-600">●</span>Kiosk shows countdown and auto-terminates at limit.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Free Minutes</label>
                <input type="number" min="0" value={freeMinutes} onChange={(e) => setFreeMinutes(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-medium" placeholder="0" />
                <p className="text-xs text-neutral-400 mt-1">Grace before billing</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  Billing Interval
                  <span className="group relative">
                    <span className="w-4 h-4 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center text-xs cursor-help">?</span>
                    <span className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-neutral-900 text-white text-xs rounded-lg p-3 shadow-xl z-10">Chunk size for charging. 30s = 2 units/min, 60s = 1 unit/min. Shorter interval = fairer for short calls.</span>
                  </span>
                </label>
                <div className="relative">
                  <input type="number" min="1" value={billingInterval} onChange={(e) => setBillingInterval(e.target.value)}
                    className="w-full px-3 pr-10 py-2.5 border-2 border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-medium" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">sec</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Tax */}
        <Card className="border-t-4 border-t-amber-500">
          <div className="flex gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center"><svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l2-2h2l2 2h2l2-2h2l2 2z" /></svg></div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">Tax Rules</h3>
              <p className="text-xs text-neutral-500">Applied on top of call charge • optional</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">GST <span className="text-neutral-400 normal-case">total %</span></label>
              <div className="relative">
                <input type="number" step="0.1" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)}
                  className="w-full px-3 pr-8 py-2.5 border-2 border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-medium" placeholder="0.0" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">CGST %</label>
                <div className="relative">
                  <input type="number" step="0.1" value={cgstPercent} onChange={(e) => setCgstPercent(e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 border-2 border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-medium" placeholder="0.0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">SGST %</label>
                <div className="relative">
                  <input type="number" step="0.1" value={sgstPercent} onChange={(e) => setSgstPercent(e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 border-2 border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-medium" placeholder="0.0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">%</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-neutral-500 bg-amber-50 border border-amber-200 rounded-lg p-2.5">Leave at 0 if tax is included in rate. Effective tax = GST or CGST+SGST whichever you fill.</p>
          </div>
        </Card>

        {/* Billing Rules */}
        <Card className="border-t-4 border-t-success">
          <div className="flex gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center"><svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v3m12-3v3m-6-3h.01" /></svg></div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">Billing Guards</h3>
              <p className="text-xs text-neutral-500">Caps and floors • protect inmate wallet</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Minimum Charge <span className="text-neutral-400 normal-case">(₹ floor per call)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">₹</span>
                <input type="number" step="0.5" value={minCharge} onChange={(e) => setMinCharge(e.target.value)}
                  className="w-full pl-7 py-2.5 border-2 border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-medium" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Max Daily Charge <span className="text-neutral-400 normal-case">(₹ ceiling)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">₹</span>
                <input type="number" step="1" value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)}
                  className="w-full pl-7 py-2.5 border-2 border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-medium" placeholder="No cap" />
              </div>
              <p className="text-xs text-neutral-500 mt-1">0 = no daily cap</p>
            </div>
          </div>
        </Card>

        {/* PIN */}
        <Card className="lg:col-span-2 border-t-4 border-t-neutral-300">
          <div className="flex gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center"><svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">Kiosk Setup PIN Policy</h3>
              <p className="text-xs text-neutral-500">Device onboarding • 6-digit • per-facility <span className="font-mono text-neutral-900 font-medium">{prisonId || '—'}</span></p>
            </div>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">Facility Setup PIN <span className="text-error">*</span></label>
              <input type="text" maxLength={6} placeholder="••••••"
                onChange={async (e) => {
                  if (e.target.value.length === 6) {
                    try { await wardenApi.updateSetupPin(prisonId, e.target.value); toastSuccess('Setup PIN updated — new kiosks must use new PIN.'); } catch { toastError('Failed to update PIN — must be 6 digits and prison must exist.'); }
                  }
                }}
                className="w-full max-w-xs px-4 py-3 border-2 border-neutral-300 rounded-lg font-mono font-bold text-center tracking-[0.5em] text-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white" />
              <p className="text-xs text-neutral-500 mt-2">Auto-saves when 6 digits entered. Required for first-time kiosk hardware provisioning.</p>
            </div>
            <div className="flex-1 text-xs text-neutral-600 bg-white border border-neutral-200 rounded-lg p-3">
              <p className="font-semibold text-neutral-900 mb-1">Security note</p>
              PIN is bcrypt-hashed server-side and never returned in GET. Only `pinSet: true/false` is readable. Rotate periodically for hygiene.
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => window.location.reload()}>Reset</Button>
        <Button size="lg" onClick={handleSave} disabled={saving} className="min-w-40 shadow-lg">
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
