import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  Activity, 
  MonitorPlay, 
  CircleDollarSign, 
  ShieldCheck, 
  HardDrive, 
  BarChart3, 
  Settings,
  LogOut,
  Shield
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jails', label: 'Jail Management', icon: Building2 },
  { to: '/infrastructure', label: 'Infrastructure', icon: Activity },
  { to: '/live-monitoring', label: 'Live Monitoring', icon: MonitorPlay },
  { to: '/pricing', label: 'Pricing', icon: CircleDollarSign },
  { to: '/subscriptions', label: 'Subscriptions', icon: ShieldCheck },
  { to: '/storage', label: 'Recording Storage', icon: HardDrive },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Global Settings', icon: Settings },
];

export function DashboardLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
    <div className="min-h-screen bg-slate-50 flex w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:flex flex-col">
        <div className="px-6 py-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary-400" />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">PrisonConnect</h1>
              <p className="text-[10px] uppercase tracking-widest text-primary-400 font-semibold">Vendor Super Admin</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 py-6 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-600 text-white border-r-4 border-primary-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white border-r-4 border-transparent'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 w-full text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Control Panel</h2>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900">{displayName}</span>
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                System Online
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-primary-700 font-bold">
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}