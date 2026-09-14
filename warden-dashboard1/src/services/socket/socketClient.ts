import { io, type Socket } from 'socket.io-client';
import { env } from '@/config/env';

/**
 * Socket.IO client for the Node.js signaling server.
 * Used for real-time monitoring of active calls, kiosk status, and threat alerts.
 */
export const socketClient: Socket = io(env.signalingUrl, {
  autoConnect: false,
  transports: ['websocket'],
});