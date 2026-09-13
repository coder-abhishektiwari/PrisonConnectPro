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
app.use('/settings', createSettingsRouter(broadcastEvent));

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

// ==================== BIOMETRICS ====================
app.get('/admin/prisoners/:prisonerId/biometrics', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonerId } = req.params;
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === prisonerId && inAdminScope(req, i));
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);
  const biometrics = inmate.biometricData || {};
  return sendSuccess(res, {
    prisonerId, biometrics,
    hasFace: biometrics.faceRegistered || false,
    hasFingerprint: biometrics.fingerprintRegistered || false,
    hasRfid: biometrics.rfidRegistered || false,
    lastUpdate: biometrics.lastBiometricUpdate
  });
}));

app.delete('/admin/biometrics/:biometricId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { biometricId } = req.params;
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

console.warn('[startup] attempting to load face recognition models (non-blocking)...');

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
