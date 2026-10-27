import { useNavigate } from 'react-router-dom';

const features = [
  { icon: 'videocam', title: 'Live Monitoring', desc: 'Monitor active calls' },
  { icon: 'devices_other', title: 'Kiosk Management', desc: 'Track device health' },
  { icon: 'history', title: 'Call Records', desc: 'Review call history' },
  { icon: 'family_restroom', title: 'People & Wallets', desc: 'Manage contacts and balances' },
];

export function WelcomePage() {
  const navigate = useNavigate();

  return (
    <main className="relative flex min-h-[100svh] w-full flex-col justify-center bg-canvas px-5 py-8 sm:px-8 sm:py-12">

      {/* Welcome hero */}
      <section className="mx-auto mt-12 w-full max-w-xl text-center sm:mt-16">
        <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-primary-100 bg-primary-50">
          <img
            src="/ic_icon.webp"
            alt="PrisonConnect"
            className="w-10 h-10 object-contain"
            aria-hidden="true"
          />
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
          Warden & Administration Portal
        </p>

        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
          Welcome to PrisonConnect
        </h1>

        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-neutral-600 sm:text-base sm:leading-7">
          Your central workspace for secure call monitoring, kiosk
          operations, inmate records and family account management.
        </p>

        {/* Actions */}
        <div className="mx-auto mt-8 w-full max-w-sm space-y-3">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="group flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/25 active:scale-[0.99]"
          >
            Sign in to your account
            <span
              className="material-icons text-lg transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            >
              arrow_forward
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/register')}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-neutral-200 bg-white px-5 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-neutral-200"
          >
            Create an account
          </button>

          <p className="pt-1 text-xs leading-5 text-neutral-500">
            Already have access? Sign in with your registered credentials.
          </p>

          <button
            type="button"
            onClick={() => navigate('/theme-editor')}
            className="pt-1 text-11 text-neutral-400 transition-colors hover:text-neutral-600"
          >
            Customize theme
          </button>
        </div>
      </section>

    </main>
  );
}
