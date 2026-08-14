import { useEffect, useState } from 'react';
import { 
  CircleDollarSign, 
  Mic, 
  Video, 
  Receipt, 
  Info, 
  CheckCircle2 
} from 'lucide-react';
import { vendorApi } from '@/services/api/vendorApi';
import type { Pricing } from '@/types/api';

export function PricingPage() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    vendorApi.getPricing().then(res => {
      setPricing(res.data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading || !pricing) return <div className="flex items-center justify-center h-full">Loading Rate Cards...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pricing Management</h1>
        <p className="text-slate-500">Global rate configuration for audio and video services.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Mic className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">Audio Call Pricing</h3>
            </div>
            <button className="text-primary-600 text-xs font-bold uppercase tracking-wider">Edit Rates</button>
          </div>
          <div className="p-8 flex flex-col items-center text-center">
            <span className="text-slate-400 text-sm font-medium mb-1">Standard Rate</span>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900">₹{pricing.audio.price.toFixed(2)}</span>
              <span className="text-slate-500 font-medium">/{pricing.audio.unit}</span>
            </div>
            <div className="mt-6 w-full p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-sm text-slate-600 italic">
              "Competitive audio rates designed for high-volume inmate voice communications."
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">Video Call Pricing</h3>
            </div>
            <button className="text-primary-600 text-xs font-bold uppercase tracking-wider">Edit Rates</button>
          </div>
          <div className="p-8 flex flex-col items-center text-center">
            <span className="text-slate-400 text-sm font-medium mb-1">Premium Rate</span>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900">₹{pricing.video.price.toFixed(2)}</span>
              <span className="text-slate-500 font-medium">/{pricing.video.unit}</span>
            </div>
            <div className="mt-6 w-full p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-sm text-slate-600 italic">
              "Includes HD video streaming, multi-party signaling, and automated recording."
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary-500" />
            Billing & Tax Rules
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-sm font-medium text-slate-600">Applied Tax (GST)</span>
                <span className="text-sm font-bold text-slate-900">{pricing.tax}% ({pricing.gst})</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-sm font-medium text-slate-600">Currency</span>
                <span className="text-sm font-bold text-slate-900">INR (₹)</span>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Governance Rules</p>
              {pricing.billingRules.map((rule, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                  <span className="text-sm text-slate-600 font-medium">{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-primary-900 rounded-2xl p-8 text-white flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-6">
              <Info className="w-6 h-6 text-primary-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">Global Pricing Strategy</h3>
            <p className="text-primary-200 text-sm leading-relaxed">
              Updating these rates will affect all future transactions across every prison facility. 
              Changes are logged for audit purposes.
            </p>
          </div>
          <button className="mt-8 w-full py-3 bg-white text-primary-900 font-bold rounded-xl hover:bg-primary-50 transition-colors shadow-lg">
            Review Price Change
          </button>
        </div>
      </div>
    </div>
  );
}
