import { Outlet } from 'react-router-dom';

/** Real dashboard capabilities — must match Sidebar nav items. Kept short. */
const features = [
  { icon: 'videocam', title: 'Live Calls', desc: 'Real-time monitoring' },
  { icon: 'history', title: 'Call Logs', desc: 'History & recordings' },
  { icon: 'devices_other', title: 'Kiosks', desc: 'Fleet health & status' },
  { icon: 'family_restroom', title: 'Inmates & Family', desc: 'Contacts & credits' },
  { icon: 'how_to_reg', title: 'Registrations', desc: 'Approve new devices' },
];

/**
 * Split-screen auth layout — Apple-inspired, fits any viewport without
 * scrolling. Compact branding panel + centered form card.
 * Used for Login, Register, Forgot Password, and Reset Password screens.
 */
export function AuthLayout() {
  return (
    <div className="h-screen overflow-hidden flex bg-[#fbfbfd]">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-[42%] relative overflow-hidden bg-[#060609]">
        {/* Soft aurora glows */}
        <div className="absolute -top-40 -left-32 w-[480px] h-[480px] rounded-full bg-primary-600/[0.18] blur-[120px]" />
        <div className="absolute -bottom-48 -right-40 w-[560px] h-[560px] rounded-full bg-indigo-400/[0.10] blur-[140px]" />

        <div className="relative z-10 flex flex-col justify-between w-full px-10 py-9 xl:px-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.07] border border-white/[0.08] flex items-center justify-center backdrop-blur-sm">
              <img src="/ic_icon.webp" alt="PrisonConnect" className="w-6 h-6 object-contain" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-white tracking-[-0.01em]">PrisonConnect</h1>
              <p className="text-[10px] text-neutral-500 uppercase tracking-[0.22em]">Jail Admin Console</p>
            </div>
          </div>

          {/* Hero */}
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-medium text-primary-400 uppercase tracking-[0.3em] mb-2.5">
                Secure Operations
              </p>
              <h2 className="text-[28px] xl:text-[32px] font-semibold text-white leading-[1.12] tracking-[-0.025em]">
                The complete jail operations console.
              </h2>
            </div>

            {/* Feature list — mirrors the real dashboard nav */}
            <ul className="border-t border-white/[0.07]">
              {features.map((feature) => (
                <li
                  key={feature.title}
                  className="flex items-center gap-3 py-2.5 border-b border-white/[0.07]"
                >
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-neutral-300">
                    <span className="material-icons text-[16px]">{feature.icon}</span>
                  </span>
                  <span className="min-w-0 flex items-baseline gap-2">
                    <span className="text-[13px] font-medium text-neutral-100 whitespace-nowrap">{feature.title}</span>
                    <span className="text-[12px] text-neutral-500 truncate">{feature.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-neutral-600">
            <span>© 2026 PrisonConnect</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full" />
              Systems Operational
            </span>
          </div>
        </div>
      </div>

      {/* Right Form Panel — centers the card; scrolls only if truly needed */}
      <div className="flex-1 h-full flex items-center justify-center overflow-y-auto p-5 sm:p-8">
        <div className="w-full max-w-[400px] my-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
