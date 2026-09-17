import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { to: '/calls', label: 'Live Calls', icon: 'phone_in_talk' },
  { to: '/calls/logs', label: 'Call Logs', icon: 'history' },
  { to: '/inmate-wallet', label: 'Inmate Wallet', icon: 'account_balance_wallet' },
  { to: '/inmates-family', label: 'Prisoner & Family', icon: 'family_restroom' },
  { to: '/kiosk-registrations', label: 'Kiosk Registration', icon: 'security' },
  { to: '/kiosks', label: 'Kiosks', icon: 'devices_other' },
  { to: '/users', label: 'Users', icon: 'people' },
  { to: '/call-configuration', label: 'Call Configuration', icon: 'tune' },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.name || 'Warden';
  const displayEmail = user?.email || '';
  const initials = displayName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 z-50 bg-neutral-900 text-white transition-all duration-300 ease-in-out hover:w-64 group/sidebar overflow-hidden flex flex-col shadow-xl">
      {/* Logo */}
      <div className="px-2 py-5 border-b border-neutral-800 flex items-center gap-3 flex-shrink-0 h-[72px]">
        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 ml-2">
          <img src="/ic_icon.webp" alt="Warden Panel" className="w-8 h-8 object-contain" />
        </div>
        <div className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 overflow-hidden whitespace-nowrap">
          <h1 className="text-lg font-bold text-white">Warden Pannel</h1>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden hide-scrollbar">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                  }`
                }
                title={item.label}
              >
                <span className="material-icons text-lg flex-shrink-0 ml-0.5">{item.icon}</span>
                <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 whitespace-nowrap">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Admin Info + Logout */}
      <div className="border-t border-neutral-800 px-2 py-2 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
          <div className="w-7 h-7 bg-primary-600 rounded-full flex items-center justify-center text-white font-medium text-[11px] flex-shrink-0">
            {initials}
          </div>
          <div className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 overflow-hidden whitespace-nowrap min-w-0">
            <p className="text-[13px] font-medium text-white truncate">{displayName}</p>
            {displayEmail && <p className="text-[11px] text-neutral-400 truncate">{displayEmail}</p>}
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Sign out"
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-neutral-400 hover:bg-error-600 hover:text-white transition-colors"
        >
          <span className="material-icons text-lg flex-shrink-0 ml-0.5">logout</span>
          <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 whitespace-nowrap">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
