require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const { readDb, updateDb } = require('./lib/db');
const { verifyToken } = require('./lib/auth');
const { requireAuth, requireRole } = require('./middleware/auth');
const { sendSms, otpTemplateVars } = require('./lib/sms');
const { sendSuccess, sendError, asyncRoute, deepMerge } = require('./lib/response');
const { jailScopeOf, inAdminScope, inScopeOf, scopeList, kioskScopeOf } = require('./lib/scoping');

const { router: authRouter } = require('./auth-routes');
const { router: adminRouter } = require('./admin-routes');

const kiosksRouter = require('./routes/kiosks');
const authRoutesRouter = require('./routes/auth');
const createCallsRouter = require('./routes/calls');
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

// Alias routes — dashboard expects these at root, not under /settings
app.get('/pricing', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await readDb('pricing.json'))));
app.patch('/pricing', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { deepMerge } = require('./lib/response');
  const merged = await updateDb('pricing.json', (all) => {
    const base = all || {};
    const result = deepMerge(base, { ...req.body });
    return { data: result, result };
  });
  broadcastEvent('pricing-updated', merged.result);
  return sendSuccess(res, merged.result);
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
  const all = await readDb('wallet-requests.json');
  const idx = all.findIndex((r) => r.requestId === requestId);
  if (idx === -1) return sendError(res, 'NOT_FOUND', 'Request not found');
  if (all[idx].status !== 'pending') return sendError(res, 'BAD_REQUEST', 'Request already processed');

  all[idx].status = 'approved';
  all[idx].reviewedBy = req.auth?.sub || 'system';
  all[idx].reviewedAt = new Date().toISOString();

  await updateDb('wallet-requests.json', (data) => {
    const i = data.findIndex((r) => r.requestId === requestId);
    if (i !== -1) data[i] = all[idx];
    return { data, result: all[idx] };
  });

  // Auto-recharge wallet on approval
  const { inmateId, amount } = all[idx];
  const wallets = await readDb('wallets.json');
  let wallet = wallets.find((w) => w.inmateId === inmateId);

  const transaction = {
    transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    inmateId,
    type: 'recharge',
    amount: Number(amount),
    description: 'Approved wallet request',
    timestamp: new Date().toISOString(),
    performedBy: req.auth?.sub || 'system'
  };

  if (wallet) {
    await updateDb('wallets.json', (data) => {
      const i = data.findIndex((w) => w.inmateId === inmateId);
      if (i !== -1) {
        data[i].balance = (data[i].balance || 0) + Number(amount);
        data[i].lastRecharge = new Date().toISOString();
        data[i].lastRechargeAmount = Number(amount);
        data[i].totalRecharged = (data[i].totalRecharged || 0) + Number(amount);
        data[i].updatedAt = new Date().toISOString();
        wallet = data[i];
      }
      return { data, result: data[i] };
    });
  } else {
    wallet = {
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
    await updateDb('wallets.json', (data) => {
      data.push(wallet);
      return { data, result: wallet };
    });
  }

  await updateDb('transactions.json', (data) => {
    data.push(transaction);
    return { data, result: transaction };
  });

  return sendSuccess(res, { request: all[idx], wallet, transaction });
}));

app.patch('/wallet-requests/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const { reason } = req.body;
  const all = await readDb('wallet-requests.json');
  const idx = all.findIndex((r) => r.requestId === requestId);
  if (idx === -1) return sendError(res, 'NOT_FOUND', 'Request not found');
  if (all[idx].status !== 'pending') return sendError(res, 'BAD_REQUEST', 'Request already processed');

  all[idx].status = 'rejected';
  all[idx].reviewedBy = req.auth?.sub || 'system';
  all[idx].reviewedAt = new Date().toISOString();
  all[idx].rejectionReason = reason || '';

  await updateDb('wallet-requests.json', (data) => {
    const i = data.findIndex((r) => r.requestId === requestId);
    if (i !== -1) data[i] = all[idx];
    return { data, result: all[idx] };
  });

  return sendSuccess(res, all[idx]);
}));

// ==================== WARDENS ====================
app.get('/wardens', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('wardens.json')))));
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
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
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

app.get('/test-sms', asyncRoute(async (req, res) => {
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
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
    const { rows } = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    const tableCount = parseInt(rows[0].count, 10);
    await pool.end();

    if (tableCount === 0 || process.env.FORCE_SEED === 'true') {
      console.log('[startup] database empty or FORCE_SEED set — running migrations + seed...');
      const { migrate } = require('./lib/migrate');
      await migrate();
      // seed.js is a standalone script — exec it in a child process
      const { execSync } = require('child_process');
      execSync('node lib/seed.js', { cwd: __dirname, stdio: 'inherit', env: { ...process.env, FORCE_SEED: 'true' } });
      console.log('[startup] auto-seed complete');
    } else {
      console.log(`[startup] database has ${tableCount} tables — skipping seed`);
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
}
