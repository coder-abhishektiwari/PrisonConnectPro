import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import type { CallSession } from '@/types/call';

export function LinkVerificationPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const navigate = useNavigate();
  useHeartbeat(linkToken);
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

  // Fully automatic: verified link flows straight into the next step.
  useEffect(() => {
    if (!session || !linkToken) return;
    const next = session.deviceRegistered ? `/call/${linkToken}/device` : `/call/${linkToken}/otp`;
    const t = setTimeout(() => navigate(next, { replace: true }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (loading) return <Loading message="Checking your secure link..." />;

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Link Expired</h1>
          <p className="text-neutral-600 mb-8">{error || 'This call link is no longer valid.'}</p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-2xl shadow-xl p-10">
          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-neutral-900 mb-1">
            Hi {session.contactName.split(' ')[0]}, your call is ready
          </p>
          <p className="text-sm text-neutral-500 mb-8">Setting things up for you…</p>
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    </div>
  );
}
