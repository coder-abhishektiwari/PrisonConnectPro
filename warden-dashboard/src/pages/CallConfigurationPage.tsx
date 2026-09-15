import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { getStoredUser } from '@/services/auth/tokenStorage';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ToastContainer';

export function CallConfigurationPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, success: toastSuccess, error: toastError, removeToast } = useToast();
  const storedUser = getStoredUser();
  const prisonId = storedUser?.prisonId || '';

  useEffect(() => {
    const load = async () => {
      try {
        await wardenApi.getSettings();
      } catch {
        setLoadError('Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) return <Loading message="Loading configuration..." />;

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Kiosk Setup PIN</h1>
          <p className="text-neutral-600 mt-1">Device onboarding PIN for your facility</p>
        </div>
        <Card><div className="text-center py-12"><p className="text-neutral-600">{loadError}</p></div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Kiosk Setup PIN</h1>
        <p className="text-neutral-600 mt-1">Device onboarding PIN for your facility</p>
      </div>

      <Card>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-neutral-900">Facility Setup PIN</h3>
              <p className="text-sm text-neutral-500">Required for first-time kiosk hardware provisioning</p>
            </div>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 max-w-md">
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">
              6-Digit PIN <span className="text-error">*</span>
            </label>
            <input
              type="text"
              maxLength={6}
              placeholder="••••••"
              onChange={async (e) => {
                if (e.target.value.length === 6) {
                  try {
                    await wardenApi.updateSetupPin(prisonId, e.target.value);
                    toastSuccess('Setup PIN updated. New kiosks must use the new PIN.');
                  } catch {
                    toastError('Failed to update PIN. Must be 6 digits and prison must exist.');
                  }
                }
              }}
              className="w-full px-4 py-3 border-2 border-neutral-300 rounded-lg font-mono font-bold text-center tracking-[0.5em] text-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            />
            <p className="text-xs text-neutral-500 mt-3">Auto-saves when 6 digits are entered.</p>
          </div>

          <div className="text-xs text-neutral-600 bg-white border border-neutral-200 rounded-lg p-4 max-w-md">
            <p className="font-semibold text-neutral-900 mb-1">Security note</p>
            PIN is bcrypt-hashed server-side and never returned in GET. Only <code className="bg-neutral-100 px-1 rounded">pinSet: true/false</code> is readable. Rotate periodically.
          </div>
        </div>
      </Card>
    </div>
  );
}
