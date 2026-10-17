import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { ToastProvider } from '@/components/Toast';
import { installConsoleGuard } from '@/services/consoleGuard';
import '@/index.css';

// Lock the page down BEFORE any UI renders: no devtools shortcuts, no
// context menu, no readable console, watchdog bounces debugger sessions.
installConsoleGuard();

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}