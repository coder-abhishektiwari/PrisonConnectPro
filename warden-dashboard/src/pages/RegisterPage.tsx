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
  const [prisonName, setPrisonName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    const { valid, errors } = validateRegister(name, email, password, confirmPassword);
    if (!prisonName.trim()) errors.prisonName = 'Prison name is required';
    setFieldErrors(errors);
    if (!valid || !prisonName.trim()) return;

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        prisonName: prisonName.trim(),
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
        <h2 className="text-[26px] font-semibold text-neutral-900 tracking-[-0.02em]">Create account</h2>
        <p className="text-[14px] text-neutral-500 mt-1">Register to access the monitoring dashboard</p>
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

      {/* Register Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          label="Prison / Jail Name"
          type="text"
          value={prisonName}
          onChange={(v) => {
            setPrisonName(v);
            clearFieldError('prisonName');
          }}
          error={fieldErrors.prisonName}
          placeholder="e.g. Central Prison Mumbai"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1" />
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
        <div className="bg-[#fbfbfd] border border-black/[0.06] rounded-2xl px-4 py-3">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-neutral-500">
            <li className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-success-500' : 'bg-neutral-300'}`} />
              8+ characters
            </li>
            <li className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? 'bg-success-500' : 'bg-neutral-300'}`} />
              Uppercase
            </li>
            <li className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(password) ? 'bg-success-500' : 'bg-neutral-300'}`} />
              Lowercase
            </li>
            <li className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? 'bg-success-500' : 'bg-neutral-300'}`} />
              One number
            </li>
          </ul>
        </div>

        <LoadingButton
          type="submit"
          size="lg"
          className="w-full h-12 rounded-full"
          isLoading={isLoading}
          loadingText="Creating Account..."
        >
          Create Account
        </LoadingButton>
      </form>

      {/* Login Link */}
      <div className="mt-5 text-center">
        <p className="text-[13px] text-neutral-500">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Sign in
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