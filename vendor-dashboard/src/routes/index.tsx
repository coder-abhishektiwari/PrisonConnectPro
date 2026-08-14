import { createBrowserRouter, Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { JailManagementPage } from '@/pages/JailManagementPage';
import { InfrastructurePage } from '@/pages/InfrastructurePage';
import { LiveMonitoringPage } from '@/pages/LiveMonitoringPage';
import { PricingPage } from '@/pages/PricingPage';
import { SubscriptionsPage } from '@/pages/SubscriptionsPage';
import { StoragePage } from '@/pages/StoragePage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { RequireAuth, RedirectIfAuthenticated } from '@/components/auth/RouteGuards';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RedirectIfAuthenticated>
        <LoginPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/register',
    element: (
      <RedirectIfAuthenticated>
        <RegisterPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <RedirectIfAuthenticated>
        <ForgotPasswordPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/reset-password',
    element: (
      <RedirectIfAuthenticated>
        <ResetPasswordPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'jails', element: <JailManagementPage /> },
      { path: 'infrastructure', element: <InfrastructurePage /> },
      { path: 'live-monitoring', element: <LiveMonitoringPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'subscriptions', element: <SubscriptionsPage /> },
      { path: 'storage', element: <StoragePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);