import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateLogin } from '@/utils/validation';

/**
 * Turn a failed login into an honest message. The API answers 401 for bad
 * credentials, but a dead/500-ing backend or a network drop must not be
 * reported as "invalid credentials" - that sent us chasing phantom password
 * bugs while the API was simply down.
 */
function loginErrorMessage(err: unknown): string {
  const response = (
    err as { response?: { status?: number; data?: { error?: { message?: string } } } }
  )?.response;
  const serverMessage = response?.data?.error?.message;
  if (response?.status === 401) return 'Invalid email or password. Please try again.';
  if (serverMessage) return serverMessage;
  if (!response) return 'Cannot reach the server. Please try again in a moment.';
  return 'Something went wrong while signing in. Please try again.';
}

/**
 * Login Page for Jail Administration staff.
 * Features floating labels, password visibility toggle, inline validation,
 * loading spinner, and error handling.
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    const { valid, errors } = validateLogin(email, password);
    setFieldErrors(errors);
    if (!valid) return;

    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(loginErrorMessage(err));
    }
  };

  return (
    <div className="bg-white rounded-[28px] border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_64px_-24px_rgba(0,0,0,0.14)] p-7 sm:p-8">
      {/* Mobile Logo (hidden on desktop) */}
      <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center">
          <img src="/ic_icon.webp" alt="PrisonConnect" className="w-6 h-6 object-contain" />
        </div>
        <div className="text-left">
          <h1 className="text-[15px] font-semibold text-neutral-900 tracking-[-0.01em]">PrisonConnect</h1>
          <p className="text-[10px] text-neutral-400 uppercase tracking-[0.22em]">Jail Admin Console</p>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[26px] font-semibold text-neutral-900 tracking-[-0.02em]">Welcome back</h2>
        <p className="text-[14px] text-neutral-500 mt-1">Sign in to the monitoring dashboard</p>
      </div>

      {/* Form Error Banner */}
      {formError && (
        <div
          className="mb-4 p-3 bg-error-50/70 border border-error-100 text-error-700 rounded-2xl text-[13px] flex items-start gap-2.5"
          role="alert"
        >
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthInput
          label="Email Address"
          type="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
          }}
          error={fieldErrors.email}
          autoComplete="email"
          autoFocus
        />

        <AuthInput
          label="Password"
          type="password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
          }}
          error={fieldErrors.password}
          autoComplete="current-password"
        />

        {/* Forgot Password Link */}
        <div className="flex justify-end -mt-1">
          <Link
            to="/forgot-password"
            className="text-[13px] font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <LoadingButton
          type="submit"
          size="lg"
          className="w-full h-12 rounded-full"
          isLoading={isLoading}
          loadingText="Signing In..."
        >
          Sign In
        </LoadingButton>
      </form>

      {/* Register Link */}
      <div className="mt-5 text-center">
        <p className="text-[13px] text-neutral-500">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Request access
          </Link>
        </p>
      </div>

      {/* Security Notice */}
      <div className="mt-4 pt-4 border-t border-neutral-100">
        <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
          Authorized personnel only · All activities are monitored
        </p>
      </div>
    </div>
  );
}