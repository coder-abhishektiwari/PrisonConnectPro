import { useEffect, useState } from 'react';
import { 
  Play, 
  ExternalLink, 
  BarChart2, 
  Building2, 
  Shield, 
  AlertTriangle 
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';

export function LiveMonitoringPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getActiveCalls().then(res => {
      setCalls(res.data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-full">Connecting to Signaling Nodes...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Global Monitoring</h1>
          <p className="text-slate-500">Supervisory view of all active communications across the network.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
            {calls.length} ACTIVE SESSIONS
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {calls.map((call) => (
          <div key={call.callId} className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl group">
            <div className="aspect-video bg-slate-800 relative flex items-center justify-center">
              <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
                <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded uppercase tracking-wider animate-pulse">REC</span>
                <span className="px-2 py-0.5 bg-black/50 text-white text-[10px] font-bold rounded uppercase tracking-wider backdrop-blur-sm">HD 1080P</span>
              </div>
              <Monitor className="w-12 h-12 text-slate-700 group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent opacity-60"></div>
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div>
                  <div className="text-white text-sm font-bold flex items-center gap-1">
                    {call.inmateName} <span className="text-slate-400 font-normal">→</span> {call.familyMemberName}
                  </div>
                  <div className="text-slate-400 text-[10px] font-medium uppercase tracking-widest flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {call.roomIdLabel || 'Facility A'}
                  </div>
                </div>
                <div className="text-white text-xs font-mono bg-black/40 px-2 py-1 rounded">04:22</div>
              </div>
            </div>
            
            <div className="p-4 flex items-center justify-between gap-3">
              <button className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-primary-600 text-white py-2 rounded-lg text-xs font-bold transition-all border border-slate-700">
                <Play className="w-3 h-3" /> INTERCEPT
              </button>
              <button className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-all">
                <BarChart2 className="w-4 h-4" />
              </button>
              <button className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-all">
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {calls.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
          <Monitor className="w-16 h-16 text-slate-200 mb-4" />
          <h3 className="text-lg font-bold text-slate-400 uppercase tracking-widest">No Active Sessions Found</h3>
        </div>
      )}
    </div>
  );
}

function Monitor(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}
