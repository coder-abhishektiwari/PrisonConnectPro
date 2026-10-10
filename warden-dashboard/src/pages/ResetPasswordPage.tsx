import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthInput } from '@/components/auth/AuthInput';
import { LoadingButton } from '@/components/auth/LoadingButton';
import { validateResetPassword } from '@/utils/validation';

/**
 * Reset Password Page.
 * Allows the user to set a new password using a reset token.
 */
export function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { resetPassword, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    // Validate token
    if (!token.trim()) {
      setFieldErrors((p) => ({ ...p, token: 'Reset token is required' }));
      return;
    }

    // Client-side validation
    const { valid, errors } = validateResetPassword(newPassword, confirmPassword);
    setFieldErrors(errors);
    if (!valid) return;

    try {
      await resetPassword({
        token: token.trim(),
        newPassword,
      });
      setSuccessMessage('Password reset successfully. You can now sign in with your new password.');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch {
      setFormError('Failed to reset password. The token may be invalid or expired.');
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
        <div className="w-11 h-11 bg-neutral-100 rounded-xl flex items-center justify-center mb-3.5">
          <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-[26px] font-semibold text-neutral-900 tracking-[-0.02em]">Reset password</h2>
        <p className="text-[14px] text-neutral-500 mt-1">Enter the reset token and your new password</p>
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

      {/* Success Message */}
      {successMessage && (
        <div
          className="mb-4 p-3 bg-success-50/70 border border-success-100 text-success-700 rounded-2xl text-[13px] flex items-start gap-2.5"
          role="status"
        >
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Reset Password Form */}
      {!successMessage && (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <AuthInput
            label="Reset Token"
            type="text"
            value={token}
            onChange={(v) => {
              setToken(v);
              clearFieldError('token');
            }}
            error={fieldErrors.token}
            autoComplete="off"
            autoFocus
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            }
          />

          <AuthInput
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v);
              clearFieldError('newPassword');
            }}
            error={fieldErrors.newPassword}
            autoComplete="new-password"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
          />

          <AuthInput
            label="Confirm New Password"
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

          <LoadingButton
            type="submit"
            size="lg"
            className="w-full h-12 rounded-full"
            isLoading={isLoading}
            loadingText="Resetting..."
          >
            Reset Password
          </LoadingButton>
        </form>
      )}

      {/* Back to Login */}
      <div className="mt-5 text-center">
        <Link
          to="/login"
          className="text-[13px] font-medium text-neutral-500 hover:text-neutral-900 transition-colors inline-flex items-center gap-1.5"
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