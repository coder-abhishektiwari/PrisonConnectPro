const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { hashSecret, verifySecret, verifyToken } = require('../lib/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, inAdminScope, adminScopeFilter, inScopeOf, scopeList } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');
const { isDemoKiosk, wardLabel, buildWardIndex } = require('../lib/kioskView');

const router = express.Router();


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
const pinValidationAttempts = new Map();
function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  const record = pinValidationAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  pinValidationAttempts.set(key, record);
  return record.count <= maxAttempts;
}

// ==================== KIOSK VERIFICATION (public — pre-auth) ====================

router.post('/verify', asyncRoute(async (req, res) => {
  const { deviceSerialNumber } = req.body;
  if (!deviceSerialNumber) return sendError(res, 'INVALID_REQUEST', 'Device serial number is required', 400);

  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) =>
    k.deviceSerialNumber === deviceSerialNumber ||
    k.kioskId === deviceSerialNumber ||
    k.deviceFingerprint === deviceSerialNumber
  );
  if (!kiosk) return sendSuccess(res, { success: true, authorized: false, kiosk: null });

  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === kiosk.prisonId);

  const authorized = !!(
    prison && prison.status === 'active' &&
    kiosk.authorizationStatus === 'authorized' &&
    kiosk.status !== 'disabled' && kiosk.status !== 'unauthorized'
  );

  if (!authorized) return sendSuccess(res, { success: true, authorized: false, kiosk: null });

  return sendSuccess(res, {
    success: true,
    authorized: true,
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
  const kiosks = (await readDb('kiosks.json')).filter((k) => !isDemoKiosk(k));
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
    lastSeen: updated.lastSeen,
  });
}));

// ==================== KIOSK REGISTRATION (public — after PIN validation) ====================

router.post('/register', asyncRoute(async (req, res) => {
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
    assignedBlock: null,
    assignedCellArea: null,
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
  const scoped = kiosks.filter(adminScopeFilter(req)).filter((k) => !isDemoKiosk(k));
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
  const realKiosks = kiosks.filter((k) => !isDemoKiosk(k));
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

router.get('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const [kiosks, inmates, blocks] = await Promise.all([
    readDb('kiosks.json'),
    readDb('inmates.json'),
    readDb('blocks.json').catch(() => []),
  ]);
  const inScope = adminScopeFilter(req);
  const index = buildWardIndex({ inmates, blocks, inScope });

  const data = kiosks
    .filter((k) => inScope(k) && !isDemoKiosk(k))
    .map((k) => {
      const wards = index.wardsFor(k.kioskId);
      return {
        ...k,
        // Liveness is derived from the device's heartbeat, not the stored flag.
        status: kioskDisplayStatus(k),
        lastSeen: kioskLive(k).lastSeen,
        lastHeartbeatAt: k.lastHeartbeatAt || null,
        // Where the assigned prisoners actually live is the only truthful
        // source — a kiosk has no cell range of its own, and every device that
        // went through registration leaves assignedBlock null.
        ward: wards.length ? wards.join(', ') : null,
        wards,
        registeredInmates: index.countFor(k.kioskId),
      };
    });
  return sendSuccess(res, data);
}));

// Per-kiosk report: today / this month / all-time call counts, audio vs
// video split, registered prisoners and the latest calls from the device.
router.get('/:kioskId/stats', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const [kiosks, inmates, calls, blocks, prisons] = await Promise.all([
    readDb('kiosks.json'),
    readDb('inmates.json'),
    readDb('calls.json'),
    readDb('blocks.json').catch(() => []),
    readDb('prisons.json'),
  ]);
  const kiosk = kiosks.find((k) => k.kioskId === req.params.kioskId);
  if (!kiosk || isDemoKiosk(kiosk) || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Kiosk not found in your jail', 404);
  }

  const inScope = adminScopeFilter(req);
  const blockMap = new Map(blocks.map((b) => [b.blockId, b.name]));

  const registered = inmates.filter((i) => i.assignedKioskId === kiosk.kioskId && inScope(i));
  const wardSet = new Set();
  for (const i of registered) {
    const w = wardLabel(i, blockMap);
    if (w) wardSet.add(w);
  }
  const wards = [...wardSet];

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
    ward: wards.length ? wards.join(', ') : null,
    wards,
    registeredInmates: registered.length,
    today: finish(today),
    month: finish(month),
    allTime: finish(allTime),
    lastCallAt: lastCallAt ? new Date(lastCallAt).toISOString() : null,
    recentCalls,
  });
}));

router.get('/:kioskId', requireAuth, asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === req.params.kioskId && !isDemoKiosk(k) && inAdminScope(req, k));
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, kiosk);
}));
router.post('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kioskData = req.body;
  const jailId = jailScopeOf(req);
  if (jailId && kioskData.prisonId && kioskData.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a kiosk outside your jail', 403);
  }
  const newKiosk = {
    kioskId: `KIOSK-${uuidv4().substring(0, 8).toUpperCase()}`,
    ...kioskData,
    prisonId: jailId || kioskData.prisonId,
    status: kioskData.status || 'pending',
    authorizationStatus: kioskData.authorizationStatus || 'pending',
    createdAt: new Date().toISOString()
  };
  await updateDb('kiosks.json', (k) => ({ data: [...k, newKiosk], result: newKiosk }));
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
  const deleted = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
    if (idx === -1) return { data: kiosks, result: null };
    const [removed] = kiosks.splice(idx, 1);
    return { data: kiosks, result: removed };
  });
  if (!deleted) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, { message: 'Kiosk deleted successfully', kioskId: deleted.kioskId });
}));

// ==================== KIOSK SETUP PIN ====================

router.get('/setup-pin/:prisonId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId } = req.params;
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);

  // The setup PIN is stored bcrypt-hashed; never return the value itself.
  return sendSuccess(res, {
    prisonId: prison.prisonId,
    pinSet: Boolean(prison.setupPin),
    updatedAt: prison.updatedAt || null
  });
}));

// ==================== SETUP PIN VALIDATION (public - for kiosk setup) ====================

router.post('/validate-setup-pin', asyncRoute(async (req, res) => {
  const { pin, prisonId } = req.body;
  if (!pin || !prisonId) {
    return sendError(res, 'INVALID_REQUEST', 'pin and prisonId are required', 400);
  }
  
  // Rate limiting — max 5 attempts per minute per IP+prisonId
  const rateKey = `${req.ip}:${prisonId}`;
  if (!checkRateLimit(rateKey, 5, 60000)) {
    return sendError(res, 'RATE_LIMITED', 'Too many attempts. Try again in 1 minute.', 429);
  }
  
  // Validate PIN length (6 digits)
  if (!/^\d{6}$/.test(pin)) {
    return sendError(res, 'INVALID_PIN', 'PIN must be exactly 6 digits', 400);
  }
  
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  
  if (!prison) {
    return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  }
  
  const valid = await verifySecret(pin, prison.setupPin);
  if (!valid) {
    return sendError(res, 'INVALID_CREDENTIALS', 'Invalid setup PIN', 401);
  }
  
  return sendSuccess(res, {
    success: true,
    prisonId: prison.prisonId,
    prisonName: prison.name,
    message: 'Setup PIN validated successfully'
  });
}));

router.put('/setup-pin', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId, pin } = req.body;
  if (!prisonId || !pin) return sendError(res, 'INVALID_REQUEST', 'prisonId and pin are required', 400);

  const prison = (await readDb('prisons.json')).find((p) => p.prisonId === prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);

  // Validate PIN length (6 digits)
  if (!/^\d{6}$/.test(pin)) {
    return sendError(res, 'INVALID_PIN', 'PIN must be exactly 6 digits', 400);
  }
  
  const hashedPin = await hashSecret(String(pin));
  const updated = await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === prisonId);
    if (idx === -1) return { data: prisons, result: null };
    prisons[idx] = { 
      ...prisons[idx], 
      setupPin: hashedPin,
      updatedAt: new Date().toISOString()
    };
    return { data: prisons, result: prisons[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, { success: true });
}));

// ==================== PIN CHANGE REQUESTS ====================

router.post('/pin-change-request', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId, currentPin, newPin, reason } = req.body;
  if (!prisonId || !currentPin || !newPin) {
    return sendError(res, 'INVALID_REQUEST', 'prisonId, currentPin, and newPin are required', 400);
  }
  
  // Validate PIN length (6 digits)
  if (!/^\d{6}$/.test(newPin)) {
    return sendError(res, 'INVALID_PIN', 'PIN must be exactly 6 digits', 400);
  }

  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  if (!prison) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  if (!(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  
  const valid = await verifySecret(currentPin, prison.setupPin);
  if (!valid) {
    return sendError(res, 'INVALID_CREDENTIALS', 'Current PIN is incorrect', 401);
  }

  const hashedNewPin = await hashSecret(String(newPin));
  // Create PIN change request
  const changeRequest = {
    requestId: 'PIN-' + Date.now().toString(36).toUpperCase(),
    prisonId,
    requestedBy: req.auth.sub,
    requestedByRole: req.auth.role,
    newPinHash: hashedNewPin,
    reason: reason || 'Routine security update',
    status: 'pending',
    requestedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    reviewedByRole: null,
    comments: null
  };

  const updated = await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === prisonId);
    if (idx === -1) return { data: prisons, result: null };
    
    if (!prisons[idx].pinChangeRequests) {
      prisons[idx].pinChangeRequests = [];
    }
    prisons[idx].pinChangeRequests.push(changeRequest);
    return { data: prisons, result: prisons[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, changeRequest, 201);
}));

router.get('/pin-change-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId } = req.query;
  const prisons = await readDb('prisons.json');
  let requests = [];
  for (const prison of prisons) {
    if (prison.pinChangeRequests && prison.pinChangeRequests.length > 0) {
      // Scoped staff only see pin-change requests for prisons in their jail.
      if (!(await inScopeOf(req, prison))) continue;
      if (!prisonId || prison.prisonId === prisonId) {
        const prisonName = prison.name;
        requests.push(...prison.pinChangeRequests.map((req) => ({
          ...req,
          prisonName
        })));
      }
    }
  }

  // Sort by requestedAt descending (newest first)
  requests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  
  return sendSuccess(res, requests);
}));

router.put('/pin-change-request/:requestId/approve', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const { comments } = req.body;
  
  const allPrisons = await readDb('prisons.json');
  const owner = allPrisons.find((p) => p.pinChangeRequests && p.pinChangeRequests.some((r) => r.requestId === requestId));
  if (!owner || !(await inScopeOf(req, owner))) {
    return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  }
  let found = false;
  
  const updated = await updateDb('prisons.json', (prisons) => {
    for (const prison of prisons) {
      if (prison.pinChangeRequests) {
        const reqIdx = prison.pinChangeRequests.findIndex((r) => r.requestId === requestId);
        if (reqIdx !== -1) {
          const request = prison.pinChangeRequests[reqIdx];
          
          // Only approve if still pending
          if (request.status !== 'pending') {
            return { data: prisons, result: null };
          }
          
          // Update the PIN
          prison.setupPin = request.newPinHash;
          
          // Update request status
          prison.pinChangeRequests[reqIdx] = {
            ...request,
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.auth.sub,
            reviewedByRole: req.auth.role,
            comments: comments || 'Approved'
          };
          
          found = true;
          break;
        }
      }
    }
    return { data: prisons, result: prisons };
  });

  if (!found) return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  return sendSuccess(res, { success: true, message: 'PIN changed successfully' });
}));

router.put('/pin-change-request/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const { comments } = req.body;
  
  const allPrisons = await readDb('prisons.json');
  const owner = allPrisons.find((p) => p.pinChangeRequests && p.pinChangeRequests.some((r) => r.requestId === requestId));
  if (!owner || !(await inScopeOf(req, owner))) {
    return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  }
  let found = false;
  
  const updated = await updateDb('prisons.json', (prisons) => {
    for (const prison of prisons) {
      if (prison.pinChangeRequests) {
        const reqIdx = prison.pinChangeRequests.findIndex((r) => r.requestId === requestId);
        if (reqIdx !== -1) {
          const request = prison.pinChangeRequests[reqIdx];
          
          // Only reject if still pending
          if (request.status !== 'pending') {
            return { data: prisons, result: null };
          }
          
          // Update request status (don't change PIN)
          prison.pinChangeRequests[reqIdx] = {
            ...request,
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.auth.sub,
            reviewedByRole: req.auth.role,
            comments: comments || 'Rejected'
          };
          
          found = true;
          break;
        }
      }
    }
    return { data: prisons, result: prisons };
  });

  if (!found) return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  return sendSuccess(res, { success: true, message: 'PIN change request rejected' });
}));

module.exports = router;
