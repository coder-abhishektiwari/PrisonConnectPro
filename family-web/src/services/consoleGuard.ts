/**
 * Console / devtools lockdown for the family portal.
 *
 * Disables the context menu, every devtools / view-source / save shortcut and
 * the console API itself, and runs a `debugger;` watchdog: with devtools open
 * the tick parks until someone resumes it, so a slow tick means a devtools
 * session and the page bounces itself to a blank page.
 *
 * Browser menus (right-click toolbar, More tools → Developer tools) sit
 * outside the page and cannot be blocked by any web code — this shuts down
 * every in-page route into them.
 */

const WATCHDOG_INTERVAL_MS = 1500;
const WATCHDOG_PAUSE_THRESHOLD_MS = 100;

function goBlank(): void {
  try {
    window.location.replace('about:blank');
  } catch {
    /* ignore */
  }
}

export function installConsoleGuard(): void {
  if (typeof window === 'undefined') return;

  // No right-click menu anywhere on the portal.
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // No devtools / view-source / save shortcuts (Ctrl or Cmd on macOS).
  window.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const blocked =
        e.key === 'F12' ||
        (e.shiftKey && mod && ['i', 'j', 'c', 'k', 'm', 'p', 'y'].includes(key)) ||
        (mod && !e.shiftKey && ['u', 's'].includes(key));
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  // The console API becomes no-ops so nothing the app logs is ever readable.
  const noop = (): void => undefined;
  const methods = [
    'log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table',
    'group', 'groupCollapsed', 'groupEnd', 'clear', 'assert', 'count',
    'countReset', 'time', 'timeLog', 'timeEnd',
  ];
  for (const m of methods) {
    try {
      (console as unknown as Record<string, unknown>)[m] = noop;
    } catch {
      /* the browser can freeze console — nothing to do */
    }
  }

  // Watchdog: `debugger;` runs instantly with devtools closed, but parks
  // while the debugger has it open — leave when someone is inside.
  window.setInterval(() => {
    const started = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    if (performance.now() - started > WATCHDOG_PAUSE_THRESHOLD_MS) goBlank();
  }, WATCHDOG_INTERVAL_MS);
}
