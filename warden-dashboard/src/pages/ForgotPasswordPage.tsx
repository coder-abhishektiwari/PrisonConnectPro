import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateForgotPassword } from '@/utils/validation';

/**
 * Forgot Password Page.
 * Requests a password reset link for the given email.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mockResetToken, setMockResetToken] = useState<string | null>(null);
  const { forgotPassword, isLoading } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setMockResetToken(null);

    // Client-side validation
    const { valid, errors } = validateForgotPassword(email);
    setFieldErrors(errors);
    if (!valid) return;

    try {
      const response = await forgotPassword(email.trim());
      setSuccessMessage(response.message);
      // Mock: expose the reset token for development convenience
      if (response.resetToken) {
        setMockResetToken(response.resetToken);
      }
    } catch {
      setFormError('Failed to send reset link. Please try again.');
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
        <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Forgot Password?</h2>
        <p className="text-neutral-500 mt-2">
          Enter your email and we'll send you a reset link
        </p>
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

      {/* Success Message */}
      {successMessage && (
        <div
          className="mb-6 p-3.5 bg-success-50 border border-success-200 text-success-700 rounded-xl text-sm flex items-start gap-3"
          role="status"
        >
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="space-y-1">
            <p>{successMessage}</p>
            {import.meta.env.DEV && mockResetToken && (
              <div className="mt-2 p-2 bg-success-50 border border-success-200 rounded-lg">
                <p className="text-[11px] text-success-600 font-medium mb-1">
                  Mock Development Token:
                </p>
                <p className="font-mono text-xs break-all select-all">{mockResetToken}</p>
              </div>
            )}
            <Link
              to="/reset-password"
              className="inline-block mt-2 text-sm font-semibold text-success-700 hover:text-success-800 transition-colors"
            >
              Continue to reset password →
            </Link>
          </div>
        </div>
      )}

      {/* Forgot Password Form */}
      {!successMessage && (
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

          <LoadingButton
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isLoading}
            loadingText="Sending..."
          >
            Send Reset Link
          </LoadingButton>
        </form>
      )}

      {/* Back to Login */}
      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors inline-flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}