import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateEmail, validateLogin } from '@/utils/validation';

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
 * Login Page for Jail Administration staff — two steps:
 * Step 1: email address.
 * Step 2: password.
 * Floating labels, password visibility toggle, inline validation,
 * loading spinner, and error handling.
 */
export function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // One-shot flash messages carried in via router state (password reset).
  const [flash, setFlash] = useState<string | null>(
    (location.state as { resetSuccess?: boolean })?.resetSuccess
      ? 'Password reset successfully. Sign in with your new password.'
      : null
  );

  // Drop the router state once read, so a refresh doesn't replay the flash.
  useEffect(() => {
    if (location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const goToStep = (next: 1 | 2) => {
    setFieldErrors({});
    setFormError(null);
    setStep(next);
  };

  // Step 1 -> Step 2: validate the email first.
  const handleContinue = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const emailError = validateEmail(email);
    setFieldErrors(emailError ? { email: emailError } : {});
    if (emailError) return;

    goToStep(2);
  };

  // Step 2 submit: sign in with email + password.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const { valid, errors } = validateLogin(email, password);
    setFieldErrors(errors);
    if (!valid) {
      if (errors.email) goToStep(1);
      return;
    }

    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(loginErrorMessage(err));
    }
  };

  return (
    <div className="bg-white rounded-card shadow-card border border-black/[0.07] p-7 sm:p-9">
      {/* Top row: back (step 2) + step indicator */}
      <div className="mb-7 flex items-center justify-between">
        {step === 2 && (
          <button
            type="button"
            onClick={() => goToStep(1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition-colors hover:text-neutral-900 hover:border-neutral-500"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-8-8 8-8" />
            </svg>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ease-in-out ${step === 1
                ? 'w-7 bg-primary-600'
                : 'w-4 bg-primary-100'
              }`}
          />

          <span
            className={`h-1.5 rounded-full transition-all duration-300 ease-in-out ${step === 2
                ? 'w-7 bg-primary-600'
                : 'w-4 bg-primary-100'
              }`}
          />

          <span className="ml-1 text-11 font-medium uppercase tracking-[0.2em] text-neutral-400">
            Step {step} of 2
          </span>
        </div>

      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-28 font-semibold text-neutral-900 tracking-[-0.025em]">
          {step === 1 ? 'Sign in' : 'Welcome back'}
        </h2>
        <p className="mt-1.5 text-14 text-neutral-500">
          {step === 1
            ? 'Enter your registered email to continue'
            : 'Enter your password to reach the console'}
        </p>
      </div>

      {/* Password reset success */}
      {flash && (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-success-100 bg-success-50 p-3 text-13 text-success-700"
          role="status"
        >
          <span className="material-icons mt-px text-[18px]" aria-hidden="true">
            check_circle
          </span>
          <span>{flash}</span>
        </div>
      )}

      {/* Error */}
      {formError && (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-error-100 bg-error-50 p-3 text-13 text-error-700"
          role="alert"
        >
          <svg
            className="mt-0.5 h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleContinue} className="space-y-5" noValidate>
          <AuthInput
            label="Email Address"
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              clearFieldError('email');
            }}
            error={fieldErrors.email}
            autoComplete="email"
            autoFocus
          />

          <LoadingButton
            type="submit"
            size="lg"
            className="h-12 w-full rounded-full"
            isLoading={isLoading}
            loadingText="Please wait..."
          >
            Continue
          </LoadingButton>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email chip with Change action */}
        <button
          type="button"
          onClick={() => goToStep(1)}
          className="group flex items-center gap-2.5 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-left hover:border-neutral-300 hover:bg-white transition-colors focus:outline-none focus:ring-4 focus:ring-primary-500/15"
        >
          <span className="w-7 h-7 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
            <span className="material-icons text-[15px]">mail</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-700">
            {email}
          </span>
          <span className="text-[11px] font-semibold text-primary-600 group-hover:text-primary-700 flex items-center gap-1 shrink-0">
            <span className="material-icons text-[14px]">edit</span>
            Change
          </span>
        </button>

          <AuthInput
            label="Password"
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              clearFieldError('password');
            }}
            error={fieldErrors.password}
            autoComplete="current-password"
            autoFocus
          />

          <div className="-mt-1 text-right">
            <Link
              to="/forgot-password"
              state={{ email }}
              className="text-13 font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              Forgot password?
            </Link>
          </div>

          <LoadingButton
            type="submit"
            size="lg"
            className="h-12 w-full rounded-full"
            isLoading={isLoading}
            loadingText="Signing In..."
          >
            Sign In
          </LoadingButton>
        </form>
      )}

      {/* Register Link */}
      <div className="mt-6 text-center">
        <p className="text-13 text-neutral-500">
          New to PrisonConnect?{' '}
          <Link
            to="/register"
            className="font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
