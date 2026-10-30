import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '@/services/auth/authApi';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from '@/utils/validation';

/**
 * Turn a failed reset request into an honest message. The API answers with
 * specific codes for expired / burned codes, but a dead backend or a network
 * drop must not masquerade as a bad code.
 */
function resetErrorMessage(err: unknown): string {
  const response = (
    err as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } }
  )?.response;
  const code = response?.data?.error?.code;
  const serverMessage = response?.data?.error?.message;
  if (code === 'RATE_LIMITED') return 'Too many attempts. Please wait a few minutes and try again.';
  if (serverMessage) return serverMessage;
  if (!response) return 'Cannot reach the server. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}

/**
 * Password reset for wardens — two steps:
 * Step 1: request a 6-digit code by email.
 * Step 2: enter the code + choose a new password.
 * Styled to match the Login / Register cards inside AuthLayout.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Arriving from "Forgot password?" on the login page carries the email —
  // prefill it so the warden never retypes it.
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(
    (location.state as { email?: string } | null)?.email ?? ''
  );
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Drop the router state once read, so a refresh doesn't replay it.
  useEffect(() => {
    if (location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const goToStep = (next: 1 | 2) => {
    setFieldErrors({});
    setFormError(null);
    setStep(next);
  };

  // Step 1 -> Step 2: ask the backend to email a code.
  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const emailError = validateEmail(email);
    setFieldErrors(emailError ? { email: emailError } : {});
    if (emailError) return;

    setIsLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setStep(2);
      setInfo(`Code sent to ${email.trim()} — check your inbox (valid for 10 minutes).`);
      setResendIn(30);
    } catch (err) {
      setFormError(resetErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Resend the same request (backend enforces its own 30s cooldown).
  const resendCode = async () => {
    if (resendIn > 0 || isLoading) return;
    setFormError(null);
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setInfo(`Code sent to ${email.trim()} — check your inbox (valid for 10 minutes).`);
      setResendIn(30);
    } catch (err) {
      setFormError(resetErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 submit: exchange code + new password.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (emailError) errors.email = emailError;
    if (!/^\d{6}$/.test(code)) errors.code = 'Enter the 6-digit code from your email';
    if (passwordError) errors.password = passwordError;
    if (confirmError) errors.confirmPassword = confirmError;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    try {
      await authApi.resetPassword(email.trim(), code, password);
      navigate('/login', { replace: true, state: { resetSuccess: true } });
    } catch (err) {
      setFormError(resetErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-card shadow-card border border-black/[0.07] p-7 sm:p-9">
      {/* Top row: back + step indicator */}
      <div className="mb-7 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 2 ? goToStep(1) : navigate('/login'))}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition-colors hover:text-neutral-900 hover:border-neutral-500"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-8-8 8-8" />
          </svg>
        </button>

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
          {step === 1 ? 'Forgot password?' : 'Enter verification code'}
        </h2>
        <p className="mt-1.5 text-14 text-neutral-500">
          {step === 1
            ? "We'll email you a 6-digit code"
            : `We sent a code to ${email}`}
        </p>
      </div>

      {/* Info (code sent) */}
      {info && step === 2 && (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-success-100 bg-success-50 p-3 text-13 text-success-700"
          role="status"
        >
          <span className="material-icons mt-px text-[18px]" aria-hidden="true">
            mark_email_read
          </span>
          <span>{info}</span>
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
        <form onSubmit={requestCode} className="space-y-5" noValidate>
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

          <LoadingButton
            type="submit"
            size="lg"
            className="h-12 w-full rounded-full"
            isLoading={isLoading}
            loadingText="Sending code..."
          >
            Send Code
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
            label="Verification Code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, 6));
              if (fieldErrors.code) setFieldErrors((p) => ({ ...p, code: '' }));
            }}
            error={fieldErrors.code}
            autoFocus
          />

          <AuthInput
            label="New Password"
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
            }}
            error={fieldErrors.password}
            autoComplete="new-password"
          />

          <AuthInput
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v);
              if (fieldErrors.confirmPassword) setFieldErrors((p) => ({ ...p, confirmPassword: '' }));
            }}
            error={fieldErrors.confirmPassword}
            autoComplete="new-password"
          />

          <LoadingButton
            type="submit"
            size="lg"
            className="h-12 w-full rounded-full"
            isLoading={isLoading}
            loadingText="Resetting..."
          >
            Reset Password
          </LoadingButton>

          {/* Resend */}
          <p className="text-center text-13 text-neutral-500">
            Didn't get the code?{' '}
            {resendIn > 0 ? (
              <span className="font-medium text-neutral-400">Resend in {resendIn}s</span>
            ) : (
              <button
                type="button"
                onClick={resendCode}
                disabled={isLoading}
                className="font-medium text-primary-600 transition-colors hover:text-primary-700 disabled:opacity-50"
              >
                Resend
              </button>
            )}
          </p>
        </form>
      )}

      {/* Back to login */}
      <div className="mt-6 text-center">
        <p className="text-13 text-neutral-500">
          Remembered it?{' '}
          <Link
            to="/login"
            className="font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
