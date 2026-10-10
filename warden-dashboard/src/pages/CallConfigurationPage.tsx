import { useState } from 'react';
import { Card } from '@/components/Card';
import { wardenApi, cacheKeys, Settings, SetupPinData, PrisonInfo } from '@/services/api/wardenApi';
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

  const { data: prison, error: prisonError, refresh: refreshPrison } = useCachedResource<PrisonInfo>(
    cacheKeys.prison(prisonId),
    () => wardenApi.getPrison(prisonId),
    { ttl: 60_000 },
  );

  const { data: pinData, refresh: refreshPin } = useCachedResource<SetupPinData>(
    `kiosks:pin:${prisonId}`,
    () => wardenApi.getSetupPin(prisonId),
    { ttl: 60_000 },
  );

  const { toasts, success: toastSuccess, error: toastError, removeToast } = useToast();
  const [pinInput, setPinInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const [prisonEditing, setPrisonEditing] = useState(false);
  const [savingPrison, setSavingPrison] = useState(false);
  const [prisonForm, setPrisonForm] = useState({ name: '', code: '', state: '', district: '', capacity: '', address: '' });

  const pinSet = !!pinData?.pinSet;
  const inputEnabled = !pinSet || editing;

  usePageHeader({
    title: 'Configurations',
    subtitle: 'Manage facility setup & kiosk configuration',
  });

  const startPrisonEdit = () => {
    setPrisonForm({
      name: prison?.name ?? '',
      code: prison?.code ?? '',
      state: prison?.state ?? '',
      district: prison?.district ?? '',
      capacity: prison?.capacity != null ? String(prison.capacity) : '',
      address: prison?.address ?? '',
    });
    setPrisonEditing(true);
  };

  const savePrison = async () => {
    if (savingPrison) return;
    const name = prisonForm.name.trim();
    if (!name) {
      toastError('Jail name is required.');
      return;
    }
    const capacityRaw = prisonForm.capacity.trim();
    const capacity = capacityRaw === '' ? null : Number(capacityRaw);
    if (capacityRaw !== '' && (!Number.isInteger(capacity) || capacity < 0)) {
      toastError('Capacity must be a whole number.');
      return;
    }
    setSavingPrison(true);
    try {
      await wardenApi.updatePrison(prisonId, {
        name,
        code: prisonForm.code.trim(),
        state: prisonForm.state.trim(),
        district: prisonForm.district.trim(),
        address: prisonForm.address.trim(),
        capacity,
      });
      toastSuccess('Jail information updated.');
      setPrisonEditing(false);
      await refreshPrison();
    } catch {
      toastError('Failed to update jail information.');
    } finally {
      setSavingPrison(false);
    }
  };

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

  const viewField = (label: string, value?: string | null) => (
    <div key={label}>
      <span className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">{label}</span>
      <p className="text-sm text-neutral-900 min-h-[1.25rem]">{value && value.trim() ? value : '—'}</p>
    </div>
  );

  const editField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { type?: string; inputMode?: 'numeric'; maxLength?: number; required?: boolean },
  ) => (
    <div key={label}>
      <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
        {label} {opts?.required && <span className="text-error">*</span>}
      </label>
      <input
        type={opts?.type || 'text'}
        inputMode={opts?.inputMode}
        maxLength={opts?.maxLength}
        value={value}
        disabled={savingPrison}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border-2 border-neutral-300 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white disabled:bg-neutral-100"
      />
    </div>
  );

  const statusActive = (prison?.status || 'active') === 'active';

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <Card>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
                <span className="material-icons text-xl">account_balance</span>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900">Jail Information</h3>
                <p className="text-sm text-neutral-500">Facility profile shown across the dashboard</p>
              </div>
            </div>
            {!prisonEditing ? (
              <button
                onClick={startPrisonEdit}
                disabled={!prison}
                title="Edit jail information"
                className="w-9 h-9 flex items-center justify-center bg-white border-2 border-neutral-300 text-neutral-600 rounded-lg hover:border-primary-400 hover:text-primary-400 transition disabled:opacity-40"
              >
                <span className="material-icons text-lg">edit</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPrisonEditing(false)}
                  disabled={savingPrison}
                  title="Cancel"
                  className="w-9 h-9 flex items-center justify-center bg-white border-2 border-neutral-300 text-neutral-600 rounded-lg hover:border-error hover:text-error transition disabled:opacity-40"
                >
                  <span className="material-icons text-lg">close</span>
                </button>
                <button
                  onClick={savePrison}
                  disabled={savingPrison || !prisonForm.name.trim()}
                  title="Save"
                  className="w-9 h-9 flex items-center justify-center bg-success text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  <span className="material-icons text-lg">{savingPrison ? 'hourglass_top' : 'check'}</span>
                </button>
              </div>
            )}
          </div>

          {prisonError && !prison ? (
            <div className="text-center py-6">
              <p className="text-sm text-neutral-600">{prisonError}</p>
              <button onClick={refreshPrison} className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
            </div>
          ) : !prison ? (
            <p className="text-sm text-neutral-500 py-4">Loading jail information…</p>
          ) : (
            <>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">Prison ID</span>
                  <span className="font-mono font-bold text-neutral-900">{prison.prisonId || prisonId || '—'}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <span className={`px-2 py-1 rounded-full font-semibold text-white ${statusActive ? 'bg-success' : 'bg-neutral-400'}`}>
                    {prison.status || 'active'}
                  </span>
                  <span>{prison.currentInmateCount ?? 0} inmates</span>
                  <span>{(prison.kioskIds ?? []).length} kiosks</span>
                  <span className="flex items-center gap-1" title="Prison ID is permanent and cannot be changed">
                    <span className="material-icons text-sm text-neutral-400">lock</span> Read-only
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {prisonEditing ? (
                  <>
                    {editField('Jail Name', prisonForm.name, (v) => setPrisonForm({ ...prisonForm, name: v }), { required: true })}
                    {editField('Code', prisonForm.code, (v) => setPrisonForm({ ...prisonForm, code: v }))}
                    {editField('State', prisonForm.state, (v) => setPrisonForm({ ...prisonForm, state: v }))}
                    {editField('District', prisonForm.district, (v) => setPrisonForm({ ...prisonForm, district: v }))}
                    {editField('Capacity', prisonForm.capacity, (v) => setPrisonForm({ ...prisonForm, capacity: v.replace(/\D/g, '').slice(0, 7) }), { inputMode: 'numeric' })}
                    <div className="hidden md:block" />
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">Address</label>
                      <textarea
                        rows={2}
                        value={prisonForm.address}
                        disabled={savingPrison}
                        onChange={(e) => setPrisonForm({ ...prisonForm, address: e.target.value })}
                        className="w-full px-3 py-2.5 border-2 border-neutral-300 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white disabled:bg-neutral-100 resize-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {viewField('Jail Name', prison.name)}
                    {viewField('Code', prison.code)}
                    {viewField('State', prison.state)}
                    {viewField('District', prison.district)}
                    {viewField('Capacity', prison.capacity != null ? String(prison.capacity) : '')}
                    <div className="hidden md:block" />
                    <div className="md:col-span-2">{viewField('Address', prison.address)}</div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

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
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-white border-2 border-neutral-300 text-neutral-600 rounded-lg hover:border-primary-400 hover:text-primary-400 transition"
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
