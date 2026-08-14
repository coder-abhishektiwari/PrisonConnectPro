import { Shield } from 'lucide-react';

/**
 * High-quality centered splash/loading screen shown while
 * the initial authentication state is being resolved.
 */
export function SplashScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-6">
        {/* Logo Mark */}
        <div className="relative">
          <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-primary-500/30">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -inset-2 rounded-3xl border-2 border-primary-500/20 animate-ping" />
        </div>

        {/* Brand */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">PrisonConnect</h1>
          <p className="text-sm text-slate-500 mt-1 uppercase tracking-[0.2em] text-xs font-semibold">
            Vendor Super Admin
          </p>
        </div>

        {/* Spinner */}
        <div className="w-10 h-10 border-[3px] border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    </div>
  );
}