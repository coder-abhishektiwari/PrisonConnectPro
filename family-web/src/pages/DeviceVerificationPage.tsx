import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';

export function DeviceVerificationPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const { session, setDeviceInfo } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfoState] = useState({ browser: '', os: '', screen: '', language: '' });

  useEffect(() => {
    const ua = navigator.userAgent;
    const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : 'Unknown';
    const os = ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Unknown';
    const info = { browser, os, screen: `${window.screen.width}x${window.screen.height}`, language: navigator.language };

    setDeviceInfoState(info);

    if (!linkToken || !session) {
      setError('Missing session or link token.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    callApi
      .verifyDevice(linkToken, info)
      .then(() => {
        if (!cancelled) {
          setDeviceInfo(info);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Device verification failed.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [linkToken, session, setDeviceInfo]);

  if (loading) return <Loading message="Verifying your device..." />;

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Device Blocked</h1>
          <p className="text-neutral-600 mb-8">{error || 'This device is not allowed to join this call.'}</p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => window.location.reload()}>
            Retry Verification
          </Button>
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
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Device Verification</h1>
            <p className="text-neutral-600">We've verified your device environment</p>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Browser</span>
              <span className="text-sm font-medium text-neutral-900">{deviceInfo.browser}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Operating System</span>
              <span className="text-sm font-medium text-neutral-900">{deviceInfo.os}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Screen Resolution</span>
              <span className="text-sm font-medium text-neutral-900">{deviceInfo.screen}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-neutral-50 rounded-lg">
              <span className="text-sm text-neutral-600">Security Status</span>
              <span className="text-sm font-medium text-success">Verified</span>
            </div>
          </div>

          <Link to={`/call/${linkToken}/otp`}>
            <Button size="lg" className="w-full">
              Continue to OTP Verification
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}