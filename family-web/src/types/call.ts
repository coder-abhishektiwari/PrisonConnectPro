/** Types for the Family Member Secure Calling Process. */

export type CallType = 'audio' | 'video';

export interface CallSession {
  callId: string;
  roomId: string;
  inmateName: string;
  contactName: string;
  callType: CallType;
  scheduledAt: string;
  maxDurationMinutes: number;
  ratePerMinute: number;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  screen: string;
  language: string;
}

export interface DeviceVerificationResult {
  verified: boolean;
}

export interface OtpVerificationResult {
  verified: boolean;
  sessionToken: string;
}

export interface JoinRoomResult {
  status: 'ready';
}

export interface LeaveRoomResult {
  status: 'left';
}

export interface CallSummary {
  callId: string;
  durationMinutes: number;
  charges: number;
}

export interface RoomStatus {
  status: 'idle' | 'waiting' | 'ready' | 'joining' | 'joined' | 'error';
  message?: string;
}