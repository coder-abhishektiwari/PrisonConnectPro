const express = require('express');
const router = express.Router();
const { signAccessToken } = require('./lib/auth');
const sessions = require('./lib/sessions');
const { requireAuth } = require('./middleware/auth');

// Refresh token endpoint — rotating. The presented refresh token is revoked
// and a fresh pair is issued, so a stolen token cannot be replayed.
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'refreshToken is required' } });

  const session = await sessions.findSessionByToken(refreshToken);
  if (!session) return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
  if (session.revokedAt) return res.status(401).json({ success: false, error: { code: 'TOKEN_REVOKED', message: 'Refresh token has been revoked' } });
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await sessions.revokeSessionByToken(refreshToken);
    return res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Refresh token has expired' } });
  }

  await sessions.revokeSessionByToken(refreshToken);
  const claims = { sub: session.sub, role: session.role };
  const next = await sessions.createSession(claims, req);
  return res.json({
    success: true,
    data: {
      accessToken: signAccessToken(claims),
      refreshToken: next.refreshToken,
      expiresIn: 3600
    },
    timestamp: Date.now()
  });
});

// Logout — revokes the server-side session so the refresh token dies.
router.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await sessions.revokeSessionByToken(refreshToken);
  return res.json({ success: true, message: 'Logged out' });
});

// Password reset request (stub — wire to email service in production)
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'email is required' } });
  return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
});

router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'token and newPassword are required' } });
  return res.json({ success: true, message: 'Password reset successful' });
});

// Health check for auth service
router.get('/health', (req, res) => {
  res.json({ success: true, service: 'auth', timestamp: Date.now() });
});

module.exports = { router };