import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AuthTokens,
  AuthUser,
  ChangePasswordRequest,
  LoginResponse,
  RegisterRequest,
  ResetPasswordRequest,
} from '@/types/auth';
import { authApi, getAuthErrorMessage } from '@/services/auth/authApi';
import {
  clearStoredAuth,
  getStoredTokens,
  getStoredUser,
  isTokenExpired,
  persistAuth,
} from '@/services/auth/tokenStorage';

/**
 * Auth Context Value
 */
interface AuthContextValue {
  /** The currently authenticated user, or null */
  user: AuthUser | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** True while initial session restore is in progress */
  isInitializing: boolean;
  /** True while any auth operation is in progress */
  isLoading: boolean;
  /** Last auth error message */
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string; resetToken?: string }>;
  resetPassword: (data: ResetPasswordRequest) => Promise<void>;
  changePassword: (data: ChangePasswordRequest) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Token refresh safety: only allow one refresh at a time
let refreshPromise: Promise<LoginResponse> | null = null;

/**
 * Attempt to refresh the access token.
 * Coordinates concurrent refresh calls so only one network request is made.
 */
async function refreshTokens(refreshToken: string): Promise<LoginResponse> {
  if (!refreshPromise) {
    refreshPromise = authApi.refresh(refreshToken).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * AuthProvider - Central auth state management.
 *
 * Handles:
 *  - Initial session restore (splash screen)
 *  - Login / Register / Logout
 *  - Background token refresh
 *  - Synchronous auth state for navigation guards
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for the refresh interval and token lock
  const refreshTimerRef = useRef<number | null>(null);
  const tokensRef = useRef<AuthTokens | null>(null);

  // Keep tokensRef in sync
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  /**
   * Apply a successful login/refresh response.
   */
  const applyAuth = useCallback((response: LoginResponse) => {
    const { accessToken, refreshToken, expiresIn, user: authUser } = response;

    // Store with a timestamp for client-side expiry detection
    const tokenBundle: AuthTokens & { storedAt?: number } = {
      accessToken,
      refreshToken,
      expiresIn,
      storedAt: Date.now(),
    };

    setTokens(tokenBundle);
    setUser(authUser);
    persistAuth(tokenBundle, authUser);
    setError(null);
  }, []);

  /**
   * Clear all auth state.
   */
  const clearAuth = useCallback(() => {
    setTokens(null);
    setUser(null);
    setError(null);
    clearStoredAuth();
  }, []);

  /**
   * Schedule background token refresh.
   * Refresh 10 seconds before expiry (or every 50 minutes for the mock 1hr tokens).
   */
  const scheduleTokenRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) {
      window.clearInterval(refreshTimerRef.current);
    }

    const refreshInterval = Math.max((expiresIn - 10) * 1000, 50 * 60 * 1000);

    refreshTimerRef.current = window.setInterval(async () => {
      const currentTokens = tokensRef.current;
      if (!currentTokens) return;

      try {
        const response = await refreshTokens(currentTokens.refreshToken);
        applyAuth(response);
        // Reschedule with the new expiry
        scheduleTokenRefresh(response.expiresIn);
      } catch {
        // Refresh failed - force logout
        clearAuth();
      }
    }, refreshInterval);
  }, [applyAuth, clearAuth]);

  /**
   * Initial session restore.
   * Runs once on app mount before rendering any routes.
   */
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedTokens = getStoredTokens();
      const storedUser = getStoredUser();

      if (!storedTokens || !storedUser) {
        if (!cancelled) {
          clearAuth();
          setIsInitializing(false);
        }
        return;
      }

      // If token looks expired, try to refresh it silently
      if (isTokenExpired()) {
        try {
          const response = await refreshTokens(storedTokens.refreshToken);
          if (!cancelled) {
            applyAuth(response);
            scheduleTokenRefresh(response.expiresIn);
          }
        } catch {
          if (!cancelled) {
            clearAuth();
          }
        } finally {
          if (!cancelled) setIsInitializing(false);
        }
        return;
      }

      // Token is valid - restore session immediately
      if (!cancelled) {
        setTokens(storedTokens);
        setUser(storedUser);
        scheduleTokenRefresh(storedTokens.expiresIn);
        setIsInitializing(false);
      }

      // Silently validate token with the server in the background
      try {
        const freshUser = await authApi.getMe(storedTokens.accessToken);
        if (!cancelled) {
          setUser(freshUser);
          persistAuth(storedTokens, freshUser);
        }
      } catch {
        // Token was invalidated server-side
        if (!cancelled) {
          clearAuth();
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
      }
    };
  }, [applyAuth, clearAuth, scheduleTokenRefresh]);

  /**
   * Login with email + password.
   */
  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authApi.login(email, password);
        applyAuth(response);
        scheduleTokenRefresh(response.expiresIn);
      } catch (err) {
        setError(getAuthErrorMessage(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [applyAuth, scheduleTokenRefresh]
  );

  /**
   * Register a new user.
   */
  const register = useCallback(
    async (data: RegisterRequest) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authApi.register(data);
        applyAuth(response);
        scheduleTokenRefresh(response.expiresIn);
      } catch (err) {
        setError(getAuthErrorMessage(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [applyAuth, scheduleTokenRefresh]
  );

  /**
   * Logout - clear local state and revoke tokens server-side.
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentTokens = tokensRef.current;
      if (currentTokens) {
        try {
          await authApi.logout(currentTokens.accessToken);
        } catch {
          // Ignore server errors on logout - always clear locally
        }
      }
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  }, [clearAuth]);

  /**
   * Forgot password.
   */
  const forgotPassword = useCallback(async (email: string) => {
    setIsLoading(true);
    setError(null);
    try {
      return await authApi.forgotPassword(email);
    } catch (err) {
      setError(getAuthErrorMessage(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Reset password.
   */
  const resetPassword = useCallback(
    async (data: ResetPasswordRequest) => {
      setIsLoading(true);
      setError(null);
      try {
        await authApi.resetPassword(data);
        clearAuth();
      } catch (err) {
        setError(getAuthErrorMessage(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearAuth]
  );

  /**
   * Change password.
   */
  const changePassword = useCallback(
    async (data: ChangePasswordRequest) => {
      setIsLoading(true);
      setError(null);
      try {
        const currentTokens = tokensRef.current;
        if (!currentTokens) throw new Error('Not authenticated');
        await authApi.changePassword(currentTokens.accessToken, data);
      } catch (err) {
        setError(getAuthErrorMessage(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user && !!tokens,
      isInitializing,
      isLoading,
      error,
      login,
      register,
      logout,
      forgotPassword,
      resetPassword,
      changePassword,
      clearError,
    }),
    [
      user,
      tokens,
      isInitializing,
      isLoading,
      error,
      login,
      register,
      logout,
      forgotPassword,
      resetPassword,
      changePassword,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access the Auth Context.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export { AuthContext };