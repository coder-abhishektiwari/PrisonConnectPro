const express = require('express');
const rateLimit = require('express-rate-limit');
const { readDb, updateDb } = require('../lib/db');
const { signAccessToken, verifyToken, hashSecret, verifySecret } = require('../lib/auth');
const { createSession } = require('../lib/sessions');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inAdminScope } = require('../lib/scoping');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } }
});

const router = express.Router();

// ==================== AUTH (real credential checks + JWT) ====================

router.post('/login', authLimiter, asyncRoute(async (req, res) => {
  const { kioskId, pin, email, password } = req.body;

  // Kiosk operator login (kioskId + pin).
  if (kioskId && pin) {
    const users = await readDb('users.json');
    const user = users.find((u) => u.kioskId === kioskId || u.username === kioskId);
    if (!user) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid kiosk ID or PIN', 401);

    const valid = await verifySecret(pin, user.password || user.pin);
    if (!valid) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid kiosk ID or PIN', 401);

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
      const valid = await verifySecret(password, emailUser.password || emailUser.pin);
      if (!valid) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
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
      const valid = await verifySecret(password, admin.password || admin.pin);
      if (!valid) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
      const claims = { sub: admin.adminId, role: admin.role || 'admin', kioskId: admin.kioskId, prisonId: admin.prisonId };
      const session = await createSession(claims, req);
      return sendSuccess(res, {
        accessToken: signAccessToken(claims),
        refreshToken: session.refreshToken,
        expiresIn: 3600,
        user: { id: admin.adminId, name: admin.name, email: admin.email, role: claims.role, permissions: admin.permissions || [], kioskId: admin.kioskId, prisonId: admin.prisonId }
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

  const valid = await verifySecret(password, warden.password);
  if (!valid) return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);

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
    code: 'JAIL-' + prisonId.slice(-6),
    state: null,
    district: null,
    address: null,
    status: 'active',
    capacity: 500,
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

  // Find matching inmate in same prison + assigned to this kiosk + active
  const match = inmates.find((i) =>
    matchFn(i) &&
    (!kiosk.prisonId || !i.prisonId || kiosk.prisonId === i.prisonId) &&
    (!i.assignedKioskId || i.assignedKioskId === kioskId) &&
    (!i.status || i.status === 'active')
  );
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

router.post('/fingerprint-identify', asyncRoute((req, res) =>
  identifyInmate(req, res, (i) => i.biometricData?.fingerprintRegistered, 0.92)));

router.post('/rfid-identify', asyncRoute(async (req, res) => {
  const { kioskId, rfidToken } = req.body;
  if (!kioskId || !rfidToken) return sendError(res, 'INVALID_REQUEST', 'kioskId and rfidToken are required', 400);

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Record not found', 404);

  // Find inmate with matching RFID in same prison + assigned to this kiosk + active
  const inmate = inmates.find((i) =>
    i.biometricData?.rfidToken === rfidToken &&
    (!kiosk.prisonId || !i.prisonId || kiosk.prisonId === i.prisonId) &&
    (!i.assignedKioskId || i.assignedKioskId === kioskId) &&
    (!i.status || i.status === 'active')
  );
  if (!inmate) return sendError(res, 'NOT_FOUND', 'No inmate identified for this RFID token', 404);

  const inmateName = inmate.name || inmate.fullName || [inmate.firstName, inmate.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
  return sendSuccess(res, {
    inmateId: inmate.inmateId, name: inmateName,
    prisonId: inmate.prisonId, facility: inmate.prisonId,
    status: inmate.status, photoUrl: inmate.photo,
    rfidToken, confidence: 0.98
  });
}));

router.post('/prisoner/identify', asyncRoute(async (req, res) => {
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

  const valid = await verifySecret(pin, inmate.pin);
  if (!valid) return sendError(res, 'INVALID_PIN', 'Incorrect PIN', 401);

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

router.post('/admin/identify', asyncRoute(async (req, res) => {
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

  const storedSecret = admin.password ?? admin.pin;
  const valid = storedSecret ? await verifySecret(secret, storedSecret) : false;
  if (!valid) return sendError(res, 'INVALID_PIN', 'Incorrect password', 401);

  const claims = { sub: admin.adminId, role: admin.role || 'admin', kioskId, prisonId: admin.prisonId || kiosk.prisonId };
  const session = await createSession(claims, req);
  return sendSuccess(res, {
    accessToken: signAccessToken(claims), refreshToken: session.refreshToken, expiresIn: 3600,
    adminId: admin.adminId, role: admin.role, permissions: admin.permissions, kioskId, prisonId: admin.prisonId || kiosk.prisonId
  });
}));

module.exports = router;
