import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

  if (loading) return <Loading message="Checking your secure link..." />;

  if (error || !session) {
    // Any link that is invalid, used too early (scheduled call not started
    // yet), or already finished gets NO portal UI at all — the visitor is
    // sent to a blank page so there is nothing to poke at.
    window.location.replace('about:blank');
    return <Loading message="" />;
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
