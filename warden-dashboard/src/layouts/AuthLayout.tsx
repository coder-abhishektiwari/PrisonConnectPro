import { Outlet } from 'react-router-dom';

/**
 * Polished split-screen auth layout with branding panel.
 * Used for Login, Register, Forgot Password, and Reset Password screens.
 */
export function AuthLayout() {
  return (
    <div className="min-h-screen flex bg-neutral-50">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-primary-950">
        {/* Decorative Elements */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-primary-400/10 blur-2xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/30">
              <img src="/ic_icon.webp" alt="PrisonConnect" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">PrisonConnect</h1>
              <p className="text-xs text-neutral-400 uppercase tracking-widest">Jail Admin Console</p>
            </div>
          </div>

          {/* Hero Text */}
          <div className="space-y-6">
            <h2 className="text-4xl font-bold text-white leading-tight">
              Centralized Monitoring for
              <span className="block text-primary-400">Correctional Facilities</span>
            </h2>
            <p className="text-neutral-300 text-lg max-w-md">
              Real-time call monitoring, threat detection, and infrastructure management across all connected prisons.
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3">
              {['Live Monitoring', 'Threat Alerts', 'Recording Center', 'Infrastructure Health'].map((feature) => (
                <span
                  key={feature}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 text-neutral-200 text-sm rounded-full backdrop-blur-sm"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>© 2026 PrisonConnect. All rights reserved.</span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Systems Operational
            </span>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}