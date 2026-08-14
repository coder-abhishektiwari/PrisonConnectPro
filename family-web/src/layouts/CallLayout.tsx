import { Outlet } from 'react-router-dom';

/**
 * Layout for the secure call flow screens.
 */
export function CallLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Outlet />
    </div>
  );
}