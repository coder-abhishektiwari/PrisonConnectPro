/**
 * High-quality centered splash/loading screen shown while
 * the initial authentication state is being resolved.
 */
export function SplashScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-6">
        {/* Logo Mark */}
        <div className="relative">
          <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-primary-600/30">
            <img src="/ic_icon.webp" alt="PrisonConnect" className="w-12 h-12 object-contain" />
          </div>
          <div className="absolute -inset-2 rounded-3xl border-2 border-primary-500/20 animate-ping" />
        </div>

        {/* Brand */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">PrisonConnect</h1>
          <p className="text-sm text-neutral-400 mt-1">Securing Your Session</p>
        </div>

        {/* Spinner */}
        <div className="w-10 h-10 border-[3px] border-primary-600/30 border-t-primary-600 rounded-full animate-spin" />
      </div>
    </div>
  );
}