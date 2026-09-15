import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayName = user?.name || 'Warden';
  const displayEmail = user?.email || '';
  const initials = displayName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="bg-white border-b border-neutral-200 h-16 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold text-neutral-900">Warden Console</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-neutral-900">{displayName}</p>
            {displayEmail && <p className="text-xs text-neutral-500">{displayEmail}</p>}
          </div>
          <div className="w-9 h-9 bg-primary-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
            {initials}
          </div>
          <button onClick={handleLogout} title="Sign out" className="p-2 text-neutral-500 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
