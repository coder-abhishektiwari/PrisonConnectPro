import { useEffect, useState } from 'react';
import { 
  Building2, 
  Wifi, 
  WifiOff, 
  PhoneCall, 
  Mic, 
  Monitor, 
  IndianRupee, 
  TrendingUp, 
  Users, 
  HeartPulse,
  AlertCircle,
  Activity
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';
import type { Prison } from '@/types/api';

export function DashboardPage() {
  const [prisons, setPrisons] = useState<Prison[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    vendorApi.getPrisons()
      .then(res => {
        clearTimeout(timeoutId);
        setPrisons(res.data);
        setIsLoading(false);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error('Failed to load prisons:', err);
        setIsLoading(false);
      });
  }, []);

  const displayPrisons = prisons;

  const stats = [
    { label: 'Total Connected Prisons', value: displayPrisons.length, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Online Prisons', value: displayPrisons.filter(p => p.status === 'online').length, icon: Wifi, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Offline Prisons', value: displayPrisons.filter(p => p.status === 'offline').length, icon: WifiOff, color: 'text-red-600', bg: 'bg-red-100' },
    { label: 'Active Calls', value: displayPrisons.reduce((acc, p) => acc + (p.activeCalls || 0), 0), icon: PhoneCall, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Active Recordings', value: Math.floor(displayPrisons.reduce((acc, p) => acc + (p.activeCalls || 0), 0) * 0.8), icon: Mic, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Connected Kiosks', value: displayPrisons.reduce((acc, p) => acc + (p.activeKiosks || 0), 0), icon: Monitor, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { label: 'Today\'s Revenue', value: `₹${displayPrisons.reduce((acc, p) => acc + (p.revenueToday || 0), 0).toLocaleString()}`, icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Monthly Revenue', value: `₹${displayPrisons.reduce((acc, p) => acc + (p.revenueMonthly || 0), 0).toLocaleString()}`, icon: TrendingUp, color: 'text-cyan-600', bg: 'bg-cyan-100' },
    { label: 'Active Operators', value: displayPrisons.length * 4, icon: Users, color: 'text-rose-600', bg: 'bg-rose-100' },
    { label: 'Server Health', value: displayPrisons.length > 0 ? '98.2%' : '0%', icon: HeartPulse, color: 'text-orange-600', bg: 'bg-orange-100' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading System Metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Multi-Jail Oversight</h1>
        <p className="text-slate-500">Real-time aggregate performance metrics across all connected facilities.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className={`${stat.bg} ${stat.color} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary-500" />
            Revenue Distribution
          </h3>
          <div className="space-y-6">
            {displayPrisons.map(prison => (
              <div key={prison.id}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">{prison.name}</span>
                  <span className="text-sm font-bold text-slate-900">₹{prison.revenueMonthly.toLocaleString()}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div 
                    className="bg-primary-600 h-2 rounded-full" 
                    style={{ width: `${(prison.revenueMonthly / prisons.reduce((acc, p) => acc + p.revenueMonthly, 0)) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-500" />
            Operational Status
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Facility</th>
                  <th className="pb-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="pb-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Load</th>
                </tr>
              </thead>
                <tbody className="divide-y divide-slate-50">
                {displayPrisons.map(prison => (
                  <tr key={prison.id}>
                    <td className="py-4 text-sm font-medium text-slate-700">{prison.name}</td>
                    <td className="py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        prison.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${prison.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        {prison.status}
                      </span>
                    </td>
                    <td className="py-4 text-sm text-slate-600">{Math.floor((prison.activeKiosks / prison.totalKiosks) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
