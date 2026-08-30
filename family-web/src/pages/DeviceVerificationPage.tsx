import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';
import { collectSignals, fingerprintHash } from '@/services/fingerprint';
import { useHeartbeat } from '@/hooks/useHeartbeat';

const STEPS = ['Checking your device…', 'Matching your secure profile…', 'Almost done…'];

export function DeviceVerificationPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const navigate = useNavigate();
  useHeartbeat(linkToken);
  const { session, setDeviceVerified } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);
  const attemptedRef = useRef(false);

  // Rotate a single short line while verifying — keeps the wait calm.
  useEffect(() => {
    if (!submitting) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1500);
    return () => clearInterval(t);
  }, [submitting]);

  useEffect(() => {
    if (!linkToken || !session || attemptedRef.current) return;
    handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken, session]);

  const handleVerify = async () => {
    if (attemptedRef.current && !error) return;
    attemptedRef.current = true;

    if (!linkToken || !session) {
      setError('Missing session or link token.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const signals = collectSignals();
      const hash = await fingerprintHash(signals);

      const result = await callApi.verifyDevice(linkToken, {
        fingerprint: hash,
        signals: signals as unknown as Record<string, unknown>,
        deviceInfo: {
          browser: /Chrome/.test(navigator.userAgent) ? 'Chrome' : /Firefox/.test(navigator.userAgent) ? 'Firefox' : 'Mobile Browser',
          os: /Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : 'Desktop',
          screen: `${window.screen.width}x${window.screen.height}`,
          language: navigator.language,
        },
      });

      if (result.verified) {
        setDeviceVerified(true);
        // Returning device -> OTP. First call to this number -> straight to
        // the call screen (the lobby was only ever a redirect hop).
        navigate(session.deviceRegistered ? `/c/${linkToken}/otp` : `/c/${linkToken}/call`, { replace: true });
      } else {
        setDeviceVerified(false);
        setError('We could not confirm this is your registered phone.');
      }
    } catch (err) {
      setDeviceVerified(false);
      setError(err instanceof Error ? err.message : 'Device verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-2xl shadow-xl p-10">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-primary-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-neutral-900 mb-1">Securing your connection</p>
            <p className="text-sm text-neutral-500">{STEPS[step]}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
      <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">Phone Not Recognised</h1>
        <p className="text-neutral-600 mb-8">
          This call can only be answered from the phone number it was sent to.
        </p>
        <Button variant="primary" size="lg" className="w-full" onClick={handleVerify}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
