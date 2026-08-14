import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';
import type { CallSession } from '@/types/call';

export function LinkVerificationPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const { setSession } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSessionState] = useState<CallSession | null>(null);

  useEffect(() => {
    if (!linkToken) {
      setError('Missing link token.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    callApi
      .getSession(linkToken)
      .then((data) => {
        if (!cancelled) {
          setSessionState(data);
          setSession(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Invalid or expired link.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [linkToken, setSession]);

  if (loading) return <Loading message="Verifying your secure link..." />;

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Verification Failed</h1>
          <p className="text-neutral-600 mb-8">{error || 'Invalid or expired call link session.'}</p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Link Verified</h1>
          <div className="bg-neutral-50 rounded-lg p-4 mb-6 text-left space-y-2">
            <p className="text-sm text-neutral-600">
              Inmate: <span className="font-semibold text-neutral-900">{session.inmateName}</span>
            </p>
            <p className="text-sm text-neutral-600">
              Call Type: <span className="font-semibold text-neutral-900 capitalize">{session.callType}</span>
            </p>
            <p className="text-sm text-neutral-600">
              Max Duration: <span className="font-semibold text-neutral-900">{session.maxDurationMinutes} Minutes</span>
            </p>
          </div>
          <Link to={`/call/${linkToken}/device`}>
            <Button size="lg" className="w-full">
              Continue to Device Verification
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}