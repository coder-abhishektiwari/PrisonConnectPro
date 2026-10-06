/**
 * Free reverse geocoding: lat/lng -> { area, city, state, country }.
 *
 * Uses the BigDataCloud "reverse geocode CLIENT" API - no API key, no signup,
 * no billing and no published hard quota, so it can run on every device
 * verification without a quota worry. Volume here is one request per family
 * call, and a small coordinate cache keeps even that off the wire.
 *
 * Everything is best-effort: any failure, timeout or a disabled provider
 * resolves to null, so geocoding can never delay or break a call.
 */

const ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS) || 3000;
const MAX_CACHE = 500;

/** ~11 m grid: two captures of the same house resolve to one request. */
const cache = new Map();

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function remember(key, value) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, value);
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
  if (cache.has(key)) return cache.get(key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
    const place = normalize(await res.json());
    remember(key, place);
    return place;
  } catch (err) {
    // Negative-cache too: a dead endpoint must not be retried on every call.
    remember(key, null);
    console.warn(`[geocode] ${err.message} (lat=${lat} lng=${lng})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { reverseGeocode };
