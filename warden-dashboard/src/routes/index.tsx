import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { WelcomePage } from '@/pages/WelcomePage';
import { ThemeEditorPage } from '@/pages/ThemeEditorPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ActiveCallsPage } from '@/pages/ActiveCallsPage';
import { MonitorScreenPage } from '@/pages/MonitorScreenPage';
import { CallHistoryPage } from '@/pages/CallHistoryPage';
import { InmateFamilyPage } from '@/pages/InmateFamilyPage';
import { InmateDetailPage } from '@/pages/InmateDetailPage';
import { KioskRegistrationPage } from '@/pages/KioskRegistrationPage';
import { KiosksPage } from '@/pages/KiosksPage';
import { UsersPage } from '@/pages/UsersPage';
import { CallConfigurationPage } from '@/pages/CallConfigurationPage';
import { RequireAuth, RedirectIfAuthenticated } from '@/components/auth/RouteGuards';

export const RoutePaths = {
  login: '/login',
  register: '/register',
  activeCalls: '/calls',
  monitorScreen: '/monitoring/live/:callId',
  callHistory: '/calls/logs',
  inmateFamily: '/inmates-family',
  inmateNew: '/inmates-family/new',
  inmateDetail: '/inmates-family/:inmateId',
  kioskRegistrations: '/kiosk-registrations',
  kiosks: '/kiosks',
  users: '/users',
  callConfiguration: '/call-configuration',
} as const;

export const router = createBrowserRouter([
  {
    // Visual theme editor — no login required, changes the whole app live.
    path: '/theme-editor',
    element: <ThemeEditorPage />,
  },
  {
    // First open lands on the welcome screen (login / signup start here).
    path: '/',
    element: (
      <RedirectIfAuthenticated>
        <WelcomePage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/',
    element: (
      <RedirectIfAuthenticated>
        <AuthLayout />
      </RedirectIfAuthenticated>
    ),
    children: [
      { path: RoutePaths.login, element: <LoginPage /> },
      { path: RoutePaths.register, element: <RegisterPage /> },
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
      // NOTE: no index child here — an index at path '/' would outrank the
      // welcome branch above and bounce logged-out users to /login.
      { path: RoutePaths.activeCalls, element: <ActiveCallsPage /> },
      { path: RoutePaths.monitorScreen, element: <MonitorScreenPage /> },
      { path: RoutePaths.callHistory, element: <CallHistoryPage /> },
      { path: RoutePaths.inmateFamily, element: <InmateFamilyPage /> },
      { path: RoutePaths.inmateNew, element: <InmateDetailPage /> },
  { path: RoutePaths.inmateDetail, element: <InmateDetailPage /> },
  { path: RoutePaths.kioskRegistrations, element: <KioskRegistrationPage /> },
      { path: RoutePaths.kiosks, element: <KiosksPage /> },
      { path: RoutePaths.users, element: <UsersPage /> },
      { path: RoutePaths.callConfiguration, element: <CallConfigurationPage /> },
      { path: '*', element: <Navigate to="/calls" replace /> },
    ],
  },
]);
