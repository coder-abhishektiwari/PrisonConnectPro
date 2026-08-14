import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ActiveCallsPage } from '@/pages/ActiveCallsPage';
import { LiveMonitoringPage } from '@/pages/LiveMonitoringPage';
import { MonitorScreenPage } from '@/pages/MonitorScreenPage';
import { InmateDetailsPage } from '@/pages/InmateDetailsPage';
import { CallHistoryPage } from '@/pages/CallHistoryPage';
import { RecordingCenterPage } from '@/pages/RecordingCenterPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { KioskRegistrationPage } from '@/pages/KioskRegistrationPage';
import { RequireAuth, RedirectIfAuthenticated } from '@/components/auth/RouteGuards';

/**
 * Route paths for the Jail Administration Monitoring Console.
 */
export const RoutePaths = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/dashboard',
  prisons: '/prisons',
  activeCalls: '/calls',
  liveMonitoring: '/monitoring/live',
  monitorScreen: '/monitoring/live/:callId',
  inmates: '/inmates/:inmateId',
  callHistory: '/inmates/:inmateId/calls',
  recordings: '/recordings',
  alerts: '/alerts',
  devices: '/devices',
  kioskRegistrations: '/kiosk-registrations',
  reports: '/reports',
  users: '/users',
  settings: '/settings',
  pricing: '/pricing',
  subscriptions: '/subscriptions',
} as const;

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RedirectIfAuthenticated>
        <AuthLayout />
      </RedirectIfAuthenticated>
    ),
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: RoutePaths.login, element: <LoginPage /> },
      { path: RoutePaths.register, element: <RegisterPage /> },
      { path: RoutePaths.forgotPassword, element: <ForgotPasswordPage /> },
      { path: RoutePaths.resetPassword, element: <ResetPasswordPage /> },
    ],
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: RoutePaths.dashboard, element: <DashboardPage /> },
      { path: RoutePaths.activeCalls, element: <ActiveCallsPage /> },
      { path: RoutePaths.liveMonitoring, element: <LiveMonitoringPage /> },
      { path: RoutePaths.monitorScreen, element: <MonitorScreenPage /> },
      { path: RoutePaths.inmates, element: <InmateDetailsPage /> },
      { path: RoutePaths.callHistory, element: <CallHistoryPage /> },
      { path: RoutePaths.recordings, element: <RecordingCenterPage /> },
      { path: RoutePaths.alerts, element: <AlertsPage /> },
      { path: RoutePaths.devices, element: <DevicesPage /> },
      { path: RoutePaths.kioskRegistrations, element: <KioskRegistrationPage /> },
      { path: RoutePaths.reports, element: <ReportsPage /> },
      { path: RoutePaths.users, element: <div className="p-6"><h1 className="text-2xl font-bold">Users - Coming Soon</h1></div> },
      { path: RoutePaths.pricing, element: <div className="p-6"><h1 className="text-2xl font-bold">Pricing - Coming Soon</h1></div> },
      { path: RoutePaths.subscriptions, element: <div className="p-6"><h1 className="text-2xl font-bold">Subscriptions - Coming Soon</h1></div> },
      { path: RoutePaths.prisons, element: <div className="p-6"><h1 className="text-2xl font-bold">Prisons - Coming Soon</h1></div> },
      { path: RoutePaths.settings, element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);