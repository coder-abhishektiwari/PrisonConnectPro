const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { timingSafeEqual } = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly instead of silently signing tokens with a guessable default.
  throw new Error('JWT_SECRET env var is required — set it before starting the server.');
}

// Short-lived access tokens: a stolen JWT (localStorage/XSS) stays useful for
// minutes, not hours. Refresh tokens (7d) handle renewal - every client
// (dashboards, Android kiosk) refreshes on schedule/401 automatically.
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '7d';

function signAccessToken(payload, expiresIn = ACCESS_TOKEN_TTL) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function signRefreshToken(payload) {
  return jwt.sign({ ...payload, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws on invalid/expired token
}

async function hashSecret(plain) {
  return bcrypt.hash(String(plain), 10);
}

/**
 * Verifies a PIN/password against a stored value that may be a bcrypt hash
 * ($2a$/$2b$/$2y$ prefix) or, for records not yet migrated, plaintext.
 * The plaintext branch has to keep working — unmigrated rows would lock their
 * owners out — but it must not leak the stored value through `===`, which
 * short-circuits on the first differing character. verifyCredential() re-hashes
 * such rows on the next successful login, so this path only exists for rows
 * that have never been used since hashing landed.
 */
async function verifySecret(plain, stored) {
  if (!stored) return false;
  const value = String(plain);
  if (/^\$2[aby]\$/.test(stored)) {
    return bcrypt.compare(value, stored);
  }
  const a = Buffer.from(value);
  const b = Buffer.from(String(stored));
  // Length is compared first because timingSafeEqual throws on mismatch; for
  // fixed-format PINs the length is not a secret, and the guess length is
  // attacker-controlled anyway.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Same acceptance rules as verifySecret, but on a successful check against a
 * legacy plaintext row it also returns a bcrypt re-hash of the value so the
 * caller can persist it. `fields` are tried in order, mirroring the
 * `record.password || record.pin` lookups the login handlers already do, so a
 * bcrypt row is never touched and behaviour stays identical.
 *
 * Returns { ok, field, rehash } — rehash is null when nothing needs upgrading
 * or when hashing fails (the caller must never fail a valid login over this).
 */
async function verifyCredential(plain, record, fields) {
  const field = fields.find((f) => record && record[f]);
  const stored = field ? record[field] : null;
  const ok = await verifySecret(plain, stored);
  if (!ok) return { ok: false, field: null, rehash: null };
  if (!stored || /^\$2[aby]\$/.test(String(stored))) return { ok: true, field, rehash: null };
  try {
    return { ok: true, field, rehash: await hashSecret(plain) };
  } catch (err) {
    console.warn(`[auth] credential re-hash skipped: ${err.message}`);
    return { ok: true, field, rehash: null };
  }
}

module.exports = {
  signAccessToken, signRefreshToken, verifyToken, hashSecret, verifySecret, verifyCredential
};
