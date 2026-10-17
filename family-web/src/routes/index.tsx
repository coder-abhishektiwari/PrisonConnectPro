import { createBrowserRouter, Navigate, useSearchParams } from 'react-router-dom';
import { CallLayout } from '@/layouts/CallLayout';
import { LinkVerificationPage } from '@/pages/LinkVerificationPage';
import { WalletLinkPage } from '@/pages/WalletLinkPage';
import { DeviceVerificationPage } from '@/pages/DeviceVerificationPage';
import { OtpVerificationPage } from '@/pages/OtpVerificationPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { CallPage } from '@/pages/CallPage';
import { RouteGuard } from '@/components/RouteGuard';
import { SessionProvider } from '@/context/SessionContext';

export const RoutePaths = {
  linkVerification: '/c/:linkToken',
  walletLink: '/w',
  deviceVerification: '/c/:linkToken/device',
  otpVerification: '/c/:linkToken/otp',
  lobby: '/c/:linkToken/lobby',
  call: '/c/:linkToken/call',
} as const;

function Home() {
  // The portal has no landing page: a direct visit without a call or wallet
  // link gets NO UI at all — bounce straight to a blank page.
  window.location.replace('about:blank');
  return null;
}

function QueryLinkRedirect() {
  const [searchParams] = useSearchParams();
  const firstKey = searchParams.keys().next().value;
  if (firstKey) return <Navigate to={`/c/${firstKey}`} replace />;
  window.location.replace('about:blank');
  return null;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <SessionProvider>
        <CallLayout />
      </SessionProvider>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'c', element: <QueryLinkRedirect /> },
      { path: RoutePaths.walletLink, element: <WalletLinkPage /> },
      { path: RoutePaths.linkVerification, element: <LinkVerificationPage /> },
      {
        path: RoutePaths.deviceVerification,
        element: (
          <RouteGuard require="device">
            <DeviceVerificationPage />
          </RouteGuard>
        ),
      },
      {
        path: RoutePaths.otpVerification,
        element: (
          <RouteGuard require="otp">
            <OtpVerificationPage />
          </RouteGuard>
        ),
      },
      {
        path: RoutePaths.lobby,
        element: (
          <RouteGuard require="call">
            <LobbyPage />
          </RouteGuard>
        ),
      },
      {
        path: RoutePaths.call,
        element: (
          <RouteGuard require="call">
            <CallPage />
          </RouteGuard>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);