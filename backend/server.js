require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const { readDb, updateDb } = require('./lib/db');
const { verifyToken, hashSecret } = require('./lib/auth');
const { requireAuth, requireRole } = require('./middleware/auth');
const { sendSuccess, sendError, asyncRoute, deepMerge } = require('./lib/response');
const { jailScopeOf, inAdminScope, inScopeOf, scopeList, kioskScopeOf } = require('./lib/scoping');
const { paginate } = require('./lib/paginate');
const { buildInmateIndex } = require('./lib/kioskView');
const { rfidCardNumberFor } = require('./lib/biometrics');
const { verifyWebhookSignature } = require('./lib/razorpay');
const { creditFromRazorpay, markPaymentFailed, sweepWalletPayments } = require('./lib/wallet-credit');

/** Kiosk-admin username: what the operator types on the terminal to sign in. */
const EMPLOYEE_ID_RE = /^[A-Za-z0-9._-]{3,40}$/;

const { router: authRouter } = require('./auth-routes');
const { router: adminRouter } = require('./admin-routes');

const kiosksRouter = require('./routes/kiosks');
const authRoutesRouter = require('./routes/auth');
const createCallsRouter = require('./routes/calls');
const { sweepStaleCalls } = require('./routes/calls');
const familyRouter = require('./routes/family');
const walletLinkRouter = require('./routes/wallet-link');
const inmatesRouter = require('./routes/inmates');
const createContactsRouter = require('./routes/contacts');
const scheduleRouter = require('./routes/schedule');
const createStatisticsRouter = require('./routes/statistics');
const prisonsRouter = require('./routes/prisons');
const createSettingsRouter = require('./routes/settings');
const misRouter = require('./routes/mis');

const app = express();
// Trust exactly one proxy hop (Render/nginx) so req.ip sees the real client
// behind it. A *direct* client can still spoof X-Forwarded-For, so per-IP rate
// limits are best-effort only - the per-token limiter in routes/wallet-link.js
// is the spoof-proof control (60/h per hashed token, regardless of source IP).
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
});

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// Baseline response hardening. The backend serves JSON only (SPAs are hosted
// separately and carry their own CSP meta), so the policy here can be strict:
// nothing to execute, nothing to frame, nothing to sniff.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});
// Wallet-link payment endpoints only ever receive tiny JSON bodies ({amount}
// or three short strings). Reject oversized payloads BEFORE the global parser
// touches them — cheap flood guard on the money surface. Runs pre-parse on
// purpose: router-level checks would fire after the body was already read.
app.use('/family/wallet-link', (req, res, next) => {
  const len = Number(req.headers['content-length']) || 0;
  if (len > 8 * 1024) return sendError(res, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413);
  next();
});
// verify keeps the original bytes so the Razorpay webhook can HMAC its raw
// body (the parsed req.body would fail signature verification).
app.use(express.json({
  limit: process.env.JSON_BODY_LIMIT || '10mb',
  verify: (req, res, buf) => { if (buf && buf.length) req.rawBody = buf; },
}));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Malformed JSON request body:', err.body);
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Invalid JSON payload sent in request body' },
      timestamp: Date.now()
    });
  }
  next();
});

// ==================== SOCKET.IO ====================
// Only a holder of a valid JWT gets a socket. Handshake auth is checked on
// every (re)connection so a dropped connection cannot rejoin anonymously —
// broadcastEvent() is io.emit(), i.e. every event goes to every connected
// socket, so "connected" must mean "authenticated".
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    socket.data.auth = verifyToken(token);
    next();
  } catch (err) {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id} (peer=${socket.data.auth.sub} role=${socket.data.auth.role})`);
  socket.on('disconnect', () => {});
});

function broadcastEvent(event, data) {
  io.emit(event, data);
}

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

const settingsRouter = createSettingsRouter(broadcastEvent);
const walletsRouter = require('./routes/wallets');
const callWalletRouter = require('./routes/call-wallet');

// ==================== MOUNT ROUTES ====================
app.use('/auth', authRouter);
app.use('/kiosks', kiosksRouter);
app.use('/auth', authRoutesRouter);
app.use('/calls', createCallsRouter(broadcastEvent, signaling));
app.use('/family', familyRouter);
app.use('/family', walletLinkRouter);
app.use('/family', callWalletRouter);
app.use('/inmates', inmatesRouter);
app.use('/contacts', createContactsRouter());
app.use('/schedule', scheduleRouter);
app.use('/statistics', createStatisticsRouter());
app.use('/prisons', prisonsRouter);
app.use('/settings', settingsRouter);
app.use('/wallets', walletsRouter);
app.use('/mis', misRouter);

// ==================== RAZORPAY WEBHOOK ====================
// Signature is HMAC over the raw body; crediting uses the same idempotent
// helper as the family verify endpoint, so retries/double-delivery can never
// double-credit (orderId is the key, checked inside the transactions mutex).
app.post('/api/webhooks/razorpay', asyncRoute(async (req, res) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return sendError(res, 'WEBHOOK_NOT_CONFIGURED', 'Webhook secret not configured', 503);
  }
  const signature = req.headers['x-razorpay-signature'];
  if (!req.rawBody || !verifyWebhookSignature(req.rawBody, signature)) {
    return sendError(res, 'SIGNATURE_INVALID', 'Invalid webhook signature', 400);
  }
  let event;
  try {
    event = JSON.parse(req.rawBody.toString('utf8'));
  } catch (e) {
    return sendError(res, 'BAD_REQUEST', 'Invalid webhook payload', 400);
  }

  const payment = event && event.payload && event.payload.payment && event.payload.payment.entity;
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment && payment.order_id) {
    const out = await creditFromRazorpay({ orderId: payment.order_id, paymentId: payment.id, entity: payment });
    if (!out.ok) {
      // unknown_order = not ours (test mode noise); anything else is logged
      // for the sweep/ops - never 5xx, Razorpay would only retry uselessly.
      console.warn(`[razorpay-webhook] ${event.event} for ${payment.order_id} not credited: ${out.reason}`);
    } else if (out.alreadyCredited) {
      console.log(`[razorpay-webhook] duplicate delivery for ${payment.order_id} ignored`);
    } else {
      console.log(`[razorpay-webhook] credited ${out.netPaise} paise (net) for ${payment.order_id}`);
    }
  } else if (event.event === 'payment.failed' && payment && payment.order_id) {
    await markPaymentFailed(payment.order_id, payment.error_description || 'payment_failed');
  }

  // 2xx once the signature is valid so Razorpay stops retrying; genuinely
  // lost credits are recovered by sweepWalletPayments().
  return sendSuccess(res, { received: true });
}));

// Alias routes — dashboard expects these at root, not under /settings
app.get('/pricing', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'vendor', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await readDb('pricing.json'))));
app.patch('/pricing', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { deepMerge } = require('./lib/response');
  const merged = await updateDb('pricing.json', (all) => {
    const base = all || {};
    const result = deepMerge(base, { ...req.body });
    return { data: result, result };
  });
  broadcastEvent('pricing-updated', merged);
  return sendSuccess(res, merged);
}));
app.get('/subscriptions', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('subscriptions.json')))));
app.get('/reports', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('reports.json')))));

// ==================== WALLET REQUESTS ====================
// REMOVED: the warden approve/reject inbox, admin-created requests and the
// inmate keypad request are gone. Wallet money enters only through the family
// Razorpay wallet-link flow (routes/wallet-link.js).

// ==================== WARDENS ====================
// A warden's prison can be missing from the token (accounts created before a
// prison was assigned), and a scope with no jail returns every prison's staff.
// Fall back to the warden record so the list is always this jail's own wardens.
async function effectiveJailId(req) {
  const claimed = jailScopeOf(req);
  if (claimed) return claimed;
  if (req.auth?.role !== 'warden') return null;
  const [wardens, prisons] = await Promise.all([readDb('wardens.json'), readDb('prisons.json')]);
  const me = wardens.find((w) => w.wardenId === req.auth.sub);
  if (me?.prisonId) return me.prisonId;
  const linked = prisons.find((p) => (p.wardenIds || []).includes(req.auth.sub));
  return linked?.prisonId || null;
}

// The account created through "Create Account" is the jail's chief warden, and
// only the chief may add wardens; everyone added afterwards is a plain warden.
// Older records predate that flag, so the earliest-created warden of the jail
// stands in until one is explicitly marked.
function chiefWardenOf(jailId, wardens) {
  if (!jailId) return null;
  const own = wardens.filter((w) => w.prisonId === jailId);
  const marked = own.find((w) => w.isChiefWarden);
  if (marked) return marked;
  const sorted = own.slice().sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
    String(a.wardenId || '').localeCompare(String(b.wardenId || '')));
  return sorted[0] || null;
}

function withoutSecrets(warden) {
  const { password, pin, ...safe } = warden;
  void password;
  void pin;
  return safe;
}

// Everything on this page is one jail's own staff; only a super admin is
// allowed to look across prisons, and a warden with no linked jail sees nothing
// rather than another prison's records.
function staffInScope(jailId, role, rows) {
  if (jailId) return rows.filter((w) => w.prisonId === jailId);
  return role === 'super-admin' || role === 'super_admin' ? rows : [];
}

app.get('/wardens', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const jailId = await effectiveJailId(req);
  const all = await readDb('wardens.json');
  const wardens = staffInScope(jailId, req.auth?.role, all);
  const chief = chiefWardenOf(jailId, all);
  const statusFilter = req.query.status;
  const filtered = (statusFilter && statusFilter !== 'all')
    ? wardens.filter((w) => w.status === statusFilter)
    : wardens;
  const result = await paginate({
    req, data: filtered,
    search: (w, q) =>
      (w.name || '').toLowerCase().includes(q) ||
      (w.wardenId || '').toLowerCase().includes(q) ||
      (w.email || '').toLowerCase().includes(q) ||
      (w.employeeId || '').toLowerCase().includes(q),
    searchFields: [],
    defaultSort: 'name',
  });
  result.items = (result.items || []).map((w) => ({
    ...withoutSecrets(w),
    isChiefWarden: !!chief && w.wardenId === chief.wardenId,
  }));
  return sendSuccess(res, result);
}));
app.get('/wardens/stats', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const jailId = await effectiveJailId(req);
  const all = await readDb('wardens.json');
  const wardens = staffInScope(jailId, req.auth?.role, all);
  const chief = chiefWardenOf(jailId, all);
  return sendSuccess(res, {
    total: wardens.length,
    activeCount: wardens.filter((w) => w.status === 'active').length,
    inactiveCount: wardens.filter((w) => w.status === 'inactive').length,
    onLeaveCount: wardens.filter((w) => w.status === 'on_leave').length,
    // Only the chief of this jail gets the "Add New Warden" action.
    canManageWardens: !!(chief && req.auth?.sub === chief.wardenId),
  });
}));

// Only the chief warden may create wardens, and they always land in the
// chief's own jail — a warden can never seed staff into another prison.
app.post('/wardens', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const jailId = await effectiveJailId(req);
  if (!jailId) return sendError(res, 'FORBIDDEN', 'Your account is not linked to a prison yet', 403);

  const all = await readDb('wardens.json');
  const chief = chiefWardenOf(jailId, all);
  if (req.auth?.role === 'warden' && !(chief && req.auth.sub === chief.wardenId)) {
    return sendError(res, 'FORBIDDEN', 'Only the chief warden can add wardens', 403);
  }

  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const phone = String(req.body.phone || '').trim();
  const designation = String(req.body.designation || '').trim() || 'Warden';

  if (!name || !email || !password) {
    return sendError(res, 'INVALID_REQUEST', 'name, email and password are required', 400);
  }
  if (password.length < 6) {
    return sendError(res, 'INVALID_REQUEST', 'password must be at least 6 characters', 400);
  }
  if (all.some((w) => String(w.email || '').toLowerCase() === email)) {
    return sendError(res, 'DUPLICATE', 'A warden with this email already exists', 409);
  }

  const now = new Date().toISOString();
  const newWarden = {
    wardenId: `WARDEN-${uuidv4().substring(0, 8).toUpperCase()}`,
    employeeId: `EMP-${uuidv4().substring(0, 6).toUpperCase()}`,
    name,
    email,
    phone,
    designation,
    prisonId: jailId,
    permissions: ['view_calls', 'view_reports'],
    status: 'active',
    password: await hashSecret(password),
    isChiefWarden: false,
    createdBy: req.auth.sub,
    createdAt: now,
  };
  await updateDb('wardens.json', (rows) => ({ data: [...rows, newWarden], result: newWarden }));
  // The jail keeps its own roster: without this the array written at
  // registration stays frozen and effectiveJailId can never fall back to it.
  await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === jailId);
    if (idx === -1) return { data: prisons, result: null };
    const roster = Array.isArray(prisons[idx].wardenIds) ? prisons[idx].wardenIds : [];
    if (roster.includes(newWarden.wardenId)) return { data: prisons, result: prisons[idx] };
    prisons[idx] = { ...prisons[idx], wardenIds: [...roster, newWarden.wardenId] };
    return { data: prisons, result: prisons[idx] };
  });
  return sendSuccess(res, withoutSecrets(newWarden), 201);
}));

// ==================== KIOSK ADMINS ====================
// Staff who operate a kiosk device, shown with the device's location and
// prisoner load so a warden can see who is on which terminal in this jail.
// A kiosk admin sees the same staff page as their warden does - scoped to the
// same prison - so the roles below include 'kiosk_admin' on all three routes.
app.get('/kiosk-admins', requireAuth, requireRole('admin', 'kiosk_admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const jailId = await effectiveJailId(req);
  const [admins, kiosks, inmates] = await Promise.all([
    readDb('admins.json'),
    readDb('kiosks.json'),
    readDb('inmates.json'),
  ]);
  const index = buildInmateIndex({ inmates });

  const data = staffInScope(jailId, req.auth?.role, admins.filter((a) => a.role === 'kiosk_admin'))
    .map((a) => {
      const kiosk = kiosks.find((k) => k.kioskId === a.kioskId);
      const { password, pin, biometricData, ...safe } = a;
      void password;
      void pin;
      void biometricData;
      return {
        ...safe,
        kioskId: a.kioskId || null,
        location: kiosk?.location || null,
        registeredInmates: a.kioskId ? index.countFor(a.kioskId) : 0,
      };
    });
  return sendSuccess(res, data);
}));

// Kiosk admins are this jail's staff, so the jail's wardens may create, edit or
// remove them here; the vendor console keeps its own super-admin-only /admin
// routes. All three routes refuse a row from another prison unless the caller
// is a super admin.
app.post('/kiosk-admins', requireAuth, requireRole('admin', 'kiosk_admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const isSuper = ['super-admin', 'super_admin'].includes(req.auth?.role);
  const jailId = await effectiveJailId(req);
  if (!isSuper && !jailId) return sendError(res, 'FORBIDDEN', 'Your account is not linked to a prison yet', 403);

  const name = String(req.body.name || '').trim();
  const employeeId = String(req.body.employeeId || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !employeeId || !password) {
    return sendError(res, 'INVALID_REQUEST', 'name, username and password are required', 400);
  }
  if (!EMPLOYEE_ID_RE.test(employeeId)) {
    return sendError(res, 'INVALID_REQUEST', 'username must be 3-40 characters: letters, digits, dot, dash or underscore', 400);
  }
  if (password.length < 6) return sendError(res, 'INVALID_REQUEST', 'password must be at least 6 characters', 400);

  const admins = await readDb('admins.json');
  if (admins.some((a) => String(a.employeeId || '').toLowerCase() === employeeId.toLowerCase())) {
    return sendError(res, 'DUPLICATE', 'That username is already taken', 409);
  }
  if (email && admins.some((a) => String(a.email || '').toLowerCase() === email)) {
    return sendError(res, 'DUPLICATE', 'A kiosk admin with this email already exists', 409);
  }

  const record = {
    adminId: `ADMIN-${uuidv4().substring(0, 8).toUpperCase()}`,
    employeeId,
    name,
    email: email || null,
    role: 'kiosk_admin',
    permissions: ['manage_inmates', 'manage_contacts', 'view_calls', 'view_schedule', 'manage_alerts'],
    status: 'active',
    password: await hashSecret(password),
    kioskId: null,
    prisonId: jailId || req.body.prisonId || null,
    createdAt: new Date().toISOString(),
  };
  await updateDb('admins.json', (all) => ({ data: [...all, record], result: record }));

  const { password: _password, pin, biometricData, ...safe } = record;
  void _password;
  void pin;
  void biometricData;
  return sendSuccess(res, safe, 201);
}));

app.patch('/kiosk-admins/:adminId', requireAuth, requireRole('admin', 'kiosk_admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const isSuper = ['super-admin', 'super_admin'].includes(req.auth?.role);
  const jailId = await effectiveJailId(req);
  if (!isSuper && !jailId) return sendError(res, 'FORBIDDEN', 'Your account is not linked to a prison yet', 403);

  const patch = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return sendError(res, 'INVALID_REQUEST', 'name cannot be empty', 400);
    patch.name = name;
  }
  // The username a kiosk operator types on the terminal - unique, like on create.
  if (req.body.employeeId !== undefined) {
    const employeeId = String(req.body.employeeId).trim();
    if (!EMPLOYEE_ID_RE.test(employeeId)) {
      return sendError(res, 'INVALID_REQUEST', 'username must be 3-40 characters: letters, digits, dot, dash or underscore', 400);
    }
    const admins = await readDb('admins.json');
    if (admins.some((a) => a.adminId !== req.params.adminId && String(a.employeeId || '').toLowerCase() === employeeId.toLowerCase())) {
      return sendError(res, 'DUPLICATE', 'That username is already taken', 409);
    }
    patch.employeeId = employeeId;
  }
  // Email is the other way to sign in on a kiosk - kept unique and lowercased
  // exactly like on create.
  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 'INVALID_REQUEST', 'enter a valid email', 400);
    }
    const admins = await readDb('admins.json');
    if (email && admins.some((a) => a.adminId !== req.params.adminId && String(a.email || '').toLowerCase() === email)) {
      return sendError(res, 'DUPLICATE', 'A kiosk admin with this email already exists', 409);
    }
    patch.email = email || null;
  }
  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!['active', 'inactive', 'on_leave'].includes(status)) {
      return sendError(res, 'INVALID_REQUEST', 'status must be active, inactive or on_leave', 400);
    }
    patch.status = status;
  }
  if (req.body.permissions !== undefined) {
    if (!Array.isArray(req.body.permissions)) {
      return sendError(res, 'INVALID_REQUEST', 'permissions must be an array', 400);
    }
    patch.permissions = req.body.permissions.map(String);
  }
  // Password reset from the same form: hashed here, never returned.
  if (req.body.password !== undefined) {
    const password = String(req.body.password);
    if (password.length < 6) {
      return sendError(res, 'INVALID_REQUEST', 'password must be at least 6 characters', 400);
    }
    patch.password = await hashSecret(password);
  }
  if (Object.keys(patch).length === 0) return sendError(res, 'INVALID_REQUEST', 'nothing to update', 400);

  const updated = await updateDb('admins.json', (all) => {
    const idx = all.findIndex((a) => a.adminId === req.params.adminId && a.role === 'kiosk_admin');
    if (idx === -1 || (!isSuper && all[idx].prisonId !== jailId)) return { data: all, result: null };
    all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
    return { data: all, result: all[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Kiosk admin not found', 404);

  const { password, pin, biometricData, ...safe } = updated;
  void password;
  void pin;
  void biometricData;
  return sendSuccess(res, safe);
}));

app.delete('/kiosk-admins/:adminId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const isSuper = ['super-admin', 'super_admin'].includes(req.auth?.role);
  const jailId = await effectiveJailId(req);
  if (!isSuper && !jailId) return sendError(res, 'FORBIDDEN', 'Your account is not linked to a prison yet', 403);

  const removed = await updateDb('admins.json', (all) => {
    const idx = all.findIndex((a) => a.adminId === req.params.adminId && a.role === 'kiosk_admin');
    if (idx === -1 || (!isSuper && all[idx].prisonId !== jailId)) return { data: all, result: null };
    const [gone] = all.splice(idx, 1);
    return { data: all, result: gone };
  });
  if (!removed) return sendError(res, 'NOT_FOUND', 'Kiosk admin not found', 404);

  return sendSuccess(res, { message: 'Kiosk admin deleted', adminId: removed.adminId });
}));
app.get('/wardens/:wardenId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const wardens = await readDb('wardens.json');
  const warden = wardens.find((w) => w.wardenId === req.params.wardenId);
  if (!warden || !(await inScopeOf(req, warden))) return sendError(res, 'NOT_FOUND', 'Warden not found', 404);
  return sendSuccess(res, warden);
}));

// Same rule as POST /wardens: the chief warden of the jail manages its wardens,
// an admin needs a jail to manage, a super admin manages everywhere.
async function wardenWriteGuard(req) {
  const role = req.auth?.role;
  const jailId = await effectiveJailId(req);
  if (role === 'super-admin' || role === 'super_admin') return { ok: true, jailId };
  if (!jailId) return { ok: false, code: 'FORBIDDEN', message: 'Your account is not linked to a prison yet', status: 403 };
  if (role === 'warden') {
    const chief = chiefWardenOf(jailId, await readDb('wardens.json'));
    if (!(chief && req.auth.sub === chief.wardenId)) {
      return { ok: false, code: 'FORBIDDEN', message: 'Only the chief warden can manage wardens', status: 403 };
    }
  }
  return { ok: true, jailId };
}

function wardenGuardError(res, guard) {
  return sendError(res, guard.code, guard.message, guard.status);
}

app.patch('/wardens/:wardenId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const guard = await wardenWriteGuard(req);
  if (!guard.ok) return wardenGuardError(res, guard);

  const patch = {};
  // department is not a warden field any more - it is dropped if a client
  // still sends it.
  for (const key of ['name', 'phone']) {
    if (req.body[key] !== undefined) patch[key] = String(req.body[key]).trim();
  }
  // Designation is set on creation ("Warden") and never blanked by a patch.
  if (req.body.designation !== undefined && String(req.body.designation).trim()) {
    patch.designation = String(req.body.designation).trim();
  }
  // Email doubles as the warden's sign-in name, so it stays unique.
  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!email) return sendError(res, 'INVALID_REQUEST', 'email cannot be empty', 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 'INVALID_REQUEST', 'enter a valid email', 400);
    const wardens = await readDb('wardens.json');
    if (wardens.some((w) => w.wardenId !== req.params.wardenId && String(w.email || '').toLowerCase() === email)) {
      return sendError(res, 'DUPLICATE', 'A warden with this email already exists', 409);
    }
    patch.email = email;
  }
  if ('name' in patch && !patch.name) return sendError(res, 'INVALID_REQUEST', 'name cannot be empty', 400);
  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!['active', 'inactive', 'on_leave'].includes(status)) {
      return sendError(res, 'INVALID_REQUEST', 'status must be active, inactive or on_leave', 400);
    }
    patch.status = status;
  }
  if (req.body.password !== undefined) {
    const password = String(req.body.password);
    if (password.length < 6) {
      return sendError(res, 'INVALID_REQUEST', 'password must be at least 6 characters', 400);
    }
    patch.password = await hashSecret(password);
  }
  if (Object.keys(patch).length === 0) return sendError(res, 'INVALID_REQUEST', 'nothing to update', 400);

  // All row checks run inside the write transaction: scope, the chief warden
  // protections and the no-deactivating-yourself rule cannot be raced around.
  let refusal = null;
  const updated = await updateDb('wardens.json', (rows) => {
    const idx = rows.findIndex((w) => w.wardenId === req.params.wardenId);
    const deny = (code, message, status) => {
      refusal = { code, message, status };
      return { data: rows, result: null };
    };
    if (idx === -1) return deny('NOT_FOUND', 'Warden not found', 404);
    const target = rows[idx];
    if (guard.jailId && target.prisonId !== guard.jailId) return deny('NOT_FOUND', 'Warden not found', 404);
    const chief = chiefWardenOf(target.prisonId, rows);
    const isChief = !!chief && chief.wardenId === target.wardenId;
    if (isChief && patch.status && patch.status !== 'active') {
      return deny('FORBIDDEN', 'The chief warden cannot be deactivated', 403);
    }
    if (target.wardenId === req.auth?.sub && patch.status && patch.status !== 'active') {
      return deny('FORBIDDEN', 'You cannot deactivate your own account', 403);
    }
    rows[idx] = { ...target, ...patch, updatedAt: new Date().toISOString() };
    return { data: rows, result: rows[idx] };
  });
  if (!updated) return sendError(res, refusal.code, refusal.message, refusal.status);

  return sendSuccess(res, withoutSecrets(updated));
}));

app.delete('/wardens/:wardenId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const guard = await wardenWriteGuard(req);
  if (!guard.ok) return wardenGuardError(res, guard);

  let refusal = null;
  const removed = await updateDb('wardens.json', (rows) => {
    const idx = rows.findIndex((w) => w.wardenId === req.params.wardenId);
    const deny = (code, message, status) => {
      refusal = { code, message, status };
      return { data: rows, result: null };
    };
    if (idx === -1) return deny('NOT_FOUND', 'Warden not found', 404);
    const target = rows[idx];
    if (guard.jailId && target.prisonId !== guard.jailId) return deny('NOT_FOUND', 'Warden not found', 404);
    const chief = chiefWardenOf(target.prisonId, rows);
    const isChief = !!chief && chief.wardenId === target.wardenId;
    if (isChief) return deny('FORBIDDEN', 'The chief warden cannot be deleted', 403);
    if (target.wardenId === req.auth?.sub) return deny('FORBIDDEN', 'You cannot delete your own account', 403);
    const [gone] = rows.splice(idx, 1);
    return { data: rows, result: gone };
  });
  if (!removed) return sendError(res, refusal.code, refusal.message, refusal.status);

  // The jail roster has to drop the id too - 005 rebuilds wardenIds from the
  // rows that exist, and a stale entry would resurrect on the next rebuild.
  await updateDb('prisons.json', (prisons) => {
    const jail = prisons.find((p) => p.prisonId === removed.prisonId);
    if (!jail || !Array.isArray(jail.wardenIds) || !jail.wardenIds.includes(removed.wardenId)) {
      return { data: prisons, result: null };
    }
    jail.wardenIds = jail.wardenIds.filter((id) => id !== removed.wardenId);
    return { data: prisons, result: jail };
  });

  return sendSuccess(res, { message: 'Warden deleted', wardenId: removed.wardenId });
}));

// ==================== ADMIN PROFILE ====================
// Self profile only: the kiosk admin screen reads it. Looking up another
// admin by id had no caller and was removed.
app.get('/admin/profile', requireAuth, asyncRoute(async (req, res) => {
  const admins = await readDb('admins.json');
  const admin = admins.find((a) => a.adminId === req.auth.sub);
  if (!admin) return sendError(res, 'NOT_FOUND', 'Admin not found', 404);
  const { password, pin, ...profile } = admin;
  return sendSuccess(res, profile);
}));

// ==================== INMATE SELF-SERVICE (dashboard data) ====================
const { getStatement, resolveInmate } = require('./lib/jail-account');

app.get('/inmate/profile/:inmateId', requireAuth, asyncRoute(async (req, res) => {
  const id = req.params.inmateId;
  const inmate = await resolveInmate(id);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  if (!(await inScopeOf(req, inmate))) return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  if (inmate.status && inmate.status !== 'active') return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  return sendSuccess(res, {
    inmateId: inmate.inmateId,
    prisonerNumber: inmate.prisonerNumber || null,
    name: inmate.name || inmate.fullName || [inmate.firstName, inmate.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
    prisonId: inmate.prisonId,
    facility: inmate.facility || inmate.prisonId,
    status: inmate.status || 'active',
    photoUrl: inmate.photoUrl || null,
    // Display details for the kiosk profile card (no sensitive material).
    gender: inmate.gender || null,
    age: inmate.age != null ? String(inmate.age) : null,
    district: inmate.district || null,
    state: inmate.state || null,
    religion: inmate.religion || null,
    nationality: inmate.nationality || null,
    dateOfAdmission: inmate.dateOfAdmission || null,
    rfidCardNumber: rfidCardNumberFor(inmate),
    rfidRegistered: !!(inmate.biometricData && inmate.biometricData.rfidRegistered)
  });
}));

app.get('/inmate/balance/:inmateId', requireAuth, asyncRoute(async (req, res) => {
  const id = req.params.inmateId;
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === id);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  if (!(await inScopeOf(req, inmate))) return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  if (inmate.status && inmate.status !== 'active') return sendError(res, 'NOT_FOUND', 'Record not found', 404);
  const statement = await getStatement(id);
  if (!statement) return sendError(res, 'NOT_FOUND', 'Inmate or wallet not found', 404);
  const { wallet } = statement;
  return sendSuccess(res, {
    balance: wallet.balance,
    currency: wallet.currency || 'INR',
    lastRecharge: wallet.lastRecharge,
    totalSpent: wallet.totalSpent,
    remainingMinutes: wallet.remainingMinutes || 0,
    lastRechargeAmount: wallet.lastRechargeAmount
  });
}));

app.get('/inmate/wallet/:inmateId', requireAuth, asyncRoute(async (req, res) => {
  const id = req.params.inmateId;
  // Scope check: ensure warden/admin can only access their own jail's inmates
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === id);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  if (!(await inScopeOf(req, inmate))) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  const statement = await getStatement(id);
  if (!statement) return sendError(res, 'NOT_FOUND', 'Inmate or wallet not found', 404);
  return sendSuccess(res, statement);
}));

// ==================== INMATE: REQUEST BALANCE (kiosk) ====================
// REMOVED: the kiosk keypad "request balance" flow. Family sees only the
// wallet-link page now — no pending request signal, no warden inbox.

// Admin router mounted AFTER explicit /admin routes
app.use('/admin', requireAuth, adminRouter);

// ==================== HEALTH CHECK ====================
app.get('/health', asyncRoute(async (req, res) => {
  const { PROVIDER, senderIdFor, effectiveProvider } = require('./lib/sms');
  const { probeGeo } = require('./lib/geocode');
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '2.0.0-real',
    // /health?geocode=19.076,72.8777 (&fresh=1 to skip the cache) -> live check
    // that this host reaches the free reverse-geocoder, plus the last failure.
    geocode: req.query.geocode !== undefined ? await probeGeo(req.query.geocode, req.query.fresh !== undefined) : undefined,
    sms: {
      provider: PROVIDER || process.env.SMS_PROVIDER || 'log',
      hasApiKey: !!process.env.FAST2SMS_API_KEY,
      domain: process.env.SMS_OTP_DOMAIN || '(none)',
      // Which DLT header each kind goes out under, and whether that kind is
      // actually routed to the gateway (some stay on `log` on purpose).
      senders: {
        shared: process.env.FAST2SMS_SENDER_ID || '(none)',
        otp: senderIdFor('otp') || '(none)',
        link: senderIdFor('link') || '(none)',
        scheduled: senderIdFor('scheduled') || '(none)',
      },
      routes: {
        otp: effectiveProvider('otp'),
        link: effectiveProvider('link'),
        scheduled: effectiveProvider('scheduled'),
      },
    }
  });
}));

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  if (res.headersSent) {
    return next(err);
  }
  sendError(res, 'INTERNAL_ERROR', 'Something went wrong', 500);
});

// ==================== START ====================
const PORT = process.env.PORT || 3000;

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('[startup] DATABASE_URL not set — skipping migrations');
    return;
  }
  try {
    // Migrations run on every boot: they are idempotent (tracked in
    // schema_migrations) and a redeploy must never leave a table behind the
    // code that reads it. There is no data seeding anymore — a fresh database
    // starts empty and fills through the API (register → setup password → kiosk).
    const { migrate } = require('./lib/migrate');
    await migrate();
  } catch (err) {
    console.error('[startup] migration failed (non-blocking):', err.message);
  }
}

// Start only when launched directly (`node server.js`); tests import `app`
// without binding a port or starting sweep intervals.
if (require.main === module) {
  runMigrations().then(() => startServer());
}

module.exports = { app, server };

function startServer() {
  server.listen(PORT, () => {
    console.log(`PrisonConnect backend running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}`);
    console.log(`Socket.IO: http://localhost:${PORT}`);
  });

  // Periodic sweep: finalize orphaned active calls every 2 minutes
  setInterval(() => sweepStaleCalls(broadcastEvent), 2 * 60 * 1000);

// Razorpay reconciliation: catch payments the gateway captured while this
// server could not process the webhook (downtime, restart). 15-min interval
// plus one catch-up run a minute after boot.
const sweepWallet = () => sweepWalletPayments().catch((err) => console.warn(`[wallet-sweep] ${err.message}`));
setInterval(sweepWallet, 15 * 60 * 1000);
setTimeout(sweepWallet, 60 * 1000);
}
