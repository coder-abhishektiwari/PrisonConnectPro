import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/components/Toast';
import { useHeartbeat } from '@/hooks/useHeartbeat';

export function OtpVerificationPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const navigate = useNavigate();
  useHeartbeat(linkToken);
  const { addToast } = useToast();
  const { session, setOtpResult } = useSession();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [waitingForSms, setWaitingForSms] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  // Last 6-digit code we already POSTed. The auto-submit effect re-runs every
  // time `loading` flips, so without this a failed verification immediately
  // re-submits the same code — an infinite loop hammering /verify-otp.
  const lastSubmittedCodeRef = useRef<string | null>(null);

  // Warm up camera/mic NOW so the call page doesn't pay the getUserMedia cost.
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch((err) => {
        console.warn('[OTP] Camera/mic warm-up failed — permissions may need to be granted:', err.name);
      });
  }, []);

  const listenForOtp = useCallback(() => {
    abortRef.current?.abort();
    if (!('credentials' in navigator)) return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const options = {
          otp: { transport: ['sms'] as const },
          signal: controller.signal,
        } as unknown as CredentialRequestOptions;
        const cred = await navigator.credentials.get(options);
        if (cred && (cred as any).code) {
          // Only hand the code to state — the auto-submit effect below is the
          // single place that POSTs. Calling handleSubmit from here would use
          // the first render's closure (stale `session`), and would race the
          // effect into a second submit.
          setOtp((cred as any).code);
        }
      } catch (err) {
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
    // A resend starts a fresh attempt: allow the same code to be POSTed again
    // (the backend may re-issue the identical OTP).
    lastSubmittedCodeRef.current = null;
    try {
      const result = await callApi.sendOtp(linkToken);
      setPhoneMasked(result.phoneMasked);
      listenForOtp();
      setWaitingForSms(false);
      // Dev/demo: auto-fill from backend log
      if (import.meta.env.DEV && session) {
        try {
          const dev = await callApi.getDevOtp(linkToken);
          if (dev?.otp) setOtp(dev.otp);
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
    if (code.length !== 6 || !linkToken || !session) return;

    submittingRef.current = true;
    lastSubmittedCodeRef.current = code;
    setLoading(true);
    setError(null);

    try {
      const result = await callApi.verifyOtp(linkToken, code);
      setOtpResult(result);
      addToast('OTP verified successfully.', 'success');
      if (session.deviceRegistered) {
        navigate(`/c/${linkToken}/call`);
      } else {
        navigate(`/c/${linkToken}/device`);
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

  const cooldownActive = resendCooldown > 0;
  useEffect(() => {
    if (!cooldownActive) return;
    // One interval for the whole countdown — the previous version re-ran on
    // every `resendCooldown` change and rebuilt the timer once per second.
    const timer = setInterval(() => setResendCooldown((c) => (c > 1 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldownActive]);

  useEffect(() => {
    dispatchOtp();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken]);

  // Auto-submit when 6 digits arrive via WebOTP (or the dev auto-fill).
  // `loading` flipping true->false re-runs this, so a code is only posted
  // once — a failed verify must not immediately retry the same code forever.
  useEffect(() => {
    if (otp.length !== 6) {
      lastSubmittedCodeRef.current = null;
      return;
    }
    if (loading || submittingRef.current) return;
    if (lastSubmittedCodeRef.current === otp) return;
    void handleSubmit(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, loading, session]);

  const otpDigits = otp.split('');
  while (otpDigits.length < 6) otpDigits.push('');

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
            <p className="text-neutral-600">
              {phoneMasked
                ? <>Sending OTP to <span className="font-medium text-neutral-800">{phoneMasked}</span></>
                : 'Sending OTP...'
              }
            </p>
          </div>

          <div className="space-y-6">
            {/* Visual OTP display — auto-filled by WebOTP, no manual input */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2 text-center">One-Time Password</label>
              <div className="flex justify-center gap-3">
                {otpDigits.map((d, i) => (
                  <div
                    key={i}
                    className={`w-12 h-14 flex items-center justify-center text-2xl font-mono font-bold rounded-xl border-2 transition-all ${
                      d
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : waitingForSms
                          ? 'border-neutral-200 bg-neutral-50 text-neutral-300 animate-pulse'
                          : 'border-neutral-200 bg-white text-neutral-300'
                    }`}
                  >
                    {d || ''}
                  </div>
                ))}
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600 text-center">{error}</p>
              )}
            </div>

            {loading && (
              <p className="text-center text-primary-600 font-medium">Verifying...</p>
            )}

            {waitingForSms && !loading && (
              <div className="flex items-center justify-center gap-2 text-neutral-500">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Waiting for SMS auto-read...</span>
              </div>
            )}
          </div>

          <div className="mt-6 text-center space-y-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || !phoneMasked}
              className="text-primary-600 font-medium hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Didn't receive? Resend SMS"}
            </button>
            <p className="text-xs text-neutral-400">
              OTP will be read automatically from your SMS. Make sure you're using Chrome on Android.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
