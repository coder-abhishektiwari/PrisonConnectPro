/**
 * Authentication API service for the Vendor Super Admin Console.
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
import type { ApiResponse } from '@/types/api';

/**
 * Auth API methods.
 */
export const authApi = {
  /**
   * Login with email + password.
   */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await apiClient.post<any, ApiResponse<LoginResponse>>('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  /**
   * Register a new admin user.
   */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post<any, ApiResponse<RegisterResponse>>('/auth/register', data);
    return response.data;
  },

  /**
   * Refresh the access token using a refresh token.
   */
  refresh: async (refreshToken: string): Promise<LoginResponse> => {
    const response = await apiClient.post<any, ApiResponse<LoginResponse>>('/auth/refresh', {
      refreshToken,
    });
    return response.data;
  },

  /**
   * Logout - revoke all tokens for the current user.
   */
  logout: async (accessToken: string): Promise<void> => {
    await apiClient.post<any, ApiResponse<{ message: string }>>(
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
    const response = await apiClient.get<any, ApiResponse<AuthUser>>('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  },

  /**
   * Request a password reset.
   */
  forgotPassword: async (email: string): Promise<ForgotPasswordResponse> => {
    const response = await apiClient.post<any, ApiResponse<ForgotPasswordResponse>>(
      '/auth/forgot-password',
      { email }
    );
    return response.data;
  },

  /**
   * Reset password using a reset token.
   */
  resetPassword: async (data: ResetPasswordRequest): Promise<{ message: string }> => {
    const response = await apiClient.post<any, ApiResponse<{ message: string }>>(
      '/auth/reset-password',
      data
    );
    return response.data;
  },

  /**
   * Change password for the authenticated user.
   */
  changePassword: async (
    accessToken: string,
    data: ChangePasswordRequest
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<any, ApiResponse<{ message: string }>>(
      '/auth/change-password',
      data,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return response.data;
  },
};

/**
 * Helper to extract a user-friendly error message from an API error.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error) {
    const err = (error as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as { message: string }).message;
  }
  return 'An unexpected error occurred. Please try again.';
}