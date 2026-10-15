const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { hashSecret, verifySecret, verifyToken, signAccessToken } = require('../lib/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, inAdminScope, adminScopeFilter, inScopeOf, scopeList } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');
const { buildInmateIndex } = require('../lib/kioskView');

const router = express.Router();

// The facility setup secret used to be a 6-digit PIN; it is a real password
// now. Policy shared by PUT /kiosks/setup-password and the change-request
// flow: 8-64 chars, at least one letter and one digit.
function isSetupPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64 &&
    /[A-Za-z]/.test(value) && /\d/.test(value);
}


// ==================== KIOSK REPORT HELPERS ====================
// States where the call actually reached the kiosk. 'scheduled'/'waiting'
// are bookings that never connected and 'cancelled' was called off.
const PLACED_CALL_STATES = ['active', 'completed', 'failed', 'rejected', 'missed'];

function callMinutes(c) {
  const dm = Number(c.durationMinutes);
  if (Number.isFinite(dm) && dm > 0) return dm;
  const secs = Number(c.duration);
  if (Number.isFinite(secs) && secs > 0) return secs / 60;
  if (c.startTime && c.endTime) {
    const ms = new Date(c.endTime).getTime() - new Date(c.startTime).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms / 60000;
  }
  return 0;
}

function emptyPeriod() {
  return { total: 0, audio: 0, video: 0, minutes: 0 };
}

function tallyPeriod(period, call) {
  period.total += 1;
  if (call.type === 'audio') period.audio += 1;
  else if (call.type === 'video') period.video += 1;
  period.minutes += callMinutes(call);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function parseWhen(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ==================== DEVICE LIVENESS ====================
// The kiosk app posts a heartbeat every 30s while it runs. `lastHeartbeatAt`
// is the only field liveness is derived from — stored `status` flags go stale
// the moment they are written, so they are never trusted for online/offline.
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_GRACE_MS = 4 * HEARTBEAT_INTERVAL_MS;

function kioskLive(k) {
  const beat = parseWhen(k?.lastHeartbeatAt);
  if (!beat) return { online: false, lastSeen: parseWhen(k?.lastSeen) ? k.lastSeen : null };
  return {
    online: Date.now() - beat.getTime() <= HEARTBEAT_GRACE_MS,
    lastSeen: beat.toISOString(),
  };
}

// Read-model status: authorization state wins (pending/disabled/maintenance
// are things a warden set), otherwise the device's real connectivity.
function kioskDisplayStatus(k) {
  if (!k) return 'unknown';
  if (k.authorizationStatus === 'unauthorized' || k.status === 'disabled') return 'disabled';
  if (k.authorizationStatus !== 'authorized') return 'pending';
  if (k.status === 'maintenance') return 'maintenance';
  return kioskLive(k).online ? 'online' : 'offline';
}


// ==================== INPUT SANITIZATION ====================
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>]/g, '').replace(/['";]/g, '').replace(/\n/g, ' ').trim().slice(0, 500);
}
function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? sanitize(v) : v;
  }
  return out;
}

// ==================== RATE LIMITING (in-memory) ====================
const rateLimitAttempts = new Map();
function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  rateLimitAttempts.set(key, record);
  return record.count <= maxAttempts;
}

// ==================== KIOSK VERIFICATION (public — pre-auth) ====================

router.post('/verify', asyncRoute(async (req, res) => {
  const { deviceSerialNumber } = req.body;
  if (!deviceSerialNumber) return sendError(res, 'INVALID_REQUEST', 'Device serial number is required', 400);

  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) =>
    k.deviceSerialNumber === deviceSerialNumber ||
    k.deviceFingerprint === deviceSerialNumber
  );
  if (!kiosk) return sendSuccess(res, { success: true, authorized: false, reason: 'not_found', kiosk: null });

  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === kiosk.prisonId);

  const authorized = !!(
    prison && prison.status === 'active' &&
    kiosk.authorizationStatus === 'authorized' &&
    kiosk.status !== 'disabled' && kiosk.status !== 'unauthorized'
  );

  if (!authorized) return sendSuccess(res, { success: true, authorized: false, reason: 'unauthorized', kiosk: null });

  // Long-lived device credential: background workers that run without a
  // logged-in user authenticate with this instead of an expiring session token.
  const deviceToken = signAccessToken(
    {
      sub: kiosk.kioskId,
      role: 'kiosk',
      kioskId: kiosk.kioskId,
      prisonId: kiosk.prisonId,
      device: true
    },
    process.env.DEVICE_TOKEN_TTL || '365d'
  );

  return sendSuccess(res, {
    success: true,
    authorized: true,
    deviceToken,
    kiosk: {
      kioskId: kiosk.kioskId,
      deviceSerialNumber: kiosk.deviceSerialNumber,
      prisonId: kiosk.prisonId,
      prisonName: prison.name,
      status: kiosk.status,
      authorized: true,
      location: kiosk.location,
      ipAddress: kiosk.ipAddress
    }
  });
}));

// ==================== KIOSK LIVENESS HEARTBEAT (public — device side) ====================
// The kiosk posts this while it runs so the dashboard can show a truthful
// Online/Offline state and Last Seen. It only ever refreshes liveness and
// device facts — it can never authorize, approve or move a kiosk.
router.post('/heartbeat', asyncRoute(async (req, res) => {
  if (!checkRateLimit(`heartbeat:${req.ip}`, 30, 60000)) {
    return sendError(res, 'RATE_LIMITED', 'Too many heartbeats, slow down', 429);
  }

  const body = req.body || {};
  const deviceSerialNumber = typeof body.deviceSerialNumber === 'string' ? body.deviceSerialNumber.trim() : '';
  const deviceFingerprint =
    (typeof body.deviceFingerprint === 'string' && body.deviceFingerprint.trim()) ||
    (req.get('X-Device-Fingerprint') || '').trim();

  // Identity, strongest first. The hardware serial is the best signal but
  // Build.getSerial() is only readable when the app is Device Owner, so most
  // installations fall back to the kiosk's own login token — the app attaches
  // it to every request. Fingerprint last: it is only unique when the serial
  // was available when it was computed.
  const authHeader = req.get('authorization') || '';
  let claims = null;
  if (/^bearer\s+/i.test(authHeader)) {
    try { claims = verifyToken(authHeader.replace(/^bearer\s+/i, '').trim()); } catch (e) { claims = null; }
  }
  const tokenKioskId = claims && claims.role === 'kiosk' && claims.kioskId ? String(claims.kioskId) : '';

  if (!deviceSerialNumber && !deviceFingerprint && !tokenKioskId) {
    return sendError(res, 'INVALID_REQUEST', 'deviceSerialNumber or X-Device-Fingerprint is required', 400);
  }

  // Demo rows are not real devices, so no heartbeat can ever light one up.
  const kiosks = await readDb('kiosks.json');
  const match = kiosks.find((k) =>
    (tokenKioskId && k.kioskId === tokenKioskId) ||
    (deviceSerialNumber && k.deviceSerialNumber === deviceSerialNumber) ||
    (deviceFingerprint && k.deviceFingerprint === deviceFingerprint)
  );
  if (!match) {
    console.warn('[kiosks] unmatched heartbeat', {
      kioskId: tokenKioskId || null,
      serial: deviceSerialNumber || null,
      fingerprint: deviceFingerprint ? deviceFingerprint.slice(0, 12) + '…' : null,
      ip: req.ip,
    });
    return sendError(res, 'NOT_FOUND', 'Unknown kiosk device', 404);
  }

  const now = new Date().toISOString();
  const ipAddress = (req.get('X-Device-IP') || '').trim() || body.ipAddress || match.ipAddress;
  // A heartbeat that identified the kiosk by its login token or by the hardware
  // serial is trustworthy enough to teach us the device's fingerprint, so
  // heartbeats keep matching after the kiosk's session expires or is logged out.
  const matchedByStrongId =
    !!tokenKioskId || (!!deviceSerialNumber && match.deviceSerialNumber === deviceSerialNumber);
  const learnedFingerprint =
    matchedByStrongId && deviceFingerprint && deviceFingerprint !== match.deviceFingerprint
      ? deviceFingerprint
      : null;
  const updated = await updateDb('kiosks.json', (rows) => {
    const idx = rows.findIndex((k) => k.kioskId === match.kioskId);
    if (idx === -1) return { data: rows, result: null };
    rows[idx] = {
      ...rows[idx],
      lastHeartbeatAt: now,
      lastSeen: now,
      ipAddress,
      androidVersion: body.androidVersion || rows[idx].androidVersion,
      firmwareVersion: body.appVersion || rows[idx].firmwareVersion,
      ...(learnedFingerprint ? { deviceFingerprint: learnedFingerprint } : {}),
    };
    return { data: rows, result: rows[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Unknown kiosk device', 404);

  return sendSuccess(res, {
    ok: true,
    kioskId: updated.kioskId,
    status: kioskDisplayStatus(updated),
    lastSeen: updated.lastSeen
  });
}));

// ==================== KIOSK REGISTRATION (public — after setup password validation) ====================

router.post('/register', asyncRoute(async (req, res) => {
  // Basic flood protection: a device retries a handful of times at most.
  if (!checkRateLimit(`register:${req.ip}`, 10, 60000)) {
    return sendError(res, 'RATE_LIMITED', 'Too many registration attempts. Try again in 1 minute.', 429);
  }

  const raw = { 
    deviceSerialNumber, 
    prisonId, 
    deviceModel, 
    deviceBrand, 
    ipAddress, 
    location, 
    androidVersion, 
    appVersion,
    deviceFingerprint 
  } = req.body;
  
  if (!deviceSerialNumber || !prisonId) {
    return sendError(res, 'INVALID_REQUEST', 'deviceSerialNumber and prisonId are required', 400);
  }

  // The setup password gate must hold server-side, not just in the app UI: a
  // successful /validate-setup-password issues a short-lived signed token bound
  // to that prison, and this endpoint refuses to create/refresh a kiosk without
  // it (same prison only — a token for jail A cannot register into jail B).
  const setupHeader = (req.get('authorization') || '').replace(/^bearer\s+/i, '').trim();
  const setupToken = (typeof req.body.setupToken === 'string' && req.body.setupToken.trim()) || setupHeader;
  let setupClaims = null;
  if (setupToken) {
    try { setupClaims = verifyToken(setupToken); } catch (e) { setupClaims = null; }
  }
  if (!setupClaims || setupClaims.role !== 'setup' || setupClaims.prisonId !== prisonId) {
    return sendError(res, 'SETUP_TOKEN_REQUIRED', 'Validate the prison setup password first (missing or invalid setup token)', 401);
  }
  
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  if (!prison) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  
  const kiosks = await readDb('kiosks.json');
  
  // Check if kiosk already exists. The hardware serial is only readable when
  // the app is Device Owner, so a kiosk that has since lost that permission
  // comes back with a fallback id — fall back to the fingerprint it registered
  // with instead of creating a duplicate row for the same tablet.
  const existingKiosk =
    kiosks.find((k) => k.deviceSerialNumber === deviceSerialNumber) ||
    (deviceFingerprint
      ? kiosks.find((k) => k.deviceFingerprint && k.deviceFingerprint === deviceFingerprint)
      : undefined);
  if (existingKiosk) {
    // If already pending, return existing request (no duplicate)
    if (existingKiosk.authorizationStatus === 'pending' && existingKiosk.status === 'pending') {
      return sendSuccess(res, {
        success: true,
        kiosk: existingKiosk,
        requestId: existingKiosk.kioskId,
        kioskId: existingKiosk.kioskId,
        status: 'pending',
        message: 'Registration request already pending'
      });
    }
    // Re-registering a previously rejected/disabled device queues a fresh approval
    const needsReapproval =
      existingKiosk.authorizationStatus !== 'authorized' ||
      existingKiosk.status === 'disabled' ||
      existingKiosk.status === 'unauthorized';
    // Update existing kiosk
    const updated = await updateDb('kiosks.json', (kiosks) => {
      const idx = kiosks.findIndex((k) => k.kioskId === existingKiosk.kioskId);
      if (idx === -1) return { data: kiosks, result: null };
      
      kiosks[idx] = {
        ...kiosks[idx],
        ...(needsReapproval
          ? { status: 'pending', authorizationStatus: 'pending', reviewedBy: null, reviewedAt: null, rejectionReason: null }
          : {}),
        ipAddress: ipAddress || kiosks[idx].ipAddress,
        location: sanitize(location) || kiosks[idx].location,
        firmwareVersion: appVersion || kiosks[idx].firmwareVersion,
        androidVersion: androidVersion || kiosks[idx].androidVersion,
        lastSeen: new Date().toISOString(),
        deviceFingerprint: deviceFingerprint || kiosks[idx].deviceFingerprint,
        prisonName: prison.name
      };
      return { data: kiosks, result: kiosks[idx] };
    });
    
    return sendSuccess(res, {
      success: true,
      kiosk: updated,
      requestId: updated.kioskId,
      kioskId: updated.kioskId,
      status: needsReapproval ? 'pending' : (updated.status || updated.authorizationStatus || 'pending'),
      message: needsReapproval ? 'Kiosk re-registered for approval' : 'Kiosk updated successfully'
    });
  }
  
  // Create new kiosk registration request
  const newKiosk = {
    kioskId: `KIOSK-${uuidv4().substring(0, 8).toUpperCase()}`,
    deviceSerialNumber: sanitize(deviceSerialNumber),
    prisonId,
    prisonName: prison.name,
    status: 'pending',
    authorizationStatus: 'pending',
    location: sanitize(location) || 'Unknown',
    ipAddress: ipAddress || 'Unknown',
    firmwareVersion: appVersion || 'Unknown',
    androidVersion: androidVersion || 'Unknown',
    lastSeen: new Date().toISOString(),
    hardware: {
      model: sanitize(deviceModel) || 'Unknown',
      manufacturer: sanitize(deviceBrand) || 'Unknown',
      serialNumber: sanitize(deviceSerialNumber),
      screenSize: 'Unknown',
      touchScreen: true,
      processor: 'Unknown',
      ram: 'Unknown',
      storage: 'Unknown'
    },
    camera: { status: 'unknown', resolution: 'Unknown', lastTested: null },
    microphone: { status: 'unknown', sensitivity: 'unknown', lastTested: null },
    speaker: { status: 'unknown', volume: 0, lastTested: null },
    printer: { status: 'unknown', paperLevel: 0, lastTested: null },
    network: { status: 'unknown', type: 'unknown', signalStrength: 0, bandwidth: '0Mbps' },
    installationDate: null,
    lastMaintenance: null,
    deviceFingerprint: deviceFingerprint || null,
    rejectionReason: null,
    createdAt: new Date().toISOString()
  };
  
  const created = await updateDb('kiosks.json', (kiosks) => {
    kiosks.push(newKiosk);
    return { data: kiosks, result: newKiosk };
  });
  
  return sendSuccess(res, {
    success: true,
    kiosk: newKiosk,
    requestId: newKiosk.kioskId,
    kioskId: newKiosk.kioskId,
    status: newKiosk.status,
    message: 'Kiosk registration request submitted successfully'
  }, 201);
}));

// ==================== KIOSK REGISTRATION REQUESTS ====================

// Public endpoint used by kiosk devices to check registration status by serial number
router.get('/registration-status/:identifier', asyncRoute(async (req, res) => {
  const identifier = req.params.identifier;
  // Check existing kiosks first
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.deviceSerialNumber === identifier || k.kioskId === identifier);
  if (kiosk) {
    // Expire pending requests older than 7 days
    const createdAt = new Date(kiosk.createdAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if ((kiosk.authorizationStatus === 'pending' || kiosk.status === 'pending') && (Date.now() - createdAt > sevenDays)) {
      return sendSuccess(res, {
        status: 'expired',
        requestId: kiosk.kioskId,
        prisonId: kiosk.prisonId || null,
        authorized: false,
        rejectionReason: 'Registration request expired after 7 days'
      });
    }
    const mappedStatus = kiosk.authorizationStatus === 'authorized'
      ? 'approved'
      : kiosk.authorizationStatus === 'unauthorized'
        ? 'rejected'
        : (kiosk.authorizationStatus || 'pending');
    return sendSuccess(res, {
      status: mappedStatus,
      requestId: kiosk.kioskId,
      prisonId: kiosk.prisonId || null,
      authorized: kiosk.authorizationStatus === 'authorized',
      rejectionReason: kiosk.rejectionReason || null
    });
  }

  return sendError(res, 'NOT_FOUND', 'Kiosk registration status not found', 404);
}));

router.get('/registration-requests/stats', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  const scoped = kiosks.filter(adminScopeFilter(req));
  return sendSuccess(res, {
    total: scoped.length,
    pendingCount: scoped.filter((k) => k.authorizationStatus === 'pending' || k.status === 'pending').length,
    approvedCount: scoped.filter((k) => k.authorizationStatus === 'authorized').length,
    rejectedCount: scoped.filter((k) => k.authorizationStatus === 'unauthorized').length,
  });
}));

router.get('/registration-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const [kiosks, prisons] = await Promise.all([readDb('kiosks.json'), readDb('prisons.json')]);
  const statusFilter = req.query.status;
  const realKiosks = kiosks;
  let registrationRequests;
  if (statusFilter && statusFilter !== 'all') {
    const statusMap = { approved: 'authorized', rejected: 'unauthorized', pending: 'pending' };
    const authStatus = statusMap[statusFilter] || statusFilter;
    registrationRequests = realKiosks.filter((k) => k.authorizationStatus === authStatus || k.status === statusFilter);
  } else {
    registrationRequests = realKiosks.filter((k) => k.status === 'pending' || k.authorizationStatus === 'pending' || k.authorizationStatus === 'authorized' || k.authorizationStatus === 'unauthorized');
  }
  const mapped = (await scopeList(req, registrationRequests)).map((k) => {
    const prison = prisons.find((p) => p.prisonId === k.prisonId);
    return {
      requestId: k.kioskId,
      prisonId: k.prisonId,
      prisonName: prison?.name || 'Unknown Prison',
      deviceSerialNumber: k.deviceSerialNumber,
      deviceModel: k.hardware?.model || 'Unknown',
      deviceBrand: k.hardware?.manufacturer || 'Unknown',
      ipAddress: k.ipAddress,
      location: k.location,
      androidVersion: k.androidVersion || 'Unknown',
      appVersion: k.firmwareVersion || 'Unknown',
      registrationTimestamp: k.createdAt,
      deviceFingerprint: k.deviceSerialNumber || 'Unknown',
      status: k.authorizationStatus === 'authorized' ? 'approved' : k.authorizationStatus === 'unauthorized' ? 'rejected' : 'pending',
      reviewedBy: k.reviewedBy || null,
      reviewedAt: k.reviewedAt || null,
    };
  });
  const result = await paginate({
    req, data: mapped,
    search: (r, q) =>
      (r.requestId || '').toLowerCase().includes(q) ||
      (r.deviceSerialNumber || '').toLowerCase().includes(q) ||
      (r.prisonName || '').toLowerCase().includes(q) ||
      (r.location || '').toLowerCase().includes(q),
    searchFields: [],
    defaultSort: 'registrationTimestamp',
  });
  return sendSuccess(res, result);
}));

router.patch('/registration/:requestId/approve', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const [kiosks, prisons] = await Promise.all([readDb('kiosks.json'), readDb('prisons.json')]);
  const kiosk = kiosks.find((k) => k.kioskId === requestId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  }
  // Race condition guard — only approve if still pending
  if (kiosk.authorizationStatus !== 'pending') {
    return sendError(res, 'CONFLICT', `Request already ${kiosk.authorizationStatus}`, 409);
  }
  // Validate prison still exists and is active
  const prison = prisons.find((p) => p.prisonId === kiosk.prisonId);
  if (!prison || prison.status !== 'active') {
    return sendError(res, 'FORBIDDEN', 'Cannot approve — prison not found or inactive', 403);
  }
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === requestId);
    if (idx === -1) return { data: kiosks, result: null };
    // Re-check status inside mutex
    if (kiosks[idx].authorizationStatus !== 'pending') return { data: kiosks, result: null };
    kiosks[idx] = { 
      ...kiosks[idx], 
      authorizationStatus: 'authorized',
      status: 'active',
      reviewedBy: req.auth.sub,
      reviewedAt: new Date().toISOString(),
      rejectionReason: null
    };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Registration request not found or already processed', 404);
  // Approval is when the device actually joins the jail: the prison's kiosk
  // roster has to learn about it here, not at registration time.
  await addToPrisonKiosks(updated.prisonId, updated.kioskId);
  return sendSuccess(res, { success: true });
}));

router.patch('/registration/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const { reason } = req.body;
  const kiosk = (await readDb('kiosks.json')).find((k) => k.kioskId === requestId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  }
  // Race condition guard — only reject if still pending
  if (kiosk.authorizationStatus !== 'pending') {
    return sendError(res, 'CONFLICT', `Request already ${kiosk.authorizationStatus}`, 409);
  }
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === requestId);
    if (idx === -1) return { data: kiosks, result: null };
    // Re-check status inside mutex
    if (kiosks[idx].authorizationStatus !== 'pending') return { data: kiosks, result: null };
    kiosks[idx] = { 
      ...kiosks[idx], 
      authorizationStatus: 'unauthorized',
      status: 'disabled',
      reviewedBy: req.auth.sub,
      reviewedAt: new Date().toISOString(),
      rejectionReason: sanitize(reason) || 'No reason provided'
    };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Registration request not found or already processed', 404);
  return sendSuccess(res, { success: true });
}));

// ==================== KIOSK ROUTES (CRUD added — was read-only) ====================

router.get('/', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const [kiosks, inmates] = await Promise.all([
    readDb('kiosks.json'),
    readDb('inmates.json'),
  ]);
  const inScope = adminScopeFilter(req);
  const index = buildInmateIndex({ inmates, inScope });

  // A kiosk-admin token may list sibling kiosks (so the on-device inmate form
  // can offer the assignment dropdown), but only as a minimal projection of
  // its own prison — never serials, IPs, fingerprints or hardware detail.
  const role = String(req.auth?.role || '').toLowerCase().replace(/[-_]/g, '');
  const kioskAdminJail = role === 'kioskadmin' ? (req.auth?.prisonId || req.auth?.jailId || null) : null;

  if (role === 'kioskadmin') {
    if (!kioskAdminJail) return sendSuccess(res, []);
    const data = kiosks
      .filter((k) => k.prisonId === kioskAdminJail)
      .map((k) => ({
        kioskId: k.kioskId,
        prisonId: k.prisonId,
        location: k.location || null,
        status: kioskDisplayStatus(k),
      }));
    return sendSuccess(res, data);
  }

  const data = kiosks
    .filter((k) => inScope(k))
    .map((k) => ({
      ...k,
      // Liveness is derived from the device's heartbeat, not the stored flag.
      status: kioskDisplayStatus(k),
      lastSeen: kioskLive(k).lastSeen,
      lastHeartbeatAt: k.lastHeartbeatAt || null,
      location: k.location || null,
      registeredInmates: index.countFor(k.kioskId),
    }));
  return sendSuccess(res, data);
}));

// Per-kiosk report: today / this month / all-time call counts, audio vs
// video split, registered prisoners and the latest calls from the device.
router.get('/:kioskId/stats', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const [kiosks, inmates, calls, prisons] = await Promise.all([
    readDb('kiosks.json'),
    readDb('inmates.json'),
    readDb('calls.json'),
    readDb('prisons.json'),
  ]);
  const kiosk = kiosks.find((k) => k.kioskId === req.params.kioskId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Kiosk not found in your jail', 404);
  }

  const inScope = adminScopeFilter(req);
  const registered = inmates.filter((i) => i.assignedKioskId === kiosk.kioskId && inScope(i));

  const placed = calls.filter((c) => c.kioskId === kiosk.kioskId && inScope(c) && PLACED_CALL_STATES.includes(c.status));
  const now = new Date();
  const today = emptyPeriod();
  const month = emptyPeriod();
  const allTime = emptyPeriod();
  for (const c of placed) {
    const started = parseWhen(c.startTime);
    if (!started) continue;
    tallyPeriod(allTime, c);
    if (sameMonth(started, now)) tallyPeriod(month, c);
    if (sameDay(started, now)) tallyPeriod(today, c);
  }

  const recentCalls = [...placed]
    .sort((a, b) => (parseWhen(b.startTime)?.getTime() || 0) - (parseWhen(a.startTime)?.getTime() || 0))
    .slice(0, 5)
    .map((c) => ({
      callId: c.callId,
      startTime: c.startTime || null,
      type: c.type || 'video',
      status: c.status,
      minutes: round1(callMinutes(c)),
      inmateName: c.inmateName || c.inmateId || null,
      familyMemberName: c.familyMemberName || null,
    }));

  const lastCallAt = placed.reduce((latest, c) => {
    const when = parseWhen(c.startTime)?.getTime() || 0;
    return when > latest ? when : latest;
  }, 0);

  const prison = prisons.find((p) => p.prisonId === kiosk.prisonId);
  const finish = (period) => ({ ...period, minutes: round1(period.minutes) });

  return sendSuccess(res, {
    kioskId: kiosk.kioskId,
    prisonId: kiosk.prisonId || null,
    prisonName: kiosk.prisonName || prison?.name || null,
    deviceSerialNumber: kiosk.deviceSerialNumber || null,
    location: kiosk.location || null,
    ipAddress: kiosk.ipAddress || null,
    androidVersion: kiosk.androidVersion || null,
    status: kioskDisplayStatus(kiosk),
    authorizationStatus: kiosk.authorizationStatus || 'pending',
    lastSeen: kioskLive(kiosk).lastSeen,
    lastHeartbeatAt: kiosk.lastHeartbeatAt || null,
    installationDate: kiosk.installationDate || null,
    registeredInmates: registered.length,
    today: finish(today),
    month: finish(month),
    allTime: finish(allTime),
    lastCallAt: lastCallAt ? new Date(lastCallAt).toISOString() : null,
    recentCalls,
  });
}));

router.get('/:kioskId', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, kiosk);
}));
// A prison lists the devices it owns; keep that array in step with the kiosks
// table so nothing has to guess which kiosks belong to which jail.
async function addToPrisonKiosks(prisonId, kioskId) {
  if (!prisonId || !kioskId) return;
  await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === prisonId);
    if (idx === -1) return { data: prisons, result: null };
    const owned = Array.isArray(prisons[idx].kioskIds) ? prisons[idx].kioskIds : [];
    if (owned.includes(kioskId)) return { data: prisons, result: prisons[idx] };
    prisons[idx] = { ...prisons[idx], kioskIds: [...owned, kioskId] };
    return { data: prisons, result: prisons[idx] };
  });
}

async function removeFromPrisonKiosks(prisonId, kioskId) {
  if (!prisonId || !kioskId) return;
  await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === prisonId);
    if (idx === -1) return { data: prisons, result: null };
    const owned = Array.isArray(prisons[idx].kioskIds) ? prisons[idx].kioskIds : [];
    if (!owned.includes(kioskId)) return { data: prisons, result: prisons[idx] };
    prisons[idx] = { ...prisons[idx], kioskIds: owned.filter((id) => id !== kioskId) };
    return { data: prisons, result: prisons[idx] };
  });
}

router.post('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kioskData = req.body || {};
  const jailId = jailScopeOf(req);
  if (jailId && kioskData.prisonId && kioskData.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a kiosk outside your jail', 403);
  }
  const prisonId = jailId || kioskData.prisonId || null;
  const kioskId = kioskData.kioskId || `KIOSK-${uuidv4().substring(0, 8).toUpperCase()}`;
  const [kiosks, prisons] = await Promise.all([readDb('kiosks.json'), readDb('prisons.json')]);
  // kiosk_id is the primary key: a client-supplied id must not collide.
  if (kiosks.some((k) => k.kioskId === kioskId)) {
    return sendError(res, 'DUPLICATE', `A kiosk with id ${kioskId} already exists`, 409);
  }
  // prison_id is a foreign key — reject an unknown jail here rather than
  // letting the write fail inside the database.
  if (prisonId && !prisons.some((p) => p.prisonId === prisonId)) {
    return sendError(res, 'INVALID_REFERENCE', `prisonId '${prisonId}' does not exist`, 422);
  }
  const newKiosk = {
    ...kioskData,
    kioskId,
    prisonId,
    status: kioskData.status || 'pending',
    authorizationStatus: kioskData.authorizationStatus || 'pending',
    createdAt: new Date().toISOString()
  };
  await updateDb('kiosks.json', (k) => ({ data: [...k, newKiosk], result: newKiosk }));
  await addToPrisonKiosks(newKiosk.prisonId, newKiosk.kioskId);
  return sendSuccess(res, newKiosk, 201);
}));
router.patch('/:kioskId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
    if (idx === -1) return { data: kiosks, result: null };
    kiosks[idx] = { ...kiosks[idx], ...req.body };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, updated);
}));
router.delete('/:kioskId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);

  // Deleting a device that still holds prisoners would silently unassign all of
  // them (inmates.kiosk_id is SET NULL), so the roster has to be emptied first.
  const inmates = await readDb('inmates.json');
  const assigned = inmates.filter((i) => i.assignedKioskId === kiosk.kioskId);
  if (assigned.length) {
    return sendError(
      res, 'CONFLICT',
      `Reassign ${assigned.length} prisoner(s) to another kiosk before deleting this one`,
      409
    );
  }

  const removed = await updateDb('kiosks.json', (rows) => {
    const idx = rows.findIndex((k) => k.kioskId === kiosk.kioskId);
    if (idx === -1) return { data: rows, result: null };
    const [gone] = rows.splice(idx, 1);
    return { data: rows, result: gone };
  });
  if (!removed) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);

  // Rows that only this kiosk owns go with it; everything historical (calls,
  // alerts, incidents) keeps its history and is unlinked by the foreign keys.
  await updateDb('rooms.json', (rooms) => ({
    data: rooms.filter((r) => r.kioskId !== removed.kioskId),
    result: null,
  }));
  await removeFromPrisonKiosks(removed.prisonId, removed.kioskId);
  return sendSuccess(res, { message: 'Kiosk deleted successfully', kioskId: removed.kioskId });
}));

// ==================== KIOSK SETUP PASSWORD ====================

router.get('/setup-password/:prisonId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId } = req.params;
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);

  // The setup password is stored bcrypt-hashed; never return the value itself.
  return sendSuccess(res, {
    prisonId: prison.prisonId,
    passwordSet: Boolean(prison.setupPassword),
    updatedAt: prison.updatedAt || null
  });
}));

// ==================== SETUP PASSWORD VALIDATION (public - for kiosk setup) ====================

router.post('/validate-setup-password', asyncRoute(async (req, res) => {
  const { password, prisonId } = req.body;
  if (!password || !prisonId) {
    return sendError(res, 'INVALID_REQUEST', 'password and prisonId are required', 400);
  }
  
  // Rate limiting — max 5 attempts per minute per IP+prisonId
  const rateKey = `${req.ip}:${prisonId}`;
  if (!checkRateLimit(rateKey, 5, 60000)) {
    return sendError(res, 'RATE_LIMITED', 'Too many attempts. Try again in 1 minute.', 429);
  }
  
  if (!isSetupPassword(password)) {
    return sendError(res, 'INVALID_PASSWORD', 'Password must be 8-64 characters and include letters and numbers', 400);
  }
  
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  
  if (!prison) {
    return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  }
  
  const valid = await verifySecret(password, prison.setupPassword);
  if (!valid) {
    return sendError(res, 'INVALID_CREDENTIALS', 'Invalid setup password', 401);
  }

  // Short-lived proof that this device knows the prison's setup password.
  // POST /kiosks/register requires it, so the password gate cannot be bypassed
  // by calling the register API directly. Bound to the prison it was validated
  // against; expires in 10 minutes.
  const setupToken = signAccessToken(
    { sub: 'device-setup', role: 'setup', prisonId: prison.prisonId },
    '10m'
  );

  return sendSuccess(res, {
    valid: true,
    success: true,
    prisonId: prison.prisonId,
    prisonName: prison.name,
    setupToken,
    message: 'Setup password validated successfully'
  });
}));

router.put('/setup-password', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId, password } = req.body;
  if (!prisonId || !password) return sendError(res, 'INVALID_REQUEST', 'prisonId and password are required', 400);

  const prison = (await readDb('prisons.json')).find((p) => p.prisonId === prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);

  if (!isSetupPassword(password)) {
    return sendError(res, 'INVALID_PASSWORD', 'Password must be 8-64 characters and include letters and numbers', 400);
  }
  
  const hashedPassword = await hashSecret(String(password));
  const updated = await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === prisonId);
    if (idx === -1) return { data: prisons, result: null };
    prisons[idx] = { 
      ...prisons[idx], 
      setupPassword: hashedPassword,
      updatedAt: new Date().toISOString()
    };
    return { data: prisons, result: prisons[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, { success: true });
}));

module.exports = router;
