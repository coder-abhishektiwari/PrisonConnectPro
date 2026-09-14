import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateRegister } from '@/utils/validation';

/**
 * Registration Page for creating new admin accounts.
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
        <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Create Account</h2>
        <p className="text-neutral-500 mt-2">Register to access the monitoring dashboard</p>
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
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
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
            clearFieldError('password');
          }}
          error={fieldErrors.password}
          autoComplete="new-password"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
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
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        />

        {/* Password Requirements */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
            Password Requirements
          </p>
          <ul className="space-y-1.5 text-xs text-neutral-600">
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-success-500' : 'bg-neutral-300'}`} />
              At least 8 characters
            </li>
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? 'bg-success-500' : 'bg-neutral-300'}`} />
              One uppercase letter
            </li>
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(password) ? 'bg-success-500' : 'bg-neutral-300'}`} />
              One lowercase letter
            </li>
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? 'bg-success-500' : 'bg-neutral-300'}`} />
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
        <p className="text-sm text-neutral-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            Sign in
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