const crypto = require('crypto');
const { query } = require('./db');

const SESSION_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '14', 10);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(claims, req) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const id = 'ses_' + crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO sessions (id, user_id, role, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, claims.sub, claims.role, tokenHash, expiresAt.toISOString(), req?.get?.('user-agent') || null]
  );
  return { id, refreshToken, expiresAt };
}

async function findSessionByToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  const { rows } = await query(
    `SELECT id, user_id, role, expires_at, revoked_at FROM sessions WHERE token_hash = $1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    sub: row.user_id,
    role: row.role,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at
  };
}

async function revokeSessionByToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  const { rows } = await query(
    `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id`,
    [tokenHash]
  );
  return rows.length > 0;
}

async function revokeAllForUser(userId) {
  const { rows } = await query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
    [userId]
  );
  return rows.length;
}

async function cleanupExpired() {
  const { rows } = await query(
    `DELETE FROM sessions WHERE expires_at < now() RETURNING id`,
    []
  );
  return rows.length;
}

module.exports = {
  createSession,
  findSessionByToken,
  revokeSessionByToken,
  revokeAllForUser,
  cleanupExpired
};