import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { getStoredUser } from '@/services/auth/tokenStorage';
import type { Settings, Pricing } from '@/services/api/wardenApi';

/**
 * Settings Page - System configuration and policies.
 * Includes the warden-controlled call billing rates (per-minute, per jail)
 * and the maximum call duration enforced on the kiosk.
 */
export function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Get prisonId from logged-in warden's profile
  const storedUser = getStoredUser();
  const prisonId = storedUser?.prisonId || '';

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsData, pricingData] = await Promise.all([
          wardenApi.getSettings(),
          wardenApi.getPricing(),
        ]);
        setSettings(settingsData ?? null);
        setPricing(pricingData ?? null);
      } catch (error) {
        console.error('Failed to load settings:', error);
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
    setSaveMessage(null);
    try {
      // Persist call policy + billing rates together.
      await Promise.all([
        wardenApi.updateSettings({
          callSettings: {
            maxCallDurationMinutes: Number(settings.callSettings.maxCallDurationMinutes) || 15,
          },
        }),
        wardenApi.updatePricing({
          video: { ratePerMinute: Number(pricing?.video?.ratePerMinute) || 0 },
          audio: { ratePerMinute: Number(pricing?.audio?.ratePerMinute) || 0 },
        }),
      ]);
      setSaveMessage('Settings saved — new calls will use these rates and limits.');
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Loading message="Loading settings..." />;
  }

  if (!settings || loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Settings</h1>
          <p className="text-neutral-600 mt-1">System configuration and policies</p>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-neutral-600">Failed to load settings</p>
          </div>
        </Card>
      </div>
    );
  }

  const maxDuration = Number(settings.callSettings.maxCallDurationMinutes) || 15;
  const videoRate = Number(pricing?.video?.ratePerMinute ?? 2.5);
  const audioRate = Number(pricing?.audio?.ratePerMinute ?? 1.0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Settings</h1>
        <p className="text-neutral-600 mt-1">System configuration and policies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Billing — per-jail rates controlled by the warden */}
        <Card title="Call Billing Rates (₹ per minute)">
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              These rates apply to all calls from your jail. A new minute is
              charged as soon as it starts, even if not consumed in full.
            </p>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Video Call Rate (₹ / minute)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={videoRate}
                onChange={(e) =>
                  setPricing({
                    ...(pricing ?? {}),
                    video: { ...(pricing?.video ?? {}), ratePerMinute: parseFloat(e.target.value) || 0 },
                  })
                }
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Audio Call Rate (₹ / minute)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={audioRate}
                onChange={(e) =>
                  setPricing({
                    ...(pricing ?? {}),
                    audio: { ...(pricing?.audio ?? {}), ratePerMinute: parseFloat(e.target.value) || 0 },
                  })
                }
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="bg-neutral-50 rounded-lg p-3 text-sm text-neutral-600">
              Example: 3m 20s video call = 4 billed minutes ={' '}
              <span className="font-semibold text-neutral-900">
                ₹{(4 * videoRate).toFixed(2)}
              </span>
            </div>
          </div>
        </Card>

        {/* Call limits — enforced live on the kiosk */}
        <Card title="Call Duration Limits">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Maximum Call Duration (minutes)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={maxDuration}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    callSettings: {
                      ...settings.callSettings,
                      maxCallDurationMinutes: parseInt(e.target.value) || 15,
                    },
                  })
                }
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                The kiosk automatically ends calls at this limit and shows the
                countdown to the inmate during the call.
              </p>
            </div>
          </div>
        </Card>

        {/* Kiosk Setup PIN Management */}
        <Card title="Kiosk Setup PIN Policy" className="lg:col-span-2">
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Configure the 6-digit Setup PIN required for first-time hardware
              provisioning of kiosks at {prisonId}.
            </p>
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Facility Setup PIN (6 Digits)
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit PIN"
                onChange={async (e) => {
                  if (e.target.value.length === 6) {
                    try {
                      await wardenApi.updateSetupPin(prisonId, e.target.value);
                      setSaveMessage('Setup PIN updated successfully');
                      setTimeout(() => setSaveMessage(null), 3000);
                    } catch (err) {
                      console.error('Failed to update PIN', err);
                      setSaveMessage('Failed to update PIN');
                      setTimeout(() => setSaveMessage(null), 3000);
                    }
                  }
                }}
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-lg font-mono font-bold text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </Card>
      </div>

      {saveMessage && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            saveMessage.startsWith('Failed')
              ? 'bg-red-50 text-red-700'
              : 'bg-green-50 text-green-700'
          }`}
        >
          {saveMessage}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
