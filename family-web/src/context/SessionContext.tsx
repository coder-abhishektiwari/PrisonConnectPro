import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CallSession, DeviceInfo, OtpVerificationResult } from '@/types/call';

interface SessionState {
  session: CallSession | null;
  deviceInfo: DeviceInfo | null;
  otpResult: OtpVerificationResult | null;
}

interface SessionContextValue extends SessionState {
  setSession: (session: CallSession) => void;
  setDeviceInfo: (info: DeviceInfo) => void;
  setOtpResult: (result: OtpVerificationResult) => void;
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    deviceInfo: null,
    otpResult: null,
  });

  const setSession = useCallback((session: CallSession) => {
    setState((s) => ({ ...s, session }));
  }, []);

  const setDeviceInfo = useCallback((deviceInfo: DeviceInfo) => {
    setState((s) => ({ ...s, deviceInfo }));
  }, []);

  const setOtpResult = useCallback((otpResult: OtpVerificationResult) => {
    setState((s) => ({ ...s, otpResult }));
  }, []);

  const clear = useCallback(() => {
    setState({ session: null, deviceInfo: null, otpResult: null });
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, setSession, setDeviceInfo, setOtpResult, clear }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}