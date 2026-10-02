/**
 * Client-side device fingerprinting.
 *
 * Produces a stable, anonymous fingerprint from a combination of browser
 * signals plus a persistent device id stored in localStorage. The fingerprint
 * is registered on the family member's FIRST call to a number and must match
 * on subsequent calls — this is what lets the portal detect "same phone, same
 * SIM" without the user manually proving anything.
 */

const DEVICE_ID_KEY = 'pc-family-device-id';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { /* blocked */ }
  try { return sessionStorage.getItem(key); } catch { /* blocked */ }
  const m = new RegExp('(?:^|;\\s*)' + key + '=([^;]*)').exec(document.cookie || '');
  return m ? decodeURIComponent(m[1]) : null;
}

function writeStore(key: string, value: string): void {
  try { localStorage.setItem(key, value); return; } catch { /* blocked */ }
  try { sessionStorage.setItem(key, value); return; } catch { /* blocked */ }
  try { document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=31536000;samesite=lax`; } catch { /* blocked */ }
}

/**
 * Device id that survives across page loads. Falls back through
 * localStorage -> sessionStorage -> cookie so a blocked storage API never
 * silently regenerates the id (which would make verification fail forever).
 */
function getOrCreateDeviceId(): string {
  const existing = readStore(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = uuid();
  writeStore(DEVICE_ID_KEY, id);
  // Re-read: if all writes failed, the id will not persist and the next load
  // gets a fresh one — nothing more we can do without server-side storage.
  return readStore(DEVICE_ID_KEY) || id;
}

export interface FingerprintSignal {
  userAgent: string;
  language: string;
  languages: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  screen: string;
  colorDepth: number;
  pixelRatio: number;
  timezone: string;
  touchPoints: number;
  online: boolean;
  cookiesEnabled: boolean;
  canvasHash: string | null;
  deviceId: string;
}

function canvasHash(): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 220, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('PrisonConnect\u{1F12F}', 2, 2);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function collectSignals(): FingerprintSignal {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const screenRes = `${window.screen.width}x${window.screen.height}`;
  return {
    userAgent: navigator.userAgent,
    language: navigator.language || '',
    languages: (navigator.languages || []).join(','),
    platform: (nav as { platform?: string }).platform || '',
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    screen: screenRes,
    colorDepth: window.screen.colorDepth || 0,
    pixelRatio: window.devicePixelRatio || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    touchPoints: navigator.maxTouchPoints || 0,
    online: navigator.onLine,
    cookiesEnabled: navigator.cookieEnabled,
    canvasHash: canvasHash(),
    deviceId: getOrCreateDeviceId(),
  };
}

/**
 * SHA-256 hash of the canonical signal string.
 *
 * ONLY stable signals are hashed. Volatile values (userAgent, language,
 * timezone, raw screen resolution) are deliberately excluded:
 *   - userAgent changes on every browser auto-update
 *   - timezone/language change when the user travels or changes settings
 *   - screen width/height swap on mobile rotation
 * Including any of them made the same phone fail verification for reasons
 * that have nothing to do with the device changing.
 *
 * MUST stay in sync with hashSignals() in backend/lib/familySecurity.js.
 */
export async function fingerprintHash(signals?: FingerprintSignal): Promise<string> {
  const data = signals || collectSignals();
  const stable = {
    deviceId: String(data.deviceId || ''),
    platform: String(data.platform || ''),
    hardwareConcurrency: Number(data.hardwareConcurrency) || 0,
    deviceMemory: typeof data.deviceMemory === 'number' ? data.deviceMemory : null,
    screen: normalizeScreen(data.screen),
    touchPoints: Number(data.touchPoints) || 0,
  };
  const canonical = JSON.stringify(stable);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Orientation-independent resolution: always "smaller x bigger". */
function normalizeScreen(screen: string): string {
  const m = /^(\d+)x(\d+)$/.exec(screen || '');
  if (!m) return screen || '';
  const a = Number(m[1]);
  const b = Number(m[2]);
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}