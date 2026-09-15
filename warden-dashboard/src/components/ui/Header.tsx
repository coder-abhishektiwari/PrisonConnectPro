import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePageHeaderConfig } from '@/context/PageHeaderContext';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { title, subtitle, action } = usePageHeaderConfig();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayName = user?.name || 'Warden';
  const initials = displayName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="bg-white border-b border-neutral-200 h-16 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutral-900 truncate">{title || 'Warden Panel'}</h2>
          {subtitle && <p className="text-xs text-neutral-500 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {action && <div className="flex items-center">{action}</div>}
        
      </div>
    </header>
  );
}
