import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Mail, AlertCircle, KeyRound, CheckCircle2 } from 'lucide-react';
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
            <h2 className="text-xl font-bold text-white tracking-tight">Forgot Password?</h2>
            <p className="text-slate-400 mt-2 text-sm">
              Enter your email and we'll send you a reset link
            </p>
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
              <div className="space-y-1">
                <p>{successMessage}</p>
                {mockResetToken && (
                  <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-[11px] text-green-500 font-medium mb-1">
                      Mock Development Token:
                    </p>
                    <p className="font-mono text-xs break-all select-all">{mockResetToken}</p>
                  </div>
                )}
                <Link
                  to="/reset-password"
                  className="inline-block mt-2 text-sm font-semibold text-green-400 hover:text-green-300 transition-colors"
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
                icon={<Mail className="w-5 h-5" />}
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