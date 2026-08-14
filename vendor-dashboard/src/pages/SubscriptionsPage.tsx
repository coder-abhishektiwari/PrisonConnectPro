import { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  Calendar, 
  User, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle 
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';
import type { Subscription } from '@/types/api';

export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getSubscriptions().then(res => {
      setSubscriptions(res.data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-full">Verifying Licenses...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscription Management</h1>
          <p className="text-slate-500">Monitor customer plans, licenses, and renewal cycles.</p>
        </div>
        <button className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-primary-600/20">
          Issue New License
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search licenses, customers, or jail IDs..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all"
          />
        </div>
        <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 flex items-center gap-2 hover:bg-slate-50">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer & Plan</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">License Key</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry / Renewal</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Management</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.map((sub) => (
              <tr key={sub.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{sub.customer}</div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wider mt-1">
                        {sub.plan} Plan
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">{sub.license}</code>
                    <button className="text-primary-600 hover:text-primary-700 text-xs font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Copy</button>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Expires: {sub.expiry}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Renew by: {sub.renewalDate}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    sub.status === 'active' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
                  }`}>
                    {sub.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {sub.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all">
                    Modify Plan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
