import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CallSession, OtpVerificationResult } from '@/types/call';

interface SessionState {
  session: CallSession | null;
  /** True once this device has been registered/verified via fingerprint. */
  deviceVerified: boolean;
  otpResult: OtpVerificationResult | null;
}

interface SessionContextValue extends SessionState {
  setSession: (session: CallSession) => void;
  setDeviceVerified: (verified: boolean) => void;
  setOtpResult: (result: OtpVerificationResult | null) => void;
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    deviceVerified: false,
    otpResult: null,
  });

  const setSession = useCallback((session: CallSession) => {
    setState((s) => ({ ...s, session }));
  }, []);

  const setDeviceVerified = useCallback((deviceVerified: boolean) => {
    setState((s) => ({ ...s, deviceVerified }));
  }, []);

  const setOtpResult = useCallback((otpResult: OtpVerificationResult | null) => {
    setState((s) => ({ ...s, otpResult }));
  }, []);

  const clear = useCallback(() => {
    setState({ session: null, deviceVerified: false, otpResult: null });
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, setSession, setDeviceVerified, setOtpResult, clear }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}