import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function Header() {
  const [notifications, _setNotifications] = useState<Array<{id: number, message: string, time: string, unread: boolean}>>([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Notifications would be fetched from backend in production
  // For now, showing empty state until backend integration
  const unreadCount = (notifications || []).filter(n => n.unread).length;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayName = user?.name ?? 'Super Admin';
  const displayEmail = user?.email ?? 'admin@prisonconnect.com';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="bg-white border-b border-neutral-200 h-16 flex items-center justify-between px-6">
      {/* Left side - Logo and Environment */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-neutral-900">Monitoring Dashboard</span>
        </div>
      </div>

      {/* Right side - Status, Notifications, User Menu */}
      <div className="flex items-center gap-6">
        {/* System Status */}
        <div className="hidden md:flex items-center gap-2">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          <span className="text-sm text-neutral-600">All Systems Operational</span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
            )}
          </button>
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-neutral-900">{displayName}</p>
            <p className="text-xs text-neutral-500">{displayEmail}</p>
          </div>
          <div className="w-9 h-9 bg-primary-600 rounded-full flex items-center justify-center text-white font-medium">
            {initials}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-2 text-neutral-500 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}