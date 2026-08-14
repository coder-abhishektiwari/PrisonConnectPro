/**
 * Authentication API service for the Warden Dashboard.
 */
import { apiClient } from '@/services/api/client';
import type {
  AuthUser,
  ChangePasswordRequest,
  ForgotPasswordResponse,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
} from '@/types/auth';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: number;
}

/**
 * Auth API methods.
 */
export const authApi = {
  /**
   * Login with email + password (warden authentication).
   */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await apiClient.post<ApiEnvelope<LoginResponse>>('/auth/warden/login', {
      email,
      password,
    });
    return response.data.data;
  },

  /**
   * Register a new warden account.
   */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post<ApiEnvelope<RegisterResponse>>('/auth/register', data);
    return response.data.data;
  },

  /**
   * Refresh the access token using a refresh token.
   */
  refresh: async (refreshToken: string): Promise<LoginResponse> => {
    const response = await apiClient.post<ApiEnvelope<LoginResponse>>('/auth/refresh', {
      refreshToken,
    });
    return response.data.data;
  },

  /**
   * Logout - revoke all tokens for the current user.
   */
  logout: async (accessToken: string): Promise<void> => {
    await apiClient.post<ApiEnvelope<{ message: string }>>(
      '/auth/logout',
      {},
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  },

  /**
   * Get the current authenticated user.
   */
  getMe: async (accessToken: string): Promise<AuthUser> => {
    const response = await apiClient.get<ApiEnvelope<AuthUser>>('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data.data;
  },

  /**
   * Request a password reset.
   */
  forgotPassword: async (email: string): Promise<ForgotPasswordResponse> => {
    const response = await apiClient.post<ApiEnvelope<ForgotPasswordResponse>>(
      '/auth/forgot-password',
      { email }
    );
    return response.data.data;
  },

  /**
   * Reset password using a reset token.
   */
  resetPassword: async (data: ResetPasswordRequest): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiEnvelope<{ message: string }>>(
      '/auth/reset-password',
      data
    );
    return response.data.data;
  },

  /**
   * Change password for the authenticated user.
   */
  changePassword: async (
    accessToken: string,
    data: ChangePasswordRequest
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiEnvelope<{ message: string }>>(
      '/auth/change-password',
      data,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return response.data.data;
  },
};

/**
 * Helper to extract a user-friendly error message from an API error.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as { message: string }).message;
  }
  if (error && typeof error === 'object' && 'error' in error) {
    const err = (error as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
