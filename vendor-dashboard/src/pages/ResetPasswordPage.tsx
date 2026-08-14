import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
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
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-primary-400" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Reset Password</h2>
            <p className="text-slate-400 mt-2 text-sm">Enter the reset token and your new password</p>
          </div>

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

          {/* Success Message */}
          {successMessage && (
            <div
              className="mb-6 p-3.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-sm flex items-start gap-3"
              role="status"
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Reset Password Form */}
          {!successMessage && (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                icon={<KeyRound className="w-5 h-5" />}
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
                icon={<Lock className="w-5 h-5" />}
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
                icon={<Lock className="w-5 h-5" />}
              />

              <LoadingButton
                type="submit"
                size="lg"
                className="w-full"
                isLoading={isLoading}
                loadingText="Resetting..."
              >
                Reset Password
              </LoadingButton>
            </form>
          )}

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1.5"
            >
              ← Back to Sign In
            </Link>
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