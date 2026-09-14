import { useEffect, useRef, useCallback } from 'react';
import { backendSocket, signalingSocket } from '@/services/socket/socketClient';
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
    // ========== BACKEND SOCKET ==========
    // App-level events: call-created, call-ended, alerts, recordings, etc.
    backendSocket.connect();

    const backendHandlers: Record<string, EventHandler> = {
      'call-created': (data) => {
        console.log('[BackendSocket] Call created:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history');
        onActiveCallsUpdate?.();
      },
      'call-updated': (data) => {
        console.log('[BackendSocket] Call updated:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history');
        onActiveCallsUpdate?.();
      },
      'call-ended': (data) => {
        console.log('[BackendSocket] Call ended:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history', 'recordings', 'statistics');
        onActiveCallsUpdate?.();
      },
      'alert-generated': (data) => {
        console.log('[BackendSocket] Alert generated:', data);
        onAlertGenerated?.(data);
      },
      'device-status-change': (data) => {
        console.log('[BackendSocket] Device status changed:', data);
        onDeviceStatusChange?.(data);
      },
      'recording-started': (data) => {
        console.log('[BackendSocket] Recording started:', data);
        invalidateCache('recordings');
        onRecordingUpdate?.(data);
      },
      'recording-finished': (data) => {
        console.log('[BackendSocket] Recording finished:', data);
        invalidateCache('recordings');
        onRecordingUpdate?.(data);
      },
      'settings-updated': (data) => {
        console.log('[BackendSocket] Settings updated:', data);
        invalidateCache('settings', 'wallets', 'wallets:all');
      },
      'pricing-updated': (data) => {
        console.log('[BackendSocket] Pricing updated:', data);
        invalidateCache('pricing', 'wallets', 'wallets:all', 'statistics');
      },
      'incident-created': (data) => {
        console.log('[BackendSocket] Incident created:', data);
      },
      'statistics-updated': (data) => {
        console.log('[BackendSocket] Statistics updated:', data);
      },
    };

    // ========== SIGNALING SOCKET ==========
    // WebRTC-level events: peer-joined, peer-left, room events
    signalingSocket.connect();

    const signalingHandlers: Record<string, EventHandler> = {
      'joined': (data) => {
        console.log('[SignalingSocket] Room joined:', data);
      },
      'peer-joined': (data) => {
        console.log('[SignalingSocket] Peer joined:', data);
        invalidateCache('calls:active', 'calls:all');
        onActiveCallsUpdate?.();
      },
      'peer-left': (data) => {
        console.log('[SignalingSocket] Peer left:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history', 'recordings');
        onActiveCallsUpdate?.();
      },
      'call-ended': (data) => {
        console.log('[SignalingSocket] Call ended (WebRTC):', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history', 'recordings', 'statistics');
        onActiveCallsUpdate?.();
      },
    };

    // Register all handlers
    handlersRef.current = new Map();
    Object.entries(backendHandlers).forEach(([event, handler]) => {
      handlersRef.current.set(`backend:${event}`, handler);
      backendSocket.on(event, handler as any);
    });
    Object.entries(signalingHandlers).forEach(([event, handler]) => {
      handlersRef.current.set(`signaling:${event}`, handler);
      signalingSocket.on(event, handler as any);
    });

    // Cleanup
    return () => {
      Object.entries(backendHandlers).forEach(([event, handler]) => {
        backendSocket.off(event, handler as any);
      });
      Object.entries(signalingHandlers).forEach(([event, handler]) => {
        signalingSocket.off(event, handler as any);
      });
      handlersRef.current.clear();
    };
  }, [onActiveCallsUpdate, onAlertGenerated, onDeviceStatusChange, onRecordingUpdate]);

  const sendEvent = useCallback((event: string, data: any) => {
    backendSocket.emit(event, data);
  }, []);

  return { sendEvent };
}
