import { useEffect, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Download, 
  Filter, 
  IndianRupee, 
  PhoneCall, 
  Database 
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';

export function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getReports().then(res => {
      setReports(res.data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-full">Compiling Analytical Data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Reports</h1>
          <p className="text-slate-500">Comprehensive revenue and usage analytics across all facilities.</p>
        </div>
        <button className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 font-medium hover:bg-slate-50 transition-all">
          <Download className="w-4 h-4" />
          Export All Data
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
              <IndianRupee className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">+12.5%</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Gross Revenue (24h)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">₹85,420</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <PhoneCall className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">+5.2%</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Total Call Volume</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">1,240</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Optimal</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Avg. Infra Usage</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">68.4%</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary-500" />
            Historical Logs
          </h3>
          <div className="flex gap-2">
            {['Daily', 'Weekly', 'Monthly'].map(period => (
              <button key={period} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                period === 'Monthly' ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20' : 'text-slate-500 hover:bg-slate-100'
              }`}>
                {period}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Report Name</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Generated</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-700">{report.title}</td>
                  <td className="px-6 py-4 text-slate-500">{new Date(report.timestamp || Date.now()).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wider">
                      {report.type || 'SYSTEM'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-primary-600 hover:text-primary-700 font-bold flex items-center justify-end gap-1 ml-auto">
                      <Download className="w-4 h-4" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
