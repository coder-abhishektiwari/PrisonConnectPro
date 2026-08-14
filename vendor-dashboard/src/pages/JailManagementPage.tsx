import { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Building2, 
  MoreVertical,
  Edit,
  Power,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';
import type { Prison } from '@/types/api';

export function JailManagementPage() {
  const [prisons, setPrisons] = useState<Prison[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getPrisons().then(res => {
      setPrisons(res.data);
      setIsLoading(false);
    });
  }, []);

  const filteredPrisons = prisons.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <div className="flex items-center justify-center h-full">Loading Prison List...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jail Management</h1>
          <p className="text-slate-500">Add, configure, and monitor prison facilities globally.</p>
        </div>
        <button className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-primary-600/20">
          <Plus className="w-4 h-4" />
          Onboard New Jail
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name or code..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 flex items-center gap-2 hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Facility Details</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Location</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Infrastructure</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Traffic</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPrisons.map((prison) => (
              <tr key={prison.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{prison.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{prison.code}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-700 font-medium">{prison.state}</div>
                  <div className="text-xs text-slate-500">{prison.district}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    prison.status === 'online' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${prison.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {prison.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-700 font-medium">{prison.activeKiosks}/{prison.totalKiosks} Kiosks</div>
                  <div className="text-xs text-slate-500">Active / Total</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-700 font-medium">{prison.activeCalls} Live Calls</div>
                  <div className="text-xs text-slate-500">{prison.totalInmates} Inmates</div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all" title="Warden Dashboard">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                      <Power className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
