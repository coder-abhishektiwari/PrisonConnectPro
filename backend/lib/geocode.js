/**
 * Free reverse geocoding: lat/lng -> { area, city, state, country }.
 *
 * Uses the BigDataCloud "reverse geocode CLIENT" API - no API key, no signup,
 * no billing and no published hard quota, so it can run on every device
 * verification without a quota worry. Volume here is one request per family
 * call, and a small coordinate cache keeps even that off the wire.
 *
 * Everything is best-effort: any failure, timeout or a disabled provider
 * resolves to null, so geocoding can never delay or break a call. Failures are
 * only cached for a minute so a single cold-start hiccup does not poison a
 * whole instance.
 */

const ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS) || 5000;
const MAX_CACHE = 500;
const OK_TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;

/** ~11 m grid: two captures of the same house resolve to one request. */
const cache = new Map();

/** Last failure, surfaced by /health?geocode= for diagnosing the free API. */
let lastError = null;
function lastGeocodeError() { return lastError; }

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function remember(key, value, ttlMs) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function recall(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function normalize(data) {
  if (!data || typeof data !== 'object') return null;
  const area = data.locality || data.subLocality || data.neighbourhood || null;
  const city = data.city || data.district || null;
  const state = data.principalSubdivision || null;
  const country = data.countryName || null;
  if (!area && !city && !state) return null;
  return { area, city, state, country };
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{area: string|null, city: string|null, state: string|null, country: string|null}|null>}
 */
async function reverseGeocode(lat, lng) {
  if ((process.env.GEOCODE_PROVIDER || '').toLowerCase() === 'off') return null;

  const key = cacheKey(lat, lng);
  const cached = recall(key);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
    const place = normalize(await res.json());
    lastError = null;
    remember(key, place, OK_TTL_MS);
    return place;
  } catch (err) {
    lastError = { at: new Date().toISOString(), message: err.message, lat, lng };
    remember(key, null, FAIL_TTL_MS);
    console.warn(`[geocode] ${err.message} (lat=${lat} lng=${lng})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Diagnostics for `/health?geocode=lat,lng`: does this host actually reach
 * the free API, how long does it take, and what was the last failure?
 * Never throws.
 */
async function probeGeo(input, fresh) {
  try {
    if (fresh) cache.clear();
    const [lat, lng] = String(input).split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: 'expected ?geocode=lat,lng' };
    }
    const t0 = Date.now();
    const place = await reverseGeocode(lat, lng);
    return {
      ms: Date.now() - t0,
      place,
      fresh: !!fresh,
      provider: process.env.GEOCODE_PROVIDER || 'bigdatacloud',
      timeoutMs: TIMEOUT_MS,
      lastError,
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { reverseGeocode, lastGeocodeError, probeGeo };
