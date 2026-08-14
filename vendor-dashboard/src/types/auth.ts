/**
 * Authentication types for the Vendor Super Admin Console.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  kioskId?: string | null;
  prisonId?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  employeeId?: string;
}

export interface RegisterResponse extends AuthTokens {
  user: AuthUser;
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string; // Mock only - remove in production
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';