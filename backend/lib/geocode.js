/**
 * Free reverse geocoding: lat/lng -> { area, city, state, country }.
 *
 * Primary: BigDataCloud "reverse geocode CLIENT" API - no key, no signup, no
 * billing, no published hard quota. Fallback: OpenStreetMap Nominatim (also
 * free; honoured at most one request per second, which this volume is far
 * below). GEOCODE_PROVIDER=bigdatacloud|nominatim|off pins the choice,
 * default is "try BigDataCloud, then Nominatim".
 *
 * Everything is best-effort: any failure, timeout or disabled provider
 * resolves to null, so geocoding can never delay or break a call. Failures
 * are cached for a minute only, so one cold-start hiccup cannot poison an
 * instance until its next restart.
 */

const TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS) || 5000;
const MAX_CACHE = 500;
const OK_TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;
const NOMINATIM_MIN_INTERVAL_MS = 1100;

const PROVIDER = (process.env.GEOCODE_PROVIDER || 'auto').toLowerCase();

/** ~11 m grid: two captures of the same house resolve to one request. */
const cache = new Map();

/** Last failure, surfaced by /health?geocode= for diagnosing the free APIs. */
let lastError = null;
function lastGeocodeError() { return lastError; }

// Nominatim asks for at most 1 request/second per application.
let lastNominatimAt = 0;

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

/** One HTTP GET with a hard deadline. Throws with the response body attached. */
async function getJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

function placeFrom({ area, city, state, country }) {
  if (!area && !city && !state) return null;
  return { area: area || null, city: city || null, state: state || null, country: country || null };
}

async function viaBigDataCloud(lat, lng) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
  const data = await getJson(url);
  return placeFrom({
    area: data.locality || data.subLocality || data.neighbourhood || null,
    city: data.city || data.district || null,
    state: data.principalSubdivision || null,
    country: data.countryName || null,
  });
}

async function viaNominatim(lat, lng) {
  const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    if (wait > TIMEOUT_MS) throw new Error('nominatim rate limit slot unavailable');
    await new Promise((r) => setTimeout(r, wait));
  }
  lastNominatimAt = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=12&accept-language=en`;
  const data = await getJson(url, { 'User-Agent': 'PrisonConnect/1.0 (secure call links)' });
  const a = data?.address || {};
  return placeFrom({
    area: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.village || a.hamlet || null,
    city: a.city || a.town || a.county || null,
    state: a.state || null,
    country: a.country || null,
  });
}

function providers() {
  if (PROVIDER === 'off') return [];
  if (PROVIDER === 'nominatim') return [['nominatim', viaNominatim]];
  if (PROVIDER === 'bigdatacloud') return [['bigdatacloud', viaBigDataCloud]];
  return [['bigdatacloud', viaBigDataCloud], ['nominatim', viaNominatim]];
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{area: string|null, city: string|null, state: string|null, country: string|null}|null>}
 */
async function reverseGeocode(lat, lng) {
  const chain = providers();
  if (!chain.length) return null;

  const key = cacheKey(lat, lng);
  const cached = recall(key);
  if (cached !== undefined) return cached;

  let place = null;
  const errors = [];
  for (const [name, fn] of chain) {
    try {
      const result = await fn(lat, lng);
      if (result) {
        place = result;
        lastError = null;
        break;
      }
      errors.push(`${name}: no match`);
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  if (!place) {
    lastError = { at: new Date().toISOString(), message: errors.join(' | '), lat, lng };
    remember(key, null, FAIL_TTL_MS);
    console.warn(`[geocode] failed (lat=${lat} lng=${lng}): ${errors.join(' | ')}`);
    return null;
  }

  remember(key, place, OK_TTL_MS);
  return place;
}

/**
 * Diagnostics for `/health?geocode=lat,lng` (&fresh=1 to skip the cache):
 * does this host reach the free API, how long did it take, what was the last
 * failure. Never throws.
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
      provider: PROVIDER,
      timeoutMs: TIMEOUT_MS,
      lastError,
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { reverseGeocode, lastGeocodeError, probeGeo };
