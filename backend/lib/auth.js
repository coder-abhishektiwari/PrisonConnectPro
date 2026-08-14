const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly instead of silently signing tokens with a guessable default.
  throw new Error('JWT_SECRET env var is required — set it before starting the server.');
}

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '1h';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '7d';

function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
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
 */
async function verifySecret(plain, stored) {
  if (!stored) return false;
  if (/^\$2[aby]\$/.test(stored)) {
    return bcrypt.compare(String(plain), stored);
  }
  return String(plain) === String(stored);
}

module.exports = { signAccessToken, signRefreshToken, verifyToken, hashSecret, verifySecret };
