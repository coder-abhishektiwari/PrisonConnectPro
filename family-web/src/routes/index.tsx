import { createBrowserRouter, Navigate } from 'react-router-dom';
import { CallLayout } from '@/layouts/CallLayout';
import { LinkVerificationPage } from '@/pages/LinkVerificationPage';
import { DeviceVerificationPage } from '@/pages/DeviceVerificationPage';
import { OtpVerificationPage } from '@/pages/OtpVerificationPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { CallPage } from '@/pages/CallPage';
import { RouteGuard } from '@/components/RouteGuard';
import { SessionProvider } from '@/context/SessionContext';

export const RoutePaths = {
  linkVerification: '/call/:linkToken',
  deviceVerification: '/call/:linkToken/device',
  otpVerification: '/call/:linkToken/otp',
  lobby: '/call/:linkToken/lobby',
  call: '/call/:linkToken/call',
} as const;

function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-primary-50 to-neutral-100">
      <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">PrisonConnect</h1>
        <p className="text-neutral-600 mb-8">Family Calling Portal</p>
        <p className="text-sm text-neutral-500">Please use the secure link sent to your registered mobile number.</p>
      </div>
    </div>
  );
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