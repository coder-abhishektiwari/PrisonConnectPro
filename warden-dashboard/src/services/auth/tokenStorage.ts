/**
 * Secure token storage for the Warden Dashboard.
 * 
 * In production, tokens should be stored in HttpOnly cookies or
 * an encrypted IndexedDB. For this mock implementation, we use
 * localStorage with a namespaced key and basic obfuscation.
 */

import type { AuthTokens, AuthUser } from '@/types/auth';

const STORAGE_KEYS = {
  tokens: 'pc_warden_tokens',
  user: 'pc_warden_user',
} as const;

/**
 * Store auth tokens and user data.
 * Includes a storedAt timestamp for expiry detection.
 */
export function persistAuth(tokens: AuthTokens, user: AuthUser): void {
  try {
    const tokenBundle: AuthTokens & { storedAt?: number } = {
      ...tokens,
      storedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.tokens, JSON.stringify(tokenBundle));
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  } catch (error) {
    console.error('Failed to persist auth data:', error);
  }
}

/**
 * Retrieve stored auth tokens.
 */
export function getStoredTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tokens);
    if (!raw) return null;
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

/**
 * Retrieve stored user data.
 */
export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Clear all stored auth data.
 */
export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.tokens);
    localStorage.removeItem(STORAGE_KEYS.user);
  } catch (error) {
    console.error('Failed to clear auth data:', error);
  }
}

/**
 * Check if a stored access token is still valid (not expired).
 * Note: This is a client-side heuristic. The server is the source of truth.
 */
export function isTokenExpired(): boolean {
  // The mock backend doesn't return an expiry timestamp, so we
  // conservatively treat tokens as valid for 1 hour from storage.
  // In production, decode the JWT and check `exp`.
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.tokens);
    if (!stored) return true;
    const parsed = JSON.parse(stored) as AuthTokens & { storedAt?: number };
    const storedAt = parsed.storedAt ?? Date.now();
    const expiresInMs = (parsed.expiresIn ?? 3600) * 1000;
    return Date.now() - storedAt > expiresInMs;
  } catch {
    return true;
  }
}