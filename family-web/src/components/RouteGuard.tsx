import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';

interface GuardProps {
  require?: 'session' | 'device' | 'otp';
  children: ReactNode;
}

export function RouteGuard({ require, children }: GuardProps) {
  const { session, deviceInfo, otpResult } = useSession();

  if (require === 'session' && !session) return <Navigate to="/" replace />;
  if (require === 'device' && (!session || !deviceInfo)) return <Navigate to="/" replace />;
  if (require === 'otp' && (!session || !deviceInfo || !otpResult)) return <Navigate to="/" replace />;

  return <>{children}</>;
}