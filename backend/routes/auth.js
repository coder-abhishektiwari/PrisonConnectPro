const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { readDb, updateDb } = require('../lib/db');
const { signAccessToken, verifyToken, hashSecret, verifySecret, verifyCredential } = require('../lib/auth');
const { createSession, revokeAllForUser } = require('../lib/sessions');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inAdminScope } = require('../lib/scoping');
const { sendMail } = require('../lib/mailer');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } }
});

// Pre-auth identification primitives (fingerprint / RFID / prisoner number /
// admin username). These are public by design — the kiosk has no session yet —
// so they need their own budget: generous enough for a kiosk admitting one
// inmate after another, but bounded so a remote caller cannot grind through
// the inmate roster looking for matches.
const identifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } }
});

const router = express.Router();

/**
 * Persist the bcrypt upgrade returned by verifyCredential. Runs AFTER the
 * credential already verified, and any failure is only logged — a write
 * hiccup must never turn a valid login into a 401.
 *
 * idKeys are candidate unique-id fields (records differ between tables);
 * secretField is whichever of password/pin actually matched.
 */
async function persistRehash(file, idKeys, idValue, secretField, rehash) {
  if (!rehash || !secretField || idValue == null) return;
  try {
    await updateDb(file, (all) => {
      const idx = all.findIndex((r) => idKeys.some((k) => r[k] === idValue));
      if (idx === -1) return { data: all, result: null };
      all[idx] = { ...all[idx], [secretField]: rehash };
      return { data: all, result: all[idx] };
    });
    console.log(`[auth] upgraded plaintext credential to bcrypt for ${file}:${idValue}`);
  } catch (err) {
    console.warn(`[auth] credential upgrade failed for ${file}:${idValue}: ${err.message}`);
  }
}

// ==================== AUTH (real credential checks + JWT) ====================

router.post('/login', authLimiter, asyncRoute(async (req, res) => {
  const { kioskId, pin, email, password } = req.body;

  // Kiosk operator login (kioskId + pin).
  if (kioskId && pin) {
    const users = await readDb('users.json');
    const user = users.find((u) => u.kioskId === kioskId || u.username === kioskId);
    if (!user) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid kiosk ID or PIN', 401);

    const check = await verifyCredential(pin, user, ['password', 'pin']);
    if (!check.ok) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid kiosk ID or PIN', 401);
    await persistRehash('users.json', ['id', 'userId'], user.id || user.userId, check.field, check.rehash);

    const claims = { sub: user.id || user.userId, role: user.role || 'kiosk', kioskId: user.kioskId, prisonId: user.prisonId };
    const session = await createSession(claims, req);
    return sendSuccess(res, {
      accessToken: signAccessToken(claims),
      refreshToken: session.refreshToken,
      expiresIn: 3600,
      user: { id: user.userId || user.id, name: user.username, role: user.role || 'kiosk', kioskId: user.kioskId, prisonId: user.prisonId, permissions: [] }
    });
  }

  // Staff/vendor login (email + password) — warden, vendor or admin.
  if (email && password) {
    const [users, admins] = await Promise.all([readDb('users.json'), readDb('admins.json')]);
    const emailUser = users.find((u) => u.email === email) || users.find((u) => u.username === email);
    if (emailUser && (emailUser.role === 'vendor' || emailUser.role === 'kiosk')) {
      const check = await verifyCredential(password, emailUser, ['password', 'pin']);
      if (!check.ok) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
      await persistRehash('users.json', ['userId', 'id'], emailUser.userId || emailUser.id, check.field, check.rehash);
      const claims = { sub: emailUser.userId || emailUser.id, role: emailUser.role || 'vendor', kioskId: emailUser.kioskId, prisonId: emailUser.prisonId };
      const session = await createSession(claims, req);
      return sendSuccess(res, {
        accessToken: signAccessToken(claims),
        refreshToken: session.refreshToken,
        expiresIn: 3600,
        user: { id: emailUser.userId || emailUser.id, name: emailUser.username || emailUser.name, email: emailUser.email, role: claims.role, permissions: emailUser.permissions || [], kioskId: emailUser.kioskId, prisonId: emailUser.prisonId }
      });
    }
    const wanted = email.toLowerCase();
    const admin = admins.find((a) => String(a.email || '').toLowerCase() === wanted);
    if (admin) {
      const check = await verifyCredential(password, admin, ['password', 'pin']);
      if (!check.ok) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
      await persistRehash('admins.json', ['adminId'], admin.adminId, check.field, check.rehash);
      const claims = { sub: admin.adminId, role: admin.role || 'admin', kioskId: admin.kioskId, prisonId: admin.prisonId };
      const session = await createSession(claims, req);
      return sendSuccess(res, {
        accessToken: signAccessToken(claims),
        refreshToken: session.refreshToken,
        expiresIn: 3600,
        user: { id: admin.adminId, name: admin.name, email: admin.email, role: claims.role, permissions: admin.permissions || [], kioskId: admin.kioskId, prisonId: admin.prisonId }
      });
    }

    // Super-admin lookup (separate collection, role forced to super_admin so
    // requireRole('super_admin') checks always match regardless of the stored
    // legacy role spelling).
    const superAdmins = await readDb('super-admins.json');
    const superAdmin = superAdmins.find((a) => String(a.email || '').toLowerCase() === wanted);
    if (superAdmin) {
      const check = await verifyCredential(password, superAdmin, ['password', 'pin']);
      if (!check.ok) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
      await persistRehash('super-admins.json', ['adminId'], superAdmin.adminId, check.field, check.rehash);
      const claims = { sub: superAdmin.adminId, role: 'super_admin', kioskId: null, prisonId: null };
      const session = await createSession(claims, req);
      return sendSuccess(res, {
        accessToken: signAccessToken(claims),
        refreshToken: session.refreshToken,
        expiresIn: 3600,
        user: { id: superAdmin.adminId, name: superAdmin.name, email: superAdmin.email, role: claims.role, permissions: superAdmin.permissions || [], kioskId: null, prisonId: null }
      });
    }
    return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  return sendError(res, 'INVALID_REQUEST', 'Provide kioskId+pin or email+password', 400);
}));

// ==================== WARDEN AUTH ENDPOINTS (email + password) ====================
router.post('/warden/login', authLimiter, asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return sendError(res, 'INVALID_REQUEST', 'email and password are required', 400);

  const wardens = await readDb('wardens.json');
  const wanted = email.toLowerCase();
  const warden = wardens.find((w) => String(w.email || '').toLowerCase() === wanted);
  if (!warden) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);

  if (warden.status !== 'active') return sendError(res, 'ACCOUNT_DISABLED', 'Account is not active', 403);

  const check = await verifyCredential(password, warden, ['password']);
  if (!check.ok) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
  await persistRehash('wardens.json', ['wardenId'], warden.wardenId, check.field, check.rehash);

  const claims = { sub: warden.wardenId, role: 'warden', prisonId: warden.prisonId };
  const session = await createSession(claims, req);
  return sendSuccess(res, {
    accessToken: signAccessToken(claims),
    refreshToken: session.refreshToken,
    expiresIn: 3600,
    user: {
      id: warden.wardenId,
      name: warden.name,
      email: warden.email,
      role: 'warden',
      permissions: warden.permissions || [],
      kioskId: null,
      prisonId: warden.prisonId,
    }
  });
}));

// Warden registration endpoint
router.post('/register', authLimiter, asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;
  const prisonName = String(req.body.prisonName || '').trim() || 'New Prison';
  const state = String(req.body.state || '').trim() || null;
  const district = String(req.body.district || '').trim() || null;
  const address = String(req.body.address || '').trim() || null;
  if (!name || !email || !password) return sendError(res, 'INVALID_REQUEST', 'name, email and password are required', 400);

  const wardens = await readDb('wardens.json');
  const existing = wardens.find((w) => w.email === email);
  if (existing) return sendError(res, 'DUPLICATE', 'A warden with this email already exists', 409);

  const now = new Date().toISOString();
  const wardenId = 'WARDEN-' + Date.now().toString(36).toUpperCase();
  const prisonId = 'PRISON-' + Date.now().toString(36).toUpperCase();

  const newWarden = {
    wardenId,
    name: name.trim(),
    email: email.trim(),
    password: await hashSecret(String(password)),
    role: 'warden',
    permissions: ['view_calls'],
    status: 'active',
    designation: 'Chief Warden',
    // The account opened through "Create Account" runs the jail it creates.
    isChiefWarden: true,
    prisonId,
    createdAt: now
  };

  // A registered account owns its own jail, so it has a scope to manage wardens
  // and kiosk admins against.
  const newPrison = {
    prisonId,
    name: prisonName,
    state,
    district,
    address,
    status: 'active',
    currentInmateCount: 0,
    wardenIds: [wardenId],
    kioskIds: [],
    createdAt: now
  };

  // The jail row must exist first: wardens.prison_id is a foreign key.
  await updateDb('prisons.json', (all) => ({ data: [...all, newPrison], result: newPrison }));
  await updateDb('wardens.json', (all) => ({ data: [...all, newWarden], result: newWarden }));

  const claims = { sub: newWarden.wardenId, role: 'warden', prisonId: newWarden.prisonId };
  const session = await createSession(claims, req);
  return sendSuccess(res, {
    accessToken: signAccessToken(claims),
    refreshToken: session.refreshToken,
    expiresIn: 3600,
    user: {
      id: newWarden.wardenId,
      name: newWarden.name,
      email: newWarden.email,
      role: 'warden',
      permissions: newWarden.permissions,
      kioskId: null,
      prisonId: newWarden.prisonId,
    }
  }, 201);
}));

// ==================== PASSWORD RESET (warden accounts, 6-digit email code) ====================
// The warden dashboard's recovery flow: request a code by email, then
// exchange code + new password here. The code lives hashed on the warden
// document (10-minute TTL, 5 wrong attempts burn it, 30s resend cooldown).
// Only wardens are supported — this is the dashboard's reset flow.

const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const RESET_RESEND_COOLDOWN_MS = 30 * 1000;

router.post('/forgot-password', authLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return sendError(res, 'INVALID_REQUEST', 'email is required', 400);

  const wardens = await readDb('wardens.json');
  const warden = wardens.find((w) => String(w.email || '').toLowerCase() === email);

  // One response either way — never reveal whether the account exists.
  const genericMessage = 'If an account exists for this email, a 6-digit verification code has been sent.';

  if (warden && warden.status === 'active') {
    const lastSent = warden.resetSentAt ? Date.parse(warden.resetSentAt) : 0;
    const inCooldown = lastSent && Date.now() - lastSent < RESET_RESEND_COOLDOWN_MS;
    if (!inCooldown) {
      const code = String(crypto.randomInt(100000, 1000000));
      const codeHash = await hashSecret(code);
      await updateDb('wardens.json', (all) => {
        const idx = all.findIndex((w) => w.wardenId === warden.wardenId);
        if (idx === -1) return { data: all, result: null };
        all[idx].resetCodeHash = codeHash;
        all[idx].resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();
        all[idx].resetAttempts = 0;
        all[idx].resetSentAt = new Date().toISOString();
        return { data: all, result: all[idx] };
      });
      try {
        await sendMail({
          to: warden.email,
          subject: 'PrisonConnect \u2014 your password reset code',
          text:
            `Hi ${warden.name || 'there'},\n\n` +
            `Your PrisonConnect password reset code is:\n\n    ${code}\n\n` +
            `It expires in 10 minutes and can be used once. If you did not request this, you can safely ignore this email.\n`,
        });
      } catch (err) {
        console.error('[auth] password-reset mail failed:', err.message);
        return sendError(res, 'MAIL_FAILED', 'We could not send the reset email right now. Please try again in a moment.', 502);
      }
    }
  }

  return sendSuccess(res, { message: genericMessage });
}));

router.post('/reset-password', authLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const newPassword = String(req.body.newPassword || '');
  if (!email || !code || !newPassword) {
    return sendError(res, 'INVALID_REQUEST', 'email, code and newPassword are required', 400);
  }
  if (!/^\d{6}$/.test(code)) return sendError(res, 'INVALID_CODE', 'Enter the 6-digit code from your email', 400);
  if (newPassword.length < 8) return sendError(res, 'INVALID_PASSWORD', 'Password must be at least 8 characters', 400);

  const wardens = await readDb('wardens.json');
  const warden = wardens.find((w) => String(w.email || '').toLowerCase() === email);
  const invalid = () => sendError(res, 'INVALID_CODE', 'This code is incorrect or has expired. Request a new one.', 400);
  if (!warden || !warden.resetCodeHash) return invalid();

  if (!warden.resetCodeExpiresAt || Date.parse(warden.resetCodeExpiresAt) < Date.now()) {
    return sendError(res, 'CODE_EXPIRED', 'This code has expired. Request a new one.', 400);
  }
  if ((warden.resetAttempts || 0) >= RESET_MAX_ATTEMPTS) {
    return sendError(res, 'CODE_ATTEMPTS', 'Too many incorrect attempts. Request a new code.', 400);
  }

  const ok = await verifySecret(code, warden.resetCodeHash);
  if (!ok) {
    await updateDb('wardens.json', (all) => {
      const idx = all.findIndex((w) => w.wardenId === warden.wardenId);
      if (idx === -1) return { data: all, result: null };
      all[idx].resetAttempts = (all[idx].resetAttempts || 0) + 1;
      return { data: all, result: all[idx] };
    });
    return invalid();
  }

  const passwordHash = await hashSecret(newPassword);
  await updateDb('wardens.json', (all) => {
    const idx = all.findIndex((w) => w.wardenId === warden.wardenId);
    if (idx === -1) return { data: all, result: null };
    all[idx].password = passwordHash;
    delete all[idx].resetCodeHash;
    delete all[idx].resetCodeExpiresAt;
    delete all[idx].resetAttempts;
    delete all[idx].resetSentAt;
    all[idx].updatedAt = new Date().toISOString();
    return { data: all, result: all[idx] };
  });

  // Old refresh tokens must die with the old password (access tokens lapse
  // within their ≤15-minute TTL).
  await revokeAllForUser(warden.wardenId);

  return sendSuccess(res, { message: 'Password reset successfully' });
}));

// Get current authenticated user profile (warden, admin, kiosk, inmate)
router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const role = req.auth.role;
  const sub = req.auth.sub;

  if (role === 'warden') {
    const wardens = await readDb('wardens.json');
    const warden = wardens.find((w) => w.wardenId === sub);
    if (warden) {
      return sendSuccess(res, {
        id: warden.wardenId,
        name: warden.name,
        email: warden.email,
        role: 'warden',
        permissions: warden.permissions || [],
        kioskId: null,
        prisonId: warden.prisonId,
      });
    }
  }

  if (role === 'admin' || role === 'super_admin' || role === 'super-admin' || role === 'kiosk_admin') {
    const admins = await readDb('admins.json');
    const admin = admins.find((a) => a.adminId === sub);
    if (admin) {
      return sendSuccess(res, {
        id: admin.adminId,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
        kioskId: admin.kioskId,
        prisonId: admin.prisonId,
      });
    }
  }

  const users = await readDb('users.json');
  const user = users.find((u) => u.userId === sub || u.id === sub);
  if (user) {
    return sendSuccess(res, {
      id: user.userId || user.id,
      name: user.username,
      email: user.email || user.username,
      role: user.role || 'kiosk',
      permissions: [],
      kioskId: user.kioskId,
      prisonId: user.prisonId,
    });
  }

  return sendError(res, 'NOT_FOUND', 'User not found', 404);
}));

// Change password for authenticated user (warden, admin, kiosk)
router.post('/change-password', requireAuth, authLimiter, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return sendError(res, 'INVALID_REQUEST', 'currentPassword and newPassword are required', 400);
  }

  const role = req.auth.role;
  const sub = req.auth.sub;
  let dbFile, idField, userRec;

  if (role === 'warden') {
    dbFile = 'wardens.json';
    idField = 'wardenId';
    const wardens = await readDb(dbFile);
    userRec = wardens.find((w) => w.wardenId === sub);
  } else if (role === 'admin' || role === 'super_admin' || role === 'kiosk_admin') {
    dbFile = 'admins.json';
    idField = 'adminId';
    const admins = await readDb(dbFile);
    userRec = admins.find((a) => a.adminId === sub);
  } else {
    dbFile = 'users.json';
    idField = 'userId';
    const users = await readDb(dbFile);
    userRec = users.find((u) => u.userId === sub || u.id === sub);
  }

  if (!userRec) return sendError(res, 'NOT_FOUND', 'User not found', 404);

  const valid = await verifySecret(currentPassword, userRec.password || userRec.pin);
  if (!valid) return sendError(res, 'INVALID_CREDENTIALS', 'Current password is incorrect', 401);

  const hashedPassword = await hashSecret(String(newPassword));
  await updateDb(dbFile, (all) => {
    const idx = all.findIndex((u) => (u[idField] || u.id) === sub);
    if (idx === -1) return { data: all, result: null };
    all[idx].password = hashedPassword;
    all[idx].updatedAt = new Date().toISOString();
    return { data: all, result: all[idx] };
  });

  return sendSuccess(res, { message: 'Password changed successfully' });
}));

async function identifyInmate(req, res, matchFn, confidence) {
  const { kioskId } = req.body;
  if (!kioskId) return sendError(res, 'INVALID_REQUEST', 'kioskId is required', 400);

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Find matching inmate in same prison + assigned to this kiosk + active.
  // matchFn may be async (bcrypt verify), so iterate instead of Array.find.
  let match = null;
  for (const i of inmates) {
    const inScope = (!kiosk.prisonId || !i.prisonId || kiosk.prisonId === i.prisonId) &&
      (!i.assignedKioskId || i.assignedKioskId === kioskId) &&
      (!i.status || i.status === 'active');
    if (!inScope) continue;
    if (await matchFn(i)) { match = i; break; }
  }
  if (!match) return sendError(res, 'NOT_FOUND', 'No matching inmate identified for this kiosk', 404);

  return sendSuccess(res, {
    inmateId: match.inmateId,
    name: match.name || match.fullName || [match.firstName, match.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
    prisonId: match.prisonId,
    facility: match.prisonId,
    status: match.status,
    photoUrl: match.photo,
    confidence
  });
}

// Biometric values are stored hashed at rest (admin-routes.js
// POST /prisoners/:prisonerId/biometrics). Legacy rows may still hold the raw
// value, so a presented token matches when it equals the stored value (legacy)
// or verifies against the stored bcrypt hash (current storage).
async function matchesBiometric(presented, stored) {
  if (!presented || !stored) return false;
  if (String(stored) === String(presented)) return true; // legacy plain value
  if (/^\$2[aby]\$/.test(String(stored))) return verifySecret(String(presented), String(stored));
  return false;
}

// Re-hash a legacy plaintext biometric right after it matched. Matching is
// exact-equality (no fuzzy scoring), so replacing the raw value with
// hash(presented) preserves the exact comparison on every later tap.
async function persistBiometricRehash(inmateId, field, presented) {
  try {
    const hashed = await hashSecret(String(presented));
    await updateDb('inmates.json', (all) => {
      const idx = all.findIndex((i) => i.inmateId === inmateId);
      if (idx === -1) return { data: all, result: null };
      const bio = { ...(all[idx].biometricData || {}) };
      if (!bio[field] || /^\$2[aby]\$/.test(String(bio[field]))) return { data: all, result: null };
      bio[field] = hashed;
      all[idx] = { ...all[idx], biometricData: bio };
      return { data: all, result: all[idx] };
    });
    console.log(`[auth] upgraded plaintext biometric to bcrypt for ${inmateId}`);
  } catch (err) {
    console.warn(`[auth] biometric upgrade failed for ${inmateId}: ${err.message}`);
  }
}

router.post('/fingerprint-identify', identifyLimiter, asyncRoute(async (req, res) => {
  const { capture } = req.body;
  if (!capture) return sendError(res, 'INVALID_REQUEST', 'capture is required', 400);
  const presented = Buffer.from(String(capture), 'base64').toString('utf8').trim();
  if (!presented) return sendError(res, 'INVALID_REQUEST', 'capture is empty', 400);
  return identifyInmate(req, res, async (i) => {
    const stored = i.biometricData?.fingerprintTemplate;
    if (!i.biometricData?.fingerprintRegistered || !(await matchesBiometric(presented, stored))) return false;
    if (stored && !/^\$2[aby]\$/.test(String(stored))) {
      await persistBiometricRehash(i.inmateId, 'fingerprintTemplate', presented);
    }
    return true;
  }, 0.92);
}));

router.post('/rfid-identify', identifyLimiter, asyncRoute(async (req, res) => {
  const { kioskId, rfidToken } = req.body;
  if (!kioskId || !rfidToken) return sendError(res, 'INVALID_REQUEST', 'kioskId and rfidToken are required', 400);

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Find inmate with matching RFID in same prison + assigned to this kiosk + active.
  // Matching is async (bcrypt verify), so iterate instead of Array.find.
  let inmate = null;
  for (const i of inmates) {
    const inScope = (!kiosk.prisonId || !i.prisonId || kiosk.prisonId === i.prisonId) &&
      (!i.assignedKioskId || i.assignedKioskId === kioskId) &&
      (!i.status || i.status === 'active');
    if (!inScope) continue;
    if (await matchesBiometric(rfidToken, i.biometricData?.rfidToken)) {
      const stored = i.biometricData?.rfidToken;
      if (stored && !/^\$2[aby]\$/.test(String(stored))) {
        await persistBiometricRehash(i.inmateId, 'rfidToken', rfidToken);
      }
      inmate = i;
      break;
    }
  }
  if (!inmate) return sendError(res, 'NOT_FOUND', 'No inmate identified for this RFID token', 404);

  const inmateName = inmate.name || inmate.fullName || [inmate.firstName, inmate.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
  return sendSuccess(res, {
    inmateId: inmate.inmateId, name: inmateName,
    prisonId: inmate.prisonId, facility: inmate.prisonId,
    status: inmate.status, photoUrl: inmate.photo,
    confidence: 0.98
  });
}));

router.post('/prisoner/identify', identifyLimiter, asyncRoute(async (req, res) => {
  const prisonerId = req.query.prisonerId || req.body.prisonerId;
  const kioskId = req.query.kioskId || req.body.kioskId;

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const inmate = inmates.find((i) => i.inmateId === prisonerId);
  if (!inmate) return sendError(res, 'PRISONER_NOT_FOUND', 'Record not found', 404);

  // Block inactive inmates
  if (inmate.status && inmate.status !== 'active') return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Kiosk MUST be registered — block if not found
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Inmate must be in same prison as kiosk
  if (kiosk.prisonId && inmate.prisonId && kiosk.prisonId !== inmate.prisonId) {
    return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  }

  // Inmate must be assigned to this specific kiosk
  if (inmate.assignedKioskId && inmate.assignedKioskId !== kioskId) {
    return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  }

  return sendSuccess(res, {
    inmateId: inmate.inmateId,
    name: inmate.name || inmate.fullName || [inmate.firstName, inmate.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
    prisonId: inmate.prisonId, facility: inmate.facility,
    status: inmate.status, photoUrl: inmate.photoUrl, confidence: 1.0
  });
}));

router.post('/verify-pin', authLimiter, asyncRoute(async (req, res) => {
  const { inmateId, pin, kioskId } = req.body;
  if (!inmateId || !pin) return sendError(res, 'INVALID_REQUEST', 'inmateId and pin are required', 400);

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const inmate = inmates.find((i) => i.inmateId === inmateId);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Block inactive inmates
  if (inmate.status && inmate.status !== 'active') return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Kiosk MUST be registered
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Inmate must be in same prison
  if (kiosk.prisonId && inmate.prisonId && kiosk.prisonId !== inmate.prisonId) {
    return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  }

  // Inmate must be assigned to this specific kiosk
  if (inmate.assignedKioskId && inmate.assignedKioskId !== kioskId) {
    return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  }

  const check = await verifyCredential(pin, inmate, ['pin']);
  if (!check.ok) return sendError(res, 'INVALID_PIN', 'Incorrect PIN', 401);
  await persistRehash('inmates.json', ['inmateId'], inmate.inmateId, check.field, check.rehash);

  const claims = { sub: inmate.inmateId, role: 'inmate', inmateId: inmate.inmateId, kioskId };
  const session = await createSession(claims, req);
  return sendSuccess(res, {
    accessToken: signAccessToken(claims),
    refreshToken: session.refreshToken,
    expiresIn: 3600,
    inmateId: inmate.inmateId,
    kioskId
  });
}));

router.post('/admin/identify', identifyLimiter, asyncRoute(async (req, res) => {
  const { kioskId, username } = req.body;
  const [admins, kiosks] = await Promise.all([readDb('admins.json'), readDb('kiosks.json')]);
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk || kiosk.authorizationStatus !== 'authorized') return sendError(res, 'UNAUTHORIZED', 'Kiosk not authorized', 403);

  // Lookup is scoped to this kiosk's jail. Kiosk admins are jail staff, not
  // per-terminal accounts: any active admin of this jail may sign in on any
  // kiosk of that jail (by employee id, or by email for older accounts).
  // Super admins are excluded - they manage at company level, not kiosk level.
  const scopeAdmin = (a) =>
    a.status === 'active' &&
    a.role !== 'super_admin' &&
    (!kiosk.prisonId || !a.prisonId || a.prisonId === kiosk.prisonId);

  const admin = username
    ? admins.find((a) => scopeAdmin(a) && (a.employeeId === username || a.email === username))
    : admins.find(scopeAdmin);
  if (!admin) return sendError(res, 'ADMIN_NOT_FOUND', 'No admin found for this kiosk', 404);

  return sendSuccess(res, {
    adminId: admin.adminId, employeeId: admin.employeeId, name: admin.name, email: admin.email,
    role: admin.role, permissions: admin.permissions, status: admin.status,
    // The device asking, not the admin's "home" kiosk - the session that follows
    // must belong to the terminal the person is standing at.
    kioskId, prisonId: admin.prisonId || kiosk.prisonId, confidence: 0.95
  });
}));

router.post('/admin/verify-pin', authLimiter, asyncRoute(async (req, res) => {
  const { adminId, pin, password, kioskId } = req.body;
  const admins = await readDb('admins.json');
  // No per-kiosk assignment check: an admin of this jail unlocks on any kiosk
  // of the jail, which is what the identify step above just validated.
  const admin = admins.find((a) => a.adminId === adminId && a.role !== 'super_admin' && a.status === 'active');
  if (!admin) return sendError(res, 'NOT_FOUND', 'Admin not found', 404);

  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk || kiosk.authorizationStatus !== 'authorized' || kiosk.status === 'unauthorized' || kiosk.status === 'disabled') {
    return sendError(res, 'UNAUTHORIZED', 'Kiosk not authorized for admin access', 403);
  }
  if (admin.prisonId && kiosk.prisonId && admin.prisonId !== kiosk.prisonId) {
    return sendError(res, 'NOT_FOUND', 'Admin not found for this kiosk', 404);
  }

  // Accept the admin's login secret as "password" (preferred) or "pin".
  const secret = password ?? pin;
  if (!secret) return sendError(res, 'INVALID_REQUEST', 'password is required', 400);

  const check = await verifyCredential(secret, admin, ['password', 'pin']);
  if (!check.ok) return sendError(res, 'INVALID_PIN', 'Incorrect password', 401);
  await persistRehash('admins.json', ['adminId'], admin.adminId, check.field, check.rehash);

  const claims = { sub: admin.adminId, role: admin.role || 'admin', kioskId, prisonId: admin.prisonId || kiosk.prisonId };
  const session = await createSession(claims, req);
  return sendSuccess(res, {
    accessToken: signAccessToken(claims), refreshToken: session.refreshToken, expiresIn: 3600,
    adminId: admin.adminId, role: admin.role, permissions: admin.permissions, kioskId, prisonId: admin.prisonId || kiosk.prisonId
  });
}));

module.exports = router;
