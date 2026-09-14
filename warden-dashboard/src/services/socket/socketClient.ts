import { io, type Socket } from 'socket.io-client';
import { env } from '@/config/env';

/**
 * Dual Socket.IO setup:
 * - backendSocket: connects to backend for app-level events (call-created, call-ended, alerts, etc.)
 * - signalingSocket: connects to signaling server for WebRTC events (peer-joined, peer-left, ice-state)
 */
export const backendSocket: Socket = io(env.apiGatewayUrl, {
  autoConnect: false,
  transports: ['websocket'],
});

export const signalingSocket: Socket = io(env.signalingUrl, {
  autoConnect: false,
  transports: ['websocket'],
});

/** Legacy alias — keeps old code working */
export const socketClient = backendSocket;
