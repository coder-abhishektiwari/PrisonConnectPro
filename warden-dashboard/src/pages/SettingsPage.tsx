import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import type { Settings } from '@/services/api/wardenApi';

/**
 * Settings Page - System configuration and policies.
 */
export function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsData = await wardenApi.getSettings();
        setSettings(settingsData);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await wardenApi.updateSettings(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  if (isLoading) {
    return <Loading message="Loading settings..." />;
  }

  if (!settings) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Settings</h1>
        <p className="text-neutral-600 mt-1">System configuration and policies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Call Settings">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Default Call Duration (minutes)</label>
              <input
                type="number"
                value={settings.callSettings.defaultDuration}
                onChange={(e) => setSettings({ ...settings, callSettings: { ...settings.callSettings, defaultDuration: parseInt(e.target.value) } })}
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Maximum Call Duration (minutes)</label>
              <input
                type="number"
                value={settings.callSettings.maxDuration}
                onChange={(e) => setSettings({ ...settings, callSettings: { ...settings.callSettings, maxDuration: parseInt(e.target.value) } })}
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </Card>

        <Card title="System Settings">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">Enable Call Recording</p>
                <p className="text-sm text-neutral-600">Automatically record all calls</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, callSettings: { ...settings.callSettings, recordingEnabled: !settings.callSettings.recordingEnabled } })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.callSettings.recordingEnabled ? 'bg-primary-600' : 'bg-neutral-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.callSettings.recordingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">Auto-Terminate Calls</p>
                <p className="text-sm text-neutral-600">End calls when time limit reached</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, callSettings: { ...settings.callSettings, autoTerminate: !settings.callSettings.autoTerminate } })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.callSettings.autoTerminate ? 'bg-primary-600' : 'bg-neutral-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.callSettings.autoTerminate ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">SMS Notifications</p>
                <p className="text-sm text-neutral-600">Send SMS alerts for call events</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, systemSettings: { ...settings.systemSettings, smsNotifications: !settings.systemSettings.smsNotifications } })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.systemSettings.smsNotifications ? 'bg-primary-600' : 'bg-neutral-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.systemSettings.smsNotifications ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Kiosk Setup PIN Management */}
      <Card title="Kiosk Setup PIN Policy">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Configure the 6-digit Setup PIN required for first-time hardware provisioning of kiosks at PRISON-001 (Central Prison Facility).
          </p>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Facility Setup PIN (6 Digits)
            </label>
            <input
              type="text"
              maxLength={6}
              defaultValue="123456"
              onChange={async (e) => {
                if (e.target.value.length === 6) {
                  try {
                    await wardenApi.updateSetupPin('PRISON-001', e.target.value);
                  } catch (err) {
                    console.error('Failed to update PIN', err);
                  }
                }
              }}
              className="w-full px-4 py-2 border-2 border-neutral-300 rounded-lg font-mono font-bold text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </Card>


      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
