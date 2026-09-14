import { useEffect, useRef, useCallback } from 'react';
import { socketClient } from '@/services/socket/socketClient';
import { invalidateCache } from '@/services/api/cache';
import type { Alert, Device, Recording } from '@/services/api/wardenApi';

type EventHandler = (data: any) => void;

export function useWardenSocket(
  onActiveCallsUpdate?: () => void,
  onAlertGenerated?: (alert: Alert) => void,
  onDeviceStatusChange?: (device: Device) => void,
  onRecordingUpdate?: (recording: Recording) => void
) {
  const handlersRef = useRef<Map<string, EventHandler>>(new Map());

  useEffect(() => {
    const socket = socketClient;

    // Connect to socket
    socket.connect();

    // Define event handlers - aligned with P2P signaling events
    const handlers: Record<string, EventHandler> = {
      // Signaling room events
      'joined': (data) => {
        console.log('[WardenSocket] Room joined:', data);
      },
      'peer-joined': (data) => {
        console.log('[WardenSocket] Peer joined:', data);
      },
      'peer-left': (data) => {
        console.log('[WardenSocket] Peer left:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history', 'recordings');
        onActiveCallsUpdate?.();
      },
      'call-ended': (data) => {
        console.log('[WardenSocket] Call ended:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history', 'recordings', 'statistics');
        onActiveCallsUpdate?.();
      },
      // Application-level events (emitted by mock backend)
      'call-created': (data) => {
        console.log('[WardenSocket] Call created:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history');
        onActiveCallsUpdate?.();
      },
      'call-updated': (data) => {
        console.log('[WardenSocket] Call updated:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history');
        onActiveCallsUpdate?.();
      },
      'alert-generated': (data) => {
        console.log('[WardenSocket] Alert generated:', data);
        onAlertGenerated?.(data);
      },
      'device-status-change': (data) => {
        console.log('[WardenSocket] Device status changed:', data);
        onDeviceStatusChange?.(data);
      },
      'recording-started': (data) => {
        console.log('[WardenSocket] Recording started:', data);
        invalidateCache('recordings');
        onRecordingUpdate?.(data);
      },
      'recording-finished': (data) => {
        console.log('[WardenSocket] Recording finished:', data);
        invalidateCache('recordings');
        onRecordingUpdate?.(data);
      },
      'settings-updated': (data) => {
        console.log('[WardenSocket] Settings updated:', data);
        invalidateCache('settings', 'wallets', 'wallets:all');
      },
      'pricing-updated': (data) => {
        console.log('[WardenSocket] Pricing updated:', data);
        invalidateCache('pricing', 'wallets', 'wallets:all', 'statistics');
      },
      'incident-created': (data) => {
        console.log('[WardenSocket] Incident created:', data);
      },
      'statistics-updated': (data) => {
        console.log('[WardenSocket] Statistics updated:', data);
      },
    };

    // Register handlers
    handlersRef.current = new Map();
    Object.entries(handlers).forEach(([event, handler]) => {
      handlersRef.current.set(event, handler);
      socket.on(event, handler as any);
    });

    // Cleanup
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler as any);
      });
      handlersRef.current.clear();
    };
  }, [onActiveCallsUpdate, onAlertGenerated, onDeviceStatusChange, onRecordingUpdate]);

  const sendEvent = useCallback((event: string, data: any) => {
    socketClient.send(event, data);
  }, []);

  return { sendEvent };
}