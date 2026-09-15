import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ActiveCallsPage } from '@/pages/ActiveCallsPage';
import { MonitorScreenPage } from '@/pages/MonitorScreenPage';
import { CallHistoryPage } from '@/pages/CallHistoryPage';
import { InmateFamilyPage } from '@/pages/InmateFamilyPage';
import { TrustAccountPage } from '@/pages/TrustAccountPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { KioskRegistrationPage } from '@/pages/KioskRegistrationPage';
import { UsersPage } from '@/pages/UsersPage';
import { CallConfigurationPage } from '@/pages/CallConfigurationPage';
import { RequireAuth, RedirectIfAuthenticated } from '@/components/auth/RouteGuards';

export const RoutePaths = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/dashboard',
  activeCalls: '/calls',
  monitorScreen: '/monitoring/live/:callId',
  callHistory: '/calls/logs',
  inmateFamily: '/inmates-family',
  trustAccount: '/inmate-wallet',
  alerts: '/alerts',
  devices: '/devices',
  kioskRegistrations: '/kiosk-registrations',
  reports: '/reports',
  users: '/users',
  callConfiguration: '/call-configuration',
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
      { path: RoutePaths.monitorScreen, element: <MonitorScreenPage /> },
      { path: RoutePaths.callHistory, element: <CallHistoryPage /> },
      { path: RoutePaths.inmateFamily, element: <InmateFamilyPage /> },
      { path: RoutePaths.trustAccount, element: <TrustAccountPage /> },
      { path: RoutePaths.alerts, element: <AlertsPage /> },
      { path: RoutePaths.devices, element: <DevicesPage /> },
      { path: RoutePaths.kioskRegistrations, element: <KioskRegistrationPage /> },
      { path: RoutePaths.reports, element: <ReportsPage /> },
      { path: RoutePaths.users, element: <UsersPage /> },
      { path: RoutePaths.callConfiguration, element: <CallConfigurationPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
