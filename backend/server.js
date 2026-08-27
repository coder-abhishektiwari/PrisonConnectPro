require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const { readDb, updateDb } = require('./lib/db');
const { signAccessToken, verifyToken, hashSecret, verifySecret } = require('./lib/auth');
const { createSession } = require('./lib/sessions');
const { getStatement, resolveInmate } = require('./lib/jail-account');
const { requireAuth, requireRole, requirePermission } = require('./middleware/auth');
const { sendSms } = require('./lib/sms');
const {
  maskedPhone,
  contactPhone,
  registerOrVerifyFingerprint,
  deviceRegisteredForCall,
  buildLinkSms,
  buildCallLink
} = require('./lib/familySecurity');
const { saveUploadedRecording } = require('./lib/recorder');

// Calls are pure 1-to-1 P2P WebRTC: media flows directly between the kiosk
// and the family browser. The dedicated signaling-server (Socket.IO) relays
// SDP offers/answers and ICE candidates; this backend only manages call
// state, authorization and recording metadata.

// Existing project routers â€” unchanged, still owned by their own files.
const { router: authRouter } = require('./auth-routes');
const { router: adminRouter } = require('./admin-routes');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
});

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// Large JSON limit: kiosk-side recordings are uploaded as base64 in the body
// of POST /recordings/upload (no multipart parser needed).
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '200mb' }));

// Handle malformed JSON errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Malformed JSON request body:', err.body);
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON payload sent in request body'
      },
      timestamp: Date.now()
    });
  }
  next();
});

// ==================== RESPONSE HELPERS ====================
function sendSuccess(res, data, statusCode = 200) {
  res.status(statusCode).json({ success: true, data, timestamp: Date.now() });
}
function sendError(res, code, message, statusCode = 400) {
  res.status(statusCode).json({ success: false, error: { code, message }, timestamp: Date.now() });
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch ?? base;
  if (patch && typeof patch === 'object' && base && typeof base === 'object') {
    const out = { ...base };
    for (const key of Object.keys(patch)) out[key] = deepMerge(base[key], patch[key]);
    return out;
  }
  return patch === undefined ? base : patch;
}

// ==================== JAIL SCOPING ====================
// Every managed entity (inmate, kiosk) belongs to exactly one jail (prisonId).
// A jail-scoped principal (admin / warden / kiosk staff) must only ever touch
// records of its own jail. super_admin without an explicit prisonId sees all.
function jailScopeOf(req) {
  return req.auth?.prisonId || req.auth?.jailId || null;
}
function inJailScope(req, record) {
  const jailId = jailScopeOf(req);
  if (!jailId) return true; // global principal (super admin with no jail)
  return !!record && (record.prisonId === jailId || record.facility === jailId || record.jailId === jailId);
}
function scopeFilter(req) {
  const jailId = jailScopeOf(req);
  return (x) => !jailId || x.prisonId === jailId || x.facility === jailId || x.jailId === jailId;
}

// ==================== KIOSK SCOPING (admin level) ====================
// A kiosk admin (has a kioskId claim) manages only the inmates/family members
// of THEIR OWN kiosk — not other kiosks, even within the same jail. Principals
// without a kioskId (super_admin, warden) fall back to jail/global scope.
function kioskScopeOf(req) {
  return req.auth?.kioskId || null;
}
function inKioskScope(req, record) {
  const kioskId = kioskScopeOf(req);
  if (!kioskId) return true; // not kiosk-bound → jail scope governs
  return !!record && (record.assignedKioskId === kioskId || record.kioskId === kioskId);
}
function inAdminScope(req, record) {
  return inJailScope(req, record) && inKioskScope(req, record);
}
function adminScopeFilter(req) {
  return (x) => inAdminScope(req, x);
}

// ==================== DOMAIN SCOPING (records that link to inmates/kiosks indirectly) ====================
// Collections like calls, wallets, contacts, recordings, statistics and transactions
// may not carry kioskId/prisonId directly. inScopeOf resolves the owner inmate (or
// the kiosk's jail when only kioskId is present) so a jailed/kiosk-bound principal
// sees only their own jail's / kiosk's records. Global principals (no kioskId/jailId) see all.
async function inScopeOf(req, record) {
  const kioskId = kioskScopeOf(req);
  const jailId = jailScopeOf(req);
  if (!kioskId && !jailId) return true; // global principal (super admin with no jail/kiosk)
  if (!record) return false;

  let recKiosk = record.kioskId || record.assignedKioskId || null;
  let recJail = record.prisonId || record.jailId || record.facility || null;
  let refInmateId = record.inmateId || null;

  if (record.walletId) {
    const wallets = await readDb('wallets.json');
    const wallet = wallets.find((w) => w.walletId === record.walletId);
    if (wallet) refInmateId = wallet.inmateId;
  }

  if (refInmateId) {
    const inmates = await readDb('inmates.json');
    const owner = inmates.find((i) => i.inmateId === refInmateId) ||
                  inmates.find((i) => i.inmateId === `INM-${refInmateId}`);
    if (owner) {
      recKiosk = recKiosk || owner.assignedKioskId || owner.kioskId;
      recJail = recJail || owner.prisonId;
    }
  }

  if (!recJail && recKiosk) {
    const kiosks = await readDb('kiosks.json');
    const k = kiosks.find((x) => x.kioskId === recKiosk);
    if (k) recJail = k.prisonId;
  }

  if (kioskId && recKiosk && recKiosk !== kioskId) return false;
  if (jailId && recJail && recJail !== jailId) return false;
  return true;
}

async function scopeList(req, records) {
  const out = [];
  for (const r of records) if (await inScopeOf(req, r)) out.push(r);
  return out;
}

// ==================== RATE LIMITING (brute force protection) ====================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } }
});

// ==================== EXISTING SUB-ROUTERS ====================
app.use('/auth', authRouter);

// ==================== CALL STATE MACHINE ====================
const CALL_STATES = ['scheduled', 'ringing', 'connecting', 'active', 'reconnecting', 'completed', 'failed', 'cancelled', 'rejected', 'missed'];
const TERMINAL_STATES = ['completed', 'failed', 'cancelled', 'rejected', 'missed'];
const ALLOWED_TRANSITIONS = {
  scheduled: ['ringing', 'cancelled'],
  ringing: ['connecting', 'missed', 'rejected', 'cancelled'],
  connecting: ['active', 'failed', 'cancelled'],
  active: ['reconnecting', 'completed', 'failed'],
  reconnecting: ['active', 'failed', 'completed'],
  completed: [], failed: [], cancelled: [], rejected: [], missed: []
};

const ROOM_MAX_PARTICIPANTS = parseInt(process.env.ROOM_MAX_PARTICIPANTS || '2', 10);

// ==================== SOCKET.IO â€” BUSINESS NOTIFICATIONS ====================
// WebRTC/media signaling intentionally lives in the dedicated signaling-server and
// media-server services. This socket only pushes business events (call state,
// alerts, monitoring) to staff dashboards. Joining rooms here is NOT used for media.

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    socket.data.auth = verifyToken(token);
    next();
  } catch (err) {
    next(new Error('INVALID_TOKEN'));
  }
});

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id} (peer=${socket.data.auth.sub} role=${socket.data.auth.role})`);
  socket.on('disconnect', () => {});
});

function broadcastEvent(event, data) {
  io.emit(event, data);
}

// --- realtime/recording control is delegated to the signaling server ---
const SIGNALING_URL = process.env.SIGNALING_URL || 'http://127.0.0.1:3002';
const MEDIA_API_KEY = process.env.MEDIA_API_KEY;
async function signaling(method, path, body) {
  if (!MEDIA_API_KEY) {
    const err = new Error('MEDIA_API_KEY is not configured');
    err.code = 'MEDIA_CONFIG';
    throw err;
  }
  const res = await fetch(SIGNALING_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': MEDIA_API_KEY },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || `signaling ${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.code = json.error?.code || 'SIGNALING_ERROR';
    throw err;
  }
  return json;
}

// ==================== KIOSK VERIFICATION (public â€” pre-auth) ====================

app.post('/kiosks/verify', asyncRoute(async (req, res) => {
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

// ==================== KIOSK REGISTRATION (public â€” after PIN validation) ====================

app.post('/kiosks/register', asyncRoute(async (req, res) => {
  const { 
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
  
  // Check if kiosk already exists
  const existingKiosk = kiosks.find((k) => k.deviceSerialNumber === deviceSerialNumber);
  if (existingKiosk) {
    // Re-registering a previously rejected/disabled device queues a fresh approval
    const needsReapproval =
      existingKiosk.authorizationStatus !== 'authorized' ||
      existingKiosk.status === 'disabled' ||
      existingKiosk.status === 'unauthorized';
    // Update existing kiosk
    const updated = await updateDb('kiosks.json', (kiosks) => {
      const idx = kiosks.findIndex((k) => k.deviceSerialNumber === deviceSerialNumber);
      if (idx === -1) return { data: kiosks, result: null };
      
      kiosks[idx] = {
        ...kiosks[idx],
        ...(needsReapproval
          ? { status: 'pending', authorizationStatus: 'pending', reviewedBy: null, reviewedAt: null }
          : {}),
        ipAddress: ipAddress || kiosks[idx].ipAddress,
        location: location || kiosks[idx].location,
        firmwareVersion: appVersion || kiosks[idx].firmwareVersion,
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
    kioskId: `KIOSK-${Date.now().toString(36).toUpperCase()}`,
    deviceSerialNumber,
    prisonId,
    prisonName: prison.name,
    status: 'pending',
    authorizationStatus: 'pending',
    location: location || 'Unknown',
    ipAddress: ipAddress || 'Unknown',
    firmwareVersion: appVersion || 'Unknown',
    lastSeen: new Date().toISOString(),
    hardware: {
      model: deviceModel || 'Unknown',
      manufacturer: deviceBrand || 'Unknown',
      serialNumber: deviceSerialNumber,
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
    deviceFingerprint: deviceFingerprint || 'Unknown',
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

// ==================== AUTH (real credential checks + JWT) ====================

app.post('/auth/login', authLimiter, asyncRoute(async (req, res) => {
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
    const admin = admins.find((a) => a.email === email);
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
app.post('/auth/warden/login', authLimiter, asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return sendError(res, 'INVALID_REQUEST', 'email and password are required', 400);

  const wardens = await readDb('wardens.json');
  const warden = wardens.find((w) => w.email === email);
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
app.post('/auth/register', authLimiter, asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return sendError(res, 'INVALID_REQUEST', 'name, email and password are required', 400);

  const wardens = await readDb('wardens.json');
  const existing = wardens.find((w) => w.email === email);
  if (existing) return sendError(res, 'DUPLICATE', 'A warden with this email already exists', 409);

  const newWarden = {
    wardenId: 'WARDEN-' + Date.now().toString(36).toUpperCase(),
    name: name.trim(),
    email: email.trim(),
    password: await hashSecret(String(password)),
    role: 'warden',
    permissions: ['view_calls'],
    status: 'active',
    prisonId: null,
    createdAt: new Date().toISOString()
  };

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
app.get('/auth/me', requireAuth, asyncRoute(async (req, res) => {
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

  if (role === 'admin' || role === 'super_admin' || role === 'super-admin') {
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
app.post('/auth/change-password', requireAuth, authLimiter, asyncRoute(async (req, res) => {
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
  } else if (role === 'admin' || role === 'super_admin') {
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

  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.assignedKioskId === kioskId && matchFn(i));
  if (!inmate) return sendError(res, 'NOT_FOUND', 'No matching inmate identified for this kiosk', 404);

  return sendSuccess(res, {
    inmateId: inmate.inmateId,
    firstName: inmate.firstName,
    lastName: inmate.lastName,
    prisonId: inmate.prisonId,
    facility: inmate.prisonId,
    cellBlock: inmate.cellBlock,
    status: inmate.status,
    photoUrl: inmate.photo,
    securityLevel: inmate.securityLevel,
    sentenceDetails: inmate.sentenceDetails,
    confidence
  });
}

// Real face recognition endpoint using Human embeddings
app.post('/auth/face-identify', authLimiter, asyncRoute(async (req, res) => {
  const { kioskId } = req.body;
  if (!kioskId) return sendError(res, 'INVALID_REQUEST', 'kioskId is required', 400);

  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.assignedKioskId === kioskId && i.biometricData?.faceRegistered);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'No face-registered inmate found for this kiosk', 404);

  // Expect image as base64 data URL or raw base64
  let imageBase64 = req.body.image;
  if (!imageBase64) return sendError(res, 'INVALID_REQUEST', 'image (base64) is required', 400);

  // Strip data URL prefix if present
  if (imageBase64.startsWith('data:image')) {
    imageBase64 = imageBase64.split(',')[1];
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');
  if (imageBuffer.length === 0) return sendError(res, 'INVALID_IMAGE', 'Empty image data', 400);

  try {
    const { detectAndEmbed, cosineSimilarity, isLive } = require('../lib/faceRecognition');
    const probeResult = await detectAndEmbed(imageBuffer);
    const storedEmbedding = inmate.biometricData.faceEmbedding;

    if (!storedEmbedding || !Array.isArray(storedEmbedding)) {
      return sendError(res, 'NO_EMBEDDING', 'Inmate has no stored face embedding', 404);
    }

    // Liveness check - reject spoofed faces
    const livenessThreshold = parseFloat(process.env.FACE_LIVENESS_THRESHOLD || '0.5');
    if (!isLive(probeResult.liveness, probeResult.antispoof, livenessThreshold)) {
      return sendError(res, 'LIVENESS_FAILED', 'Liveness check failed - possible spoof attempt', 403);
    }

    const similarity = cosineSimilarity(probeResult.embedding, storedEmbedding);
    const threshold = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.5');
    const matched = similarity >= threshold;

    return sendSuccess(res, {
      inmateId: inmate.inmateId,
      firstName: inmate.firstName,
      lastName: inmate.lastName,
      prisonId: inmate.prisonId,
      facility: inmate.prisonId,
      cellBlock: inmate.cellBlock,
      status: inmate.status,
      photoUrl: inmate.photo,
      securityLevel: inmate.securityLevel,
      sentenceDetails: inmate.sentenceDetails,
      confidence: matched ? similarity : 0,
      matched,
      similarity,
      liveness: probeResult.liveness,
      antispoof: probeResult.antispoof
    });
  } catch (err) {
    if (err.message === 'NO_FACE_DETECTED') return sendError(res, 'NO_FACE', 'No face detected in image', 400);
    if (err.message === 'MULTIPLE_FACES_DETECTED') return sendError(res, 'MULTIPLE_FACES', 'Multiple faces detected in image', 400);
    console.error('[face-identify] error:', err.message);
    return sendError(res, 'FACE_RECOGNITION_ERROR', 'Face recognition failed', 500);
  }
}));

// Face embedding registration endpoint
app.post('/auth/face-register', requireAuth, asyncRoute(async (req, res) => {
  const { inmateId, kioskId } = req.body;
  if (!inmateId || !kioskId) return sendError(res, 'INVALID_REQUEST', 'inmateId and kioskId are required', 400);

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const inmate = inmates.find((i) => i.inmateId === inmateId);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);

  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (kiosk && kiosk.prisonId && inmate.prisonId && kiosk.prisonId !== inmate.prisonId) {
    return sendError(res, 'KIOSK_MISMATCH', 'Inmate is not assigned to this prison', 403);
  }
  if (!kiosk && inmate.assignedKioskId && inmate.assignedKioskId !== kioskId) {
    return sendError(res, 'KIOSK_MISMATCH', 'Inmate not assigned to this kiosk', 403);
  }

  let imageBase64 = req.body.image;
  if (!imageBase64) return sendError(res, 'INVALID_REQUEST', 'image (base64) is required', 400);
  if (imageBase64.startsWith('data:image')) imageBase64 = imageBase64.split(',')[1];

  const imageBuffer = Buffer.from(imageBase64, 'base64');
  if (imageBuffer.length === 0) return sendError(res, 'INVALID_IMAGE', 'Empty image data', 400);

  try {
    const { detectAndEmbed, isLive } = require('../lib/faceRecognition');
    const probeResult = await detectAndEmbed(imageBuffer);

    // Liveness check during registration - reject spoofed faces
    const livenessThreshold = parseFloat(process.env.FACE_LIVENESS_THRESHOLD || '0.5');
    if (!isLive(probeResult.liveness, probeResult.antispoof, livenessThreshold)) {
      return sendError(res, 'LIVENESS_FAILED', 'Liveness check failed - possible spoof attempt', 403);
    }

    const updated = await updateDb('inmates.json', (all) => {
      const idx = all.findIndex((i) => i.inmateId === inmateId);
      if (idx === -1) return { data: all, result: null };
      all[idx].biometricData = {
        ...all[idx].biometricData,
        faceRegistered: true,
        faceEmbedding: probeResult.embedding,
        faceLiveness: probeResult.liveness,
        faceAntispoof: probeResult.antispoof,
        lastBiometricUpdate: new Date().toISOString()
      };
      return { data: all, result: all[idx] };
    });

    return sendSuccess(res, {
      inmateId: updated.inmateId,
      faceRegistered: true,
      message: 'Face registered successfully'
    });
  } catch (err) {
    if (err.message === 'NO_FACE_DETECTED') return sendError(res, 'NO_FACE', 'No face detected in image', 400);
    if (err.message === 'MULTIPLE_FACES_DETECTED') return sendError(res, 'MULTIPLE_FACES', 'Multiple faces detected in image', 400);
    console.error('[face-register] error:', err.message);
    return sendError(res, 'FACE_REGISTRATION_ERROR', 'Face registration failed', 500);
  }
}));

app.post('/auth/fingerprint-identify', asyncRoute((req, res) =>
  identifyInmate(req, res, (i) => i.biometricData?.fingerprintRegistered, 0.92)));

app.post('/auth/rfid-identify', asyncRoute(async (req, res) => {
  const { kioskId, rfidToken } = req.body;
  if (!kioskId || !rfidToken) return sendError(res, 'INVALID_REQUEST', 'kioskId and rfidToken are required', 400);

  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.assignedKioskId === kioskId && i.rfidToken === rfidToken);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'No inmate identified for this RFID token', 404);

  return sendSuccess(res, {
    inmateId: inmate.inmateId, firstName: inmate.firstName, lastName: inmate.lastName,
    prisonId: inmate.prisonId, facility: inmate.prisonId, cellBlock: inmate.cellBlock,
    status: inmate.status, photoUrl: inmate.photo, securityLevel: inmate.securityLevel,
    sentenceDetails: inmate.sentenceDetails, rfidToken, confidence: 0.98
  });
}));

app.post('/auth/prisoner/identify', asyncRoute(async (req, res) => {
  const prisonerId = req.query.prisonerId || req.body.prisonerId;
  const kioskId = req.query.kioskId || req.body.kioskId;

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const inmate = inmates.find((i) => i.inmateId === prisonerId);
  if (!inmate) return sendError(res, 'PRISONER_NOT_FOUND', 'Prisoner ID not found', 404);

  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (kiosk && kiosk.prisonId && inmate.prisonId && kiosk.prisonId !== inmate.prisonId) {
    return sendError(res, 'KIOSK_MISMATCH', 'Inmate is not assigned to this prison', 403);
  }
  if (!kiosk && inmate.assignedKioskId && inmate.assignedKioskId !== kioskId) {
    return sendError(res, 'KIOSK_MISMATCH', 'Inmate not assigned to this kiosk', 403);
  }

  return sendSuccess(res, {
    inmateId: inmate.inmateId, firstName: inmate.firstName, lastName: inmate.lastName,
    prisonId: inmate.prisonId, facility: inmate.facility, cellBlock: inmate.cellBlock,
    status: inmate.status, photoUrl: inmate.photoUrl, securityLevel: inmate.securityLevel,
    sentenceDetails: inmate.sentenceDetails, confidence: 1.0
  });
}));

app.post('/auth/verify-pin', authLimiter, asyncRoute(async (req, res) => {
  const { inmateId, pin, kioskId } = req.body;
  if (!inmateId || !pin) return sendError(res, 'INVALID_REQUEST', 'inmateId and pin are required', 400);

  const [inmates, kiosks] = await Promise.all([readDb('inmates.json'), readDb('kiosks.json')]);
  const inmate = inmates.find((i) => i.inmateId === inmateId);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);

  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (kiosk && kiosk.prisonId && inmate.prisonId && kiosk.prisonId !== inmate.prisonId) {
    return sendError(res, 'KIOSK_MISMATCH', 'Inmate is not assigned to this prison', 403);
  }
  if (!kiosk && inmate.assignedKioskId && inmate.assignedKioskId !== kioskId) {
    return sendError(res, 'KIOSK_MISMATCH', 'Inmate not assigned to this kiosk', 403);
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

// ==================== INMATE ROUTES ====================

app.get('/inmates', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const inmates = await readDb('inmates.json');
  return sendSuccess(res, inmates.filter(adminScopeFilter(req)));
}));

app.get('/inmate/profile/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const role = String(req.auth?.role || '').toLowerCase().replace(/[-_]/g, '');

  // Inmates can only access their own profile
  if (role === 'inmate' && req.auth.inmateId !== id) {
    return sendError(res, 'FORBIDDEN', 'Inmates can only view their own profile', 403);
  }

  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => (i.inmateId === id || i.assignedKioskId === id || i.prisonerNumber === id) && inAdminScope(req, i));
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  return sendSuccess(res, inmate);
}));

app.get('/inmates/:inmateId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === req.params.inmateId && inAdminScope(req, i));
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  return sendSuccess(res, inmate);
}));

app.post('/inmates', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const inmateData = req.body;
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && inmateData.prisonId && inmateData.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create an inmate outside your jail', 403);
  }
  if (kioskId && inmateData.assignedKioskId && inmateData.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create an inmate for another kiosk', 403);
  }
  try {
    const newInmate = await updateDb('inmates.json', async (inmates) => {
      if (inmates.find((i) => i.inmateId === inmateData.inmateId) ||
          (inmateData.prisonerNumber && inmates.find((i) => i.prisonerNumber === inmateData.prisonerNumber))) {
        const err = new Error('Inmate with this ID or prisoner number already exists');
        err.code = 'DUPLICATE';
        throw err;
      }
      const record = {
        ...inmateData,
        inmateId: inmateData.inmateId || `INM-${uuidv4().substring(0, 8).toUpperCase()}`,
        prisonId: jailId || inmateData.prisonId || inmateData.facility,
        facility: jailId || inmateData.facility || inmateData.prisonId,
        assignedKioskId: kioskId || inmateData.assignedKioskId,
        status: inmateData.status || 'active',
        pin: inmateData.pin ? await hashSecret(String(inmateData.pin)) : await hashSecret(uuidv4().substring(0, 8)),
        biometricData: inmateData.biometricData || {
          faceRegistered: false,
          faceEmbedding: null,
          fingerprintRegistered: false,
          rfidRegistered: false,
          lastBiometricUpdate: null
        },
        createdAt: new Date().toISOString()
      };
      return { data: [...inmates, record], result: record };
    });
    return sendSuccess(res, newInmate, 201);
  } catch (err) {
    if (err.code === 'DUPLICATE') return sendError(res, 'DUPLICATE', err.message, 409);
    throw err;
  }
}));

const INMATE_IMMUTABLE_FIELDS = ['inmateId', 'createdAt'];

app.patch('/inmates/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { inmateId } = req.params;
  const updates = { ...req.body };
  INMATE_IMMUTABLE_FIELDS.forEach((f) => delete updates[f]);
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && updates.prisonId && updates.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot move an inmate to another jail', 403);
  }
  if (kioskId && updates.assignedKioskId && updates.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot reassign an inmate to another kiosk', 403);
  }
  delete updates.prisonId;
  delete updates.facility;
  delete updates.assignedKioskId;

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === inmateId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updates };
    return { data: inmates, result: inmates[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  return sendSuccess(res, updated);
}));

app.delete('/inmates/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { inmateId } = req.params;
  const deleted = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === inmateId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    const [removed] = inmates.splice(idx, 1);
    return { data: inmates, result: removed };
  });

  if (!deleted) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  return sendSuccess(res, { message: 'Inmate deleted successfully', inmateId: deleted.inmateId });
}));

// ==================== ANDROID COMPATIBILITY: PRISONER MANAGEMENT ALIASES ====================
// These routes match what the Android app expects while keeping existing /inmates routes

app.get('/admin/prisoners', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Admin scope: only the admin's own kiosk's prisoners (or whole jail for non-kiosk principals).
  const inmates = await readDb('inmates.json');
  return sendSuccess(res, inmates.filter(adminScopeFilter(req)));
}));

app.get('/admin/prisoners/:prisonerId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Alias for GET /inmates/:inmateId
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i));
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Prisoner not found', 404);
  return sendSuccess(res, inmate);
}));

app.post('/admin/prisoners', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Alias for POST /inmates - create new prisoner (locked to the admin's kiosk/jail)
  const inmateData = req.body;
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && inmateData.prisonId && inmateData.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a prisoner outside your jail', 403);
  }
  if (kioskId && inmateData.assignedKioskId && inmateData.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a prisoner for another kiosk', 403);
  }
  try {
    const newInmate = await updateDb('inmates.json', async (inmates) => {
      if (inmates.find((i) => i.inmateId === inmateData.inmateId) ||
          (inmateData.prisonerNumber && inmates.find((i) => i.prisonerNumber === inmateData.prisonerNumber))) {
        const err = new Error('Prisoner with this ID or prisoner number already exists');
        err.code = 'DUPLICATE';
        throw err;
      }
      const record = {
        ...inmateData,
        inmateId: inmateData.inmateId || `INM-${uuidv4().substring(0, 8).toUpperCase()}`,
        prisonId: jailId || inmateData.prisonId || inmateData.facility,
        facility: jailId || inmateData.facility || inmateData.prisonId,
        assignedKioskId: kioskId || inmateData.assignedKioskId,
        status: inmateData.status || 'active',
        pin: inmateData.pin ? await hashSecret(String(inmateData.pin)) : await hashSecret(uuidv4().substring(0, 8)),
        biometricData: inmateData.biometricData || {
          faceRegistered: false,
          faceEmbedding: null,
          fingerprintRegistered: false,
          rfidRegistered: false,
          lastBiometricUpdate: null
        },
        createdAt: new Date().toISOString()
      };
      return { data: [...inmates, record], result: record };
    });
    return sendSuccess(res, newInmate, 201);
  } catch (err) {
    if (err.code === 'DUPLICATE') return sendError(res, 'DUPLICATE', err.message, 409);
    throw err;
  }
}));

app.put('/admin/prisoners/:prisonerId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Alias for PATCH /inmates/:inmateId - full update (kiosk-scoped)
  const { prisonerId } = req.params;
  const updates = { ...req.body };
  INMATE_IMMUTABLE_FIELDS.forEach((f) => delete updates[f]);
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && updates.prisonId && updates.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot move a prisoner to another jail', 403);
  }
  if (kioskId && updates.assignedKioskId && updates.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot reassign a prisoner to another kiosk', 403);
  }
  delete updates.prisonId;
  delete updates.facility;
  delete updates.assignedKioskId;

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updates };
    return { data: inmates, result: inmates[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);
  return sendSuccess(res, updated);
}));

app.patch('/admin/prisoners/:prisonerId/status', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Android-specific route for updating prisoner status (kiosk-scoped)
  const { prisonerId } = req.params;
  const { status } = req.body;
  
  if (!status) return sendError(res, 'INVALID_REQUEST', 'status is required', 400);
  const allowedStatuses = ['active', 'inactive', 'suspended', 'released', 'transferred'];
  if (!allowedStatuses.includes(status)) {
    return sendError(res, 'INVALID_STATUS', `Status must be one of: ${allowedStatuses.join(', ')}`, 400);
  }

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], status };
    return { data: inmates, result: inmates[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);
  return sendSuccess(res, updated);
}));

app.get('/inmate/balance/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  // The balance belongs to an inmate; enforce jail/kiosk scope before returning it.
  const inmate = await resolveInmate(id);
  if (!inmate || !(await inScopeOf(req, inmate))) return sendError(res, 'NOT_FOUND', 'No inmate or wallet found', 404);
  // Single source of truth: the wallet statement (ledger-derived balance + totals).
  const statement = await getStatement(id);
  if (!statement) return sendError(res, 'NOT_FOUND', 'No inmate or wallet found', 404);
  const { wallet } = statement;
  return sendSuccess(res, {
    balance: wallet.balance,
    currency: wallet.currency,
    totalSpent: wallet.totalSpent,
    lastRecharge: wallet.lastRecharge,
    lastRechargeAmount: wallet.lastRechargeAmount,
    remainingMinutes: wallet.remainingMinutes
  });
}));

// Wallet statement (balance + deductions) for the kiosk wallet screen.
// Resolves the inmate via the jail-account layer and returns the live balance
// with the transaction/deduction history.
app.get('/inmate/wallet/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  // The wallet belongs to an inmate; enforce jail/kiosk scope before returning it.
  const inmate = await resolveInmate(id);
  if (!inmate || !(await inScopeOf(req, inmate))) return sendError(res, 'NOT_FOUND', 'Inmate wallet not found', 404);
  const statement = await getStatement(id);
  if (!statement) return sendError(res, 'NOT_FOUND', 'Inmate wallet not found', 404);
  return sendSuccess(res, statement);
}));

// ==================== WALLET ROUTES ====================

app.get('/wallets', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('wallets.json')))));

app.get('/wallets/:inmateId', requireAuth, asyncRoute(async (req, res) => {
  const wallets = await readDb('wallets.json');
  const wallet = wallets.find((w) => w.inmateId === req.params.inmateId);
  if (!wallet || !(await inScopeOf(req, wallet))) return sendError(res, 'NOT_FOUND', 'Wallet not found', 404);
  return sendSuccess(res, wallet);
}));

// ==================== CONTACT ROUTES ====================

app.get('/contacts', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('contacts.json')))));

// Clear all registered family-device fingerprints for a contact. The NEXT
// call to this contact registers whatever device opens the link — use when a
// family member changed phone/browser and verification now fails with
// DEVICE_MISMATCH / "device not verified".
app.delete('/contacts/:contactId/devices', requireAuth, asyncRoute(async (req, res) => {
  const { contactId } = req.params;
  const contacts = await readDb('contacts.json');
  const contact = contacts.find((c) => c.contactId === contactId);
  if (!contact || !(await inAdminScope(req, contact))) {
    return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
  }
  // NOTE: updateDb resolves to the MUTATOR's inner `result` directly
  // (db.js does `return result`, not `{data, result}`).
  const cleared = await updateDb('contacts.json', (all) => {
    const idx = all.findIndex((c) => c.contactId === contactId);
    if (idx === -1) return { data: all, result: null };
    const removed = Array.isArray(all[idx].deviceFingerprints) ? all[idx].deviceFingerprints.length : 0;
    all[idx].deviceFingerprints = [];
    return { data: all, result: { contactId, removedDevices: removed, clearedAt: new Date().toISOString() } };
  });
  if (!cleared) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
  broadcastEvent('contact-devices-cleared', cleared);
  return sendSuccess(res, cleared);
}));

// Single route (was two colliding '/contacts/:param' routes â€” the second
// could never match). Tries contactId first, falls back to kiosk-scoped list.
app.get('/contacts/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const contacts = await readDb('contacts.json');

  const contact = contacts.find((c) => c.contactId === id);
  if (contact) {
    if (!(await inScopeOf(req, contact))) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    return sendSuccess(res, contact);
  }

  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === id) ||
                 inmates.find((i) => i.assignedKioskId === id) ||
                 inmates.find((i) => i.prisonerNumber === id);
  if (inmate && !(await inScopeOf(req, inmate))) {
    return sendError(res, 'NOT_FOUND', 'Inmate not found in your kiosk/jail', 404);
  }
  const scoped = inmate ? contacts.filter((c) => (c.inmateId === inmate.inmateId || c.inmateId === `INM-${inmate.inmateId}`) && c.active !== false) : [];
  return sendSuccess(res, scoped);
}));

// ==================== ANDROID COMPATIBILITY: PRISONER-SPECIFIC CONTACTS ====================

app.get('/admin/prisoners/:prisonerId/contacts', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonerId } = req.params;
  const inmates = await readDb('inmates.json');
  if (!inmates.find((i) => i.inmateId === prisonerId && inAdminScope(req, i))) {
    return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);
  }
  const contacts = await readDb('contacts.json');
  const scoped = contacts.filter((c) => c.inmateId === prisonerId);
  return sendSuccess(res, scoped);
}));

app.post('/admin/prisoners/:prisonerId/contacts', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonerId } = req.params;
  const contactData = req.body;

  // Verify prisoner exists in the admin's scope
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === prisonerId && inAdminScope(req, i));
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);

  const newContact = {
    contactId: contactData.contactId || `CONT-${uuidv4().substring(0, 8).toUpperCase()}`,
    inmateId: prisonerId,
    name: contactData.name,
    fullName: contactData.name,
    firstName: contactData.firstName || contactData.name?.split(' ')[0] || '',
    lastName: contactData.lastName || contactData.name?.split(' ').slice(1).join(' ') || '',
    mobileNumber: contactData.mobileNumber,
    phoneNumber: contactData.mobileNumber || contactData.phone,
    phone: contactData.phone || contactData.mobileNumber,
    relationship: contactData.relationship || 'family',
    email: contactData.email,
    active: true,
    status: contactData.status || 'active',
    verified: contactData.verified !== undefined ? contactData.verified : true,
    approvalStatus: 'approved',
    verificationStatus: 'verified',
    createdAt: new Date().toISOString()
  };

  await updateDb('contacts.json', (contacts) => ({ data: [...contacts, newContact], result: newContact }));
  return sendSuccess(res, newContact, 201);
}));

app.put('/admin/contacts/:contactId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { contactId } = req.params;
  const updates = req.body;

  const [contacts, inmates] = await Promise.all([readDb('contacts.json'), readDb('inmates.json')]);
  const target = contacts.find((c) => c.contactId === contactId);
  if (!target) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
  // Contact belongs to the jail of its inmate; scope the update to the admin's kiosk/jail.
  const owner = inmates.find((i) => i.inmateId === target.inmateId && inAdminScope(req, i));
  if (!owner) return sendError(res, 'NOT_FOUND', 'Contact not found in your kiosk', 404);

  const updated = await updateDb('contacts.json', (all) => {
    const idx = all.findIndex((c) => c.contactId === contactId);
    if (idx === -1) return { data: all, result: null };
    const merged = { ...all[idx], ...updates };
    if (updates.name) { merged.fullName = updates.name; merged.firstName = updates.name.split(' ')[0]; merged.lastName = updates.name.split(' ').slice(1).join(' '); }
    if (updates.mobileNumber) { merged.phoneNumber = updates.mobileNumber; merged.phone = updates.mobileNumber; }
    all[idx] = merged;
    return { data: all, result: all[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
  return sendSuccess(res, updated.result);
}));

app.patch('/admin/contacts/:contactId/status', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { contactId } = req.params;
  let { status, active } = req.body;

  // Android sends { active: true/false }, backend uses { status: "active"/"inactive" }
  if (active !== undefined && !status) {
    status = active ? 'active' : 'inactive';
  }

  if (!status) return sendError(res, 'INVALID_REQUEST', 'status or active is required', 400);
  const allowedStatuses = ['active', 'inactive', 'suspended', 'blocked'];
  if (!allowedStatuses.includes(status)) {
    return sendError(res, 'INVALID_STATUS', `Status must be one of: ${allowedStatuses.join(', ')}`, 400);
  }

  const [contacts, inmates] = await Promise.all([readDb('contacts.json'), readDb('inmates.json')]);
  const target = contacts.find((c) => c.contactId === contactId);
  if (!target) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
  const owner = inmates.find((i) => i.inmateId === target.inmateId && inAdminScope(req, i));
  if (!owner) return sendError(res, 'NOT_FOUND', 'Contact not found in your kiosk', 404);

  const updated = await updateDb('contacts.json', (all) => {
    const idx = all.findIndex((c) => c.contactId === contactId);
    if (idx === -1) return { data: all, result: null };
    all[idx] = { ...all[idx], status, active: status === 'active' || status === 'suspended' };
    return { data: all, result: all[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
  return sendSuccess(res, updated.result);
}));

app.delete('/admin/contacts/:contactId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { contactId } = req.params;
  const [contacts, inmates] = await Promise.all([readDb('contacts.json'), readDb('inmates.json')]);
  const target = contacts.find((c) => c.contactId === contactId);
  if (!target) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
  const owner = inmates.find((i) => i.inmateId === target.inmateId && inAdminScope(req, i));
  if (!owner) return sendError(res, 'NOT_FOUND', 'Contact not found in your kiosk', 404);

  const deleted = await updateDb('contacts.json', (all) => {
    const filtered = all.filter((c) => c.contactId !== contactId);
    return { data: filtered, result: { deleted: true, contactId } };
  });
  return sendSuccess(res, deleted.result);
}));

// ==================== CALL ROUTES ====================

app.get('/calls', requireAuth, asyncRoute(async (req, res) => {
  let calls = await readDb('calls.json');
  // Warden-scoped: wardens only see calls for their assigned prison(s)
  if (req.auth.role === 'warden') {
    const wardens = await readDb('wardens.json');
    const warden = wardens.find((w) => w.wardenId === req.auth.sub);
    if (!warden) return sendError(res, 'NOT_FOUND', 'Warden profile not found', 404);
    const prisons = await readDb('prisons.json');
    const prisonIds = prisons
      .filter((p) => p.wardenId === warden.wardenId || p.prisonId === warden.prisonId)
      .map((p) => p.prisonId);
    const inmates = await readDb('inmates.json');
    const inmateIds = inmates.filter((i) => prisonIds.includes(i.prisonId)).map((i) => i.inmateId);
    calls = calls.filter((c) => inmateIds.includes(c.inmateId));
  } else {
    // Admin/kiosk-level: calls carry kioskId/prisonId/inmateId, so inAdminScope
    // restricts a kiosk admin to their own kiosk's calls and a jail admin to
    // their prison's calls. Global super admins (no kiosk/jail claim) see all.
    calls = calls.filter((c) => inAdminScope(req, c));
  }
  return sendSuccess(res, calls);
}));

app.get('/calls/active', requireAuth, asyncRoute(async (req, res) => {
  let calls = await readDb('calls.json');
  if (req.auth.role === 'warden') {
    const wardens = await readDb('wardens.json');
    const warden = wardens.find((w) => w.wardenId === req.auth.sub);
    if (!warden) return sendError(res, 'NOT_FOUND', 'Warden profile not found', 404);
    const prisons = await readDb('prisons.json');
    const prisonIds = prisons
      .filter((p) => p.wardenId === warden.wardenId || p.prisonId === warden.prisonId)
      .map((p) => p.prisonId);
    const inmates = await readDb('inmates.json');
    const inmateIds = inmates.filter((i) => prisonIds.includes(i.prisonId)).map((i) => i.inmateId);
    calls = calls.filter((c) => inmateIds.includes(c.inmateId));
  } else {
    calls = calls.filter((c) => inAdminScope(req, c));
  }
  return sendSuccess(res, calls.filter((c) => c.status === 'active'));
}));

app.get('/calls/history', requireAuth, asyncRoute(async (req, res) => {
  let calls = await readDb('calls.json');
  if (req.auth.role === 'warden') {
    const wardens = await readDb('wardens.json');
    const warden = wardens.find((w) => w.wardenId === req.auth.sub);
    if (!warden) return sendError(res, 'NOT_FOUND', 'Warden profile not found', 404);
    const prisons = await readDb('prisons.json');
    const prisonIds = prisons
      .filter((p) => p.wardenId === warden.wardenId || p.prisonId === warden.prisonId)
      .map((p) => p.prisonId);
    const inmates = await readDb('inmates.json');
    const inmateIds = inmates.filter((i) => prisonIds.includes(i.prisonId)).map((i) => i.inmateId);
    calls = calls.filter((c) => inmateIds.includes(c.inmateId));
  } else {
    calls = calls.filter((c) => inAdminScope(req, c));
  }
  return sendSuccess(res, calls.filter((c) => TERMINAL_STATES.includes(c.status)));
}));

app.get('/calls/:callId', requireAuth, asyncRoute(async (req, res) => {
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.callId === req.params.callId);
  if (!call) return sendError(res, 'NOT_FOUND', 'Call not found', 404);
  // Wardens, jail admins and kiosk admins can only view calls within their scope.
  if (!inAdminScope(req, call)) {
    return sendError(res, 'NOT_FOUND', 'Call not found', 404);
  }
  return sendSuccess(res, call);
}));

app.post('/calls', requireAuth, asyncRoute(async (req, res) => {
  const callData = (req.body && typeof req.body === 'object') ? req.body : {};
  if (!callData.inmateId || !callData.contactId || !callData.kioskId) {
    return sendError(res, 'INVALID_REQUEST', 'inmateId, contactId and kioskId are required', 400);
  }

  const [inmates, contacts, kiosks, existingCalls, scheduleDocs] = await Promise.all([
    readDb('inmates.json'), readDb('contacts.json'), readDb('kiosks.json'), readDb('calls.json'), readDb('schedule.json')
  ]);
  // Scheduled call: reuse the link token that was already texted to the
  // family at booking time — no duplicate link SMS, no new link.
  const bookedSchedule = callData.scheduleId
    ? scheduleDocs.find((s) => s.scheduleId === callData.scheduleId && s.inmateId === callData.inmateId)
    : null;
  const scheduledLinkToken = bookedSchedule?.linkToken || null;

  const inmate = inmates.find((i) => i.inmateId === callData.inmateId);
  if (!inmate) return sendError(res, 'INVALID_REFERENCE', 'inmateId does not exist', 422);
  // A kiosk-bound admin can only create calls for their own kiosk's inmates.
  if (!inAdminScope(req, inmate)) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a call for an inmate outside your kiosk/jail', 403);
  }

  const contact = contacts.find((c) => c.contactId === callData.contactId);
  if (!contact) return sendError(res, 'INVALID_REFERENCE', 'contactId does not exist', 422);
  if (contact.inmateId && contact.inmateId !== callData.inmateId &&
      contact.inmateId !== `INM-${callData.inmateId}`) {
    return sendError(res, 'UNAUTHORIZED_CONTACT', 'Contact is not an approved contact for this inmate', 403);
  }

  const kiosk = kiosks.find((k) => k.kioskId === callData.kioskId);
  if (!kiosk) return sendError(res, 'INVALID_REFERENCE', 'kioskId does not exist', 422);
  const requestedKiosk = kioskScopeOf(req);
  if (requestedKiosk && kiosk.kioskId !== requestedKiosk) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a call for another kiosk', 403);
  }
  if (kiosk.status === 'disabled' || kiosk.authorizationStatus !== 'authorized') {
    return sendError(res, 'KIOSK_UNAUTHORIZED', 'Kiosk is not authorized for calls', 403);
  }

  const alreadyActive = existingCalls.find((c) => c.inmateId === callData.inmateId && c.status === 'active');
  if (alreadyActive) {
    // Stale-active sweep: a call whose entire max duration (+2 min grace) has
    // elapsed can only be an orphan (kiosk killed mid-call, /end never ran).
    // Finalize it — billed up to the cap, wallet charged — then proceed, so
    // one dead record can never block every future call.
    const maxMs = (Number(alreadyActive.maxDurationMinutes) || 15) * 60000;
    const graceMs = 2 * 60000;
    const startMs = new Date(alreadyActive.startTime || Date.now()).getTime();
    if (Date.now() - startMs > maxMs + graceMs) {
      console.warn(`[calls] sweeping stale active call ${alreadyActive.callId}`);
      await finalizeCall(alreadyActive, startMs + maxMs);
    } else {
      return sendError(res, 'CALL_IN_PROGRESS', 'Inmate already has an active call', 409);
    }
  }

  // Family secure-call token material. A scheduled call reuses the token
  // already texted at booking time; an instant call mints a fresh one.
  const linkToken = scheduledLinkToken || `LINK-${uuidv4().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  const [settingsDocs, pricingDocs] = await Promise.all([readDb('settings.json'), readDb('pricing.json')]);
  const settings = settingsDocs?.[0] || {};
  const pricing = pricingDocs?.[0] || {};
  const ratePerMinute = pricing[callData.type || 'video']?.ratePerMinute ?? (callData.type === 'audio' ? 1.0 : 2.5);

  const newCall = {
    callId: callData.callId || `CALL-${uuidv4().substring(0, 8).toUpperCase()}`,
    roomId: callData.roomId || `ROOM-${uuidv4().substring(0, 8).toUpperCase()}`,
    inmateId: callData.inmateId, contactId: callData.contactId, kioskId: callData.kioskId,
    prisonId: kiosk.prisonId || inmate.prisonId || null,
    facility: kiosk.prisonId || inmate.prisonId || null,
    type: callData.type || 'video',
    // 'active' from the moment of creation: this is what powers the
    // CALL_IN_PROGRESS double-call guard. /end (or the stale sweep) moves it
    // to 'completed'.
    status: 'active',
    startTime: callData.startTime || new Date().toISOString(),
    mediaConnectedAt: null,  // Set when WebRTC media actually connects — billing starts from here
    endTime: null, durationMinutes: 0,
    recordingEnabled: callData.recordingEnabled !== undefined ? callData.recordingEnabled : true,
    recordingStatus: 'not_recording',
    connectionQuality: 'good', bitrate: 0, packetLoss: 0, jitter: 0, iceState: 'new',
    inmateName: callData.inmateName || '', familyMemberName: callData.familyMemberName || '',
    roomIdLabel: callData.roomIdLabel || '',
    maxDurationMinutes: settings.callSettings?.maxCallDurationMinutes ?? 15,
    ratePerMinute,
    scheduledAt: callData.scheduledAt || callData.startTime || new Date().toISOString(),
    linkToken,
    otp,
    family: {
      doorwayCode: callData.doorwayCode || '', doorwayId: callData.doorwayId || '',
      deviceVerified: false, otpVerified: false, sessionToken: null
    }
  };

  // Room-bound signaling token for the kiosk so it can authenticate the
  // signaling socket (role 'kiosk') and join exactly this call's room.
  newCall.signalingToken = signAccessToken({
    sub: req.auth?.sub || newCall.kioskId,
    role: 'kiosk',
    callId: newCall.callId,
    roomId: newCall.roomId,
    kioskId: newCall.kioskId
  });

  // Public signaling URL for this deployment, handed to clients inside the
  // create-call response. The Android kiosk uses it at runtime so the APK
  // never needs rebuilding when the public signaling URL changes (e.g.
  // cloudflared quick tunnels get a fresh URL on every start.bat run).
  if (process.env.SIGNALING_PUBLIC_URL) {
    newCall.signalingUrl = process.env.SIGNALING_PUBLIC_URL;
  }

  await updateDb('calls.json', (calls) => ({ data: [...calls, newCall], result: newCall }));
  broadcastEvent('call-created', newCall);

  // Scheduled call launched from the dashboard: mark that booking completed so
  // it leaves the kiosk's "My Scheduled Calls" list immediately.
  if (callData.scheduleId) {
    try {
      await updateDb('schedule.json', (all) => {
        const idx = all.findIndex(
          (s) => s.scheduleId === callData.scheduleId && s.inmateId === callData.inmateId
        );
        if (idx === -1) return { data: all, result: null };
        all[idx] = {
          ...all[idx],
          status: 'completed',
          callId: newCall.callId,
          completedAt: new Date().toISOString()
        };
        return { data: all, result: all[idx] };
      });
    } catch (err) {
      console.warn('[calls] failed marking schedule completed:', err.message);
    }
  }

  // ==== FAMILY LINK SMS (background) ====
  // Dispatched AFTER the response is sent — SMS gateway latency must never
  // delay call setup on the kiosk. A scheduled call already texted the link
  // at booking time, so only OTP goes out for those (no duplicate cost).
  // Failures only log; they can never fail the call itself.
  if (!scheduledLinkToken) {
    setImmediate(() => {
      (async () => {
        const familyPhone = contactPhone(contact);
        if (!familyPhone) {
          console.warn('[calls] contact has no phone number — skipping family link SMS');
          return;
        }
        const smsResult = await sendSms({
          phone: familyPhone,
          message: buildLinkSms(newCall),
          kind: 'link',
          callId: newCall.callId
        });
        await updateDb('calls.json', (calls) => {
          const idx = calls.findIndex((c) => c.callId === newCall.callId);
          if (idx === -1) return { data: calls, result: null };
          calls[idx].sms = {
            sent: true,
            sentTo: maskedPhone(familyPhone),
            linkToken: newCall.linkToken,
            linkUrl: buildCallLink(newCall.linkToken),
            transport: smsResult.provider,
            loggedAt: smsResult.loggedAt
          };
          return { data: calls, result: calls[idx] };
        });
      })().catch((err) => {
        console.error('[calls] family link SMS dispatch failed:', err.message);
      });
    });
  } else {
    console.log(`[calls] scheduled call ${newCall.callId} — link already sent at booking, skipping link SMS`);
  }

  return sendSuccess(res, newCall, 201);
}));

// ==================== FAMILY SECURE CALL (link/OTP/device endpoints) ====================

app.get('/calls/link/:linkToken', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }

  const [inmates, contacts] = await Promise.all([readDb('inmates.json'), readDb('contacts.json')]);
  const inmate = inmates.find((i) => i.inmateId === call.inmateId);
  const contact = contacts.find((c) => c.contactId === call.contactId);

  // Record the first time the family member actually opens the link so the
  // kiosk can show real progress instead of a generic "waiting" spinner.
  if (!call.linkOpenedAt) {
    await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.callId === call.callId);
      if (idx === -1) return { data: all, result: null };
      if (!all[idx].linkOpenedAt) all[idx].linkOpenedAt = new Date().toISOString();
      return { data: all, result: all[idx] };
    });
  }

  // Report whether this phone has a registered device fingerprint so the
  // portal can route first-time (collect fingerprint) vs returning (verify).
  const { registered, maskedPhone: phone } = await deviceRegisteredForCall(call);
  const familyPhone = contactPhone(contact);

  return sendSuccess(res, {
    callId: call.callId,
    roomId: call.roomId,
    inmateName: inmate ? `${inmate.firstName} ${inmate.lastName || ''}`.trim() : call.inmateName || '',
    contactName: contact?.fullName || contact?.name || call.familyMemberName || 'Family member',
    callType: call.type,
    scheduledAt: call.scheduledAt || call.startTime,
    maxDurationMinutes: call.maxDurationMinutes,
    ratePerMinute: call.ratePerMinute,
    deviceRegistered: registered,
    phoneMasked: phone || (familyPhone ? maskedPhone(familyPhone) : null)
  });
}));

app.post('/calls/:linkToken/device-verification', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const body = req.body || {};
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);

  const { fingerprint, signals } = body;

  // A fingerprint is mandatory. deviceInfo is kept for legacy clients.
  if (!fingerprint) {
    return sendError(res, 'INVALID_REQUEST', 'Device fingerprint is required', 400);
  }

  const contacts = await readDb('contacts.json');
  const contact = contacts.find((c) => c.contactId === call.contactId);
  const familyPhone = contactPhone(contact);

  // First call to this number -> register the fingerprint.
  // Returning call  -> require the fingerprint to match the stored one.
  const result = await registerOrVerifyFingerprint(call.contactId, familyPhone, { hash: String(fingerprint), signals });

  if (!result.verified) {
    // Track failed attempts so the kiosk can show the step in red.
    await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.linkToken === linkToken);
      if (idx === -1) return { data: all, result: null };
      all[idx].family = {
        ...(all[idx].family || {}),
        deviceFailedAttempts: (all[idx].family?.deviceFailedAttempts || 0) + 1
      };
      return { data: all, result: all[idx] };
    });
    if (result.reason === 'DEVICE_MISMATCH') {
      return sendError(res, 'DEVICE_MISMATCH', 'This device is not authorized for this call link', 403);
    }
    return sendError(res, 'DEVICE_VERIFICATION_FAILED', result.reason || 'Device verification failed', 400);
  }

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].family = {
      ...(all[idx].family || {}),
      deviceInfo: body.deviceInfo || {},
      deviceVerified: true,
      isFirstTime: result.isFirstTime === true,
      deviceVerifiedAt: new Date().toISOString()
    };
    return { data: all, result: all[idx] };
  });

  return sendSuccess(res, {
    verified: true,
    isFirstTime: result.isFirstTime === true,
    // OTP may only be dispatched after a successful device check.
    otpAllowed: true
  });
}));

app.post('/calls/:linkToken/send-otp', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }

  // First-time call to this number: OTP is dispatched BEFORE the fingerprint
  // is collected (so we first prove the SIM is in the phone). Returning call:
  // the stored device fingerprint must match BEFORE an OTP is sent.
  const { registered: deviceRegistered } = await deviceRegisteredForCall(call);
  if (deviceRegistered && !call.family?.deviceVerified) {
    return sendError(res, 'DEVICE_VERIFICATION_REQUIRED', 'Device verification is required before sending the OTP', 403);
  }

  const contacts = await readDb('contacts.json');
  const contact = contacts.find((c) => c.contactId === call.contactId);
  const familyPhone = contactPhone(contact);
  if (!familyPhone) return sendError(res, 'NO_PHONE', 'Family phone number is not registered', 400);

  // Rotate the OTP on every dispatch so a stale code can never be replayed.
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + (parseInt(process.env.SMS_OTP_EXPIRY_MINUTES || '5', 10) * 60000)).toISOString();

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].otp = otp;
    all[idx].otpExpiresAt = expiresAt;
    all[idx].otpDispatchCount = (all[idx].otpDispatchCount || 0) + 1;
    return { data: all, result: all[idx] };
  });

  const { sendSms } = require('./lib/sms');
  const { buildOtpMessage } = require('./lib/sms');
  let smsResult = null;
  try {
    smsResult = await sendSms({
      phone: familyPhone,
      message: buildOtpMessage(otp, 'call'),
      kind: 'otp',
      callId: call.callId
    });
  } catch (err) {
    console.error('[otp] send failed:', err.message);
  }

  return sendSuccess(res, {
    sent: true,
    transport: smsResult?.provider || 'log',
    expiresAt,
    phoneMasked: maskedPhone(familyPhone)
  });
}));

// Family presence heartbeat: the verification pages ping this every few
// seconds so the kiosk can tell "still working" from "left the screen".
app.post('/calls/link/:linkToken/heartbeat', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.family?.otpVerified) return sendSuccess(res, { ok: true, done: true });
  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].family = { ...(all[idx].family || {}), lastSeenAt: new Date().toISOString() };
    return { data: all, result: all[idx] };
  });
  return sendSuccess(res, { ok: true });
}));

// DEV/DEMO ONLY: lets the family web auto-complete OTP when running against a
// local stack (SMS_PROVIDER=log). Never enabled in production or with real SMS.
app.get('/calls/:linkToken/otp', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  if (process.env.NODE_ENV === 'production' || (process.env.SMS_PROVIDER || '').toLowerCase() === 'fast2sms') {
    return sendError(res, 'FORBIDDEN', 'OTP debug endpoint is disabled', 403);
  }
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }
  if (call.family?.otpVerified) return sendError(res, 'ALREADY_VERIFIED', 'OTP already verified', 409);
  if (!call.otp) return sendError(res, 'NO_OTP', 'No pending OTP; dispatch it first', 404);
  return sendSuccess(res, { otp: String(call.otp), expiresAt: call.otpExpiresAt || null });
}));

app.post('/calls/:linkToken/otp-verification', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const { otp } = req.body || {};
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }

  // First-time call: OTP may be redeemed before the fingerprint is collected.
  // Returning call: OTP is only valid after the stored fingerprint matched.
  const { registered: deviceRegistered } = await deviceRegisteredForCall(call);
  if (deviceRegistered && !call.family?.deviceVerified) {
    return sendError(res, 'DEVICE_VERIFICATION_REQUIRED', 'Device verification is required before entering the OTP', 403);
  }

  // Reject stale OTPs past their expiry window.
  if (call.otpExpiresAt && Date.now() > new Date(call.otpExpiresAt).getTime()) {
    return sendError(res, 'OTP_EXPIRED', 'This OTP has expired. Tap resend to get a new code.', 401);
  }

  const valid = String(otp) === String(call.otp);
  if (!valid) {
    // Track failed attempts so the kiosk can show the step in red.
    await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.linkToken === linkToken);
      if (idx === -1) return { data: all, result: null };
      all[idx].family = {
        ...(all[idx].family || {}),
        otpFailedAttempts: (all[idx].family?.otpFailedAttempts || 0) + 1
      };
      return { data: all, result: all[idx] };
    });
    return sendError(res, 'INVALID_OTP', 'Incorrect one-time password', 401);
  }

  const sessionToken = signAccessToken({
    sub: call.contactId, role: 'family',
    callId: call.callId, roomId: call.roomId, kioskId: call.kioskId
  });

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].family = { ...(all[idx].family || {}), otpVerified: true, otpVerifiedAt: new Date().toISOString(), sessionToken };
    return { data: all, result: all[idx] };
  });

  return sendSuccess(res, { verified: true, sessionToken });
}));

app.patch('/calls/:callId', requireAuth, asyncRoute(async (req, res) => {
  const { callId } = req.params;
  const updates = req.body;

  const existing = (await readDb('calls.json')).find((c) => c.callId === callId);
  if (!existing || !inAdminScope(req, existing)) {
    return sendError(res, 'NOT_FOUND', 'Call not found', 404);
  }

  try {
    const updated = await updateDb('calls.json', (calls) => {
      const idx = calls.findIndex((c) => c.callId === callId);
      if (idx === -1) return { data: calls, result: null };

      // Prevent updates to terminal calls.
      if (TERMINAL_STATES.includes(calls[idx].status)) {
        const err = new Error(`Cannot update a call in terminal state '${calls[idx].status}'`);
        err.code = 'INVALID_STATE';
        throw err;
      }

      if (updates.status && updates.status !== calls[idx].status) {
        const allowed = ALLOWED_TRANSITIONS[calls[idx].status] || [];
        if (!allowed.includes(updates.status)) {
          const err = new Error(`Cannot transition call from '${calls[idx].status}' to '${updates.status}'`);
          err.code = 'INVALID_TRANSITION';
          throw err;
        }
        // Auto-set endTime and duration when entering a terminal state.
        if (TERMINAL_STATES.includes(updates.status)) {
          const startMs = new Date(calls[idx].startTime).getTime();
          updates.endTime = new Date().toISOString();
          updates.durationMinutes = Math.round((Date.now() - startMs) / 60000);
        }
      }

      calls[idx] = { ...calls[idx], ...updates };

      // Track when WebRTC media actually connects — billing starts from here, not from startTime
      if (updates.iceState === 'connected' && !calls[idx].mediaConnectedAt) {
        calls[idx].mediaConnectedAt = new Date().toISOString();
      }
      return { data: calls, result: calls[idx] };
    });

    if (!updated) return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    broadcastEvent('call-updated', updated);
    return sendSuccess(res, updated);
  } catch (err) {
    if (err.code === 'INVALID_TRANSITION' || err.code === 'INVALID_STATE') return sendError(res, err.code, err.message, 409);
    throw err;
  }
}));

app.get('/calls/scheduled/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const [schedules, inmates, contacts] = await Promise.all([
    readDb('schedule.json'), readDb('inmates.json'), readDb('contacts.json')
  ]);
  const inmate = inmates.find((i) => i.inmateId === id) ||
                 inmates.find((i) => i.assignedKioskId === id) ||
                 inmates.find((i) => i.prisonerNumber === id);
  if (!inmate || !(await inScopeOf(req, inmate))) {
    return sendError(res, 'NOT_FOUND', 'Inmate not found in your kiosk/jail', 404);
  }
  const matches = schedules.filter((s) => s.inmateId === inmate.inmateId || s.kioskId === inmate.assignedKioskId);
  const scoped = await scopeList(req, matches);
  const contactName = (contactId) => contacts.find((c) => c.contactId === contactId)?.fullName || null;
  // Only live bookings: completed calls and past dates leave the list. A
  // booking for TODAY stays visible until midnight (its slot may still be
  // current), everything else ages out by date.
  const today = new Date().toISOString().slice(0, 10);
  return sendSuccess(res, scoped
    .filter((s) => (s.status || 'scheduled') === 'scheduled' && (s.date || '') >= today)
    .sort((a, b) => `${a.date}${a.timeSlot}`.localeCompare(`${b.date}${b.timeSlot}`))
    .map((s) => ({ ...s, contactName: contactName(s.contactId) })));
}));

// Inmate/kiosk-scoped call history (terminal calls only) — mirrors
// /calls/scheduled/:id so the kiosk dashboard can show a real history list.
app.get('/calls/history/:id', requireAuth, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const [calls, inmates, contacts] = await Promise.all([
    readDb('calls.json'), readDb('inmates.json'), readDb('contacts.json')
  ]);
  const inmate = inmates.find((i) => i.inmateId === id) ||
                 inmates.find((i) => i.assignedKioskId === id) ||
                 inmates.find((i) => i.prisonerNumber === id);
  if (!inmate || !(await inScopeOf(req, inmate))) {
    return sendError(res, 'NOT_FOUND', 'Inmate not found in your kiosk/jail', 404);
  }
  const matches = calls.filter((c) => c.inmateId === inmate.inmateId || c.kioskId === inmate.assignedKioskId);
  const scoped = await scopeList(req, matches);
  const contactName = (contactId) => contacts.find((c) => c.contactId === contactId)?.fullName || null;
  const history = scoped
    .filter((c) => TERMINAL_STATES.includes(c.status))
    .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0))
    .map((c) => ({ ...c, contactName: contactName(c.contactId) || c.familyMemberName || null }));
  return sendSuccess(res, history);
}));

/**
 * Complete a call record and charge the inmate's wallet in one shot (the
 * balance is ledger-derived and clamped at zero — never negative). Shared by
 * the /end endpoint AND the stale-active-call sweep so a kiosk killed
 * mid-call still gets billed (capped at the max duration) and never blocks
 * future calls with a stuck 'active' record.
 */
async function finalizeCall(call, requestedEndTimeMs) {
  const startMs = new Date(call.startTime).getTime();
  const maxMs = (Number(call.maxDurationMinutes) || 15) * 60000;

  // Billing starts from media connection, NOT from call creation.
  // If media never connected (family left in lobby), charge is 0.
  const billingStartMs = call.mediaConnectedAt
    ? new Date(call.mediaConnectedAt).getTime()
    : startMs;
  const neverConnected = !call.mediaConnectedAt;

  // A call that outlived its max duration (kiosk died) is billed only up to
  // the cap — time after the app died must not be charged.
  const endMs = neverConnected
    ? billingStartMs  // No charge if never connected
    : Math.min(Math.max(requestedEndTimeMs, billingStartMs), billingStartMs + maxMs);
  const durationSec = Math.max(0, (endMs - billingStartMs) / 1000);
  const billedMinutes = Math.ceil(durationSec / 60);
  const ratePerMinute = Number(call.ratePerMinute) || 0;
  const chargeAmount = neverConnected ? 0 : +(billedMinutes * ratePerMinute).toFixed(2);

  const updatedCall = await updateDb('calls.json', (calls) => {
    const idx = calls.findIndex((c) => c.callId === call.callId);
    if (idx === -1) return { data: calls, result: null };
    calls[idx] = {
      ...calls[idx],
      status: 'completed',
      endTime: new Date(endMs).toISOString(),
      durationMinutes: billedMinutes,
      chargeAmount
    };
    return { data: calls, result: calls[idx] };
  });
  if (!updatedCall) return null;

  if (chargeAmount > 0 && updatedCall.inmateId) {
    try {
      const inmates = await readDb('inmates.json');
      const inmate =
        inmates.find((i) => i.inmateId === updatedCall.inmateId) ||
        inmates.find((i) => i.assignedKioskId === updatedCall.inmateId) ||
        null;
      const wallets = await readDb('wallets.json');
      const wallet =
        wallets.find((w) => inmate?.walletId && w.walletId === inmate.walletId) ||
        wallets.find((w) => w.inmateId === updatedCall.inmateId) ||
        wallets.find((w) => w.inmateId === `INM-${updatedCall.inmateId}`) ||
        null;

      if (wallet) {
        await updateDb('transactions.json', (all) => {
          const tx = {
            transactionId: `TXN-${uuidv4().substring(0, 8).toUpperCase()}`,
            walletId: wallet.walletId,
            inmateId: updatedCall.inmateId,
            callId: updatedCall.callId,
            type: 'charge',
            amount: chargeAmount,
            currency: wallet.currency || 'INR',
            status: 'completed',
            description: `Call charge (${billedMinutes} min @ ₹${ratePerMinute}/min)`,
            timestamp: new Date().toISOString()
          };
          return { data: [...all, tx], result: tx };
        });
        await updateDb('wallets.json', (all) => {
          const idx = all.findIndex((w) => w.walletId === wallet.walletId);
          if (idx === -1) return { data: all, result: null };
          // Clamp at zero — never negative.
          all[idx].balance = Math.max(0, (Number(all[idx].balance) || 0) - chargeAmount);
          all[idx].totalSpent = (Number(all[idx].totalSpent) || 0) + chargeAmount;
          return { data: all, result: all[idx] };
        });
        console.log(`[wallet] charged ₹${chargeAmount} to ${wallet.walletId} for ${updatedCall.callId}`);
      } else {
        console.warn(`[wallet] no wallet found for inmate ${updatedCall.inmateId} — charge skipped`);
      }
    } catch (err) {
      // A failed deduction must never fail the call end itself.
      console.error('[wallet] deduction failed:', err.message);
    }
  }
  return updatedCall;
}

app.post('/calls/:callId/end', requireAuth, asyncRoute(async (req, res) => {
  const { callId } = req.params;

  const existing = (await readDb('calls.json')).find((c) => c.callId === callId);
  if (!existing || !inAdminScope(req, existing)) {
    return sendError(res, 'NOT_FOUND', 'Call not found', 404);
  }

  const updatedCall = await finalizeCall(existing, Date.now());
  if (!updatedCall) return sendError(res, 'NOT_FOUND', 'Call not found', 404);


  await updateDb('recordings.json', (recordings) => {
    const idx = recordings.findIndex((r) => r.callId === callId);
    if (idx === -1) return { data: recordings, result: null };
    recordings[idx] = {
      ...recordings[idx],
      status: 'completed',
      endTime: new Date().toISOString(),
      duration: updatedCall.durationMinutes * 60
    };
    return { data: recordings, result: recordings[idx] };
  });

  // Close the media room on the signaling server so live media stops (best effort).
  try {
    if (updatedCall.roomId) {
      await signaling('POST', `/api/rooms/${encodeURIComponent(updatedCall.roomId)}/close`, { reason: 'call ended' });
    }
  } catch (err) {
    if (err.code !== 'SIGNALING_ERROR' && err.code !== 'MEDIA_CONFIG') throw err;
  }
  // Remove stale room membership so the room frees up for the next call.
  await updateDb('rooms.json', (rooms) => {
    const room = rooms.find((r) => r.callId === callId);
    if (!room) return { data: rooms, result: null };
    room.status = 'idle';
    room.participants = [];
    room.participantCount = 0;
    room.activeCallId = null;
    return { data: rooms, result: room };
  });

  broadcastEvent('call-ended', { callId, status: 'completed' });
  return sendSuccess(res, updatedCall);
}));

// ==================== ROOM ROUTES ====================

app.get('/rooms', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('rooms.json')))));

app.post('/rooms', requireAuth, asyncRoute(async (req, res) => {
  const roomData = req.body;
  const inmate = await resolveInmate(roomData.inmateId);
  if (!inmate) return sendError(res, 'INVALID_REFERENCE', 'inmateId does not exist', 422);
  if (!(await inScopeOf(req, inmate))) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a room for an inmate outside your kiosk/jail', 403);
  }
  const newRoom = {
    roomId: roomData.roomId || `ROOM-${uuidv4().substring(0, 8).toUpperCase()}`,
    kioskId: kioskScopeOf(req) || roomData.kioskId,
    inmateId: roomData.inmateId, contactId: roomData.contactId,
    status: 'idle', participants: [], participantCount: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };
  await updateDb('rooms.json', (rooms) => ({ data: [...rooms, newRoom], result: newRoom }));
  broadcastEvent('room-created', newRoom);
  return sendSuccess(res, newRoom, 201);
}));

// Note: actual join/leave now happens over the 'join-room'/'leave-room'
// socket events (see io.on('connection') above) so membership tracking stays
// consistent with the P2P signaling peers. These REST endpoints remain for
// clients that only need to query/report state, not establish media.
app.post('/rooms/join', requireAuth, asyncRoute(async (req, res) => {
  const { roomId, participantId } = req.body;
  const rooms = await readDb('rooms.json');
  const room = rooms.find((r) => r.roomId === roomId);
  if (!room || !(await inScopeOf(req, room))) return sendError(res, 'NOT_FOUND', 'Room not found', 404);
  if (room.expiresAt && new Date(room.expiresAt).getTime() < Date.now()) {
    return sendError(res, 'ROOM_EXPIRED', 'Room has expired', 410);
  }
  return sendSuccess(res, { roomId, participantId, status: 'use the join-room socket event to establish media' });
}));

// ==================== SCHEDULE ROUTES ====================

app.get('/schedule', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('schedule.json')))));

app.get('/schedule/slots/:kioskId/:date', requireAuth, asyncRoute(async (req, res) => {
  const { kioskId, date } = req.params;
  if (!kioskId || !date) return sendError(res, 'INVALID_REQUEST', 'kioskId and date are required', 400);

  // Verify kiosk exists and caller is in scope.
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'INVALID_REFERENCE', 'kioskId does not exist', 422);
  const callerKiosk = kioskScopeOf(req);
  if (callerKiosk && kioskId !== callerKiosk) {
    return sendError(res, 'FORBIDDEN', 'Cannot view slots for another kiosk', 403);
  }

  const schedules = await readDb('schedule.json');
  const booked = schedules.filter(
    (s) => s.kioskId === kioskId && s.date === date && s.status !== 'cancelled'
  ).map((s) => ({
    scheduleId: s.scheduleId,
    timeSlot: s.timeSlot,
    callType: s.callType,
    contactId: s.contactId,
    inmateId: s.inmateId
  }));

  return sendSuccess(res, { kioskId, date, bookedSlots: booked });
}));

app.post('/schedule/book', requireAuth, asyncRoute(async (req, res) => {
  const { inmateId, kioskId, contactId, date, timeSlot, callType } = req.body;
  if (!inmateId || !kioskId || !contactId || !date || !timeSlot) {
    return sendError(res, 'INVALID_REQUEST', 'inmateId, kioskId, contactId, date and timeSlot are required', 400);
  }

  // Validate referenced entities exist.
  const [inmates, contacts, kiosks] = await Promise.all([
    readDb('inmates.json'), readDb('contacts.json'), readDb('kiosks.json')
  ]);
  const inmate = inmates.find((i) => i.inmateId === inmateId);
  if (!inmate) return sendError(res, 'INVALID_REFERENCE', 'inmateId does not exist', 422);
  if (!(await inScopeOf(req, inmate))) {
    return sendError(res, 'FORBIDDEN', 'Cannot book a call for an inmate outside your kiosk/jail', 403);
  }
  if (!contacts.find((c) => c.contactId === contactId)) return sendError(res, 'INVALID_REFERENCE', 'contactId does not exist', 422);
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'INVALID_REFERENCE', 'kioskId does not exist', 422);
  const callerKiosk = kioskScopeOf(req);
  if (callerKiosk && kioskId !== callerKiosk) {
    return sendError(res, 'FORBIDDEN', 'Cannot book a call at another kiosk', 403);
  }

  // Validate date is in the future.
  const selectedDate = new Date(`${date}T00:00:00`);
  if (selectedDate < new Date(new Date().toISOString().slice(0, 10))) {
    return sendError(res, 'INVALID_DATE', 'Cannot schedule a call in the past', 422);
  }

  // Prevent double-booking: same inmate, same date and timeSlot.
  const schedules = await readDb('schedule.json');
  const conflict = schedules.find((s) => s.inmateId === inmateId && s.date === date && s.timeSlot === timeSlot && s.status !== 'cancelled');
  if (conflict) {
    return sendError(res, 'SLOT_CONFLICT', 'This inmate already has a booking at this time', 409);
  }

  // 10-minute buffer: cannot book within 10 minutes of any existing booking on same kiosk+date.
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const requestedMin = toMin(timeSlot.split('-')[0].trim());
  const kioskBooked = schedules.filter(
    (s) => s.kioskId === kioskId && s.date === date && s.status !== 'cancelled'
  );
  for (const b of kioskBooked) {
    const bStart = toMin(b.timeSlot.split('-')[0].trim());
    const bEnd = toMin(b.timeSlot.split('-')[1].trim());
    if (requestedMin >= bStart - 9 && requestedMin <= bEnd + 9) {
      return sendError(res, 'BUFFER_CONFLICT', `Cannot book within 10 minutes of an existing slot (${b.timeSlot})`, 409);
    }
  }

  const newSchedule = {
    scheduleId: `SCH-${uuidv4().substring(0, 8).toUpperCase()}`,
    inmateId, contactId, kioskId, date, timeSlot,
    callType: callType || 'video', status: 'scheduled', createdAt: new Date().toISOString()
  };
  // Pre-mint the family link token at booking time. The SMS carries this
  // link; when the kiosk later starts the call with this scheduleId the SAME
  // token is reused, so the family never gets a duplicate link SMS and the
  // link only becomes usable once the call actually exists.
  const linkToken = `LINK-${uuidv4().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
  newSchedule.linkToken = linkToken;
  await updateDb('schedule.json', (s) => ({ data: [...s, newSchedule], result: newSchedule }));

  // Notify the family member right away: who, from where, when + the link.
  setImmediate(() => {
    (async () => {
      const contact = contacts.find((c) => c.contactId === contactId);
      const familyPhone = contactPhone(contact);
      if (!familyPhone) {
        console.warn('[schedule] contact has no phone — skipping booking SMS');
        return;
      }
      const prisons = await readDb('prisons.json');
      const prison = prisons.find((p) => p.prisonId === inmate.prisonId || p.prisonId === kiosk.prisonId);
      const jailName = prison?.name || 'the correctional facility';
      const inmateName = `${inmate.firstName || ''} ${inmate.lastName || ''}`.trim() || 'An inmate';
      const message =
        `${inmateName} from ${jailName} has scheduled a ${newSchedule.callType} call ` +
        `with you on ${date} at ${timeSlot}. Please don't forget to join on time. ` +
        `Call link: ${buildCallLink(linkToken)}`;
      await sendSms({ phone: familyPhone, message, kind: 'link', callId: newSchedule.scheduleId });
    })().catch((err) => {
      console.error('[schedule] booking SMS failed:', err.message);
    });
  });

  return sendSuccess(res, newSchedule, 201);
}));

app.delete('/schedule/cancel/:bookingId', requireAuth, asyncRoute(async (req, res) => {
  const existing = (await readDb('schedule.json')).find((s) => s.scheduleId === req.params.bookingId);
  if (!existing || !(await inScopeOf(req, existing))) {
    return sendError(res, 'NOT_FOUND', 'Booking not found', 404);
  }
  const deleted = await updateDb('schedule.json', (schedules) => {
    const idx = schedules.findIndex((s) => s.scheduleId === req.params.bookingId);
    if (idx === -1) return { data: schedules, result: null };
    schedules.splice(idx, 1);
    return { data: schedules, result: true };
  });
  if (!deleted) return sendError(res, 'NOT_FOUND', 'Booking not found', 404);
  return sendSuccess(res, { message: 'Booking cancelled successfully' });
}));

// ==================== ALERT ROUTES ====================

app.get('/alerts', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('alerts.json')))));

app.post('/alerts', requireAuth, asyncRoute(async (req, res) => {
  const alertData = req.body;
  const kioskId = kioskScopeOf(req);
  const jailId = jailScopeOf(req);
  const newAlert = {
    alertId: `ALERT-${uuidv4().substring(0, 8).toUpperCase()}`,
    type: alertData.type || 'system', severity: alertData.severity || 'medium',
    message: alertData.message, source: alertData.source || 'system', sourceId: alertData.sourceId || 'system',
    kioskId: kioskId || alertData.kioskId || null,
    prisonId: jailId || alertData.prisonId || null,
    timestamp: new Date().toISOString(), resolved: false, resolvedAt: null, resolvedBy: null
  };
  await updateDb('alerts.json', (a) => ({ data: [...a, newAlert], result: newAlert }));
  broadcastEvent('alert-generated', newAlert);
  return sendSuccess(res, newAlert, 201);
}));

app.patch('/alerts/:alertId/resolve', requireAuth, asyncRoute(async (req, res) => {
  const existing = (await readDb('alerts.json')).find((a) => a.alertId === req.params.alertId);
  if (!existing || !(await inScopeOf(req, existing))) {
    return sendError(res, 'NOT_FOUND', 'Alert not found', 404);
  }
  const { resolvedBy } = req.body;
  const updated = await updateDb('alerts.json', (alerts) => {
    const idx = alerts.findIndex((a) => a.alertId === req.params.alertId);
    if (idx === -1) return { data: alerts, result: null };
    alerts[idx] = { ...alerts[idx], resolved: true, resolvedAt: new Date().toISOString(), resolvedBy: resolvedBy || req.auth?.sub };
    return { data: alerts, result: alerts[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Alert not found', 404);
  return sendSuccess(res, updated);
}));

// ==================== DEVICE ROUTES ====================

app.get('/devices', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('devices.json')))));
app.get('/devices/:deviceId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const devices = await readDb('devices.json');
  const device = devices.find((d) => d.deviceId === req.params.deviceId);
  if (!device) return sendError(res, 'NOT_FOUND', 'Device not found', 404);
  if (!(await inScopeOf(req, device))) return sendError(res, 'FORBIDDEN', 'Device outside your scope', 403);
  return sendSuccess(res, device);
}));
app.patch('/devices/:deviceId/status', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['online', 'offline', 'maintenance', 'decommissioned'];
  if (status && !allowedStatuses.includes(status)) {
    return sendError(res, 'INVALID_STATUS', `Status must be one of: ${allowedStatuses.join(', ')}`, 400);
  }
  const updated = await updateDb('devices.json', (devices) => {
    const idx = devices.findIndex((d) => d.deviceId === req.params.deviceId);
    if (idx === -1) return { data: devices, result: null };
    devices[idx] = { ...devices[idx], status, lastSeen: new Date().toISOString() };
    return { data: devices, result: devices[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Device not found', 404);
  broadcastEvent('device-status-change', updated);
  return sendSuccess(res, updated);
}));

// ==================== ANDROID COMPATIBILITY: DEVICE ALIASES ====================

app.get('/admin/devices', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Admin device info maps to the jail's kiosks (matches Android KioskDevice model).
  const kiosks = await readDb('kiosks.json');
  return sendSuccess(res, kiosks.filter(adminScopeFilter(req)));
}));

app.get('/admin/devices/:deviceId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Alias for device info — resolve the jail's kiosk by kioskId / serial number.
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find(
    (k) => (k.kioskId === req.params.deviceId || k.deviceSerialNumber === req.params.deviceId) && inAdminScope(req, k)
  );
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Device not found', 404);
  return sendSuccess(res, kiosk);
}));

// ==================== REPORTS / SETTINGS ====================

app.get('/reports', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('reports.json')))));
app.get('/reports/:reportId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const reports = await readDb('reports.json');
  const report = reports.find((r) => r.reportId === req.params.reportId);
  if (!report || !(await inScopeOf(req, report))) return sendError(res, 'NOT_FOUND', 'Report not found', 404);
  return sendSuccess(res, report);
}));

app.get('/settings', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await readDb('settings.json'))));
app.patch('/settings', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  // Deep-merge the patch over existing settings instead of replacing wholesale,
  // so a partial update can never wipe unrelated configuration.
  const merged = await updateDb('settings.json', (all) => {
    const patch = { ...req.body };
    const base = all.length ? { ...all[0] } : {};
    const result = deepMerge(base, patch);
    return { data: [result], result };
  });
  broadcastEvent('settings-updated', merged.result);
  return sendSuccess(res, merged.result);
}));

// ==================== RECORDINGS (real RTP capture) ====================

app.get('/recordings', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('recordings.json')))));
app.get('/recordings/:recordingId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const recordings = await readDb('recordings.json');
  const recording = recordings.find((r) => r.recordingId === req.params.recordingId);
  if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);
  return sendSuccess(res, recording);
}));

app.post('/recordings', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { callId } = req.body;
  if (!callId) return sendError(res, 'INVALID_REQUEST', 'callId is required', 400);
  const call = (await readDb('calls.json')).find((c) => c.callId === callId);
  if (!call || !inAdminScope(req, call)) {
    return sendError(res, 'NOT_FOUND', 'Call not found', 404);
  }
  const newRecording = {
    recordingId: `REC-${uuidv4().substring(0, 8).toUpperCase()}`,
    callId, kioskId: call.kioskId || kioskScopeOf(req) || null,
    inmateId: call.inmateId || null,
    status: 'not_started', startTime: null, endTime: null, duration: 0,
    createdAt: new Date().toISOString()
  };
  await updateDb('recordings.json', (r) => ({ data: [...r, newRecording], result: newRecording }));
  return sendSuccess(res, newRecording, 201);
}));

app.post('/recordings/upload', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { callId, base64Data, fileName, mimeType } = req.body || {};
  if (!callId) return sendError(res, 'INVALID_REQUEST', 'callId is required', 400);

  // recordings.call_id carries a FK to calls.id — reject unknown calls with a
  // clean error instead of letting the INSERT blow up as INTERNAL_ERROR.
  const call = (await readDb('calls.json')).find((c) => c.callId === callId || c.roomId === callId);
  if (!call || !(await inScopeOf(req, call))) {
    return sendError(res, 'CALL_NOT_FOUND', 'No call matches the given callId', 404);
  }

  let fileBuffer;
  if (base64Data) {
    fileBuffer = Buffer.from(base64Data, 'base64');
  } else if (Buffer.isBuffer(req.body)) {
    fileBuffer = req.body;
  } else {
    fileBuffer = Buffer.from('kiosk recording data');
  }

  let rec;
  try {
    rec = await saveUploadedRecording({
      callId,
      kioskId: call.kioskId || null,
      inmateId: req.body?.inmateId || call.inmateId || null,
      contactId: req.body?.contactId || call.contactId || null,
      fileBuffer,
      fileName: fileName || `kiosk-rec-${callId}.mp4`,
      mimeType: mimeType || 'video/mp4'
    });
  } catch (err) {
    console.error('[recordings] failed persisting upload:', err.message);
    return sendError(res, 'STORAGE_ERROR', 'Failed to store uploaded recording', 500);
  }

  await updateDb('recordings.json', (all) => {
    const existingIdx = all.findIndex((r) => r.callId === callId || r.recordingId === rec.recordingId);
    if (existingIdx !== -1) {
      all[existingIdx] = { ...all[existingIdx], ...rec };
      return { data: all, result: all[existingIdx] };
    }
    return { data: [...all, rec], result: rec };
  });

  await updateDb('calls.json', (calls) => {
    const c = calls.find((x) => x.callId === callId || x.roomId === callId);
    if (c) {
      c.recordingStatus = 'completed';
      c.recordingId = rec.recordingId;
    }
    return { data: calls, result: c };
  });

  broadcastEvent('recording-finished', rec);
  return sendSuccess(res, rec, 200);
}));

app.post('/recordings/:recordingId/start', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { recordingId } = req.params;
  const recordings = await readDb('recordings.json');
  const recording = recordings.find((r) => r.recordingId === recordingId);
  if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);

  const updated = await updateDb('recordings.json', (all) => {
    const idx = all.findIndex((r) => r.recordingId === recordingId);
    all[idx] = { ...all[idx], status: 'recording', startTime: new Date().toISOString() };
    return { data: all, result: all[idx] };
  });

  broadcastEvent('recording-started', updated);
  return sendSuccess(res, updated);
}));

app.post('/recordings/:recordingId/stop', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { recordingId } = req.params;
  const recordings = await readDb('recordings.json');
  const recording = recordings.find((r) => r.recordingId === recordingId);
  if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);

  const updated = await updateDb('recordings.json', (all) => {
    const idx = all.findIndex((r) => r.recordingId === recordingId);
    const startMs = all[idx].startTime ? new Date(all[idx].startTime).getTime() : Date.now();
    all[idx] = {
      ...all[idx], status: 'completed', endTime: new Date().toISOString(),
      duration: Math.max(1, Math.round((Date.now() - startMs) / 1000))
    };
    return { data: all, result: all[idx] };
  });

  broadcastEvent('recording-finished', updated);
  return sendSuccess(res, updated);
}));

// ==================== INCIDENTS ====================

app.get('/incidents', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('incidents.json')))));
app.post('/incidents', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const incidentData = req.body;
  const newIncident = {
    incidentId: `INC-${uuidv4().substring(0, 8).toUpperCase()}`,
    category: incidentData.category || 'other', severity: incidentData.severity || 'medium',
    remarks: incidentData.remarks || '', time: incidentData.time || new Date().toISOString(),
    officerName: req.auth?.sub || incidentData.officerName || 'unknown',
    callId: incidentData.callId || null,
    kioskId: kioskScopeOf(req) || incidentData.kioskId || null,
    prisonId: jailScopeOf(req) || incidentData.prisonId || null,
    inmateId: incidentData.inmateId || null,
    createdAt: new Date().toISOString()
  };
  await updateDb('incidents.json', (i) => ({ data: [...i, newIncident], result: newIncident }));
  broadcastEvent('incident-created', newIncident);
  return sendSuccess(res, newIncident, 201);
}));
app.get('/incidents/:incidentId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const incidents = await readDb('incidents.json');
  const incident = incidents.find((i) => i.incidentId === req.params.incidentId);
  if (!incident || !(await inScopeOf(req, incident))) return sendError(res, 'NOT_FOUND', 'Incident not found', 404);
  return sendSuccess(res, incident);
}));

// ==================== PRISONS / VENDOR ====================

app.get('/prisons', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('prisons.json')))));
app.get('/prisons/:prisonId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === req.params.prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, prison);
}));
app.post('/prisons', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => {
  const prisonData = req.body;
  // Jail-scoped / kiosk-bound principals can only create within their own jail.
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId || kioskId) {
    if (prisonData.prisonId && prisonData.prisonId !== jailId) {
      return sendError(res, 'FORBIDDEN', 'Cannot create a prison outside your jail', 403);
    }
    prisonData.prisonId = jailId || prisonData.prisonId;
  }
  try {
    const newPrison = await updateDb('prisons.json', (prisons) => {
      if (prisonData.name && prisons.find((p) => p.name === prisonData.name)) {
        const err = new Error('A prison with this name already exists');
        err.code = 'DUPLICATE';
        throw err;
      }
      const record = { prisonId: `PRISON-${uuidv4().substring(0, 8).toUpperCase()}`, ...prisonData, status: prisonData.status || 'active' };
      return { data: [...prisons, record], result: record };
    });
    return sendSuccess(res, newPrison, 201);
  } catch (err) {
    if (err.code === 'DUPLICATE') return sendError(res, 'DUPLICATE', err.message, 409);
    throw err;
  }
}));
app.patch('/prisons/:prisonId', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => {
  const existing = (await readDb('prisons.json')).find((p) => p.prisonId === req.params.prisonId);
  if (!existing || !(await inScopeOf(req, existing))) {
    return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  }
  const IMMUTABLE_FIELDS = ['prisonId', 'setupPin', 'wardenId', 'createdAt'];
  const patch = { ...req.body };
  IMMUTABLE_FIELDS.forEach((f) => delete patch[f]);
  const updated = await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === req.params.prisonId);
    if (idx === -1) return { data: prisons, result: null };
    prisons[idx] = { ...prisons[idx], ...patch };
    return { data: prisons, result: prisons[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, updated);
}));

app.get('/subscriptions', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('subscriptions.json')))));
app.get('/servers', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('servers.json')))));
app.get('/pricing', asyncRoute(async (req, res) => sendSuccess(res, await readDb('pricing.json'))));
// Wardens set their jail's per-minute call rates (video/audio). Deep-merged so
// a partial patch (e.g. only video rate) never wipes the rest of pricing.json.
app.patch('/pricing', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const merged = await updateDb('pricing.json', (all) => {
    const base = all.length ? { ...all[0] } : {};
    const result = deepMerge(base, { ...req.body });
    return { data: [result], result };
  });
  broadcastEvent('pricing-updated', merged.result);
  return sendSuccess(res, merged.result);
}));
app.get('/storage-stats', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => sendSuccess(res, await readDb('storage.json'))));

// ==================== STATISTICS ====================

app.get('/statistics', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const stats = await readDb('statistics.json');
  const calls = await readDb('calls.json');
  const scoped = [];
  for (const s of stats) {
    const call = calls.find((c) => c.callId === s.callId);
    if (call && !inAdminScope(req, call)) continue;
    if (!call && !(await inScopeOf(req, s))) continue;
    scoped.push(s);
  }
  return sendSuccess(res, scoped);
}));
app.get('/statistics/:callId', requireAuth, asyncRoute(async (req, res) => {
  const statistics = await readDb('statistics.json');
  const callStats = statistics.find((s) => s.callId === req.params.callId);
  if (!callStats) return sendError(res, 'NOT_FOUND', 'Statistics not found for call', 404);
  const call = (await readDb('calls.json')).find((c) => c.callId === req.params.callId);
  if (!inAdminScope(req, call)) return sendError(res, 'NOT_FOUND', 'Statistics not found for call', 404);
  return sendSuccess(res, callStats);
}));
app.patch('/statistics/:callId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { callId } = req.params;
  const updates = req.body;
  const call = (await readDb('calls.json')).find((c) => c.callId === callId);
  if (!call || !inAdminScope(req, call)) {
    return sendError(res, 'NOT_FOUND', 'Call not found', 404);
  }
  const result = await updateDb('statistics.json', (statistics) => {
    const idx = statistics.findIndex((s) => s.callId === callId);
    const record = idx === -1
      ? {
          callId, packetLoss: updates.packetLoss || 0, latency: updates.latency || 0, bitrate: updates.bitrate || 0,
          jitter: updates.jitter || 0, audioLevel: updates.audioLevel || 0, fps: updates.fps || 0,
          networkHealth: updates.networkHealth || 'good', timestamp: new Date().toISOString()
        }
      : { ...statistics[idx], ...updates, timestamp: new Date().toISOString() };
    const nextData = idx === -1 ? [...statistics, record] : (statistics[idx] = record, statistics);
    return { data: nextData, result: record };
  });
  broadcastEvent('statistics-updated', result);
  return sendSuccess(res, result);
}));

// ==================== CALL CONTROL (applies real effects, not just events) ====================

app.post('/calls/:callId/control', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const { callId } = req.params;
  const { action, target } = req.body;

  const allowedActions = ['mute', 'unmute', 'hangup', 'disable-camera', 'enable-camera'];
  if (!action || !allowedActions.includes(action)) {
    return sendError(res, 'INVALID_ACTION', `Action must be one of: ${allowedActions.join(', ')}`, 400);
  }

  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.callId === callId);
  if (!call) return sendError(res, 'NOT_FOUND', 'Call not found', 404);
  // Control actions (mute/hangup) must be scoped to the operator's jail/kiosk.
  if (!inAdminScope(req, call)) return sendError(res, 'NOT_FOUND', 'Call not found', 404);

  // Apply the control action on the media room via the signaling server.
  if (call.roomId) {
    await signaling('POST', `/api/rooms/${encodeURIComponent(call.roomId)}/control`, { action, target: target || null });
  }

  const controlEvent = { callId, action, target, timestamp: new Date().toISOString(), appliedBy: req.auth?.sub || 'unknown' };
  broadcastEvent('call-control', controlEvent);
  return sendSuccess(res, controlEvent);
}));

// ==================== SUPER ADMIN ====================

app.get('/super-admins', requireAuth, requireRole('super-admin'), asyncRoute(async (req, res) => sendSuccess(res, await readDb('super-admins.json'))));
app.get('/super-admins/:adminId', requireAuth, requireRole('super-admin'), asyncRoute(async (req, res) => {
  const admins = await readDb('super-admins.json');
  const admin = admins.find((a) => a.adminId === req.params.adminId);
  if (!admin) return sendError(res, 'NOT_FOUND', 'Super admin not found', 404);
  return sendSuccess(res, admin);
}));

app.post('/auth/admin/identify', asyncRoute(async (req, res) => {
  const { kioskId, username } = req.body;
  const [admins, kiosks] = await Promise.all([readDb('admins.json'), readDb('kiosks.json')]);
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk || kiosk.authorizationStatus !== 'authorized') return sendError(res, 'UNAUTHORIZED', 'Kiosk not authorized', 403);

  // Lookup is scoped to this kiosk's jail so an admin assigned to another
  // jail/kiosk is simply "not found" rather than leaking a mismatch.
  const scopeAdmin = (a) =>
    a.status === 'active' &&
    a.kioskId === kioskId &&
    (!kiosk.prisonId || !a.prisonId || a.prisonId === kiosk.prisonId);

  const admin = username
    ? admins.find((a) => scopeAdmin(a) && (a.employeeId === username || a.email === username))
    : admins.find(scopeAdmin);
  if (!admin) return sendError(res, 'ADMIN_NOT_FOUND', 'No admin found for this kiosk', 404);

  return sendSuccess(res, {
    adminId: admin.adminId, employeeId: admin.employeeId, name: admin.name, email: admin.email,
    role: admin.role, permissions: admin.permissions, status: admin.status,
    kioskId: admin.kioskId, prisonId: admin.prisonId, confidence: 0.95
  });
}));

app.post('/auth/admin/verify-pin', authLimiter, asyncRoute(async (req, res) => {
  const { adminId, pin, password, kioskId } = req.body;
  const admins = await readDb('admins.json');
  const admin = admins.find((a) => a.adminId === adminId && a.kioskId === kioskId);
  if (!admin) return sendError(res, 'NOT_FOUND', 'Admin not found for this kiosk', 404);

  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk || kiosk.authorizationStatus !== 'authorized' || kiosk.status === 'unauthorized' || kiosk.status === 'disabled') {
    return sendError(res, 'UNAUTHORIZED', 'Kiosk not authorized for admin access', 403);
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

// ==================== TRANSACTIONS (read-only, as originally scoped) ====================

app.get('/transactions', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('transactions.json')))));
app.get('/transactions/:transactionId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const transactions = await readDb('transactions.json');
  const transaction = transactions.find((t) => t.transactionId === req.params.transactionId);
  if (!transaction || !(await inScopeOf(req, transaction))) return sendError(res, 'NOT_FOUND', 'Transaction not found', 404);
  return sendSuccess(res, transaction);
}));
app.get('/transactions/wallet/:walletId', requireAuth, asyncRoute(async (req, res) => {
  const transactions = await readDb('transactions.json');
  return sendSuccess(res, await scopeList(req, transactions.filter((t) => t.walletId === req.params.walletId)));
}));

// ==================== KIOSK REGISTRATION REQUESTS ====================

// Public endpoint used by kiosk devices to check registration status by serial number
app.get('/kiosks/registration-status/:serialNumber', asyncRoute(async (req, res) => {
  const serial = req.params.serialNumber;
  // Check existing kiosks first
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.deviceSerialNumber === serial || k.kioskId === serial);
  if (kiosk) {
    const mappedStatus = kiosk.authorizationStatus === 'authorized'
      ? 'approved'
      : kiosk.authorizationStatus === 'unauthorized'
        ? 'rejected'
        : (kiosk.authorizationStatus || 'pending');
    return sendSuccess(res, {
      status: mappedStatus,
      requestId: kiosk.kioskId,
      prisonId: kiosk.prisonId || null,
      authorized: kiosk.authorizationStatus === 'authorized'
    });
  }

  // Fall back to registration requests file
  const requests = await readDb('kiosk-registration-requests.json');
  const reqRec = requests.find((r) => r.deviceSerialNumber === serial);
  if (reqRec) {
    return sendSuccess(res, {
      status: reqRec.status || 'pending',
      requestId: reqRec.requestId,
      prisonId: reqRec.prisonId || null,
      authorized: reqRec.status === 'approved'
    });
  }

  return sendError(res, 'NOT_FOUND', 'Kiosk registration status not found', 404);
}));

app.get('/kiosks/registration-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const [kiosks, prisons] = await Promise.all([readDb('kiosks.json'), readDb('prisons.json')]);
  const registrationRequests = kiosks.filter((k) => k.status === 'pending' || k.authorizationStatus === 'pending');
  return sendSuccess(res, (await scopeList(req, registrationRequests)).map((k) => {
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
      androidVersion: 'Unknown',
      appVersion: k.firmwareVersion || 'Unknown',
      registrationTimestamp: k.createdAt,
      deviceFingerprint: k.deviceSerialNumber || 'Unknown',
      status: k.authorizationStatus === 'authorized' ? 'approved' : k.authorizationStatus === 'unauthorized' ? 'rejected' : 'pending',
      reviewedBy: k.reviewedBy || null,
      reviewedAt: k.reviewedAt || null,
    };
  }));
}));

app.put('/kiosks/registration/:requestId/approve', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const kiosk = (await readDb('kiosks.json')).find((k) => k.kioskId === requestId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  }
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === requestId);
    if (idx === -1) return { data: kiosks, result: null };
    kiosks[idx] = { 
      ...kiosks[idx], 
      authorizationStatus: 'authorized',
      status: 'active',
      reviewedBy: req.auth.sub,
      reviewedAt: new Date().toISOString()
    };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  return sendSuccess(res, { success: true });
}));

app.put('/kiosks/registration/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const kiosk = (await readDb('kiosks.json')).find((k) => k.kioskId === requestId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  }
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === requestId);
    if (idx === -1) return { data: kiosks, result: null };
    kiosks[idx] = { 
      ...kiosks[idx], 
      authorizationStatus: 'unauthorized',
      status: 'disabled',
      reviewedBy: req.auth.sub,
      reviewedAt: new Date().toISOString()
    };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  return sendSuccess(res, { success: true });
}));

// ==================== KIOSK ROUTES (CRUD added â€” was read-only) ====================

app.get('/kiosks', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  return sendSuccess(res, kiosks.filter(adminScopeFilter(req)));
}));
app.get('/kiosks/:kioskId', requireAuth, asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, kiosk);
}));
app.post('/kiosks', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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
app.patch('/kiosks/:kioskId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
    if (idx === -1) return { data: kiosks, result: null };
    kiosks[idx] = { ...kiosks[idx], ...req.body };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, updated);
}));
app.delete('/kiosks/:kioskId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

app.get('/kiosks/setup-pin/:prisonId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

app.post('/kiosks/validate-setup-pin', asyncRoute(async (req, res) => {
  const { pin, prisonId } = req.body;
  if (!pin || !prisonId) {
    return sendError(res, 'INVALID_REQUEST', 'pin and prisonId are required', 400);
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

app.put('/kiosks/setup-pin', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

app.post('/kiosks/pin-change-request', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

app.get('/kiosks/pin-change-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

app.put('/kiosks/pin-change-request/:requestId/approve', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

app.put('/kiosks/pin-change-request/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

app.delete('/admin/prisoners/:prisonerId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonerId } = req.params;
  const deleted = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    const [removed] = inmates.splice(idx, 1);
    return { data: inmates, result: removed };
  });
  if (!deleted) return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);
  return sendSuccess(res, { message: 'Prisoner deleted successfully', prisonerId: deleted.inmateId });
}))

// ==================== ADMIN PROFILE (uses the authenticated identity, not a spoofable header) ====================

app.get('/admin/profile', requireAuth, asyncRoute(async (req, res) => {
  const admins = await readDb('admins.json');
  const admin = admins.find((a) => a.adminId === req.auth.sub);
  if (!admin) return sendError(res, 'NOT_FOUND', 'Admin not found', 404);
  const { password, pin, ...profile } = admin;
  return sendSuccess(res, profile);
}));
app.get('/admin/profile/:adminId', requireAuth, requireRole('admin', 'super-admin'), asyncRoute(async (req, res) => {
  const admins = await readDb('admins.json');
  const admin = admins.find((a) => a.adminId === req.params.adminId);
  if (!admin) return sendError(res, 'NOT_FOUND', 'Admin not found', 404);
  // Non-super-admins can only view their own profile
  const callerRole = req.auth?.role;
  if (callerRole !== 'super-admin' && callerRole !== 'super_admin' && req.auth?.sub !== req.params.adminId) {
    return sendError(res, 'FORBIDDEN', 'Cannot view other admin profiles', 403);
  }
  const { password, pin, ...profile } = admin;
  return sendSuccess(res, profile);
}));

// ==================== ANDROID COMPATIBILITY: BIOMETRICS ROUTES ====================

app.get('/admin/prisoners/:prisonerId/biometrics', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonerId } = req.params;
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === prisonerId && inAdminScope(req, i));
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);
  
  // Return biometric data from the inmate record
  const biometrics = inmate.biometricData || {};
  return sendSuccess(res, {
    prisonerId,
    biometrics,
    hasFace: biometrics.faceRegistered || false,
    hasFingerprint: biometrics.fingerprintRegistered || false,
    hasRfid: biometrics.rfidRegistered || false,
    lastUpdate: biometrics.lastBiometricUpdate
  });
}));

app.delete('/admin/biometrics/:biometricId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { biometricId } = req.params;
  
  // Parse biometricId format: BIO-{timestamp}-{TYPE}
  const parts = biometricId.split('-');
  if (parts.length < 3) return sendError(res, 'INVALID_REQUEST', 'Invalid biometric ID format', 400);
  
  const type = parts[parts.length - 1].toLowerCase();
  const prisonerId = req.query.prisonerId || req.body.prisonerId;
  
  if (!prisonerId) return sendError(res, 'INVALID_REQUEST', 'prisonerId query parameter is required', 400);

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    
    const biometricData = { ...inmates[idx].biometricData };
    
    if (type === 'face') {
      biometricData.faceRegistered = false;
      biometricData.faceEmbedding = null;
      biometricData.faceLiveness = null;
      biometricData.faceAntispoof = null;
    } else if (type === 'fingerprint') {
      biometricData.fingerprintRegistered = false;
      biometricData.fingerprintTemplate = null;
    } else if (type === 'rfid') {
      biometricData.rfidRegistered = false;
      biometricData.rfidToken = null;
    } else {
      return { data: inmates, result: null };
    }
    
    biometricData.lastBiometricUpdate = new Date().toISOString();
    inmates[idx] = { ...inmates[idx], biometricData };
    return { data: inmates, result: inmates[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Prisoner not found', 404);
  return sendSuccess(res, { message: 'Biometric deleted successfully', biometricId, prisonerId });
}));

// ==================== ADMIN ROUTER (mounted AFTER the explicit /admin routes
// so the specific routes above win over the router's generic /:adminId) ====================
// Admin router is authenticated: super-admin for account CRUD, admin/warden for biometrics.
app.use('/admin', requireAuth, adminRouter);

// ==================== WARDENS ====================

app.get('/wardens', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('wardens.json')))));
app.get('/wardens/:wardenId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const wardens = await readDb('wardens.json');
  const warden = wardens.find((w) => w.wardenId === req.params.wardenId);
  if (!warden || !(await inScopeOf(req, warden))) return sendError(res, 'NOT_FOUND', 'Warden not found', 404);
  return sendSuccess(res, warden);
}));

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: '2.0.0-real' });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  sendError(res, 'INTERNAL_ERROR', 'Something went wrong', 500);
});

// ==================== START ====================
const PORT = process.env.PORT || 3000;

// NOTE: Face recognition initialization made non-blocking - WASM module may fail on Render
// but server should still start for non-biometric operations
console.warn('[startup] attempting to load face recognition models (non-blocking)...');

let faceRecognitionAvailable = false;
try {
  const faceRecognition = require('./lib/faceRecognition');
  faceRecognition.loadModels()
    .then(() => {
      console.log('[startup] face recognition models loaded successfully');
      startServer();
    })
    .catch((err) => {
      console.warn('[startup] face recognition models failed to load (non-blocking):', err.message);
      console.warn('[startup] server will continue without face recognition capabilities');
      startServer();
    });
} catch (err) {
  console.warn('[startup] face recognition module not available (non-blocking):', err.message);
  console.warn('[startup] server will continue without face recognition capabilities');
  startServer();
}

function startServer() {
  server.listen(PORT, () => {
    console.log(`PrisonConnect backend running on port ${PORT}`);
    console.log(`API: https://prisonconnect-mockbackend.onrender.com:${PORT}`);
    console.log(`Socket.IO: https://prisonconnect-mockbackend.onrender.com:${PORT}`);
  });
}

module.exports = { app, server, io };
