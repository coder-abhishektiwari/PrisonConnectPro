import { type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';

interface GuardProps {
  require?: 'session' | 'otp' | 'device' | 'call';
  children: ReactNode;
}

/**
 * Flow depends on whether the family number has a registered device:
 *   - First call (deviceRegistered === false): OTP (auto) -> register fingerprint -> lobby
 *   - Returning (deviceRegistered === true):  fingerprint verify -> OTP (auto) -> lobby
 */
function nextStepFor(require: NonNullable<GuardProps['require']> | undefined, deviceRegistered: boolean, hasOtp: boolean, hasDevice: boolean) {
  const path = (s: string) => s;
  if (require === 'otp') {
    // OTP is only reachable after the device check passes for returning members.
    if (deviceRegistered && !hasDevice) return path('/device');
    return null;
  }
  if (require === 'device') {
    // First-time callers must complete the (auto) OTP before registering the device.
    if (!deviceRegistered && !hasOtp) return path('/otp');
    return null;
  }
  if (require === 'call') {
    if (deviceRegistered && !hasDevice) return path('/device');
    if (!deviceRegistered && !hasOtp) return path('/otp');
    if (hasOtp && !hasDevice) return path('/device');
    if (!hasOtp) return path('/otp');
    return null;
  }
  return null;
}

export function RouteGuard({ require, children }: GuardProps) {
  const { linkToken } = useParams<{ linkToken: string }>();
  const { session, deviceVerified, otpResult } = useSession();

  if (require === 'session' && !session) return <Navigate to="/" replace />;
  if ((require === 'otp' || require === 'device') && !session) return <Navigate to="/" replace />;
  if (require === 'call' && !session) return <Navigate to="/" replace />;
  if (!session) return <>{children}</>;

  const next = nextStepFor(require, session.deviceRegistered, !!otpResult, deviceVerified);
  if (next) return <Navigate to={`/call/${linkToken}${next}`} replace />;

  return <>{children}</>;
}