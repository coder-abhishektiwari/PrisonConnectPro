import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SplashScreen } from './SplashScreen';

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Protects authenticated routes.
 * - Shows splash screen while restoring the session.
 * - Redirects to /login if not authenticated.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  // Show splash while checking auth state - NEVER render protected content
  if (isInitializing) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

interface RedirectIfAuthenticatedProps {
  children: ReactNode;
}

/**
 * Redirects authenticated users away from auth screens (login/register).
 * - Shows splash screen while restoring the session.
 * - Redirects to /dashboard if already authenticated.
 */
export function RedirectIfAuthenticated({ children }: RedirectIfAuthenticatedProps) {
  const { isAuthenticated, isInitializing } = useAuth();

  // Show splash while checking auth state - NEVER flash the login screen
  if (isInitializing) {
    return <SplashScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}