import { useEffect, useRef, useCallback } from 'react';
import { backendSocket } from '@/services/socket/socketClient';
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
    const socket = backendSocket;
    socket.connect();

    const handlers: Record<string, EventHandler> = {
      'call-created': (data) => {
        console.log('[Socket] Call created:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history');
        onActiveCallsUpdate?.();
      },
      'call-updated': (data) => {
        console.log('[Socket] Call updated:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history');
        onActiveCallsUpdate?.();
      },
      'call-ended': (data) => {
        console.log('[Socket] Call ended:', data);
        invalidateCache('calls:active', 'calls:all', 'calls:history', 'recordings', 'statistics');
        onActiveCallsUpdate?.();
      },
      'alert-generated': (data) => {
        console.log('[Socket] Alert generated:', data);
        onAlertGenerated?.(data);
      },
      'device-status-change': (data) => {
        console.log('[Socket] Device status changed:', data);
        onDeviceStatusChange?.(data);
      },
      'recording-started': (data) => {
        console.log('[Socket] Recording started:', data);
        invalidateCache('recordings');
        onRecordingUpdate?.(data);
      },
      'recording-finished': (data) => {
        console.log('[Socket] Recording finished:', data);
        invalidateCache('recordings');
        onRecordingUpdate?.(data);
      },
      'settings-updated': (data) => {
        console.log('[Socket] Settings updated:', data);
        invalidateCache('settings', 'wallets', 'wallets:all');
      },
      'pricing-updated': (data) => {
        console.log('[Socket] Pricing updated:', data);
        invalidateCache('pricing', 'wallets', 'wallets:all', 'statistics');
      },
      'incident-created': (data) => {
        console.log('[Socket] Incident created:', data);
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
    };
  }, [onActiveCallsUpdate, onAlertGenerated, onDeviceStatusChange, onRecordingUpdate]);

  const sendEvent = useCallback((event: string, data: any) => {
    backendSocket.emit(event, data);
  }, []);

  return { sendEvent };
}
