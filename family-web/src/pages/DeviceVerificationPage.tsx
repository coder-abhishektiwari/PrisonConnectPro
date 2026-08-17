import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';
import { collectSignals, fingerprintHash } from '@/services/fingerprint';

export function DeviceVerificationPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const navigate = useNavigate();
  const { session, setDeviceVerified } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signalsUsed, setSignalsUsed] = useState<Record<string, unknown>>({});
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!linkToken || !session) {
      setError('Missing session or link token.');
      setLoading(false);
      return;
    }
    setLoading(false);
    // Dev/demo: auto-verify using the browser's own fingerprint so the flow
    // completes without clicks against the local stack.
    if (import.meta.env.DEV && !attemptedRef.current) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken, session]);

  const handleVerify = async () => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    if (!linkToken || !session) {
      setError('Missing session or link token.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const signals = collectSignals();
      setSignalsUsed(signals as unknown as Record<string, unknown>);
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
        const linkPath = `/call/${linkToken}/`;
        // Returning device: fingerprint matched -> proceed to OTP verification.
        // First call to this number: fingerprint just registered -> straight to lobby.
        if (session.deviceRegistered) {
          navigate(`${linkPath}otp`);
        } else {
          navigate(`${linkPath}lobby`);
        }
      } else {
        setDeviceVerified(false);
        setError('Device could not be verified.');
      }
    } catch (err) {
      setDeviceVerified(false);
      setError(err instanceof Error ? err.message : 'Device verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading message="Preparing device verification..." />;

  if (error && !submitting) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Device Verification Failed</h1>
          <p className="text-neutral-600 mb-8">
            {error} {session?.deviceRegistered ? 'This phone is not the one registered for this call link.' : ''}
          </p>
          <Button variant="primary" size="lg" className="w-full" onClick={handleVerify} disabled={submitting}>
            {submitting ? 'Verifying...' : 'Retry Verification'}
          </Button>
          <div className="mt-3">
            <Link to="/">
              <Button variant="secondary" size="lg" className="w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              {session?.deviceRegistered ? 'Device Verification' : 'Registering This Device'}
            </h1>
            <p className="text-neutral-600">
              {session?.deviceRegistered
                ? 'Confirming this phone is the device registered for this call link.'
                : 'This looks like the first call to this number — registering this device for faster verification next time.'}
            </p>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Browser</span>
              <span className="text-sm font-medium text-neutral-900">
                {signalsUsed.userAgent?.toString().includes('Chrome') ? 'Chrome' : signalsUsed.userAgent?.toString().includes('Firefox') ? 'Firefox' : 'Mobile Browser'}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Operating System</span>
              <span className="text-sm font-medium text-neutral-900">
                {signalsUsed.platform?.toString() || 'Detected'}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Device Type</span>
              <span className="text-sm font-medium text-neutral-900">
                {Number(signalsUsed.touchPoints ?? 0) > 0 ? 'Touchscreen' : 'Desktop'}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Security Status</span>
              <span className="text-sm font-medium text-primary-600">Fingerprint Ready</span>
            </div>
          </div>

          <Button size="lg" className="w-full" onClick={handleVerify} disabled={submitting}>
            {submitting ? 'Verifying...' : session?.deviceRegistered ? 'Verify Device' : 'Register Device'}
          </Button>
        </div>
      </div>
    </div>
  );
}