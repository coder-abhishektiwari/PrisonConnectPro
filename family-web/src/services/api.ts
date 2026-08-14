import axios from 'axios';
import { env } from '@/config/env';
import type { ApiResponse, ApiError } from '@/types/api';
import type { CallSession, DeviceVerificationResult, OtpVerificationResult, JoinRoomResult, LeaveRoomResult, CallSummary } from '@/types/call';

export const api = axios.create({
  baseURL: env.apiGatewayUrl,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError: ApiError = {
      message: error.response?.data?.message ?? error.message ?? 'Unexpected error',
      status: error.response?.status,
    };
    return Promise.reject(apiError);
  }
);

export const callApi = {
  getSession: (linkToken: string) =>
    api.get<ApiResponse<CallSession>>(`/calls/link/${linkToken}`).then((r) => r.data.data),

  verifyDevice: (linkToken: string, deviceInfo: { browser: string; os: string; screen: string; language: string }) =>
    api.post<ApiResponse<DeviceVerificationResult>>(`/calls/${linkToken}/device-verification`, deviceInfo).then((r) => r.data.data),

  verifyOtp: (linkToken: string, otp: string) =>
    api.post<ApiResponse<OtpVerificationResult>>(`/calls/${linkToken}/otp-verification`, { otp }).then((r) => r.data.data),

  joinRoom: (roomId: string, participantId: string) =>
    api.post<ApiResponse<JoinRoomResult>>('/rooms/join', { roomId, participantId }).then((r) => r.data.data),

  leaveRoom: (roomId: string, participantId: string) =>
    api.post<ApiResponse<LeaveRoomResult>>('/rooms/leave', { roomId, participantId }).then((r) => r.data.data),

  endCall: (callId: string) =>
    api.post<ApiResponse<CallSummary>>(`/calls/${callId}/end`).then((r) => r.data.data),
};