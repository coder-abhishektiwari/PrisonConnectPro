import { io, type Socket } from 'socket.io-client';
import { env } from '@/config/env';

/**
 * Socket.IO client connecting to backend only.
 * Backend broadcasts all app-level events (call-created, call-ended, alerts, etc.)
 */
export const backendSocket: Socket = io(env.apiGatewayUrl, {
  autoConnect: false,
  transports: ['websocket'],
});

/** Legacy alias */
export const socketClient = backendSocket;
