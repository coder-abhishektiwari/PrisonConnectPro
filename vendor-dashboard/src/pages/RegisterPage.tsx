import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, User, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateRegister } from '@/utils/validation';

/**
 * Registration Page for creating new vendor admin accounts.
 * Features client-side validation, password strength rules,
 * and loading state during API calls.
 */
export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    const { valid, errors } = validateRegister(name, email, password, confirmPassword);
    setFieldErrors(errors);
    if (!valid) return;

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      navigate('/dashboard', { replace: true });
    } catch {
      setFormError('Registration failed. Please check your details and try again.');
    }
  };

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }));
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

          {/* Register Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <AuthInput
              label="Full Name"
              type="text"
              value={name}
              onChange={(v) => {
                setName(v);
                clearFieldError('name');
              }}
              error={fieldErrors.name}
              autoComplete="name"
              autoFocus
              icon={<User className="w-5 h-5" />}
            />

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
              icon={<Mail className="w-5 h-5" />}
            />

            <AuthInput
              label="Password"
              type="password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                clearFieldError('password');
              }}
              error={fieldErrors.password}
              autoComplete="new-password"
              icon={<Lock className="w-5 h-5" />}
            />

            <AuthInput
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(v) => {
                setConfirmPassword(v);
                clearFieldError('confirmPassword');
              }}
              error={fieldErrors.confirmPassword}
              autoComplete="new-password"
              icon={<Lock className="w-5 h-5" />}
            />

            {/* Password Requirements */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Password Requirements
              </p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-green-500' : 'bg-slate-600'}`} />
                  At least 8 characters
                </li>
                <li className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? 'bg-green-500' : 'bg-slate-600'}`} />
                  One uppercase letter
                </li>
                <li className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(password) ? 'bg-green-500' : 'bg-slate-600'}`} />
                  One lowercase letter
                </li>
                <li className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? 'bg-green-500' : 'bg-slate-600'}`} />
                  One number
                </li>
              </ul>
            </div>

            <LoadingButton
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isLoading}
              loadingText="Creating Account..."
            >
              Create Account
            </LoadingButton>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-primary-400 hover:text-primary-300 transition-colors"
              >
                Sign in
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