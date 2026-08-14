import { useEffect, useState } from 'react';
import { 
  Server, 
  Cpu, 
  Database, 
  Layers, 
  Activity, 
  Clock, 
  ShieldCheck 
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';
import type { ServerHealth } from '@/types/api';

export function InfrastructurePage() {
  const [servers, setServers] = useState<ServerHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getServers().then(res => {
      setServers(res.data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-full">Polling Global Nodes...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Infrastructure Monitoring</h1>
        <p className="text-slate-500">Live health and resource utilization of the distributed backend stack.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {servers.map((server) => (
          <div key={server.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${server.status === 'online' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  <Server className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900">{server.name}</h3>
              </div>
              <span className={`w-2 h-2 rounded-full ${server.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU Usage</span>
                  <span>{server.cpu}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${server.cpu > 80 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${server.cpu}%` }}></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> RAM Allocation</span>
                  <span>{server.ram}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${server.ram > 80 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${server.ram}%` }}></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1"><Database className="w-3 h-3" /> Storage Usage</span>
                  <span>{server.storage}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${server.storage > 80 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${server.storage}%` }}></div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Clock className="w-3 h-3" />
                  Uptime: {server.uptime}
                </div>
                <ShieldCheck className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Network Traffic Load</h2>
            <p className="text-slate-400 text-sm">Global CDN and Edge distribution metrics.</p>
          </div>
        </div>
        <div className="h-48 flex items-end gap-2 px-2">
          {[40, 65, 45, 80, 95, 70, 55, 40, 65, 85, 40, 65, 45, 80, 95, 70, 55, 40, 65, 85].map((h, i) => (
            <div key={i} className="flex-1 bg-primary-500/40 rounded-t-sm hover:bg-primary-400 transition-colors" style={{ height: `${h}%` }}></div>
          ))}
        </div>
      </div>
    </div>
  );
}
