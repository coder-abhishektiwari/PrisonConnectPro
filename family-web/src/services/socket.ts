import { io, Socket } from 'socket.io-client';
import { env } from '@/config/env';
import type { CallSession } from '@/types/call';

type SocketEventCallback = (event: string, data: any) => void;

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private eventListeners: Map<string, Set<SocketEventCallback>> = new Map();
  private isConnecting = false;

  connect(session: CallSession, authToken?: string): void {
    if (this.socket?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = io(env.signalingUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: this.maxReconnectDelay,
        randomizationFactor: 0.5,
        timeout: 20000,
        auth: {
          // The verified family session token (JWT) issued by OTP verification.
          token: authToken ?? session.roomId,
        },
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connected:', this.socket?.id);
        this.reconnectAttempts = 0;
        this.emit('system', { type: 'connected' });
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        this.emit('system', { type: 'disconnected', reason });
      });

      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        this.reconnectAttempts++;
        this.emit('system', { type: 'connection_error', error: error.message });
      });

      // Mediasoup backend events (join result arrives via the join-room ACK)
      this.socket.on('peer-joined', (data) => this.emit('peer-joined', data));
      this.socket.on('peer-left', (data) => this.emit('peer-left', data));
      this.socket.on('new-producer', (data) => this.emit('new-producer', data));
      this.socket.on('call-ended', (data) => this.emit('call-ended', data));
      this.socket.on('room-updated', (data) => this.emit('room-updated', data));
      this.socket.on('recording-status', (data) => this.emit('recording-status', data));
      this.socket.on('call-status', (data) => this.emit('call-status', data));
    } catch (error) {
      console.error('[Socket] Failed to initialize:', error);
      this.isConnecting = false;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnecting = false;
      this.eventListeners.clear();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  on(event: string, callback: SocketEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: SocketEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach((callback) => callback(event, data));
  }

  send(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`[Socket] Attempted to send ${event} while disconnected`);
    }
  }

  sendWithAck(event: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error(`[Socket] Attempted to send ${event} while disconnected`));
        return;
      }
      this.socket.emit(event, data, (response: any) => {
        resolve(response);
      });
    });
  }

  // The signaling server returns the join result only via the ACK callback.
  joinRoom(roomId: string, peerId: string): Promise<any> {
    return this.sendWithAck('join-room', { roomId, peerId });
  }

  leaveRoom(roomId: string, peerId: string): void {
    this.send('leave-room', { roomId, peerId });
  }

  createWebRtcTransport(roomId: string, peerId: string, direction: 'send' | 'recv'): Promise<any> {
    return this.sendWithAck('createWebRtcTransport', { roomId, peerId, direction });
  }

  connectWebRtcTransport(peerId: string, direction: 'send' | 'recv', dtlsParameters: any): void {
    this.send('connectWebRtcTransport', { peerId, direction, dtlsParameters });
  }

  produce(peerId: string, kind: 'audio' | 'video', rtpParameters: any): Promise<any> {
    return this.sendWithAck('produce', { peerId, kind, rtpParameters, appData: {} });
  }

  consume(peerId: string, producerId: string, rtpCapabilities: any): Promise<any> {
    return this.sendWithAck('consume', { peerId, producerId, rtpCapabilities });
  }

  resumeConsumer(peerId: string, consumerId: string): void {
    this.send('resumeConsumer', { peerId, consumerId });
  }
}

export const socketService = new SocketService();