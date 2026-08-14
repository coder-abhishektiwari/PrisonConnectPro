import { useEffect, useRef, useCallback } from 'react';
import { socketClient } from '@/services/socket/socketClient';
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

    // Define event handlers - aligned with backend Mediasoup events
    const handlers: Record<string, EventHandler> = {
      // Mediasoup backend events
      'joined': (data) => {
        console.log('[WardenSocket] Room joined:', data);
      },
      'peer-joined': (data) => {
        console.log('[WardenSocket] Peer joined:', data);
      },
      'peer-left': (data) => {
        console.log('[WardenSocket] Peer left:', data);
        onActiveCallsUpdate?.();
      },
      'new-producer': (data) => {
        console.log('[WardenSocket] New producer:', data);
      },
      'call-ended': (data) => {
        console.log('[WardenSocket] Call ended:', data);
        onActiveCallsUpdate?.();
      },
      // Application-level events (emitted by mock backend)
      'call-created': (data) => {
        console.log('[WardenSocket] Call created:', data);
        onActiveCallsUpdate?.();
      },
      'call-updated': (data) => {
        console.log('[WardenSocket] Call updated:', data);
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
        onRecordingUpdate?.(data);
      },
      'recording-finished': (data) => {
        console.log('[WardenSocket] Recording finished:', data);
        onRecordingUpdate?.(data);
      },
      'settings-updated': (data) => {
        console.log('[WardenSocket] Settings updated:', data);
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