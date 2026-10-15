// PrisonConnect backend audit integration tests.
// Spawns the real server.js on a test port and verifies behavior with real HTTP.
// Usage: node audit-tests.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config'; // DATABASE_URL for the PG-backed storage checks

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.AUDIT_PORT || 39777;
const BASE = `http://127.0.0.1:${PORT}`;
// The suite needs a warden token for ~30 authorization tests, and the warden
// account lives in the seed data. The password is a real credential, so it is
// read from the environment instead of being committed to the repo.
const WARDEN_EMAIL = process.env.AUDIT_WARDEN_EMAIL || 'rajesh.kumar@prisonconnect.gov.in';
const WARDEN_PASSWORD = process.env.AUDIT_WARDEN_PASSWORD || '';
if (!WARDEN_PASSWORD) {
  console.error('\nAUDIT_WARDEN_PASSWORD is not set.');
  console.error('Add it to backend/.env (the password of the seeded warden at');
  console.error(`${WARDEN_EMAIL}) and re-run: node audit-tests.mjs\n`);
  process.exit(2);
}
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
  const wardenLogin = await api('POST', '/auth/warden/login', { email: WARDEN_EMAIL, password: WARDEN_PASSWORD });
  record('POST /auth/warden/login (valid)', wardenLogin.status === 200 ? 'PASS' : 'FAIL', `status=${wardenLogin.status}`);
  const wardenToken = wardenLogin.json?.data?.accessToken || wardenLogin.json?.accessToken || null;
  if (wardenToken) record('WARDEN_TOKEN_OBTAINED', 'PASS');
  else record('WARDEN_TOKEN_OBTAINED', 'FAIL', 'no accessToken in response');

  const wardenBad = await api('POST', '/auth/warden/login', { email: WARDEN_EMAIL, password: 'wrong' });
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

  const setupPassword = await api('GET', '/kiosks/setup-password/PRISON-001', null, kioskToken);
  record('AUTHZ: setup password readable by any authed user', setupPassword.status === 200 ? 'FAIL' : 'PASS', `set=${setupPassword.json?.data?.passwordSet}`);

  // Setup password validation — set a known password first so the check does
  // not depend on whatever the local DB happens to hold for PRISON-001.
  const setPw = await api('PUT', '/kiosks/setup-password', { prisonId: 'PRISON-001', password: 'Jail@2026x' }, wardenToken);
  record('PUT /kiosks/setup-password (warden sets own prison)', setPw.status === 200 ? 'PASS' : 'FAIL', `status=${setPw.status}`);
  const pwOk = await api('POST', '/kiosks/validate-setup-password', { password: 'Jail@2026x', prisonId: 'PRISON-001' });
  record('POST /kiosks/validate-setup-password correct', pwOk.status === 200 ? 'PASS' : 'FAIL', `status=${pwOk.status}`);
  const pwBad = await api('POST', '/kiosks/validate-setup-password', { password: 'WrongPass9', prisonId: 'PRISON-001' });
  record('POST /kiosks/validate-setup-password wrong', pwBad.status === 401 ? 'PASS' : 'FAIL', `status=${pwBad.status}`);

  // /auth/register stores the warden password bcrypt-hashed (verify against
  // the PG row directly — wardens are not listed on /admin).
  const registeredEmail = `audit.${Date.now()}@x.test`;
  const reg = await api('POST', '/auth/register', { name: 'Audit Tester', email: registeredEmail, password: 'secret123', prisonName: `Audit Prison ${Date.now()}` });
  record('POST /auth/register warden', reg.status === 201 ? 'PASS' : 'FAIL', `status=${reg.status}`);
  const regPw = reg.status === 201;

  if (regPw) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const { rows } = await pool.query(`SELECT data->>'password' AS pw FROM wardens WHERE email = $1`, [registeredEmail]);
      await pool.end();
      const stored = rows[0]?.pw || '';
      record('STORAGE: registered warden password stored bcrypt-hashed', stored.startsWith('$2') && stored !== 'secret123' ? 'PASS' : 'FAIL', `stored=${stored ? stored.slice(0, 7) + '...' : 'row absent'}`);
    } catch (e) {
      record('STORAGE: registered warden password stored bcrypt-hashed', 'FAIL', e.message);
    }
  }

  // Registration round-trip: the new warden can log in with the password they chose.
  const createdLogin = await api('POST', '/auth/warden/login', { email: registeredEmail, password: 'secret123' });
  record('REGISTER: new warden can log in with their password', createdLogin.status === 200 ? 'PASS' : 'FAIL', `status=${createdLogin.status}`);

  // Call state machine — list responses are paginated ({ items, total }); read
  // rows from data.items, skip inmates that already have an active call (a
  // previous run can leave one behind), and mint a fresh contact for it.
  const inmateRes = await api('GET', '/inmates?limit=25', null, wardenToken);
  const inmateRows = Array.isArray(inmateRes.json?.data) ? inmateRes.json.data : (inmateRes.json?.data?.items || []);
  const activeRes = await api('GET', '/calls/active', null, wardenToken);
  const activeRows = Array.isArray(activeRes.json?.data) ? activeRes.json.data : (activeRes.json?.data?.items || []);
  const busy = new Set(activeRows.map((c) => c.inmateId));
  const inmate = inmateRows.find((i) => !busy.has(i.inmateId));
  const newContact = inmate
    ? await api('POST', `/admin/prisoners/${inmate.inmateId}/contacts`, { firstName: 'Audit', lastName: 'Family', relationship: 'family', phone: `+91-${String(Date.now()).slice(-10)}` }, wardenToken)
    : { json: {} };
  const contact = newContact.json?.data;
  record('FIXTURE: free inmate + contact for call tests', inmate && contact?.contactId ? 'PASS' : 'FAIL', `inmate=${inmate?.inmateId || 'none'}, busyActive=${busy.size}, contact=${contact?.contactId || 'none'}`);
  const kioskId = 'KIOSK-001';
  const newCall = await api('POST', '/calls', { inmateId: inmate?.inmateId, contactId: contact?.contactId, kioskId }, wardenToken);
  record('POST /calls create', newCall.status === 201 ? 'PASS' : 'FAIL', `status=${newCall.status}${newCall.json?.error ? ' :: ' + newCall.json.error.message : ''}`);
  const callId = newCall.json?.data?.callId;

  if (callId) {
    // Invalid transition: active -> ringing is not in ALLOWED_TRANSITIONS
    const badTrans = await api('PATCH', `/calls/${callId}`, { status: 'ringing' }, wardenToken);
    record('CALL STATE: active->ringing rejected', badTrans.status === 409 ? 'PASS' : 'FAIL', `status=${badTrans.status}, code=${badTrans.json?.error?.code}`);
    // Valid transition: active -> reconnecting (then back to active for the dup test)
    const okTrans = await api('PATCH', `/calls/${callId}`, { status: 'reconnecting' }, wardenToken);
    record('CALL STATE: active->reconnecting allowed', okTrans.status === 200 ? 'PASS' : 'FAIL', `status=${okTrans.status}`);
    await api('PATCH', `/calls/${callId}`, { status: 'active' }, wardenToken);
  }

  // Duplicate active call for same inmate (call1 is active again by now)
  const dup = await api('POST', '/calls', { inmateId: inmate?.inmateId, contactId: contact?.contactId, kioskId }, wardenToken);
  record('CALL STATE: duplicate active call blocked', dup.status === 409 ? 'PASS' : 'FAIL', `status=${dup.status}, code=${dup.json?.error?.code}`);

  // Leave no active call behind — complete it so the next run can reuse the
  // same inmate instead of hitting CALL_IN_PROGRESS.
  if (callId) await api('PATCH', `/calls/${callId}`, { status: 'completed' }, wardenToken);

  // Refresh rotates the token pair; the response carries tokens only (the
  // dashboard keeps its stored user profile and just swaps tokens).
  const refresh = await api('POST', '/auth/refresh', { refreshToken: wardenLogin.json?.data?.refreshToken || wardenLogin.json?.refreshToken });
  record('POST /auth/refresh rotates token pair', refresh.status === 200 && refresh.json?.data?.accessToken ? 'PASS' : 'FAIL', `status=${refresh.status}, hasAccessToken=${!!refresh.json?.data?.accessToken}`);

  // Family-web endpoints live under /family/secure-call/* (family-web/src/services/api.ts).
  // A bogus link token answered WITH 'Invalid or expired call link' proves the
  // route handled it — an unhandled path would return the generic router 404.
  const famLink = await api('POST', '/family/secure-call/link/whatever-token');
  record('FAMILY: POST /family/secure-call/link/:token exists', famLink.json?.error?.message === 'Invalid or expired call link' ? 'PASS' : 'FAIL', `status=${famLink.status}, msg=${famLink.json?.error?.message}`);
  const famOtp = await api('POST', '/family/secure-call/verify-otp/whatever-token', { otp: '123456' });
  record('FAMILY: POST /family/secure-call/verify-otp/:token exists', famOtp.json?.error?.message === 'Invalid or expired call link' ? 'PASS' : 'FAIL', `status=${famOtp.status}, msg=${famOtp.json?.error?.message}`);
  const famDev = await api('POST', '/family/secure-call/device/whatever-token', { browser: 'x' });
  record('FAMILY: POST /family/secure-call/device/:token exists', famDev.json?.error?.message === 'Invalid or expired call link' ? 'PASS' : 'FAIL', `status=${famDev.status}, msg=${famDev.json?.error?.message}`);
  const famLeave = await api('POST', '/rooms/leave', {}, kioskToken);
  record('FAMILY: POST /rooms/leave exists', famLeave.status === 400 ? 'PASS' : 'FAIL', `status=${famLeave.status}`);

  // Vendor login flow: /auth/login accepts email+password for vendor/admin
  // accounts — bogus creds must fail with 401 INVALID_CREDENTIALS (a 400 would
  // mean the email+password branch does not exist at all).
  const vendorLogin = await api('POST', '/auth/login', { email: 'a@b.c', password: 'pw' });
  record('VENDOR: /auth/login accepts email+password', vendorLogin.status === 401 && vendorLogin.json?.error?.code === 'INVALID_CREDENTIALS' ? 'PASS' : 'FAIL', `status=${vendorLogin.status}, code=${vendorLogin.json?.error?.code}`);

  // Backend socket = dashboard broadcast channel, and broadcastEvent() is a
  // blind io.emit() — every event reaches every connected socket. So the
  // handshake is the only gate: no token or a garbage token must be refused,
  // a real warden token is let through.
  await socketTokenCheck('SOCKET: anonymous connect rejected', null);
  await socketTokenCheck('SOCKET: invalid token rejected', 'ROOM-ABCD1234');
  if (wardenToken) await socketTokenCheck('SOCKET: valid warden token accepted', wardenToken);

  // Warden authorization scope — warden is a first-class reader of prisons
  // and kiosks (the dashboard Configuration/Kiosks pages depend on it); both
  // lists are scoped to the warden's own jail by scopeList.
  const prisonsAsWarden = await api('GET', '/prisons', null, wardenToken);
  record('AUTHZ: warden can list prisons (scoped)', prisonsAsWarden.status === 200 ? 'PASS' : 'FAIL', `status=${prisonsAsWarden.status}`);
  const kiosksAsWarden = await api('GET', '/kiosks', null, wardenToken);
  record('AUTHZ: warden can list kiosks (scoped)', kiosksAsWarden.status === 200 ? 'PASS' : 'FAIL', `status=${kiosksAsWarden.status}`);
  const wardenCalls = await api('GET', '/calls', null, wardenToken);
  record('Warden /calls scoped to own prison(s)', wardenCalls.status === 200 ? 'PASS' : 'FAIL', `status=${wardenCalls.status}, count=${wardenCalls.json?.data?.length ?? 'n/a'}`);

  // Storage checks — the JSON files are gone (PostgreSQL JSONB `data` column);
  // verify the stored secrets are bcrypt-hashed, not clear text.
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const seeded = await pool.query(`SELECT data->>'password' AS pw FROM wardens WHERE email = $1`, ['rajesh.kumar@prisonconnect.gov.in']);
    const kioskUser = await pool.query(`SELECT data->>'password' AS pw FROM users ORDER BY id LIMIT 1`);
    await pool.end();
    const sp = seeded.rows[0]?.pw || '';
    record('STORAGE: seeded warden password bcrypt-hashed', sp.startsWith('$2') ? 'PASS' : 'FAIL', `stored=${sp ? sp.slice(0, 7) + '...' : 'row absent'}`);
    const up = kioskUser.rows[0]?.pw || '';
    record('STORAGE: kiosk user password bcrypt-hashed', up.startsWith('$2') ? 'PASS' : 'FAIL', `stored=${up ? up.slice(0, 7) + '...' : 'row absent'}`);
  } catch (e) {
    record('STORAGE: PG secret inspection', 'FAIL', e.message);
  }

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
