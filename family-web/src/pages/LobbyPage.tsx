import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/Button';
import { useSession } from '@/context/SessionContext';

const WAIT_LINES = [
  'Connecting you with your loved one…',
  'Ringing the kiosk…',
  'Getting the room ready…',
  'Almost there…',
];

export function LobbyPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Set when the inmate hung up: show the ended state, never re-dial.
  const callEnded = (location.state as { callEnded?: boolean } | null)?.callEnded === true;
  const { session } = useSession();
  const [error] = useState<string | null>(null);
  const [line, setLine] = useState(0);

  // Keep the wait feeling alive without burying them in text.
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % WAIT_LINES.length), 2500);
    return () => clearInterval(t);
  }, []);

  // Fully automatic: no Join button. Head straight into the call.
  useEffect(() => {
    if (callEnded) return; // the call is over — do NOT re-dial
    if (!linkToken || !session) return;
    const t = setTimeout(() => navigate(`/c/${linkToken}/call`, { replace: true }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken, session, callEnded]);

  // Arrived back here because the inmate ended the call: show "Call ended"
  // for 3 seconds, then blank the page entirely.
  useEffect(() => {
    if (!callEnded) return;
    const t = setTimeout(() => window.location.replace('about:blank'), 3000);
    return () => clearTimeout(t);
  }, [callEnded]);

  if (callEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-2xl shadow-xl p-10">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-neutral-900 mb-1">Call ended</p>
            <p className="text-sm text-neutral-500">Thanks for joining.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Session Expired</h1>
          <p className="text-neutral-600 mb-8">Please open the call link again.</p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-2xl shadow-xl p-10">
          <div className="relative w-24 h-24 mx-auto mb-8">
            {/* Pulsing rings — a calm "we're working on it" animation */}
            <span className="absolute inset-0 rounded-full bg-primary-200 animate-ping opacity-40" />
            <span className="absolute inset-2 rounded-full bg-primary-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </span>
          </div>

          <p className="text-lg font-semibold text-neutral-900 mb-2">
            {error ?? `Calling ${session.inmateName}`}
          </p>
          <p key={line} className="text-sm text-neutral-500 transition-opacity duration-500">{WAIT_LINES[line]}</p>

          {error && (
            <Button variant="primary" size="lg" className="w-full mt-8" onClick={() => window.location.reload()}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
