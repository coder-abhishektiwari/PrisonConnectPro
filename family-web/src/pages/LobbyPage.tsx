import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { callApi } from '@/services/api';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/components/Toast';

type LobbyStatus = 'waiting' | 'ready' | 'joining' | 'joined' | 'error';

export function LobbyPage() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const { addToast } = useToast();
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LobbyStatus>('waiting');
  const [statusMessage, setStatusMessage] = useState('Waiting for prisoner to connect...');

  useEffect(() => {
    if (!session) {
      setError('Missing session.');
      setLoading(false);
      return;
    }

    setLoading(false);

    // Simulate room status progression
    // In production, this would be driven by Socket.IO events:
    // - room-joined -> joined
    // - room-error -> error
    // - call-ended -> error
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setStatus('ready'), 2000));
    timers.push(setTimeout(() => setStatusMessage('Room is ready. You can join now.'), 2000));

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [session]);

  const handleJoin = async () => {
    if (!linkToken || !session) return;
    try {
      setStatus('joining');
      setStatusMessage('Joining room...');
      await callApi.joinRoom(session.roomId, 'family-1');
      // Navigate to call page
      window.location.href = `/call/${linkToken}/call`;
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to join call room.');
      addToast(err instanceof Error ? err.message : 'Failed to join call room.', 'error');
    }
  };

  if (loading) return <Loading message="Preparing your call..." />;

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-red-50 to-neutral-100">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Unable to Join</h1>
          <p className="text-neutral-600 mb-8">{error || 'Session not found.'}</p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isWaiting = status === 'waiting';
  const isReady = status === 'ready';
  const isJoining = status === 'joining';
  const isJoined = status === 'joined';
  const isError = status === 'error';

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-primary-50 to-neutral-100">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {isWaiting && <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />}
              {isReady && (
                <svg className="w-10 h-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isJoining && <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />}
              {isJoined && (
                <svg className="w-10 h-10 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isError && (
                <svg className="w-10 h-10 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>

            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              {isWaiting && 'Waiting for Prisoner'}
              {isReady && 'Ready to Join'}
              {isJoining && 'Joining Room'}
              {isJoined && 'Connected'}
              {isError && 'Connection Error'}
            </h1>

            <p className="text-neutral-600">{statusMessage}</p>
          </div>

          <div className="bg-neutral-50 rounded-lg p-6 mb-8 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-600">Prisoner</span>
              <span className="text-sm font-medium text-neutral-900">{session.inmateName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-600">Contact</span>
              <span className="text-sm font-medium text-neutral-900">{session.contactName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-600">Scheduled</span>
              <span className="text-sm font-medium text-neutral-900">{new Date(session.scheduledAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-600">Duration</span>
              <span className="text-sm font-medium text-neutral-900">{session.maxDurationMinutes} minutes</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-600">Room Status</span>
              <span className={`text-sm font-medium ${isJoined ? 'text-success' : isError ? 'text-error' : 'text-primary-600'}`}>
                {status.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {!isJoined && !isError && (
              <Button size="lg" className="w-full" onClick={handleJoin} disabled={isWaiting || isJoining}>
                {isWaiting ? 'Please Wait...' : isJoining ? 'Joining...' : 'Join Call'}
              </Button>
            )}

            {isError && (
              <Button variant="primary" size="lg" className="w-full" onClick={() => window.location.reload()}>
                Retry
              </Button>
            )}

            <Link to="/">
              <Button variant="secondary" size="lg" className="w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}