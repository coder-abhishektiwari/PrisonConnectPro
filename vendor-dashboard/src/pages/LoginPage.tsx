import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, User, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateLogin } from '@/utils/validation';

/**
 * Login Page for the Vendor Super Admin Console.
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4 shadow-lg shadow-primary-500/20">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">PrisonConnect</h1>
          <p className="text-slate-400 mt-2 uppercase tracking-[0.2em] text-xs font-semibold">
            Vendor Super Admin Console
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          {/* Form Error Banner */}
          {formError && (
            <div
              className="mb-6 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-3"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
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
              icon={<User className="w-5 h-5" />}
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
              icon={<Lock className="w-5 h-5" />}
            />

            {/* Forgot Password Link */}
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <LoadingButton
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isLoading}
              loadingText="Authenticating..."
            >
              Secure Authorization
            </LoadingButton>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Register Link */}
          <div className="text-center">
            <p className="text-sm text-slate-400">
              Need an account?{' '}
              <Link
                to="/register"
                className="font-semibold text-primary-400 hover:text-primary-300 transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">v1.0.0 Stable</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <span className="w-1 h-1 bg-green-500 rounded-full"></span>
            Encrypted Session
          </span>
        </div>
      </div>
    </div>
  );
}