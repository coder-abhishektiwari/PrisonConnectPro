import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/ui/Sidebar';
import { Header } from '@/components/ui/Header';

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-neutral-50 group/sidebar-wrapper">
      {/* Sidebar — fixed, hover expands */}
      <Sidebar />

      {/* Main Content — margin shifts with sidebar */}
      <div className="ml-16 transition-[margin] duration-300 ease-in-out group-hover/sidebar-wrapper:ml-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
