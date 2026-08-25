import { useEffect } from 'react';
import { callApi } from '@/services/api';

/**
 * Pings the backend every 5s while the family member is on a verification
 * screen. The kiosk polls this timestamp — if it goes stale, the family
 * member closed the screen and the kiosk shows "Family member left".
 * Stops automatically when the component unmounts (tab closed).
 */
export function useHeartbeat(linkToken?: string) {
  useEffect(() => {
    if (!linkToken) return;
    const ping = () => {
      callApi.heartbeat(linkToken).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 5000);
    return () => clearInterval(t);
  }, [linkToken]);
}
