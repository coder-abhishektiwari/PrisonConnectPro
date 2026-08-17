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

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode / blocked) — fall back to volatile id.
    return uuid();
  }
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
 * SHA-256 hash of the canonical signal string. Available in all modern
 * browsers (Web Crypto API) and on the secure context required by WebOTP.
 */
export async function fingerprintHash(signals?: FingerprintSignal): Promise<string> {
  const data = signals || collectSignals();
  const canonical = JSON.stringify(data);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}