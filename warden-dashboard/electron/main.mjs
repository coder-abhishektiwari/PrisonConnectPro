/**
 * PrisonConnect Warden desktop shell (Electron).
 *
 * Security posture — this is a thin, hardened window around the built SPA:
 *  - Renderer is fully sandboxed: no Node, no preload bridge, no IPC surface.
 *  - UI is served from the local `app://` custom scheme (standard + secure),
 *    so the renderer never loads remote document content and localStorage
 *    lives on an isolated app origin.
 *  - Strict CSP ships inside dist/index.html (vite securityMetas plugin).
 *  - Every window.open / navigation / permission / webview attempt is denied
 *    by default; only an allowlist of our own https hosts may open externally.
 *  - DevTools, reload and refresh accelerators are disabled in production.
 */
import { app, BrowserWindow, Menu, protocol, session, shell, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const APP_ORIGIN = 'app://app';

const isDev = process.argv.includes('--dev');
const isSmoke = process.argv.includes('--smoke');
const DEV_URL = 'http://localhost:3001';

/**
 * Hosts the renderer may hand to the OS browser. Anything else — including
 * look-alike http/deep-link URLs — is dropped without being opened.
 */
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'prisonconnect-backend-q71g.onrender.com',
  'warden-dashboard.onrender.com',
  'calls.dsssolutions.in',
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

/** Join a URL path under DIST, refusing any `..` escape (path traversal). */
function safeDistPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const resolved = path.normalize(path.join(DIST, decoded));
  if (resolved !== DIST && !resolved.startsWith(DIST + path.sep)) return null;
  return resolved;
}

async function serveAppFile(request) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  let urlPath = new URL(request.url).pathname;
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  let file = safeDistPath(urlPath);
  if (!file) return new Response('Forbidden', { status: 403 });

  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    // SPA fallback for extension-less routes (react-router deep links).
    if (path.extname(urlPath)) return new Response('Not Found', { status: 404 });
    file = path.join(DIST, 'index.html');
  }

  const upstream = await net.fetch(pathToFileURL(file).toString());
  const headers = { ...Object.fromEntries(upstream.headers), 'X-Content-Type-Options': 'nosniff' };
  return new Response(upstream.body, { status: upstream.status, headers });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0B2240',
    autoHideMenuBar: true,
    title: 'PrisonConnect Warden',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false,
      devTools: isDev || isSmoke,
      navigateOnDragDrop: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isSmoke) {
    mainWindow.webContents.once('did-finish-load', () => {
      // Give React a moment to mount before checking.
      setTimeout(async () => {
        try {
          const state = await mainWindow.webContents.executeJavaScript(
            `({ mounted: !!document.getElementById('root')?.childElementCount, title: document.title, origin: location.origin })`
          );
          console.log('SMOKE_OK ' + JSON.stringify(state));
        } catch (err) {
          console.log('SMOKE_FAIL ' + err.message);
        }
        app.quit();
      }, 2000);
    });
  }

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadURL(APP_ORIGIN + '/');
  }
  return mainWindow;
}

function hardenWebContents(contents) {
  // No popup windows, ever. Allowlisted https links open in the OS browser.
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
        shell.openExternal(url);
      }
    } catch {
      // Malformed URL — drop silently.
    }
    return { action: 'deny' };
  });

  // The app never leaves its own origin (react-router pushState is same-document
  // and unaffected). Block link-driven navigations and all redirects.
  contents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith(APP_ORIGIN + '/');
    if (!allowed) event.preventDefault();
  });
  contents.on('will-redirect', (event) => event.preventDefault());

  // Production: kill devtools / reload / refresh accelerators (no menu exists,
  // and devTools is already off — this also blocks before-input bindings).
  contents.on('before-input-event', (event, input) => {
    if (isDev || isSmoke) return;
    const mod = input.control || input.meta;
    const key = input.key.toLowerCase();
    const blocked =
      input.key === 'F12' ||
      input.key === 'F5' ||
      (mod && (key === 'r' || key === 'u' || key === 'p')) ||
      (mod && input.shiftKey && (key === 'i' || key === 'j' || key === 'c'));
    if (blocked) event.preventDefault();
  });

  // Unknown sub-window / iframe attach attempts are already impossible
  // (webviewTag off, window.open denied) — belt and braces below.
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

// Renderer sandbox must be locked before any window exists.
app.enableSandbox();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', serveAppFile);

    // Deny every powerful browser permission (camera/mic/geo/notifications…)
    // — the warden console needs none of them.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });

    app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
