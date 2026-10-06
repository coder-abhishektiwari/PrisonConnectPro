require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const { readDb, updateDb } = require('./lib/db');
const { verifyToken, hashSecret } = require('./lib/auth');
const { requireAuth, requireRole } = require('./middleware/auth');
const { sendSms, otpTemplateVars } = require('./lib/sms');
const { sendSuccess, sendError, asyncRoute, deepMerge } = require('./lib/response');
const { jailScopeOf, inAdminScope, inScopeOf, scopeList, kioskScopeOf } = require('./lib/scoping');
const { paginate } = require('./lib/paginate');
const { buildWardIndex } = require('./lib/kioskView');

const { router: authRouter } = require('./auth-routes');
const { router: adminRouter } = require('./admin-routes');

const kiosksRouter = require('./routes/kiosks');
const authRoutesRouter = require('./routes/auth');
const createCallsRouter = require('./routes/calls');
const { sweepStaleCalls } = require('./routes/calls');
const familyRouter = require('./routes/family');
const inmatesRouter = require('./routes/inmates');
const createContactsRouter = require('./routes/contacts');
const createRoomsRouter = require('./routes/rooms');
const scheduleRouter = require('./routes/schedule');
const createRecordingsRouter = require('./routes/recordings');
const createAlertsRouter = require('./routes/alerts');
const createDevicesRouter = require('./routes/devices');
const createStatisticsRouter = require('./routes/statistics');
const createIncidentsRouter = require('./routes/incidents');
const prisonsRouter = require('./routes/prisons');
const transactionsRouter = require('./routes/transactions');
const createSettingsRouter = require('./routes/settings');
const { createCellsRouter, createBlocksRouter } = require('./routes/cells-blocks');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
});

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));

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
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    // Allow unauthenticated connections for dashboard monitoring
    socket.data.auth = { sub: 'anonymous', role: 'warden' };
    return next();
  }
  try {
    socket.data.auth = verifyToken(token);
    next();
  } catch (err) {
    // Allow connection even with invalid token for monitoring
    socket.data.auth = { sub: 'anonymous', role: 'warden' };
    next();
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

// ==================== MOUNT ROUTES ====================
app.use('/auth', authRouter);
app.use('/kiosks', kiosksRouter);
app.use('/auth', authRoutesRouter);
app.use('/calls', createCallsRouter(broadcastEvent, signaling));
app.use('/family', familyRouter);
app.use('/inmates', inmatesRouter);
app.use('/contacts', createContactsRouter(broadcastEvent));
app.use('/rooms', createRoomsRouter(broadcastEvent));
app.use('/schedule', scheduleRouter);
app.use('/recordings', createRecordingsRouter(broadcastEvent));
app.use('/alerts', createAlertsRouter(broadcastEvent));
app.use('/devices', createDevicesRouter(broadcastEvent));
app.use('/statistics', createStatisticsRouter(broadcastEvent));
app.use('/incidents', createIncidentsRouter(broadcastEvent));
app.use('/prisons', prisonsRouter);
app.use('/transactions', transactionsRouter);
app.use('/settings', settingsRouter);
app.use('/wallets', walletsRouter);
app.use('/cells', createCellsRouter());
app.use('/blocks', createBlocksRouter());

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
app.get('/storage', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { readDb } = require('./lib/db');
  const storage = await readDb('storage.json');
  return sendSuccess(res, storage);
}));
app.get('/reports/:reportId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const reports = await readDb('reports.json');
  const report = reports.find((r) => r.reportId === req.params.reportId);
  if (!report || !(await inScopeOf(req, report))) return sendError(res, 'NOT_FOUND', 'Report not found', 404);
  return sendSuccess(res, report);
}));

// ==================== WALLET REQUESTS ====================
app.get('/wallet-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const all = await readDb('wallet-requests.json');
  return sendSuccess(res, await scopeList(req, all));
}));

app.post('/wallet-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { inmateId, amount, reason } = req.body;
  if (!inmateId || !amount) return sendError(res, 'BAD_REQUEST', 'inmateId and amount required');

  const request = {
    requestId: `WR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    inmateId,
    amount: Number(amount),
    reason: reason || '',
    status: 'pending',
    requestedBy: req.auth?.sub || 'system',
    requestedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null
  };

  await updateDb('wallet-requests.json', (all) => {
    all.push(request);
    return { data: all, result: request };
  });

  return sendSuccess(res, request);
}));

app.patch('/wallet-requests/:requestId/approve', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;

  // Claim the request INSIDE the wallet-requests mutex. The `pending` check
  // has to be part of the same atomic write it flips: reading it first and
  // writing later let two concurrent approves both see 'pending' and both
  // credit the wallet.
  const claim = await updateDb('wallet-requests.json', (data) => {
    const i = data.findIndex((r) => r.requestId === requestId);
    if (i === -1) return { data, result: { notFound: true } };
    if (data[i].status !== 'pending') {
      return { data, result: { alreadyProcessed: true, request: data[i] } };
    }
    data[i] = {
      ...data[i],
      status: 'approved',
      reviewedBy: req.auth?.sub || 'system',
      reviewedAt: new Date().toISOString(),
    };
    return { data, result: { request: data[i] } };
  });

  if (!claim || !claim.request) return sendError(res, 'NOT_FOUND', 'Request not found', 404);
  if (claim.alreadyProcessed) return sendError(res, 'BAD_REQUEST', 'Request already processed', 400);

  const approvedRequest = claim.request;
  const { inmateId, amount } = approvedRequest;

  // Second line of defence: the ledger is what the balance is derived from,
  // so never write a second recharge row for the same request.
  const priorCredit = (await readDb('transactions.json'))
    .find((t) => t.requestId === requestId && t.type === 'recharge');
  if (priorCredit) {
    console.warn(`[wallet] request ${requestId} already credited (${priorCredit.transactionId}) — skipping`);
    const existing = await readDb('wallets.json');
    return sendSuccess(res, {
      request: approvedRequest,
      wallet: existing.find((w) => w.inmateId === inmateId) || null,
      transaction: priorCredit,
    });
  }

  const transaction = {
    transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    walletId: null,
    requestId,
    inmateId,
    type: 'recharge',
    status: 'completed',
    amount: Number(amount),
    description: 'Approved wallet request',
    timestamp: new Date().toISOString(),
    performedBy: req.auth?.sub || 'system'
  };

  // Create-or-credit in ONE write: a concurrent request may have created this
  // wallet between our read and this update.
  const walletRes = await updateDb('wallets.json', (data) => {
    const i = data.findIndex((w) => w.inmateId === inmateId);
    if (i !== -1) {
      data[i] = {
        ...data[i],
        balance: (data[i].balance || 0) + Number(amount),
        lastRecharge: new Date().toISOString(),
        lastRechargeAmount: Number(amount),
        totalRecharged: (data[i].totalRecharged || 0) + Number(amount),
        updatedAt: new Date().toISOString()
      };
      return { data, result: data[i] };
    }
    const created = {
      walletId: `WAL-${Date.now()}`,
      inmateId,
      balance: Number(amount),
      currency: 'INR',
      totalSpent: 0,
      totalRecharged: Number(amount),
      lastRecharge: new Date().toISOString(),
      lastRechargeAmount: Number(amount),
      remainingMinutes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.push(created);
    return { data, result: created };
  });
  const wallet = walletRes && typeof walletRes.walletId === 'string' ? walletRes : null;
  if (wallet) transaction.walletId = wallet.walletId;

  await updateDb('transactions.json', (data) => {
    data.push(transaction);
    return { data, result: transaction };
  });

  return sendSuccess(res, { request: approvedRequest, wallet, transaction });
}));

app.patch('/wallet-requests/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const { reason } = req.body;

  // Same atomic claim as approve — the pending check must live in the write.
  const claim = await updateDb('wallet-requests.json', (data) => {
    const i = data.findIndex((r) => r.requestId === requestId);
    if (i === -1) return { data, result: { notFound: true } };
    if (data[i].status !== 'pending') {
      return { data, result: { alreadyProcessed: true, request: data[i] } };
    }
    data[i] = {
      ...data[i],
      status: 'rejected',
      reviewedBy: req.auth?.sub || 'system',
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason || ''
    };
    return { data, result: { request: data[i] } };
  });

  if (!claim || !claim.request) return sendError(res, 'NOT_FOUND', 'Request not found', 404);
  if (claim.alreadyProcessed) return sendError(res, 'BAD_REQUEST', 'Request already processed', 400);

  return sendSuccess(res, claim.request);
}));

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
  const department = String(req.body.department || '').trim();
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
    department,
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
// Staff who operate a kiosk device, shown with the device's ward and prisoner
// load so a warden can see who is on which terminal in this jail.
app.get('/kiosk-admins', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const jailId = await effectiveJailId(req);
  const [admins, kiosks, inmates, blocks] = await Promise.all([
    readDb('admins.json'),
    readDb('kiosks.json'),
    readDb('inmates.json'),
    readDb('blocks.json').catch(() => []),
  ]);
  const index = buildWardIndex({ inmates, blocks });

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
        ward: index.wardFor(a.kioskId),
        wards: index.wardsFor(a.kioskId),
        registeredInmates: a.kioskId ? index.countFor(a.kioskId) : 0,
      };
    });
  return sendSuccess(res, data);
}));

// Kiosk admins are this jail's staff, so the jail's wardens may edit or remove
// them here; the vendor console keeps its own super-admin-only /admin routes.
// Both routes refuse a row from another prison unless the caller is a super admin.
app.patch('/kiosk-admins/:adminId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const isSuper = ['super-admin', 'super_admin'].includes(req.auth?.role);
  const jailId = await effectiveJailId(req);
  if (!isSuper && !jailId) return sendError(res, 'FORBIDDEN', 'Your account is not linked to a prison yet', 403);

  const patch = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return sendError(res, 'INVALID_REQUEST', 'name cannot be empty', 400);
    patch.name = name;
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

// ==================== ADMIN PROFILE ====================
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
  const callerRole = req.auth?.role;
  if (callerRole !== 'super-admin' && callerRole !== 'super_admin' && req.auth?.sub !== req.params.adminId) {
    return sendError(res, 'FORBIDDEN', 'Cannot view other admin profiles', 403);
  }
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
    name: inmate.name || inmate.fullName || [inmate.firstName, inmate.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
    prisonId: inmate.prisonId,
    facility: inmate.facility || inmate.prisonId,
    cellBlock: inmate.cellBlock || '',
    status: inmate.status || 'active',
    photoUrl: inmate.photoUrl || null,
    securityLevel: inmate.securityLevel || null,
    sentenceDetails: inmate.sentenceDetails || null
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

// Admin router mounted AFTER explicit /admin routes
app.use('/admin', requireAuth, adminRouter);

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  const { PROVIDER } = require('./lib/sms');
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '2.0.0-real',
    sms: {
      provider: PROVIDER || process.env.SMS_PROVIDER || 'log',
      hasApiKey: !!process.env.FAST2SMS_API_KEY,
      apiKeyPrefix: (process.env.FAST2SMS_API_KEY || '').substring(0, 4),
      domain: process.env.SMS_OTP_DOMAIN || '(none)',
    }
  });
});

// Sends a real SMS, so it stays behind an operator login.
app.get('/test-sms', requireAuth, requireRole('admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return sendError(res, 'BAD_REQUEST', 'Add ?phone=XXXXXXXXXX (10 digit)');
  try {
    const result = await sendSms({
      phone, message: 'Test OTP 123456', kind: 'otp', callId: 'TEST',
      templateVars: otpTemplateVars('123456')
    });
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 'SMS_FAILED', err.message);
  }
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

async function autoSeed() {
  if (!process.env.DATABASE_URL) {
    console.warn('[startup] DATABASE_URL not set — skipping auto-seed');
    return;
  }
  try {
    // Migrations run on every boot: they are idempotent (tracked in
    // schema_migrations) and a redeploy must never leave a table behind the
    // code that reads it.
    const { migrate } = require('./lib/migrate');
    await migrate();

    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
    const { rows } = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    const tableCount = parseInt(rows[0].count, 10);
    await pool.end();

    if (tableCount === 0 || process.env.FORCE_SEED === 'true') {
      console.log('[startup] database empty or FORCE_SEED set — running seed...');
      // seed.js is a standalone script — exec it in a child process
      const { execSync } = require('child_process');
      execSync('node lib/seed.js', { cwd: __dirname, stdio: 'inherit', env: { ...process.env, FORCE_SEED: 'true' } });
      console.log('[startup] auto-seed complete');
    } else {
      console.log(`[startup] database has ${tableCount} tables — schema up to date, seed skipped`);
    }
  } catch (err) {
    console.error('[startup] auto-seed failed (non-blocking):', err.message);
  }
}

console.warn('[startup] attempting to load face recognition models (non-blocking)...');

try {
  const faceRecognition = require('./lib/faceRecognition');
  autoSeed().then(() => faceRecognition.loadModels())
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
  autoSeed().then(() => startServer());
}

function startServer() {
  server.listen(PORT, () => {
    console.log(`PrisonConnect backend running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}`);
    console.log(`Socket.IO: http://localhost:${PORT}`);
  });

  // Periodic sweep: finalize orphaned active calls every 2 minutes
  setInterval(() => sweepStaleCalls(broadcastEvent), 2 * 60 * 1000);
}
