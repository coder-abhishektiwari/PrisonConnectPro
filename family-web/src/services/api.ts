import axios from 'axios';
import { env } from '@/config/env';
import type { ApiResponse, ApiError } from '@/types/api';
import type { CallSession, CallTimerStatus, DeviceInfo, DeviceVerificationResult, FamilyLocation, SendOtpResult, OtpVerificationResult, JoinRoomResult, LeaveRoomResult, CallSummary } from '@/types/call';
import type { WalletLinkInfo, WalletOrder, WalletVerifyResult } from '@/types/wallet';

export const api = axios.create({
  baseURL: env.apiGatewayUrl,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError: ApiError = {
      message: error.response?.data?.error?.message ?? error.response?.data?.message ?? error.message ?? 'Unexpected error',
      status: error.response?.status,
    };
    return Promise.reject(apiError);
  }
);

export const callApi = {
  getSession: (linkToken: string) =>
    api.post<ApiResponse<CallSession>>(`/family/secure-call/link/${linkToken}`).then((r) => r.data.data),

  heartbeat: (linkToken: string) =>
    api.get<ApiResponse<CallTimerStatus>>(`/family/secure-call/heartbeat/${linkToken}`).then((r) => r.data.data),

  verifyDevice: (linkToken: string, payload: { fingerprint: string; signals: Record<string, unknown>; deviceInfo?: DeviceInfo }) =>
    api.post<ApiResponse<DeviceVerificationResult>>(`/family/secure-call/device/${linkToken}`, payload).then((r) => r.data.data),

  // Fire-and-forget: sent only after verifyDevice succeeded, and never awaited
  // by the caller, so a slow or refused location cannot hold up the call.
  sendLocation: (linkToken: string, location: { lat: number; lng: number; accuracy?: number | null }) =>
    api.post<ApiResponse<FamilyLocation>>(`/family/secure-call/location/${linkToken}`, location).then((r) => r.data.data),

  sendOtp: (linkToken: string) =>
    api.post<ApiResponse<SendOtpResult>>(`/family/secure-call/send-otp/${linkToken}`).then((r) => r.data.data),

  getDevOtp: (linkToken: string) =>
    api.get<ApiResponse<{ otp: string; expiresAt?: string | null }>>(`/family/secure-call/info/${linkToken}`).then((r) => r.data.data),

  verifyOtp: (linkToken: string, otp: string) =>
    api.post<ApiResponse<OtpVerificationResult>>(`/family/secure-call/verify-otp/${linkToken}`, { otp }).then((r) => r.data.data),

  joinRoom: (roomId: string, participantId: string) =>
    api.post<ApiResponse<JoinRoomResult>>('/rooms/join', { roomId, participantId }).then((r) => r.data.data),

  leaveRoom: (roomId: string, participantId: string) =>
    api.post<ApiResponse<LeaveRoomResult>>('/rooms/leave', { roomId, participantId }).then((r) => r.data.data),

  endCall: (callId: string) =>
    api.post<ApiResponse<CallSummary>>(`/calls/${callId}/end`).then((r) => r.data.data),
};

/**
 * Family wallet: three bearer-token calls, no login/OTP. The token lives only
 * in the URL the family opened (stripped from the address bar on load).
 */
export const walletApi = {
  getInfo: (token: string) =>
    api.get<ApiResponse<WalletLinkInfo>>(`/family/wallet-link/${encodeURIComponent(token)}/info`).then((r) => r.data.data),

  createOrder: (token: string, amount: number) =>
    api.post<ApiResponse<WalletOrder>>(`/family/wallet-link/${encodeURIComponent(token)}/order`, { amount }).then((r) => r.data.data),

  verify: (token: string, payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    api.post<ApiResponse<WalletVerifyResult>>(`/family/wallet-link/${encodeURIComponent(token)}/verify`, payload).then((r) => r.data.data),
};