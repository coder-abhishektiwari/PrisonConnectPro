import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateLogin } from '@/utils/validation';

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
    } catch {
      setFormError('Invalid email or password. Please try again.');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-neutral-200/50 p-8 sm:p-10">
      {/* Mobile Logo (hidden on desktop) */}
      <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
        <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/30">
          <img src="/ic_icon.webp" alt="PrisonConnect" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">PrisonConnect</h1>
          <p className="text-xs text-neutral-500 uppercase tracking-widest">Jail Admin Console</p>
        </div>
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Welcome Back</h2>
        <p className="text-neutral-500 mt-2">Sign in to access the monitoring dashboard</p>
      </div>

      {/* Form Error Banner */}
      {formError && (
        <div
          className="mb-6 p-3.5 bg-error-50 border border-error-200 text-error-700 rounded-xl text-sm flex items-start gap-3"
          role="alert"
        >
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
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
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />

        {/* Forgot Password Link */}
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <LoadingButton
          type="submit"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          loadingText="Signing In..."
        >
          Sign In
        </LoadingButton>
      </form>

      {/* Divider */}
      <div className="my-6 flex items-center gap-4">
        <div className="flex-1 h-px bg-neutral-200" />
        <span className="text-xs text-neutral-400 uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>

      {/* Register Link */}
      <div className="text-center">
        <p className="text-sm text-neutral-600">
          Need an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            Create one
          </Link>
        </p>
      </div>

      {/* Security Notice */}
      <div className="mt-8 pt-6 border-t border-neutral-100">
        <p className="text-xs text-neutral-400 text-center flex items-center justify-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Authorized personnel only. All activities are monitored.
        </p>
      </div>
    </div>
  );
}