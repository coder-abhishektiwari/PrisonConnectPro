import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/ui/Sidebar';
import { Header } from '@/components/ui/Header';

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Sidebar — fixed, hover expands */}
      <Sidebar />

      {/* Main Content — stays fixed, sidebar overlays on hover */}
      <div className="ml-16 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
