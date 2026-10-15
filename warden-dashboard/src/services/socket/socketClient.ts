import { io, type Socket } from 'socket.io-client';
import { env } from '@/config/env';
import { getStoredTokens } from '@/services/auth/tokenStorage';

/**
 * Socket.IO client connecting to backend only.
 * Backend broadcasts all app-level events (call-created, call-ended, alerts, etc.)
 *
 * The backend rejects any handshake without a valid access token, so `auth`
 * is a callback rather than a value: it reads the current token at each
 * (re)connection, which keeps reconnects working after a silent refresh.
 */
export const backendSocket: Socket = io(env.apiGatewayUrl, {
  autoConnect: false,
  transports: ['websocket'],
  auth: (cb) => cb({ token: getStoredTokens()?.accessToken ?? null }),
});

/** Legacy alias */
export const socketClient = backendSocket;
