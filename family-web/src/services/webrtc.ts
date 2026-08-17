import { Device, types } from 'mediasoup-client';
import { socketService } from './socket';
import type { CallSession } from '@/types/call';

export type ConnectionState = 
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type MediaState = {
  videoEnabled: boolean;
  audioEnabled: boolean;
};

export type CallState = {
  connectionState: ConnectionState;
  mediaState: MediaState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isInitiator: boolean;
};

type WebRtcEventCallback = (event: string, data: unknown) => void;

class WebRtcService {
  private device: Device | null = null;
  private sendTransport: types.Transport | null = null;
  private recvTransport: types.Transport | null = null;
  private videoProducer: types.Producer | null = null;
  private audioProducer: types.Producer | null = null;
  private videoConsumer: types.Consumer | null = null;
  private audioConsumer: types.Consumer | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private eventListeners: Map<string, Set<WebRtcEventCallback>> = new Map();
  private peerId: string = '';
  private roomId: string = '';

  async initialize(session: CallSession, _iceServers: RTCIceServer[]): Promise<void> {
    this.roomId = session.roomId;
    this.peerId = `family-${Date.now()}`;
  }

  private isVirtualDevice(label: string): boolean {
    const lower = label.toLowerCase();
    return (
      lower.includes('phone link') ||
      lower.includes('link to windows') ||
      lower.includes('phone-link') ||
      lower.includes('virtual') ||
      lower.includes('cross-device') ||
      lower.includes('mobile camera') ||
      lower.includes('remote camera') ||
      lower.includes('ip webcam') ||
      lower.includes('droidcam') ||
      lower.includes('video camera')
    );
  }

  private async selectPreferredDevices(): Promise<MediaStreamConstraints> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const preferred: MediaStreamConstraints = {};

      const videoInput = devices.find(
        (d) => d.kind === 'videoinput' && !this.isVirtualDevice(d.label || '')
      );
      const audioInput = devices.find(
        (d) => d.kind === 'audioinput' && !this.isVirtualDevice(d.label || '')
      );

      if (videoInput && videoInput.deviceId) {
        preferred.video = {
          deviceId: { exact: videoInput.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };
      }
      if (audioInput && audioInput.deviceId) {
        preferred.audio = {
          deviceId: { exact: audioInput.deviceId },
          echoCancellation: true,
          noiseSuppression: true,
        };
      }
      return preferred;
    } catch (error) {
      console.warn('[WebRTC] Device enumeration failed, using defaults:', error);
      return {};
    }
  }

  private static toDeviceIdString(value: ConstrainDOMString | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value[0] ?? undefined;
    if (typeof value === 'object' && value.exact !== undefined) return Array.isArray(value.exact) ? value.exact[0] : value.exact;
    if (typeof value === 'object' && value.ideal !== undefined) return Array.isArray(value.ideal) ? value.ideal[0] : value.ideal;
    return undefined;
  }

  async setupLocalMedia(constraints: MediaStreamConstraints = {
    video: true,
    audio: true,
  }): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      const preferred = await this.selectPreferredDevices();
      const preferredVideo = preferred.video as MediaTrackConstraints | undefined;
      const preferredAudio = preferred.audio as MediaTrackConstraints | undefined;
      const preferredVideoId = WebRtcService.toDeviceIdString(preferredVideo?.deviceId);
      const preferredAudioId = WebRtcService.toDeviceIdString(preferredAudio?.deviceId);
      const currentVideoId = this.localStream.getVideoTracks()[0]?.getSettings().deviceId;
      const currentAudioId = this.localStream.getAudioTracks()[0]?.getSettings().deviceId;
      const videoChanged = !!preferredVideoId && currentVideoId !== preferredVideoId;
      const audioChanged = !!preferredAudioId && currentAudioId !== preferredAudioId;

      if (videoChanged || audioChanged) {
        const newStream = await navigator.mediaDevices.getUserMedia(preferred);
        this.localStream.getTracks().forEach((t) => t.stop());
        this.localStream = newStream;
        console.log(
          '[WebRTC] Switched to preferred devices:',
          preferredVideoId ? 'video: ' + preferredVideoId.split(':')[0] : 'same video',
          preferredAudioId ? 'audio: ' + preferredAudioId.split(':')[0] : 'same audio'
        );
      } else {
        console.log(
          '[WebRTC] Using default devices:',
          this.localStream.getVideoTracks()[0]?.getSettings().deviceId,
          this.localStream.getAudioTracks()[0]?.getSettings().deviceId
        );
      }

      this.emit('local-stream', this.localStream);
      return this.localStream;
    } catch (error) {
      console.error('[WebRTC] Failed to get local media:', error);
      throw error;
    }
  }

  async createPeerConnection(): Promise<void> {
    // No-op for Mediasoup - device is created after joining room
  }

  async handleJoined(routerRtpCapabilities: any): Promise<void> {
    try {
      // Create Mediasoup Device
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities });

      // Create Send Transport
      const sendTransportData = await socketService.createWebRtcTransport(this.roomId, this.peerId, 'send');
      if (sendTransportData.success) {
        this.sendTransport = this.device.createSendTransport({
          id: sendTransportData.data.id,
          iceParameters: sendTransportData.data.iceParameters,
          iceCandidates: sendTransportData.data.iceCandidates,
          dtlsParameters: sendTransportData.data.dtlsParameters,
        });

        this.sendTransport.on('connect', ({ dtlsParameters }, callback, _errback) => {
          socketService.connectWebRtcTransport(this.peerId, 'send', dtlsParameters);
          callback();
        });

        this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          try {
            const response = await socketService.produce(this.peerId, kind, rtpParameters);
            if (response.success) {
              callback({ id: response.id });
            } else {
              errback(new Error(response.message || 'Produce failed'));
            }
          } catch (error) {
            errback(error as Error);
          }
        });

        this.sendTransport.on('connectionstatechange', (state) => {
          console.log('[WebRTC] Send transport state:', state);
          this.handleTransportState(state);
        });
      }

      // Create Recv Transport
      const recvTransportData = await socketService.createWebRtcTransport(this.roomId, this.peerId, 'recv');
      if (recvTransportData.success) {
        this.recvTransport = this.device.createRecvTransport({
          id: recvTransportData.data.id,
          iceParameters: recvTransportData.data.iceParameters,
          iceCandidates: recvTransportData.data.iceCandidates,
          dtlsParameters: recvTransportData.data.dtlsParameters,
        });

        this.recvTransport.on('connect', ({ dtlsParameters }, callback, _errback) => {
          socketService.connectWebRtcTransport(this.peerId, 'recv', dtlsParameters);
          callback();
        });

        this.recvTransport.on('connectionstatechange', (state) => {
          console.log('[WebRTC] Recv transport state:', state);
        });
      }

      // Produce local tracks
      await this.produceLocalTracks();
    } catch (error) {
      console.error('[WebRTC] Failed to handle joined:', error);
      this.emit('connection-state', 'failed');
    }
  }

  private async produceLocalTracks(): Promise<void> {
    if (!this.localStream || !this.sendTransport) return;

    // Produce video
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      try {
        this.videoProducer = await this.sendTransport.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 1000000, maxFramerate: 30 }
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000
          }
        });
        console.log('[WebRTC] Video producer created:', this.videoProducer.id);
      } catch (error) {
        console.error('[WebRTC] Failed to produce video:', error);
      }
    }

    // Produce audio
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      try {
        this.audioProducer = await this.sendTransport.produce({
          track: audioTrack,
          encodings: [
            { maxBitrate: 128000 }
          ]
        });
        console.log('[WebRTC] Audio producer created:', this.audioProducer.id);
      } catch (error) {
        console.error('[WebRTC] Failed to produce audio:', error);
      }
    }
  }

  async consumeRemoteTrack(producerId: string): Promise<void> {
    if (!this.device || !this.recvTransport) return;

    try {
      const rtpCapabilities = this.device.rtpCapabilities;
      const response = await socketService.consume(this.peerId, producerId, rtpCapabilities);

      if (response.success) {
        const consumer = await this.recvTransport.consume({
          id: response.id,
          producerId: response.producerId,
          kind: response.kind,
          rtpParameters: response.rtpParameters,
        });

        if (response.kind === 'video') {
          this.videoConsumer = consumer;
          const track = consumer.track;
          if (track) {
            const stream = new MediaStream([track]);
            this.remoteStream = stream;
            this.emit('remote-stream', stream);
          }
        } else {
          this.audioConsumer = consumer;
        }

        // Resume consumer
        socketService.resumeConsumer(this.peerId, response.id);
      }
    } catch (error) {
      console.error('[WebRTC] Failed to consume remote track:', error);
    }
  }

  private handleTransportState(state: string): void {
    switch (state) {
      case 'connecting':
        this.emit('connection-state', 'connecting');
        break;
      case 'connected':
        this.emit('connection-state', 'connected');
        break;
      case 'disconnected':
        this.emit('connection-state', 'disconnected');
        break;
      case 'failed':
        this.emit('connection-state', 'failed');
        break;
      case 'closed':
        this.emit('connection-state', 'closed');
        break;
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    // No-op for Mediasoup - offer/answer handled by transport produce/consume
    return {} as RTCSessionDescriptionInit;
  }

  async createAnswer(_offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    // No-op for Mediasoup
    return {} as RTCSessionDescriptionInit;
  }

  async setRemoteDescription(_answer: RTCSessionDescriptionInit): Promise<void> {
    // No-op for Mediasoup
  }

  async addIceCandidate(_candidate: RTCIceCandidateInit): Promise<void> {
    // No-op for Mediasoup
  }

  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  getMediaState(): MediaState {
    const videoEnabled = this.localStream?.getVideoTracks().some((t) => t.enabled) ?? false;
    const audioEnabled = this.localStream?.getAudioTracks().some((t) => t.enabled) ?? false;
    return { videoEnabled, audioEnabled };
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getConnectionState(): ConnectionState {
    return this.sendTransport?.connectionState as ConnectionState || 'new';
  }

  close(): void {
    // Close producers
    this.videoProducer?.close();
    this.videoProducer = null;
    this.audioProducer?.close();
    this.audioProducer = null;

    // Close consumers
    this.videoConsumer?.close();
    this.videoConsumer = null;
    this.audioConsumer?.close();
    this.audioConsumer = null;

    // Close transports
    this.sendTransport?.close();
    this.sendTransport = null;
    this.recvTransport?.close();
    this.recvTransport = null;

    // Close device - note: mediasoup Device may not have close() in some versions
    if (this.device) {
      (this.device as any).close?.();
    }
    this.device = null;

    // Stop local media
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
  }

  on(event: string, callback: WebRtcEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: WebRtcEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach((callback) => callback(event, data));
  }
}

export const webRtcService = new WebRtcService();