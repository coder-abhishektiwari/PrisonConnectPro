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

/** Position captured at device verification time (sent as its own request). */
export interface FamilyLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  at?: string;
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

/**
 * Response of `/family/secure-call/heartbeat/:linkToken`.
 *
 * The family browser has no trustworthy clock of its own: the kiosk bills from
 * the backend's wall clock, so the countdown shown here is anchored to
 * `serverTime` and derived from the server's own `mediaConnectedAt`. Without
 * this the two sides visibly drift apart mid-call.
 */
export interface CallTimerStatus {
  ok: boolean;
  done?: boolean;
  /** Backend wall clock as an ISO string (the billing clock). */
  serverTime: string;
  status: string;
  startTime: string | null;
  /** Backend ms when media first connected — the billing anchor. */
  mediaConnectedAt: string | null;
  maxDurationMinutes: number;
  ratePerMinute: number;
  inmateName: string | null;
  contactName: string | null;
}