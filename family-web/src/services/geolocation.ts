/**
 * Browser geolocation for the family device step.
 *
 * captureLocation() NEVER rejects: permission denied, timeout, insecure
 * origin or a browser without geolocation all resolve to null. The result is
 * sent in its own request after device verification has already succeeded, so
 * location can never delay or fail the fingerprint check that decides whether
 * the call can start.
 */

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export function captureLocation(timeoutMs = 8000): Promise<CapturedLocation | null> {
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
      // 30s freshness keeps a repeat visit instant; the first prompt still
      // gets a real fix because nothing is cached yet.
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );

    // Some browsers leave both callbacks hanging - never hold the caller.
    setTimeout(() => done(null), timeoutMs + 2000);
  });
}
