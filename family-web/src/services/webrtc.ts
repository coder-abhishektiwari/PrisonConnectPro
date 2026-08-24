import { socketService } from './socket';
import { env } from '@/config/env';
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
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private eventListeners: Map<string, Set<WebRtcEventCallback>> = new Map();
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  private pendingCandidates: RTCIceCandidateInit[] = [];

  async initialize(_session: CallSession, customIceServers?: RTCIceServer[]): Promise<void> {
    if (customIceServers && customIceServers.length > 0) {
      this.iceServers = customIceServers;
    } else if (env.webrtcIceServers) {
      // Deployment-provided STUN/TURN config (build-time). TURN is strictly a
      // connectivity fallback — media is P2P, never relayed through a server.
      try {
        const parsed = JSON.parse(env.webrtcIceServers) as RTCIceServer[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.iceServers = parsed;
        }
      } catch (e) {
        console.warn('[WebRTC] Invalid VITE_WEBRTC_ICE_SERVERS, keeping defaults:', e);
      }
    }
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

  async setupLocalMedia(constraints: MediaStreamConstraints = {
    video: true,
    audio: true,
  }): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      const preferred = await this.selectPreferredDevices();
      if (preferred.video || preferred.audio) {
        try {
          const preferredStream = await navigator.mediaDevices.getUserMedia(preferred);
          this.localStream.getTracks().forEach((t) => t.stop());
          this.localStream = preferredStream;
        } catch (_) {}
      }

      this.emit('local-stream', this.localStream);
      return this.localStream;
    } catch (error) {
      console.error('[WebRTC] Failed to get local media:', error);
      throw error;
    }
  }

  async handleJoined(joinData: any): Promise<void> {
    try {
      if (joinData && joinData.iceServers && joinData.iceServers.length > 0) {
        this.iceServers = joinData.iceServers;
      }
      this.createPeerConnection();

      // Socket Signaling Event Listeners for P2P
      socketService.on('offer', async (_event: string, data: any) => {
        console.log('[WebRTC] Received SDP Offer from peer:', data.sender);
        await this.handleOffer(data.sdp);
      });

      socketService.on('answer', async (_event: string, data: any) => {
        console.log('[WebRTC] Received SDP Answer from peer:', data.sender);
        await this.handleAnswer(data.sdp);
      });

      socketService.on('ice-candidate', async (_event: string, data: any) => {
        if (data?.candidate) {
          await this.addIceCandidate(data.candidate);
        }
      });

      socketService.on('peer-joined', async (_event: string, data: any) => {
        console.log('[WebRTC] Peer joined room:', data?.peerId);
        // Glare-free rule: the party that joined an OCCUPIED room creates the
        // offer (see handleJoined). The party already waiting must NOT offer
        // here — it only answers.
      });

      // If existing peers are already in the room when we join, create SDP Offer
      if (joinData && Array.isArray(joinData.existingPeers) && joinData.existingPeers.length > 0) {
        console.log('[WebRTC] Existing peers present in room, creating offer...');
        await this.createAndSendOffer();
      }
    } catch (error) {
      console.error('[WebRTC] Failed to handle joined:', error);
      this.emit('connection-state', 'failed');
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;

    console.log('[WebRTC] Creating RTCPeerConnection with ICE servers:', this.iceServers);
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.localStream && this.pc) {
          this.pc.addTrack(track, this.localStream);
        }
      });
    }

    this.pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
      }
      this.emit('remote-stream', this.remoteStream);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] Generated local ICE candidate');
        socketService.sendIceCandidate(event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState as ConnectionState;
      console.log('[WebRTC] Connection state changed:', state);
      this.emit('connection-state', state || 'new');
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.pc?.iceConnectionState);
    };

    return this.pc;
  }

  async createAndSendOffer(): Promise<void> {
    try {
      const pc = this.createPeerConnection();
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      console.log('[WebRTC] Local SDP Offer created and set');
      socketService.sendOffer(offer);
    } catch (error) {
      console.error('[WebRTC] Failed to create offer:', error);
    }
  }

  private async handleOffer(offerSdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      const pc = this.createPeerConnection();
      await pc.setRemoteDescription(offerSdp);
      console.log('[WebRTC] Remote SDP Offer set successfully');

      // Flush any ICE candidates received before remote description was set
      for (const candidate of this.pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WebRTC] Local SDP Answer created and set');
      socketService.sendAnswer(answer);
    } catch (error) {
      console.error('[WebRTC] Failed to handle offer:', error);
    }
  }

  private async handleAnswer(answerSdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      if (!this.pc) return;
      await this.pc.setRemoteDescription(answerSdp);
      console.log('[WebRTC] Remote SDP Answer set successfully');

      for (const candidate of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates = [];
    } catch (error) {
      console.error('[WebRTC] Failed to handle answer:', error);
    }
  }

  async addIceCandidate(candidateInit: RTCIceCandidateInit): Promise<void> {
    try {
      if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
        console.log('[WebRTC] Added remote ICE candidate');
      } else {
        console.log('[WebRTC] Buffering remote ICE candidate until remote description is set');
        this.pendingCandidates.push(candidateInit);
      }
    } catch (error) {
      console.warn('[WebRTC] Error adding ICE candidate:', error);
    }
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
    return (this.pc?.connectionState as ConnectionState) || 'new';
  }

  close(): void {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    this.pendingCandidates = [];
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