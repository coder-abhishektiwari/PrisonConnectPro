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
  /** True when this call's alt phone already has a registered device fingerprint. */
  deviceRegistered: boolean;
  /** Masked destination phone number (e.g. +91******3210) safe to show in the browser. */
  phoneMasked: string | null;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  screen: string;
  language: string;
}

export interface DeviceVerificationResult {
  verified: boolean;
  /** True when the fingerprint was newly registered (first call to this number). */
  isFirstTime: boolean;
  otpAllowed: boolean;
}

export interface SendOtpResult {
  sent: boolean;
  transport: string;
  expiresAt: string;
  phoneMasked: string;
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