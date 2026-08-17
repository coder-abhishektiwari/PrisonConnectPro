import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [waitingForSms, setWaitingForSms] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);

  const listenForOtp = useCallback(() => {
    // Abort any previous listener so we don't double-dispatch.
    abortRef.current?.abort();
    if (!('credentials' in navigator)) return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
      // WebOTP API (`otp` transport) is not part of the default TS DOM lib.
      const options = {
        otp: { transport: ['sms'] as const },
        signal: controller.signal,
      } as unknown as CredentialRequestOptions;
      const cred = await navigator.credentials.get(options);
      if (cred && (cred as any).code) {
        const code = (cred as any).code;
        setOtp(code);
        handleSubmit(code);
      }
      } catch (err) {
        // Aborted by a resend — a fresh listener is armed by the caller.
        if ((err as any)?.name !== 'AbortError') {
          console.warn('[otp] WebOTP read interrupted:', err);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispatchOtp = useCallback(async () => {
    if (!linkToken) return;
    setWaitingForSms(true);
    setError(null);
    setOtp('');
    try {
      const result = await callApi.sendOtp(linkToken);
      setPhoneMasked(result.phoneMasked);
      // WebOTP delivers asynchronously from the SMS — re-arm the credential read.
      listenForOtp();
      setWaitingForSms(false);
      // Dev/demo stack (SMS_PROVIDER=log): the OTP is in backend/logs/sms.jsonl,
      // never reachable via WebOTP on a desktop browser, so pull it from the
      // dev-only backend endpoint and verify automatically.
      if (import.meta.env.DEV && session) {
        try {
          const dev = await callApi.getDevOtp(linkToken);
          if (dev?.otp) {
            setOtp(dev.otp);
            await handleSubmit(dev.otp);
          }
        } catch (err) {
          console.warn('[otp] dev auto-fill unavailable:', err);
        }
      }
    } catch (err) {
      setWaitingForSms(false);
      setError(err instanceof Error ? err.message : 'Failed to send OTP.');
      addToast(err instanceof Error ? err.message : 'Failed to send OTP.', 'error');
    }
  }, [linkToken, listenForOtp, addToast, session]);

  const handleSubmit = async (code: string) => {
    if (submittingRef.current) return;
    if (code.length !== 6 || !linkToken || !session) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await callApi.verifyOtp(linkToken, code);
      setOtpResult(result);
      addToast('OTP verified successfully.', 'success');
      // First-time call: collect + register the device fingerprint next.
      // Returning call: fingerprint already matched, go straight to the lobby.
      if (session.deviceRegistered) {
        navigate(`/call/${linkToken}/lobby`);
      } else {
        navigate(`/call/${linkToken}/device`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OTP verification failed.';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !linkToken) return;
    setResendCooldown(30);
    await dispatchOtp();
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    dispatchOtp();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken]);

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
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Auto OTP Verification</h1>
            <p className="text-neutral-600">
              Verifying the SIM in this phone against the number we sent the link to.
              {phoneMasked && (
                <span className="block font-medium text-neutral-800 mt-1">Target number: {phoneMasked}</span>
              )}
            </p>
          </div>

          {/* Auto-filled from the SMS when WebOTP is available; also editable by hand
              (e.g. log-based SMS where the code is communicated out-of-band). */}
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
              placeholder={waitingForSms ? 'Waiting for SMS…' : '000000'}
              error={error || undefined}
              disabled={!phoneMasked}
              className="text-center text-2xl tracking-widest font-mono"
            />

            <Button size="lg" className="w-full" type="submit" disabled={loading || !otp}>
              {loading ? 'Verifying...' : otp ? 'Verify OTP' : 'Waiting for OTP...'}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || !phoneMasked}
              className="text-primary-600 font-medium hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Didn't receive the code? Resend SMS"}
            </button>
            <p className="text-xs text-neutral-400">
              If the code is read automatically it fills in by itself — otherwise type the 6-digit code you received.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}