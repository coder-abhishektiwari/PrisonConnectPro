import { useEffect, useState } from 'react';
import { 
  HardDrive, 
  ShieldCheck, 
  Clock, 
  Trash2, 
  Info,
  ChevronRight,
  Database
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';
import type { StorageStats } from '@/types/api';

export function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getStorageStats().then(res => {
      setStats(res.data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading || !stats) return <div className="flex items-center justify-center h-full">Calculating Storage Allocation...</div>;

  const usedPercentage = Math.floor((stats.used / stats.total) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recording Storage</h1>
        <p className="text-slate-500">Centralized S3-compatible object storage for every call recording.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Global Cluster Usage</h3>
                  <p className="text-sm text-slate-500">Distributed across 3 availability zones.</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-slate-900">{usedPercentage}%</span>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Capacity Reached</p>
              </div>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden flex">
              <div className="bg-primary-500 h-full transition-all duration-1000" style={{ width: `${usedPercentage}%` }}></div>
            </div>

            <div className="grid grid-cols-3 gap-8 mt-10">
              <div className="text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Allocated</p>
                <p className="text-xl font-bold text-slate-900">{stats.total} GB</p>
              </div>
              <div className="text-center border-x border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Used Storage</p>
                <p className="text-xl font-bold text-slate-900">{stats.used} GB</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Available Space</p>
                <p className="text-xl font-bold text-slate-900">{stats.available} GB</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-slate-400" />
                Storage Policies
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { label: 'Retention Period', value: stats.retention, icon: Clock, color: 'text-blue-500' },
                { label: 'Data Encryption', value: stats.encryption, icon: ShieldCheck, color: 'text-green-500' },
                { label: 'Redundancy', value: '3-Way Replication', icon: HardDrive, color: 'text-purple-500' },
                { label: 'Download Access', value: 'Disabled (Audit-only)', icon: Trash2, color: 'text-red-500' },
              ].map((policy, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <policy.icon className={`w-5 h-5 ${policy.color}`} />
                    <span className="text-sm font-medium text-slate-700">{policy.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-900">{policy.value}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 rounded-2xl p-8 text-white">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center mb-6 border border-amber-500/30">
              <Info className="w-5 h-5 text-amber-500" />
            </div>
            <h4 className="text-lg font-bold mb-4">Storage Hard Limits</h4>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Automatic deletion of recordings older than {stats.retention} is currently enabled to maintain system stability.
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-widest">Auto-purge</span>
                <span className="text-green-500 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-widest">Compression</span>
                <span className="text-primary-400 font-bold">LZ4 ENABLED</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
            <h4 className="font-bold text-slate-900 mb-2 text-sm uppercase tracking-wider">Manual Purge Controls</h4>
            <p className="text-slate-500 text-xs mb-6">Irreversible deletion of all archived recordings across the network.</p>
            <button className="w-full py-3 border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors text-sm">
              Initiate Purge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
