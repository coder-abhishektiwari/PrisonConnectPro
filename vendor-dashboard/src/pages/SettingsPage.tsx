import { useEffect, useState } from 'react';
import { 
  Settings, 
  ShieldAlert, 
  Layers, 
  HardDrive, 
  Bell, 
  Save, 
  Globe, 
  History 
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';

export function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getSettings().then(res => {
      setSettings(res.data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading || !settings) return <div className="flex items-center justify-center h-full">Synchronizing System Variables...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global Settings</h1>
          <p className="text-slate-500">Configure platform-wide policies, security, and environment variables.</p>
        </div>
        <button className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-primary-600/20">
          <Save className="w-4 h-4" />
          Apply Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <Globe className="w-5 h-5 text-primary-500" />
              <h3 className="font-bold text-slate-900">Platform Settings</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Platform Name</label>
                  <input type="text" defaultValue="PrisonConnect Global" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Version</label>
                  <input type="text" defaultValue="v1.4.2-stable" readOnly className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 cursor-not-allowed outline-none" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-primary-50 rounded-xl border border-primary-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Maintenance Mode</p>
                    <p className="text-xs text-slate-500">Route all kiosk traffic to a standby page.</p>
                  </div>
                </div>
                <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all"></div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <h3 className="font-bold text-slate-900">Security Policies</h3>
            </div>
            <div className="p-6 space-y-4">
              {[
                { title: 'Multi-Factor Authentication', desc: 'Enforce 2FA for all administrative accounts.', enabled: true },
                { title: 'Session Timeout', desc: 'Auto-logout inactive users after 30 minutes.', enabled: true },
                { title: 'IP Whitelisting', desc: 'Restrict dashboard access to corporate VPN ranges.', enabled: false },
              ].map((policy, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{policy.title}</p>
                    <p className="text-xs text-slate-500">{policy.desc}</p>
                  </div>
                  <div className={`w-12 h-6 ${policy.enabled ? 'bg-primary-600' : 'bg-slate-200'} rounded-full relative cursor-pointer`}>
                    <div className={`absolute ${policy.enabled ? 'right-1' : 'left-1'} top-1 w-4 h-4 bg-white rounded-full transition-all`}></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-widest text-xs">
              <Layers className="w-4 h-4 text-slate-400" />
              Integrations
            </h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold">TW</div>
                  <span className="text-sm font-medium text-slate-700">Twilio SMS</span>
                </div>
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">CONNECTED</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold">AWS</div>
                  <span className="text-sm font-medium text-slate-700">Amazon S3</span>
                </div>
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">CONNECTED</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold">RD</div>
                  <span className="text-sm font-medium text-slate-700">Redis Cloud</span>
                </div>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">RECONNECTING</span>
              </div>
            </div>
          </div>

          <div className="bg-primary-900 rounded-2xl p-6 text-white text-center">
            <Settings className="w-12 h-12 text-primary-400 mx-auto mb-4" />
            <h4 className="font-bold mb-2 uppercase tracking-widest text-xs">Environment</h4>
            <p className="text-2xl font-black mb-4">PRODUCTION</p>
            <div className="text-[10px] font-medium text-primary-300 uppercase tracking-widest">
              Cluster: ap-south-1a
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
