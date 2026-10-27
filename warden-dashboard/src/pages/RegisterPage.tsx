import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateRegister } from '@/utils/validation';

/**
 * Registration Page for creating new admin accounts — two steps:
 * Step 1: account credentials (name, email, password).
 * Step 2: jail information (name, state, district, address).
 * Features client-side validation, password strength rules,
 * and loading state during API calls.
 */
export function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [prisonName, setPrisonName] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();

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

  // Step 1 -> Step 2: validate account credentials first.
  const handleContinue = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const { valid, errors } = validateRegister(name, email, password, confirmPassword);
    setFieldErrors(errors);
    if (!valid) return;

    goToStep(2);
  };

  // Step 2 submit: create the account with the jail information.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const { valid, errors } = validateRegister(name, email, password, confirmPassword);
    if (!prisonName.trim()) errors.prisonName = 'Prison name is required';
    setFieldErrors(errors);
    if (!valid || !prisonName.trim()) {
      if (!valid) setStep(1);
      return;
    }

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        prisonName: prisonName.trim(),
        state: state.trim(),
        district: district.trim(),
        address: address.trim(),
      });
      navigate('/dashboard', { replace: true });
    } catch {
      setFormError('Registration failed. Please check your details and try again.');
    }
  };

  return (
    <div className="bg-white rounded-card shadow-card border border-black/[0.07] p-7 sm:p-9">
      {/* Step Indicator */}
      <div className="mb-7 flex items-center justify-between">
        {step === 2 && (
          <button
            type="button"
            onClick={() => goToStep(1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition-colors hover:text-neutral-900 hover-border-neutral-500"
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
          {step === 1 ? 'Create account' : 'Jail details'}
        </h2>
        <p className="text-14 text-neutral-500 mt-1.5">
          {step === 1
            ? 'Register to access the monitoring dashboard'
            : 'Tell us about the facility you administer'}
        </p>
      </div>

      {/* Form Error Banner */}
      {formError && (
        <div
          className="mb-4 p-3 bg-error-50/70 border border-error-100 text-error-700 rounded-2xl text-13 flex items-start gap-2.5"
          role="alert"
        >
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      {step === 1 ? (
        /* Step 1 — Account credentials */
        <form onSubmit={handleContinue} className="space-y-4" noValidate>
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
          />

          {/* Password Requirements */}
          <div className="bg-canvas border border-black/[0.06] rounded-2xl px-4 py-3">
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-12 text-neutral-500">
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
            loadingText="Please wait..."
          >
            Continue
          </LoadingButton>
        </form>
      ) : (
        /* Step 2 — Jail information */
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <AuthInput
            label="Prison / Jail Name"
            type="text"
            value={prisonName}
            onChange={(v) => {
              setPrisonName(v);
              clearFieldError('prisonName');
            }}
            error={fieldErrors.prisonName}
            autoFocus
          />

          <AuthInput
            label="State"
            type="text"
            value={state}
            onChange={(v) => {
              setState(v);
              clearFieldError('state');
            }}
            error={fieldErrors.state}
          />

          <AuthInput
            label="District"
            type="text"
            value={district}
            onChange={(v) => {
              setDistrict(v);
              clearFieldError('district');
            }}
            error={fieldErrors.district}
          />

          <AuthInput
            label="Address"
            type="text"
            value={address}
            onChange={(v) => {
              setAddress(v);
              clearFieldError('address');
            }}
            error={fieldErrors.address}
          />

          <div className="flex gap-3 pt-1">
            <LoadingButton
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 h-12 rounded-full"
              onClick={() => goToStep(1)}
            >
              Back
            </LoadingButton>
            <LoadingButton
              type="submit"
              size="lg"
              className="flex-[2] h-12 rounded-full"
              isLoading={isLoading}
              loadingText="Creating Account..."
            >
              Create Account
            </LoadingButton>
          </div>
        </form>
      )}

      {/* Login Link */}
      <div className="mt-6 text-center">
        <p className="text-13 text-neutral-500">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
