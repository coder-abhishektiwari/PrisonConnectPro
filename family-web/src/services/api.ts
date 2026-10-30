import axios from 'axios';
import { env } from '@/config/env';
import type { ApiResponse, ApiError } from '@/types/api';
import type { CallSession, CallTimerStatus, DeviceInfo, DeviceVerificationResult, FamilyLocation, SendOtpResult, OtpVerificationResult } from '@/types/call';
import type { WalletLinkInfo, WalletOrder, WalletVerifyResult, CallWalletInfo } from '@/types/wallet';

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

  verifyOtp: (linkToken: string, otp: string) =>
    api.post<ApiResponse<OtpVerificationResult>>(`/family/secure-call/verify-otp/${linkToken}`, { otp }).then((r) => r.data.data),
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

/**
 * Call-session wallet: same money path as walletApi but authenticated by the
 * OTP-verified call JWT (Bearer header) instead of a URL token. Used by the
 * post-call recharge popup so the family can top up without the SMS link.
 */
export const callWalletApi = {
  getInfo: (sessionToken: string) =>
    api
      .get<ApiResponse<CallWalletInfo>>('/family/call-wallet/info', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      .then((r) => r.data.data),

  createOrder: (sessionToken: string, amount: number) =>
    api
      .post<ApiResponse<WalletOrder>>('/family/call-wallet/order', { amount }, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      .then((r) => r.data.data),

  verify: (sessionToken: string, payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    api
      .post<ApiResponse<WalletVerifyResult>>('/family/call-wallet/verify', payload, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      .then((r) => r.data.data),
};