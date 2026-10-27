import { Outlet } from 'react-router-dom';

/**
 * Centered auth layout — grid backdrop, logo up top, card in the middle,
 * meta line at the bottom. No branding panel.
 * Used for Login and Register screens.
 */
export function AuthLayout() {
  return (
    <div className="auth-grid min-h-screen flex flex-col">
      {/* Logo */}
      <header className="mx-auto mt-8 inline-flex items-center justify-center gap-3 rounded-3xl p-3 backdrop-blur-2xl">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <img
            src="/ic_icon.webp"
            alt="PrisonConnect"
            className="h-7 w-7 object-contain"
          />
        </div>

        <div className="text-left">
          <h1 className="text-17 font-semibold tracking-[-0.01em] text-neutral-900">
            PrisonConnect
          </h1>
          <p className="text-10 uppercase tracking-[0.28em] text-neutral-500">
            Jail Operations Console
          </p>
        </div>
      </header>

      {/* Form Card */}
      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[440px]">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="pb-7 text-center text-11 text-neutral-600">
        © 2026 PrisonConnect <span className="mx-2 text-neutral-600">·</span> Authorized personnel only · All activities are monitored
      </footer>
    </div>
  );
}
