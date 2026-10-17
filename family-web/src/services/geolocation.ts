/**
 * Browser geolocation for the family device step.
 *
 * captureLocation() NEVER rejects: permission denied, timeout, insecure
 * origin or a browser without geolocation all resolve to null. It tries a
 * GPS-first fix, then falls back to a network (Wi-Fi/cell) fix — indoors the
 * high-accuracy request routinely blows the timeout, and a coarse location
 * is still far better than none for the prison's records.
 *
 * ensureLocationSent() is the shared "capture once, send per link" helper:
 * the device page starts the capture so the permission prompt appears while
 * the fingerprint is computed, and sends it after verification succeeds; the
 * call page retries the send when the first attempt never happened (prompt
 * denied once, flaky network, timeout).
 */

import { callApi } from './api';

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export function captureLocation(timeoutMs = 8000): Promise<CapturedLocation | null> {
  return requestPosition({ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }).then(
    (high) => high ?? requestPosition({ enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 30000 })
  );
}

function requestPosition(options: PositionOptions): Promise<CapturedLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    let settled = false;
    const done = (value: CapturedLocation | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        done({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
        }),
      () => done(null),
      options
    );

    // Some browsers leave both callbacks hanging - never hold the caller.
    setTimeout(() => done(null), (options.timeout ?? 8000) + 2000);
  });
}

// ---- shared capture-once / send-per-link state ----

let capturePromise: Promise<CapturedLocation | null> | null = null;
const sentLinks = new Set<string>();

/** Starts the capture (permission prompt) once per page load. */
export function startLocationCapture(): void {
  if (!capturePromise) capturePromise = captureLocation();
}

/**
 * Captures (or reuses) the device location and sends it for [linkToken].
 * Safe to call from multiple pages: a successful send per token is
 * remembered, failures are retried by the next caller. Resolves true when
 * the server has the location.
 */
export async function ensureLocationSent(linkToken: string): Promise<boolean> {
  if (sentLinks.has(linkToken)) return true;
  if (!capturePromise) capturePromise = captureLocation();
  const loc = await capturePromise;
  if (!loc) return false;
  try {
    await callApi.sendLocation(linkToken, loc);
    sentLinks.add(linkToken);
    return true;
  } catch {
    return false;
  }
}
