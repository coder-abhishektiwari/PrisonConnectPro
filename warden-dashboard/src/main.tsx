import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { AuthProvider } from '@/context/AuthContext';
import '@/assets/index.css';

const rootElement = document.getElementById('root');

interface ThemeEngine {
  applySaved?: (doc: Document) => boolean;
}

/**
 * Load the theme engine (public/theme-engine.js) and apply any saved theme
 * overrides BEFORE first paint so the app never flashes the default theme.
 * A missing/broken engine must never block the app — we just fall back to the
 * base theme in src/styles/theme.css.
 */
function loadThemeEngine(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as unknown as { PCTheme?: ThemeEngine }).PCTheme) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = '/theme-engine.js';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

async function mount() {
  await loadThemeEngine();
  try {
    (window as unknown as { PCTheme?: ThemeEngine }).PCTheme?.applySaved?.(document);
  } catch {
    // Theme restore failure must not stop the app.
  }

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </React.StrictMode>,
    );
  }
}

void mount();
