/**
 * SECURITY HARDENING REGRESSION SUITE
 *
 * Locks in the fixes from the full-system audit so none of them can silently
 * regress:
 *   1. Socket broadcast payloads never carry linkToken/otp/sessionToken.
 *   2. Call + booking HTTP responses never carry family-auth material
 *      (linkToken, otp hash, sms link, signalingToken, family.sessionToken).
 *   3. Credential material never leaves the API: inmate pin/biometrics, warden
 *      password + reset code, admin password/pin, prison setupPassword,
 *      contact device-proof hash.
 *   4. OTP is hashed at rest, locked after 5 misses, one-time-use and rate
 *      limited (per token and per IP).
 *   5. /health stops publishing SMS configuration; JSON bodies are capped.
 *   6. The signaling control API demands X-API-Key and fails closed when the
 *      key is not configured.
 *
 *   cd backend && npx jest security-hardening
 */
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hardening-suite-secret-0123456789ab';
process.env.SMS_PROVIDER = 'log';
process.env.FAMILY_WEB_URL = 'http://localhost:5173';

jest.setTimeout(60000);

// uuid v14 ships ESM-only; the suites run under CJS jest.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

jest.mock('../lib/db', () => {
  const store = {};
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    __store: store,
    readDb: async (f) => clone(store[f] || []),
    // Real lib/db.js returns `result`, not the {data, result} envelope —
    // mirroring that is what makes route-level assertions meaningful.
    updateDb: async (f, mutator) => {
      const out = mutator(clone(store[f] || []));
      if (out && typeof out === 'object' && 'data' in out) store[f] = out.data;
      if (out && typeof out === 'object' && 'result' in out) return out.result;
      return out;
    },
    transact: async () => { throw new Error('not used'); },
    query: async () => ({ rows: [] }),
    ping: async () => true,
    pool: null,
  };
});

const { app, sanitizeForBroadcast } = require('../server');
const { __store: store } = require('../lib/db');
const { hashSecret } = require('../lib/auth');

const SECRET = process.env.JWT_SECRET;
const PRISON = 'PR-1';
const KIOSK = 'KSK-1';
const INMATE = 'INM-1';
const CONTACT = 'CNT-1';
const CALL = 'CALL-1';
const LINK = 'L-SECRETLINK01';
const SIGNALLING_DIR = path.resolve(__dirname, '../../signaling-server');

const superToken = (over = {}) =>
  jwt.sign({ sub: 'SUDO-1', role: 'super-admin', ...over }, SECRET, { expiresIn: '10m' });

let xff = 0;
const ip = () => ({ 'X-Forwarded-For': `10.99.${Math.floor(++xff / 250)}.${xff % 250}` });

const data = (res) => res.body.data;

function resetStore() {
  store['inmates.json'] = [{
    inmateId: INMATE, name: 'Asha Kumar', status: 'active',
    prisonId: PRISON, assignedKioskId: KIOSK, prisonerNumber: 'P-1001',
    pin: '$2b$10$legacyinmatepinhashfakefake',
    biometricData: {
      fingerprintRegistered: true, rfidRegistered: true,
      fingerprintTemplate: '$2b$10$fpfakefakefakefakefakefake',
      rfidToken: 'rfid-secret-token-raw',
      rfidCardNumber: '4111111111',
    },
  }];
  store['contacts.json'] = [{
    contactId: CONTACT, inmateId: INMATE, name: 'Rita Kumari', status: 'active',
    active: true, approvalStatus: 'approved', phoneNumber: '+919876543210',
    deviceFingerprints: [{
      fingerprintId: 'DF-1', phone: '+919876543210',
      hash: 'device-proof-hash-must-not-leave',
      deviceInfo: { model: 'Pixel 8' }, location: { lat: 19.07, lng: 72.87 },
    }],
  }];
  store['wardens.json'] = [{
    wardenId: 'WRD-1', name: 'Chief Warden', email: 'chief@jail.test',
    status: 'active', prisonId: PRISON,
    password: '$2b$10$wardenpasswordhashfakefake',
    resetCodeHash: '$2b$10$wardenresetcodehashfakefake',
    resetCodeExpiresAt: '2030-01-01T00:00:00.000Z',
  }];
  store['admins.json'] = [{
    adminId: 'ADM-1', role: 'admin', name: 'Ops Admin', email: 'ops@jail.test',
    status: 'active', prisonId: PRISON,
    password: '$2b$10$adminpasswordhashfakefake', pin: '654321',
  }];
  store['prisons.json'] = [{
    prisonId: PRISON, name: 'Central Jail', status: 'active',
    setupPassword: '$2b$10$setuppasswordhashfakefake',
  }];
  store['kiosks.json'] = [{
    kioskId: KIOSK, prisonId: PRISON, status: 'active',
    authorizationStatus: 'authorized', deviceSerialNumber: 'SN-0001',
  }];
  store['calls.json'] = [{
    callId: CALL, roomId: 'RM-1', inmateId: INMATE, contactId: CONTACT, kioskId: KIOSK,
    prisonId: PRISON, facility: PRISON, status: 'active', type: 'video',
    startTime: new Date().toISOString(), maxDurationMinutes: 5, ratePerMinute: 2.5,
    linkToken: LINK, signalingToken: 'kiosk-room-signaling-jwt',
    otpHash: '$2b$10$otphashfakefakefakefake', otpExpiresAt: new Date(Date.now() + 300000).toISOString(),
    otpDispatchCount: 1,
    sms: {
      sent: true, sentTo: '+9******210', linkToken: LINK,
      linkUrl: `http://localhost:5173/c/${LINK}`, transport: 'log',
    },
    family: {
      doorwayCode: 'D-9', doorwayId: 'DW-1',
      // The seeded contact HAS a registered device, so OTP flows require the
      // device step to already be satisfied (otherwise every send-otp 403s).
      deviceVerified: true, otpVerified: false, sessionToken: 'family-session-jwt',
      location: { lat: 19.07, lng: 72.87 },
    },
  }];
  store['schedule.json'] = [];
  store['wallets.json'] = [];
  store['transactions.json'] = [];
  store['settings.json'] = [];
  store['pricing.json'] = [];
}

beforeEach(resetStore);

const CALL_SECRET_FIELDS = ['linkToken', 'otp', 'otpHash', 'signalingToken'];

function expectCallRedacted(call) {
  for (const key of CALL_SECRET_FIELDS) expect(call[key]).toBeUndefined();
  expect(call.sms.linkUrl).toBeUndefined();
  expect(call.sms.linkToken).toBeUndefined();
  expect(call.family.sessionToken).toBeUndefined();
  // Display fields the dashboards actually render must survive.
  expect(call.callId).toBe(CALL);
  expect(call.family.location).toEqual({ lat: 19.07, lng: 72.87 });
  expect(call.family.doorwayCode).toBe('D-9');
  expect(call.sms.sentTo).toBe('+9******210');
}

// ===========================================================================
// 1. SOCKET BROADCAST
// ===========================================================================
describe('broadcast payloads are sanitized before io.emit', () => {
  const payload = () => JSON.parse(JSON.stringify(store['calls.json'][0]));

  test('B1 family-auth material is stripped from every event', () => {
    const out = sanitizeForBroadcast(payload());
    expect(out.linkToken).toBeUndefined();
    expect(out.otp).toBeUndefined();
    expect(out.otpHash).toBeUndefined();
    expect(out.signalingToken).toBeUndefined();
    expect(out.family).toBeUndefined();
    expect(out.sms).toBeUndefined();
    // The event is only a "refetch" hint, but non-secret fields still ride along.
    expect(out.callId).toBe(CALL);
    expect(out.status).toBe('active');
  });

  test('B2 credential rows are stripped at any depth', () => {
    const out = sanitizeForBroadcast({
      warden: { wardenId: 'WRD-1', password: 'x', resetCodeHash: 'y' },
      inmate: { pin: '1234', biometricData: { fingerprintTemplate: 'raw', rfidToken: 'raw' } },
      contact: { deviceFingerprints: [{ hash: 'proof' }] },
      kiosk: { deviceToken: 'jwt', prison: { setupPassword: 'x' } },
      nested: { deep: { deeper: { accessToken: 'a', refreshToken: 'b' } } },
    });
    expect(out.warden).toEqual({ wardenId: 'WRD-1' });
    expect(out.inmate.pin).toBeUndefined();
    expect(out.inmate.biometricData).toEqual({});
    expect(out.contact.deviceFingerprints).toBeUndefined(); // whole key dropped
    expect(out.kiosk.deviceToken).toBeUndefined();
    expect(out.kiosk.prison.setupPassword).toBeUndefined();
    expect(out.nested.deep.deeper).toEqual({});
  });

  test('B3 prototype pollution keys are dropped and depth is capped', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"bad": 1}, "ok": 1}');
    const out = sanitizeForBroadcast(evil);
    expect(out.ok).toBe(1);
    expect(Object.prototype.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);

    let deep = { leaf: 'x' };
    for (let i = 0; i < 30; i += 1) deep = { child: deep };
    const sanitized = sanitizeForBroadcast(deep);
    let cursor = sanitized;
    let depth = 0;
    while (cursor && typeof cursor === 'object') { depth += 1; cursor = cursor.child; }
    expect(depth).toBeLessThanOrEqual(9);
  });
});

// ===========================================================================
// 2. CALL + BOOKING HTTP RESPONSES
// ===========================================================================
describe('call responses never expose family-auth material', () => {
  const token = superToken();

  test('C1 GET /calls/:callId', async () => {
    const res = await request(app).get(`/calls/${CALL}`).set(ip()).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expectCallRedacted(data(res));
  });

  test('C2 GET /calls (list) and GET /calls/active', async () => {
    const list = await request(app).get('/calls').set(ip()).set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(data(list)).toHaveLength(1);
    expectCallRedacted(data(list)[0]);

    const active = await request(app).get('/calls/active').set(ip()).set('Authorization', `Bearer ${token}`);
    expect(active.status).toBe(200);
    expectCallRedacted(data(active).items ? data(active).items[0] : data(active)[0]);
  });

  test('C3 GET /calls/history/:id', async () => {
    store['calls.json'][0].status = 'completed';
    store['calls.json'][0].mediaConnectedAt = new Date().toISOString();
    store['calls.json'][0].durationMinutes = 3;
    const res = await request(app).get(`/calls/history/${INMATE}`).set(ip()).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(data(res)).toHaveLength(1);
    expectCallRedacted(data(res)[0]);
  });

  test('C4 POST /calls keeps signalingToken for the kiosk, drops linkToken', async () => {
    store['inmates.json'].push({
      inmateId: 'INM-2', name: 'Bina Das', status: 'active',
      prisonId: PRISON, assignedKioskId: KIOSK,
    });
    store['contacts.json'].push({
      contactId: 'CNT-2', inmateId: 'INM-2', name: 'Suresh', status: 'active',
      active: true, approvalStatus: 'approved', phoneNumber: '+911111111111',
    });
    store['wallets.json'].push({ walletId: 'WAL-2', inmateId: 'INM-2' });
    store['transactions.json'].push({
      transactionId: 'TX-2', walletId: 'WAL-2', inmateId: 'INM-2',
      type: 'recharge', amount: 100000, status: 'completed',
      timestamp: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/calls').set(ip()).set('Authorization', `Bearer ${token}`)
      .send({ inmateId: 'INM-2', contactId: 'CNT-2', kioskId: KIOSK, type: 'video' });

    expect(res.status).toBe(201);
    // The Android kiosk reads this straight off the create response.
    expect(typeof data(res).signalingToken).toBe('string');
    expect(data(res).signalingToken.length).toBeGreaterThan(10);
    expect(data(res).linkToken).toBeUndefined();
    expect(data(res).sms).toBeUndefined();
  });

  test('C5 POST /schedule/book does not return the booking link token', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .post('/schedule/book').set(ip()).set('Authorization', `Bearer ${token}`)
      .send({ inmateId: INMATE, kioskId: KIOSK, contactId: CONTACT, date: tomorrow, timeSlot: '10:00-10:30' });

    expect(res.status).toBe(201);
    expect(data(res).linkToken).toBeUndefined();
    expect(data(res).scheduleId).toBeTruthy();
    // The token still exists server-side — it is what the SMS texted.
    expect(store['schedule.json'][0].linkToken).toMatch(/^L-/);
  });
});

// ===========================================================================
// 3. CREDENTIAL MATERIAL
// ===========================================================================
describe('credential material never leaves the API', () => {
  const token = superToken();
  const get = (url) => request(app).get(url).set(ip()).set('Authorization', `Bearer ${token}`);

  test('D1 inmate rows: pin and biometric secrets are gone, display card survives', async () => {
    const single = await get(`/inmates/${INMATE}`);
    expect(single.status).toBe(200);
    expect(data(single).pin).toBeUndefined();
    expect(data(single).biometricData.fingerprintTemplate).toBeUndefined();
    expect(data(single).biometricData.rfidToken).toBeUndefined();
    expect(data(single).rfidCardNumber).toBe('4111111111');

    const list = await get('/inmates');
    expect(list.status).toBe(200);
    const row = data(list).items ? data(list).items[0] : data(list)[0];
    expect(row.pin).toBeUndefined();

    const viaAdmin = await get('/admin/prisoners/INM-1');
    expect(viaAdmin.status).toBe(200);
    expect(data(viaAdmin).pin).toBeUndefined();
    expect(data(viaAdmin).biometricData.rfidToken).toBeUndefined();
  });

  test('D2 PATCH /admin/prisoners/:id/status echoes no pin', async () => {
    const res = await request(app)
      .patch('/admin/prisoners/INM-1/status').set(ip()).set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });
    expect(res.status).toBe(200);
    expect(data(res).pin).toBeUndefined();
    // normalizeInmate keeps the biometric block for the UI — only the secrets
    // inside it are removed.
    expect(data(res).biometricData).toBeTruthy();
    expect(data(res).biometricData.fingerprintTemplate).toBeUndefined();
    expect(data(res).biometricData.rfidToken).toBeUndefined();
    // undo so later tests see a fresh fixture
    store['inmates.json'][0].status = 'active';
  });

  test('D3 warden rows: password and reset code are gone', async () => {
    const list = await get('/wardens');
    expect(list.status).toBe(200);
    const row = Array.isArray(data(list)) ? data(list)[0] : data(list).items?.[0];
    expect(row.password).toBeUndefined();
    expect(row.resetCodeHash).toBeUndefined();

    const single = await get('/wardens/WRD-1');
    expect(single.status).toBe(200);
    expect(data(single).password).toBeUndefined();
    expect(data(single).resetCodeHash).toBeUndefined();
    expect(data(single).resetCodeExpiresAt).toBeUndefined();
    expect(data(single).email).toBe('chief@jail.test');
  });

  test('D4 admin rows: password and pin are gone', async () => {
    const res = await get('/admin');
    expect(res.status).toBe(200);
    expect(data(res)[0].password).toBeUndefined();
    expect(data(res)[0].pin).toBeUndefined();

    const one = await get('/admin/ADM-1');
    expect(one.status).toBe(200);
    expect(data(one).password).toBeUndefined();
    expect(data(one).pin).toBeUndefined();
  });

  test('D5 prison rows: setupPassword is gone', async () => {
    const list = await get('/prisons');
    expect(list.status).toBe(200);
    expect(data(list)[0].setupPassword).toBeUndefined();

    const one = await get(`/prisons/${PRISON}`);
    expect(one.status).toBe(200);
    expect(data(one).setupPassword).toBeUndefined();
    expect(data(one).name).toBe('Central Jail');
  });

  test('D6 contact rows: the device-proof hash is gone, the roster view survives', async () => {
    const one = await get(`/contacts/${CONTACT}`);
    expect(one.status).toBe(200);
    expect(data(one).deviceFingerprints[0].hash).toBeUndefined();
    expect(data(one).deviceFingerprints[0].fingerprintId).toBe('DF-1');

    const list = await get('/contacts');
    expect(list.status).toBe(200);
    const row = data(list).items ? data(list).items[0] : data(list)[0];
    expect(row.deviceFingerprints[0].hash).toBeUndefined();
  });

  test('D7 PATCH contact toggle echoes no device-proof hash', async () => {
    const res = await request(app)
      .patch('/contacts/admin/contacts/CNT-1/toggle').set(ip()).set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(data(res).deviceFingerprints[0].hash).toBeUndefined();
  });
});

// ===========================================================================
// 4. OTP HARDENING
// ===========================================================================
describe('OTP: hashed at rest, locked out, one-time, rate limited', () => {
  // Every test gets its OWN link token: the rate-limit counters live for the
  // whole test process, so sharing one token would make the assertions depend
  // on test ordering instead of on the limit itself.
  let n = 0;
  const seedCall = (link) => {
    store['calls.json'].push({
      ...JSON.parse(JSON.stringify(store['calls.json'][0])),
      callId: `CALL-OTP-${++n}`, roomId: `RM-OTP-${n}`, linkToken: link,
      signalingToken: undefined, otpHash: undefined, otpExpiresAt: undefined,
      otpDispatchCount: 0, sms: undefined,
      family: { doorwayCode: '', doorwayId: '', deviceVerified: true, otpVerified: false, sessionToken: null },
    });
    return link;
  };

  const sendOtp = (link) =>
    request(app).post(`/family/secure-call/send-otp/${link}`).set(ip());
  const verifyOtp = (otp, link) =>
    request(app).post(`/family/secure-call/verify-otp/${link}`).set(ip()).send({ otp });
  // updateDb writes a fresh array back into the store, so a row captured
  // before a request goes stale — always re-read after the call.
  const row = (link) => store['calls.json'].find((c) => c.linkToken === link);

  test('E1 send-otp persists only a bcrypt hash and resets the guess budget', async () => {
    const link = seedCall('L-OTP-E1');
    row(link).otp = '999999'; // legacy plaintext
    row(link).family.otpFailedAttempts = 3;

    const res = await sendOtp(link);
    expect(res.status).toBe(200);

    expect(row(link).otp).toBeUndefined();              // plaintext form is gone
    expect(String(row(link).otpHash)).toMatch(/^\$2[aby]\$/); // bcrypt at rest
    expect(row(link).otpDispatchCount).toBe(1);
    expect(row(link).family.otpFailedAttempts).toBe(0);  // resend clears the lock
    // The API never hands the code back — it went out over SMS only.
    expect(JSON.stringify(res.body)).not.toContain('999999');
  });

  test('E2 brute force stops at 5 misses and the code dies with it', async () => {
    const link = seedCall('L-OTP-E2');
    row(link).otpHash = await hashSecret('123456');
    row(link).otpExpiresAt = new Date(Date.now() + 300000).toISOString();

    for (let i = 1; i <= 4; i += 1) {
      const res = await verifyOtp('000000', link);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_OTP');
    }
    const locked = await verifyOtp('000000', link);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_LOCKED');

    // The correct code no longer works either — the budget burned it.
    const afterLock = await verifyOtp('123456', link);
    expect(afterLock.status).toBe(429);
    expect(row(link).otpHash).toBeUndefined();
    expect(row(link).family.sessionToken).toBeNull(); // no session was ever minted
  });

  test('E3 resend recovers the lock, success is one-time, replay is rejected', async () => {
    const link = seedCall('L-OTP-E3');
    row(link).otpHash = await hashSecret('123456');
    row(link).otpExpiresAt = new Date(Date.now() + 300000).toISOString();
    row(link).family.otpFailedAttempts = 5;

    const resent = await sendOtp(link);
    expect(resent.status).toBe(200);
    expect(row(link).family.otpFailedAttempts).toBe(0);

    // We cannot read the freshly minted code back out of the API (E1), so pin
    // one directly to prove the happy path and the one-time rule.
    row(link).otpHash = await hashSecret('123456');

    const ok = await verifyOtp('123456', link);
    expect(ok.status).toBe(200);
    expect(data(ok).verified).toBe(true);
    expect(typeof data(ok).sessionToken).toBe('string');
    expect(row(link).otpHash).toBeUndefined();       // burned on success
    expect(row(link).family.otpVerified).toBe(true);

    const replay = await verifyOtp('123456', link);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_OTP');
  });

  test('E4 send-otp is capped per link token (SMS bombing)', async () => {
    const link = seedCall('L-OTP-E4');
    const first = await sendOtp(link);
    expect(first.status).toBe(200);
    for (let i = 1; i <= 5; i += 1) await sendOtp(link);
    const blocked = await sendOtp(link);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  test('E5 verify-otp is capped per link token even with the right code', async () => {
    const link = seedCall('L-OTP-E5');
    row(link).otpHash = await hashSecret('123456');
    row(link).otpExpiresAt = new Date(Date.now() + 300000).toISOString();

    const statuses = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await verifyOtp('000000', link);
      statuses.push(res.status);
    }
    // Misses 1-4 are plain rejections; miss 5 burns the code and locks it.
    expect(statuses.slice(0, 4)).toEqual([401, 401, 401, 401]);
    expect(statuses[4]).toBe(429);
    expect(statuses.slice(5)).toEqual([429, 429, 429, 429, 429]);

    // Request 11 trips the per-token limiter — before the handler even runs —
    // so the correct code cannot slip past the cap either.
    const past = await verifyOtp('123456', link);
    expect(past.status).toBe(429);
    expect(past.body.error.code).toBe('RATE_LIMITED');
  });
});

// ===========================================================================
// 5. SURFACE MINIMISATION
// ===========================================================================
describe('surface minimisation', () => {
  test('F1 /health reports status without publishing SMS configuration', async () => {
    process.env.SMS_OTP_DOMAIN = 'sms.example.test';
    process.env.FAST2SMS_SENDER_ID = 'PRSNCT';
    try {
      const res = await request(app).get('/health').set(ip());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      const body = JSON.stringify(res.body);
      expect(res.body.sms.domain).toBeUndefined();
      expect(res.body.sms.senders).toBeUndefined();
      expect(body).not.toContain('sms.example.test');
      expect(body).not.toContain('PRSNCT');
      expect(res.body.sms.routes).toBeTruthy();
    } finally {
      delete process.env.SMS_OTP_DOMAIN;
      delete process.env.FAST2SMS_SENDER_ID;
    }
  });

  test('F2 JSON bodies above 1mb are rejected before they are buffered', async () => {
    const big = { pad: 'x'.repeat(1.5 * 1024 * 1024) };
    const res = await request(app)
      .post('/family/secure-call/link/nope')
      .set(ip())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(big));
    expect(res.status).toBe(413);
  });

  test('F3 baseline security headers stay strict', async () => {
    const res = await request(app).get('/health').set(ip());
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});

// ===========================================================================
// 6. SIGNALING CONTROL API
// ===========================================================================
describe('signaling control API requires X-API-Key', () => {
  const MEDIA_KEY = 'test-media-api-key-0123456789abcdef';

  function freePort() {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address();
        srv.close(() => resolve(port));
      });
    });
  }

  async function startSignaling(port, extraEnv) {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: SIGNALLING_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        JWT_SECRET: 'signaling-suite-secret',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });

    const deadline = Date.now() + 20000;
    for (;;) {
      if (child.exitCode !== null) {
        throw new Error(`signaling server exited early (${child.exitCode}): ${stderr}`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) return child;
      } catch (e) { /* not up yet */ }
      if (Date.now() > deadline) {
        child.kill('SIGKILL');
        throw new Error(`signaling server never became healthy: ${stderr}`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async function stop(child) {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise((r) => {
      const t = setTimeout(() => { child.kill('SIGKILL'); r(); }, 3000);
      child.on('exit', () => { clearTimeout(t); r(); });
    });
  }

  let child = null;
  let port = null;

  beforeAll(async () => {
    port = await freePort();
    child = await startSignaling(port, { MEDIA_API_KEY: MEDIA_KEY });
  });

  afterAll(async () => { await stop(child); });

  const control = (headers = {}) =>
    fetch(`http://127.0.0.1:${port}/api/rooms/ROOM-X/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ reason: 'probe' }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  test('G1 no key -> 401 with the swallowed error shape', async () => {
    const res = await control();
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SIGNALING_ERROR');
  });

  test('G2 wrong key -> 401', async () => {
    const res = await control({ 'X-API-Key': 'not-the-key' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SIGNALING_ERROR');
  });

  test('G3 correct key -> room is controllable', async () => {
    const res = await control({ 'X-API-Key': MEDIA_KEY });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('G4 GET room info is guarded too', async () => {
    const open = await fetch(`http://127.0.0.1:${port}/api/rooms/ROOM-X`);
    expect(open.status).toBe(401);
    const closed = await fetch(`http://127.0.0.1:${port}/api/rooms/ROOM-X`, {
      headers: { 'X-API-Key': MEDIA_KEY },
    });
    expect(closed.status).toBe(200);
  });

  test('G5 fail-closed when MEDIA_API_KEY is not configured', async () => {
    const sparePort = await freePort();
    const spare = await startSignaling(sparePort, { MEDIA_API_KEY: '' });
    try {
      const res = await fetch(`http://127.0.0.1:${sparePort}/api/rooms/ROOM-X/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'anything' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe('SIGNALING_ERROR');
    } finally {
      await stop(spare);
    }
  });
});

// ===========================================================================
// H. CREDENTIAL COMPARE — the legacy plaintext branch stays usable for
//    unmigrated rows, but must not leak the stored value through `===`.
// ===========================================================================
describe('H legacy plaintext credential compare', () => {
  const { verifySecret, hashSecret } = require('../lib/auth');

  test('H1 bcrypt rows verify and reject without touching the plaintext path', async () => {
    const hash = await hashSecret('1234');
    expect(await verifySecret('1234', hash)).toBe(true);
    expect(await verifySecret('0000', hash)).toBe(false);
    expect(await verifySecret('', hash)).toBe(false);
  });

  test('H2 legacy plaintext rows still verify — unmigrated owners keep access', async () => {
    expect(await verifySecret('1234', '1234')).toBe(true);
    expect(await verifySecret('1234', '9999')).toBe(false);
  });

  test('H3 wrong-length guesses are rejected without throwing', async () => {
    // timingSafeEqual throws on length mismatch; the guard must absorb it.
    expect(await verifySecret('12', '1234')).toBe(false);
    expect(await verifySecret('123456', '1234')).toBe(false);
    expect(await verifySecret('', '1234')).toBe(false);
    expect(await verifySecret('1234', '')).toBe(false);
    expect(await verifySecret('1234', null)).toBe(false);
    expect(await verifySecret('1234', undefined)).toBe(false);
  });
});
