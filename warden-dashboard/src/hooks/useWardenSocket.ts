import { useEffect, useRef } from 'react';
import { backendSocket } from '@/services/socket/socketClient';
import { invalidatePrefix } from '@/services/api/cache';

type EventHandler = (data: any) => void;

export function useWardenSocket(onActiveCallsUpdate?: () => void) {
  const handlersRef = useRef<Map<string, EventHandler>>(new Map());

  useEffect(() => {
    const socket = backendSocket;
    socket.connect();

    const handlers: Record<string, EventHandler> = {
      'call-created': (data) => {
        console.log('[Socket] Call created:', data);
        invalidatePrefix('calls:active', 'calls:all', 'calls:history', 'statistics');
        onActiveCallsUpdate?.();
      },
      'call-updated': (data) => {
        console.log('[Socket] Call updated:', data);
        invalidatePrefix('calls:active', 'calls:all', 'calls:history');
        onActiveCallsUpdate?.();
      },
      'call-ended': (data) => {
        console.log('[Socket] Call ended:', data);
        invalidatePrefix('calls:active', 'calls:all', 'calls:history', 'statistics');
        onActiveCallsUpdate?.();
      },
      'settings-updated': (data) => {
        console.log('[Socket] Settings updated:', data);
        invalidatePrefix('settings', 'wallets', 'wallets:all');
      },
      'pricing-updated': (data) => {
        console.log('[Socket] Pricing updated:', data);
        invalidatePrefix('pricing', 'wallets', 'wallets:all', 'statistics');
      },
      'statistics-updated': (data) => {
        console.log('[Socket] Statistics updated:', data);
      },
    };

    handlersRef.current = new Map();
    Object.entries(handlers).forEach(([event, handler]) => {
      handlersRef.current.set(event, handler);
      socket.on(event, handler as any);
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler as any);
      });
      handlersRef.current.clear();
      // The backend broadcasts every event to every connected socket, so a
      // socket outliving its page (or the login that opened it) would keep
      // receiving live call/alert traffic after logout.
      socket.disconnect();
    };
  }, [onActiveCallsUpdate]);
}
