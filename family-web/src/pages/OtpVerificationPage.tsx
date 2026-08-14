import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/components/Toast';

export function OtpVerificationPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { session, setOtpResult } = useSession();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!('credentials' in navigator)) return;

    let cancelled = false;
    (async () => {
      // @ts-ignore - WebOTP is not in default TS lib
      const cred = await navigator.credentials.get({ otp: { transport: ['sms'] } });
      if (!cancelled && cred && (cred as any).code) {
        const code = (cred as any).code;
        setOtp(code);
        handleSubmit(code);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (code: string) => {
    if (code.length !== 6 || !linkToken || !session) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await callApi.verifyOtp(linkToken, code);
      setOtpResult(result);
      addToast('OTP verified successfully.', 'success');
      navigate(`/call/${linkToken}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed.');
      addToast(err instanceof Error ? err.message : 'OTP verification failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !linkToken) return;
    setResendCooldown(30);
    addToast('OTP resent to your mobile number.', 'info');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">OTP Verification</h1>
            <p className="text-neutral-600">Enter the 6-digit code sent to your mobile</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(otp);
            }}
            className="space-y-6"
          >
            <Input
              label="One-Time Password"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={otp}
              onChange={setOtp}
              placeholder="000000"
              error={error || undefined}
            />

            <Button size="lg" className="w-full" type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-primary-600 font-medium hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Didn't receive the code? Resend"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}