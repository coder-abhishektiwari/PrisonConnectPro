import axios from 'axios';
import { env } from '@/config/env';
import type { ApiResponse, ApiError } from '@/types/api';
import type { CallSession, DeviceInfo, DeviceVerificationResult, SendOtpResult, OtpVerificationResult, JoinRoomResult, LeaveRoomResult, CallSummary } from '@/types/call';

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
    api.get<ApiResponse<{ ok: boolean; done?: boolean }>>(`/family/secure-call/heartbeat/${linkToken}`).then((r) => r.data.data),

  verifyDevice: (linkToken: string, payload: { fingerprint: string; signals: Record<string, unknown>; deviceInfo?: DeviceInfo }) =>
    api.post<ApiResponse<DeviceVerificationResult>>(`/family/secure-call/device/${linkToken}`, payload).then((r) => r.data.data),

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