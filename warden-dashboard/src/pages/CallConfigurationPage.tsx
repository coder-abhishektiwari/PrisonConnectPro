import { useState } from 'react';
import { Card } from '@/components/Card';
import { wardenApi, cacheKeys, Settings, SetupPinData } from '@/services/api/wardenApi';
import { useCachedResource } from '@/hooks/useCachedResource';
import { getStoredUser } from '@/services/auth/tokenStorage';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ToastContainer';
import { usePageHeader } from '@/context/PageHeaderContext';

export function CallConfigurationPage() {
  const { data: settings, error, refresh } = useCachedResource<Settings>(
    cacheKeys.settings(),
    () => wardenApi.getSettings(),
    { ttl: 60_000 },
  );
  const storedUser = getStoredUser();
  const prisonId = storedUser?.prisonId || '';

  const { data: pinData, refresh: refreshPin } = useCachedResource<SetupPinData>(
    `kiosks:pin:${prisonId}`,
    () => wardenApi.getSetupPin(prisonId),
    { ttl: 60_000 },
  );

  const { toasts, success: toastSuccess, error: toastError, removeToast } = useToast();
  const [pinInput, setPinInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const pinSet = !!pinData?.pinSet;
  const inputEnabled = !pinSet || editing;

  usePageHeader({
    title: 'Configurations',
    subtitle: 'Manage facility setup & kiosk configuration',
  });

  const savePin = async () => {
    if (pinInput.length !== 6 || savingPin) return;
    setSavingPin(true);
    try {
      await wardenApi.updateSetupPin(prisonId, pinInput);
      toastSuccess('Setup PIN updated. New kiosks must use the new PIN.');
      setPinInput('');
      setEditing(false);
      await refreshPin();
    } catch {
      toastError('Failed to update PIN. Must be 6 digits and prison must exist.');
    } finally {
      setSavingPin(false);
    }
  };

  if (error && settings === undefined) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="text-center py-12">
            <p className="text-neutral-600">{error}</p>
            <button onClick={refresh} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <Card>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 00-2-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                disabled={!inputEnabled || savingPin}
                value={inputEnabled ? pinInput : '••••••'}
                placeholder="••••••"
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 pr-24 border-2 border-neutral-300 rounded-lg font-mono font-bold text-center tracking-[0.5em] text-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
              />
              {inputEnabled ? (
                pinInput.length === 6 && (
                  <button
                    onClick={savePin}
                    disabled={savingPin}
                    title="Save PIN"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-success text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  >
                    <span className="material-icons text-lg">{savingPin ? 'hourglass_top' : 'check'}</span>
                  </button>
                )
              ) : (
                <button
                  onClick={() => { setEditing(true); setPinInput(''); }}
                  title="Edit PIN"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-white border-2 border-neutral-300 text-neutral-600 rounded-lg hover:border-primary-400 hover:text-primary-600 transition"
                >
                  <span className="material-icons text-lg">edit</span>
                </button>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-3">
              {!pinSet
                ? 'Enter all 6 digits, then tap the green tick to save.'
                : inputEnabled
                  ? `Current PIN is set. Enter a new 6-digit PIN, then tap the green tick.`
                  : 'PIN is set. Tap the pencil to rotate it.'}
            </p>
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
