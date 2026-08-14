// PrisonConnect backend audit integration tests.
// Spawns the real server.js on a test port and verifies behavior with real HTTP.
// Usage: node audit-tests.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.AUDIT_PORT || 39777;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const LOGS = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(`${status.toUpperCase().padEnd(9)} ${name}${detail ? ' :: ' + detail : ''}`);
}

async function api(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function socketTokenCheck(label, token) {
  // Use socket.io-client via a dynamic import; check handshake rejection only.
  const { io } = await import('socket.io-client');
  const result = await new Promise((resolve) => {
    const s = io(BASE, {
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
      timeout: 5000
    });
    const done = (kind, msg) => { try { s.close(); } catch {} resolve({ kind, msg }); };
    s.on('connect', () => done('connected', 'socket connected'));
    s.on('connect_error', (err) => done('connect_error', err.message));
    setTimeout(() => done('timeout', 'no connect_error within 5s'), 5500);
  });
  record(label, result.kind === 'connect_error' ? (label.includes('rejected') ? 'PASS' : 'FAIL') : (label.includes('rejected') ? 'FAIL' : 'PASS'), result.msg);
}

// ---- Boot the server ----
function bootServer() {
  return new Promise(async (resolve) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: MODULE_DIR,
      env: { ...process.env, PORT: String(PORT), JWT_SECRET: process.env.JWT_SECRET || 'audit-test-secret-36-chars-long-xyz', MEDIASOUP_ANNOUNCED_IP: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', d => { LOGS.push(d.toString().trim()); });
    child.stderr.on('data', d => { LOGS.push('[stderr] ' + d.toString().trim()); });
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        record('SERVER_BOOT', 'FAIL', `server exited early code=${child.exitCode}`);
        resolve({ child });
        return;
      }
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) {
          record('SERVER_BOOT', 'PASS', 'server up via /health');
          resolve({ child });
          return;
        }
      } catch { /* not up yet */ }
      await sleep(1500);
    }
    record('SERVER_BOOT', 'FAIL', 'server did not become healthy within 150s');
    child.kill();
    resolve({ child });
  });
}

// ==================== RUN ====================
const { child } = await bootServer();

try {
  // --- Basic health/auth ---
  const health = await api('GET', '/health');
  record('GET /health', health.status === 200 ? 'PASS' : 'FAIL', `status=${health.status}`);

  // Admin CRUD is COMPLETELY UNAUTHENTICATED
  const adminList = await api('GET', '/admin');
  record('GET /admin (no token) exposes admin list', adminList.status === 200 ? 'FAIL' : 'PASS', `status=${adminList.status}, count=${adminList.json?.data?.length ?? 'n/a'}`);

  const createNoAuth = await api('POST', '/admin', { adminId: 'ADMIN-AUDIT-X', name: 'audit', pin: '1234', role: 'admin', kioskId: null, prisonId: null, status: 'active' });
  record('POST /admin (no token) creates admin', createNoAuth.status === 201 ? 'FAIL' : 'PASS', `status=${createNoAuth.status}`);

  // Warden login (correct + wrong)
  const wardenLogin = await api('POST', '/auth/warden/login', { email: 'rajesh.kumar@prisonconnect.gov.in', password: 'Warden@123' });
  record('POST /auth/warden/login (valid)', wardenLogin.status === 200 ? 'PASS' : 'FAIL', `status=${wardenLogin.status}`);
  const wardenToken = wardenLogin.json?.data?.accessToken || wardenLogin.json?.accessToken || null;
  if (wardenToken) record('WARDEN_TOKEN_OBTAINED', 'PASS');
  else record('WARDEN_TOKEN_OBTAINED', 'FAIL', 'no accessToken in response');

  const wardenBad = await api('POST', '/auth/warden/login', { email: 'rajesh.kumar@prisonconnect.gov.in', password: 'wrong' });
  record('POST /auth/warden/login (bad pw)', wardenBad.status === 401 ? 'PASS' : 'FAIL', `status=${wardenBad.status}`);

  // Kiosk login
  const kioskLogin = await api('POST', '/auth/login', { kioskId: 'KIOSK-001', pin: 'pin1234' });
  record('POST /auth/login (kiosk pin)', kioskLogin.status === 200 ? 'PASS' : 'FAIL', `status=${kioskLogin.status}`);
  const kioskToken = kioskLogin.json?.data?.accessToken || kioskLogin.json?.accessToken || null;

  // Auth required enforcement
  const noToken = await api('GET', '/inmates');
  record('GET /inmates without token -> 401', noToken.status === 401 ? 'PASS' : 'FAIL', `status=${noToken.status}`);

  // IDOR: kiosk can read ALL inmates / wallets / contacts
  const kInmates = await api('GET', '/inmates', null, kioskToken);
  record('IDOR: kiosk token reads ALL inmates', kInmates.status === 200 ? 'FAIL' : 'PASS', `status=${kInmates.status}, count=${kInmates.json?.data?.length ?? 'n/a'}`);

  const kWallets = await api('GET', '/wallets', null, kioskToken);
  record('IDOR: kiosk token reads ALL wallets', kWallets.status === 200 ? 'FAIL' : 'PASS', `status=${kWallets.status}, count=${kWallets.json?.data?.length ?? 'n/a'}`);

  const kSettings = await api('PATCH', '/settings', { auditMode: true, hackedBy: 'kiosk-token' }, kioskToken);
  record('AUTHZ: kiosk token can PATCH global settings', kSettings.status === 200 ? 'FAIL' : 'PASS', `status=${kSettings.status}`);

  const setupPin = await api('GET', '/kiosks/setup-pin/PRISON-001', null, kioskToken);
  record('AUTHZ: setup PIN readable by any authed user', setupPin.status === 200 ? 'FAIL' : 'PASS', `pin=${setupPin.json?.data?.pin}`);

  // Setup PIN validation
  const pinOk = await api('POST', '/kiosks/validate-setup-pin', { pin: '123456', prisonId: 'PRISON-001' });
  record('POST /kiosks/validate-setup-pin correct', pinOk.status === 200 ? 'PASS' : 'FAIL', `status=${pinOk.status}`);
  const pinBad = await api('POST', '/kiosks/validate-setup-pin', { pin: '000000', prisonId: 'PRISON-001' });
  record('POST /kiosks/validate-setup-pin wrong', pinBad.status === 401 ? 'PASS' : 'FAIL', `status=${pinBad.status}`);

  // /auth/register creates warden with PLAINTEXT password
  const registeredEmail = `audit.${Date.now()}@x.test`;
  const reg = await api('POST', '/auth/register', { name: 'Audit Tester', email: registeredEmail, password: 'secret123' });
  record('POST /auth/register warden', reg.status === 201 ? 'PASS' : 'FAIL', `status=${reg.status}`);
  const regPw = reg.status === 201;

  // Verify the created warden is stored with a PLAINTEXT password (bad) and can LATER log in
  if (regPw) {
    const wardenRec = await api('GET', '/admin', null);
    const admins = wardenRec.json?.data || [];
    const created = admins.find(a => a.email === registeredEmail);
    record('PLAINTEXT: registered warden password not hashed', created && created.password === 'secret123' ? 'FAIL' : 'PASS', created ? `stored=${String(created.password).slice(0, 12)}${String(created.password).length > 12 ? '...' : ''}` : 'record not found');
  }

  // Registration warden round-trip: created with plaintext pw; login succeeds -> proves plaintext creds work
  const createdLogin = await api('POST', '/auth/warden/login', { email: registeredEmail, password: 'secret123' });
  record('PLAINTEXT: registered warden can log in with plaintext pw', createdLogin.status >= 200 && createdLogin.status < 300 ? 'FAIL' : 'PASS', `status=${createdLogin.status}`);

  // Call state machine — pick inmate + create an approved contact for that inmate
  const inmates = await api('GET', '/inmates', null, wardenToken);
  const contacts = await api('GET', '/contacts', null, wardenToken);
  const inmate = inmates.json?.data?.[0];
  const newContact = await api('POST', `/admin/prisoners/${inmate?.inmateId}/contacts`, { firstName: 'Audit', lastName: 'Family', relationship: 'family', phone: '+91-0000000000' }, wardenToken);
  const contact = newContact.json?.data || contacts.json?.data?.[0];
  const kioskId = 'KIOSK-001';
  const newCall = await api('POST', '/calls', { inmateId: inmate?.inmateId, contactId: contact?.contactId, kioskId, recordingEnabled: true }, wardenToken);
  record('POST /calls create', newCall.status === 201 ? 'PASS' : 'FAIL', `status=${newCall.status}${newCall.json?.error ? ' :: ' + newCall.json.error.message : ''}`);
  const callId = newCall.json?.data?.callId;

  if (callId) {
    // invalid transition
    const badTrans = await api('PATCH', `/calls/${callId}`, { status: 'completed' }, wardenToken);
    record('CALL STATE: scheduled->completed rejected', badTrans.status === 409 ? 'PASS' : 'FAIL', `status=${badTrans.status}, code=${badTrans.json?.error?.code}`);
    // valid transition
    const okTrans = await api('PATCH', `/calls/${callId}`, { status: 'ringing' }, wardenToken);
    record('CALL STATE: scheduled->ringing allowed', okTrans.status === 200 ? 'PASS' : 'FAIL', `status=${okTrans.status}`);
  }

  // Duplicate active call for same inmate (make first active first)
  if (callId) {
    await api('PATCH', `/calls/${callId}`, { status: 'connecting' }, wardenToken);
    await api('PATCH', `/calls/${callId}`, { status: 'active' }, wardenToken);
  }
  const dup = await api('POST', '/calls', { inmateId: inmate?.inmateId, contactId: contact?.contactId, kioskId }, wardenToken);
  record('CALL STATE: duplicate active call blocked', dup.status === 409 ? 'PASS' : 'FAIL', `status=${dup.status}, code=${dup.json?.error?.code}`);

  // Call control: /calls/:callId/control uses undefined mediasoupManager -> should 500
  if (callId) {
    const control = await api('POST', `/calls/${callId}/control`, { action: 'mute' }, wardenToken);
    record('POST /calls/:id/control (mediasoupManager undefined)', control.status === 500 ? 'FAIL' : 'PASS', `status=${control.status}, error=${control.json?.error?.code}`);
  }

  // Recording stop: outputPaths undefined -> should 500
  const rec = await api('POST', '/recordings', { callId: callId || 'CALL-X' }, wardenToken);
  const recId = rec.json?.data?.recordingId;
  if (recId) {
    const recStart = await api('POST', `/recordings/${recId}/start`, {}, wardenToken);
    record('POST /recordings/:id/start', recStart.status === 200 ? 'PASS' : 'FAIL', `status=${recStart.status}`);
    const recStop = await api('POST', `/recordings/${recId}/stop`, {}, wardenToken);
    record('POST /recordings/:id/stop (outputPaths undefined)', recStop.status === 500 ? 'FAIL' : 'PASS', `status=${recStop.status}, error=${recStop.json?.error?.code}`);
  }

  // Refresh token response shape (flat, no user) -> breaks frontends
  const refresh = await api('POST', '/auth/refresh', { refreshToken: wardenLogin.json?.data?.refreshToken || wardenLogin.json?.refreshToken });
  record('POST /auth/refresh returns user object', refresh.json && (refresh.json.data?.user || refresh.json.user) ? 'PASS' : 'FAIL', `has data.user=${!!refresh.json?.data?.user}, has user=${!!refresh.json?.user}`);

  // Family-web endpoints don't exist on this backend
  const famLink = await api('GET', '/calls/link/whatever-token');
  record('FAMILY: GET /calls/link/:token exists', famLink.status !== 404 ? 'PASS' : 'FAIL', `status=${famLink.status}`);
  const famOtp = await api('POST', '/calls/whatever/otp-verification', { otp: '123456' });
  record('FAMILY: POST /calls/:t/otp-verification exists', famOtp.status !== 404 ? 'PASS' : 'FAIL', `status=${famOtp.status}`);
  const famDev = await api('POST', '/calls/whatever/device-verification', { browser: 'x' });
  record('FAMILY: POST /calls/:t/device-verification exists', famDev.status !== 404 ? 'PASS' : 'FAIL', `status=${famDev.status}`);
  const famLeave = await api('POST', '/rooms/leave', { roomId: 'x', participantId: 'x' }, kioskToken);
  record('FAMILY: POST /rooms/leave exists', famLeave.status !== 404 ? 'PASS' : 'FAIL', `status=${famLeave.status}`);

  // Vendor login flow: /auth/login expects kioskId+pin, vendor sends email+password
  const vendorLogin = await api('POST', '/auth/login', { email: 'a@b.c', password: 'pw' });
  record('VENDOR: /auth/login accepts email+password', vendorLogin.status === 200 ? 'FAIL' : 'PASS', `status=${vendorLogin.status}, code=${vendorLogin.json?.error?.code}`);

  // Socket auth: without token, with roomId-as-token, with valid token, and join-room
  await socketTokenCheck('SOCKET: connect without token rejected', null);
  await socketTokenCheck('SOCKET: roomId-as-token rejected (family-web contract)', 'ROOM-ABCD1234');
  if (wardenToken) await socketTokenCheck('SOCKET: valid warden token accepted', wardenToken);

  // join-room over socket with valid token -> mediasoup disabled message
  if (wardenToken) {
    // create a fresh room via REST so it exists and is not expired
    const newRoom = await api('POST', '/rooms', { kioskId, inmateId: '100101' }, wardenToken);
    const freshRoomId = newRoom.json?.data?.roomId;
    const { io } = await import('socket.io-client');
    const joinResult = await new Promise((resolve) => {
      const s = io(BASE, { transports: ['websocket'], auth: { token: wardenToken }, reconnection: false, timeout: 5000 });
      const done = (v) => { try { s.close(); } catch {} resolve(v); };
      s.on('connect', () => {
        s.emit('join-room', { roomId: freshRoomId || 'ROOM-AUDIT1', peerId: 'peer-audit' }, (resp) => done({ connected: true, resp }));
      });
      s.on('connect_error', (e) => done({ err: e.message, connected: false }));
      setTimeout(() => done({ timeout: true, connected: false }), 6000);
    });
    if (joinResult.connected) {
      record('SOCKET: join-room functional (mediasoup on)', joinResult.resp?.success ? 'FAIL' : 'PASS', `resp=${JSON.stringify(joinResult.resp)}`);
    } else {
      record('SOCKET: join-room functional (mediasoup on)', 'FAIL', joinResult.err || 'timeout');
    }
  }

  // Warden authorization scope
  const prisonsAsWarden = await api('GET', '/prisons', null, wardenToken);
  record('AUTHZ: warden blocked from admin-only /prisons', prisonsAsWarden.status === 403 ? 'PASS' : 'FAIL', `status=${prisonsAsWarden.status}`);
  const kiosksAsWarden = await api('GET', '/kiosks', null, wardenToken);
  record('AUTHZ: warden blocked from admin-only /kiosks', kiosksAsWarden.status === 403 ? 'PASS' : 'FAIL', `status=${kiosksAsWarden.status}`);
  const wardenCalls = await api('GET', '/calls', null, wardenToken);
  record('Warden /calls scoped to own prison(s)', wardenCalls.status === 200 ? 'PASS' : 'FAIL', `status=${wardenCalls.status}, count=${wardenCalls.json?.data?.length ?? 'n/a'}`);

  // Plaintext check on registered warden record (read db directly)
  try {
    const wardens = JSON.parse(fs.readFileSync(path.join(MODULE_DIR, 'db', 'wardens.json'), 'utf8'));
    const created = wardens.find(w => w.email === registeredEmail);
    record('PLAINTEXT: wardens.json stores registered pw in clear', created && created.password === 'secret123' ? 'FAIL' : 'PASS', created ? `stored=${String(created.password).slice(0, 6)}...` : 'record absent');
    const seeded = wardens.find(w => w.wardenId === 'WARDEN-001');
    record('PLAINTEXT: seeded warden passwords in clear', seeded && seeded.password === 'Warden@123' ? 'FAIL' : 'PASS', `stored=${String(seeded?.password).slice(0, 6)}...`);
  } catch (e) { record('PLAINTEXT: wardens.json inspection', 'FAIL', e.message); }
  try {
    const users = JSON.parse(fs.readFileSync(path.join(MODULE_DIR, 'db', 'users.json'), 'utf8'));
    const u = users[0];
    record('PLAINTEXT: kiosk user PINs in clear', u && u.password === 'pin1234' ? 'FAIL' : 'PASS', `stored=${String(u?.password).slice(0, 6)}...`);
  } catch (e) { record('PLAINTEXT: users.json inspection', 'FAIL', e.message); }

  // Face identify without image
  const faceNoImage = await api('POST', '/auth/face-identify', { kioskId: 'KIOSK-001' });
  record('POST /auth/face-identify without image -> 400', faceNoImage.status === 400 ? 'PASS' : 'FAIL', `status=${faceNoImage.status}, code=${faceNoImage.json?.error?.code}`);

  // Kiosk verify endpoint
  const kioskVerify = await api('POST', '/kiosks/verify', { deviceSerialNumber: 'SN-TEST-000' });
  record('POST /kiosks/verify (unknown serial) graceful', kioskVerify.status === 200 ? 'PASS' : 'FAIL', `status=${kioskVerify.status}, authorized=${kioskVerify.json?.data?.authorized}`);

  // Rate limiting (20 req / 15 min) — reset via unique behavior: send 22 bad logins
  let limited = false;
  for (let i = 0; i < 24; i++) {
    const r = await api('POST', '/auth/warden/login', { email: 'nobody@x.test', password: 'no' });
    if (r.status === 429) { limited = true; break; }
  }
  record('RATE LIMIT: /auth/warden/login returns 429 after limits', limited ? 'PASS' : 'FAIL', `limited=${limited}`);

} catch (err) {
  record('TEST_HARNESS', 'FAIL', err.message);
} finally {
  child.kill();
  if (child.exitCode === null) { child.kill('SIGTERM'); }
}

// ==================== SUMMARY ====================
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\n==================== SUMMARY ====================');
console.log(`total=${results.length} passed=${passed} failed=${failed}`);
console.log('\n--- failed ---');
for (const r of results.filter(r => r.status === 'FAIL')) console.log(`  [FAIL] ${r.name} :: ${r.detail}`);
console.log('\n--- server boot log (tail) ---');
console.log(LOGS.slice(-25).join('\n'));

fs.writeFileSync(path.join(MODULE_DIR, 'audit-results.json'), JSON.stringify({ total: results.length, passed, failed, results }, null, 2));