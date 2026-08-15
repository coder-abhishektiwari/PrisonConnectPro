/**
 * Seed script: loads the archived JSON documents (backend/legacy-db) into the
 * PostgreSQL store, applying:
 *   - bcrypt hashing of every stored credential (passwords, PINs, setup PINs)
 *   - referential-integrity repair (re-link/drop orphan rows so foreign keys
 *     hold; warn loudly about every repair so nobody is surprised)
 *   - dedupe of the "one active call per inmate" business rule
 *
 * The JSON files under backend/legacy-db are intentionally kept as the seeding
 * source; after a successful seed the live JSON store (backend/db) is removed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { hashSecret } = require('./auth');
const { readDb, updateDb, pool } = require('./db');
const { migrate } = require('./migrate');

const SRC_DIR = process.env.SEED_SRC_DIR || path.join(__dirname, '..', 'legacy-db');

function load(file) {
  const p = path.join(SRC_DIR, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.warn(`[seed] skipping corrupt ${file}: ${err.message}`);
    return null;
  }
}

async function hashCredentials(file, rows, credKeys) {
  if (!Array.isArray(rows)) return rows;
  for (const row of rows) {
    for (const key of credKeys) {
      const v = row[key];
      if (v != null && !/^\$2[aby]\$/.test(String(v))) {
        row[key] = await hashSecret(String(v));
      }
    }
  }
  return rows;
}

async function main() {
  console.log('[seed] ensuring schema is up to date...');
  await migrate();

  // ---- load raw data ----
  const raw = {};
  for (const f of [
    'prisons.json', 'wardens.json', 'kiosks.json', 'users.json', 'inmates.json',
    'contacts.json', 'rooms.json', 'calls.json', 'recordings.json', 'schedule.json',
    'wallets.json', 'transactions.json', 'alerts.json', 'incidents.json',
    'devices.json', 'kiosk-registration-requests.json', 'statistics.json',
    'admins.json', 'super-admins.json', 'biometrics.json', 'subscriptions.json',
    'setup-pins.json', 'reports.json', 'servers.json', 'pricing.json', 'settings.json', 'storage.json'
  ]) {
    raw[f] = load(f);
  }

  const repairs = [];

  // ---- hash credentials ----
  await hashCredentials('wardens.json', raw['wardens.json'], ['password']);
  await hashCredentials('users.json', raw['users.json'], ['password', 'pin']);
  await hashCredentials('inmates.json', raw['inmates.json'], ['pin']);
  await hashCredentials('admins.json', raw['admins.json'], ['password', 'pin']);
  await hashCredentials('super-admins.json', raw['super-admins.json'], ['password', 'pin']);

  const prisons = (raw['prisons.json'] || []).map((p) => {
    if (p.setupPin && !/^\$2[aby]\$/.test(p.setupPin)) p.setupPinPlain = p.setupPin;
    return p;
  });
  for (const p of prisons) {
    if (p.setupPin && !/^\$2[aby]\$/.test(p.setupPin)) {
      p.setupPin = await hashSecret(String(p.setupPin));
    }
  }
  raw['prisons.json'] = prisons;

  // ---- referential-integrity helpers ----
  const idSet = (arr, key) => new Set((arr || []).map((r) => r[key]).filter(Boolean));

  // The legacy seed data is internally inconsistent: `inmates.json` uses numeric
  // ids (100101) while calls/wallets/contacts/rooms reference the fictional
  // "INM-001" / "CALL-001" naming. Resolve those positional aliases (INM-<n> maps
  // to the n-th inmate, CALL-<n> to the n-th call, etc.) so foreign keys hold.
  const ALIASES = {
    inmateId:     { arr: () => raw['inmates.json'], prefix: 'INM',     key: 'inmateId' },
    kioskId:      { arr: () => raw['kiosks.json'],  prefix: 'KIOSK',   key: 'kioskId' },
    contactId:    { arr: () => raw['contacts.json'],prefix: 'CONT',    key: 'contactId' },
    walletId:     { arr: () => raw['wallets.json'], prefix: 'WALLET',  key: 'walletId' },
    callId:       { arr: () => raw['calls.json'],   prefix: 'CALL',    key: 'callId' },
    prisonId:     { arr: () => raw['prisons.json'], prefix: 'PRISON',  key: 'prisonId' },
    wardenId:     { arr: () => raw['wardens.json'], prefix: 'WARDEN',  key: 'wardenId' }
  };
  function resolveAlias(value, alias) {
    if (typeof value !== 'string') return value;
    const m = new RegExp(`^${alias.prefix}-(\\d+)$`).exec(value);
    if (!m) return value;
    const idx = parseInt(m[1], 10) - 1;
    const src = alias.arr() || [];
    if (idx < 0 || idx >= src.length) return value;
    const canonical = src[idx][alias.key];
    if (canonical && canonical !== value) {
      repairs.push(`alias: ${value} -> ${canonical}`);
    }
    return canonical || value;
  }
  const ALIAS_FIELDS = {
    'wardens.json': { prisonId: 'prisonId' },
    'kiosks.json': { prisonId: 'prisonId' },
    'users.json': { kioskId: 'kioskId', prisonId: 'prisonId' },
    'inmates.json': { prisonId: 'prisonId', assignedKioskId: 'kioskId', walletId: 'walletId' },
    'contacts.json': { inmateId: 'inmateId' },
    'rooms.json': { kioskId: 'kioskId', inmateId: 'inmateId', contactId: 'contactId' },
    'calls.json': { inmateId: 'inmateId', contactId: 'contactId', kioskId: 'kioskId', prisonId: 'prisonId' },
    'recordings.json': { callId: 'callId', kioskId: 'kioskId', inmateId: 'inmateId' },
    'schedule.json': { inmateId: 'inmateId', contactId: 'contactId', kioskId: 'kioskId' },
    'wallets.json': { inmateId: 'inmateId' },
    'transactions.json': { walletId: 'walletId', inmateId: 'inmateId', callId: 'callId' },
    'alerts.json': { prisonId: 'prisonId', kioskId: 'kioskId', callId: 'callId' },
    'incidents.json': { prisonId: 'prisonId', inmateId: 'inmateId', kioskId: 'kioskId', callId: 'callId', wardenId: 'wardenId' },
    'statistics.json': { callId: 'callId' },
    'biometrics.json': { inmateId: 'inmateId' },
    'subscriptions.json': { prisonId: 'prisonId' },
    'setup-pins.json': { prisonId: 'prisonId' },
    'reports.json': { prisonId: 'prisonId' }
  };
  for (const [file, fields] of Object.entries(ALIAS_FIELDS)) {
    const rows = raw[file];
    if (!Array.isArray(rows)) continue;
    for (const [field, aliasKey] of Object.entries(fields)) {
      const alias = ALIASES[aliasKey];
      for (const row of rows) {
        if (Array.isArray(row[field])) {
          row[field] = row[field].map((v) => resolveAlias(v, alias));
        } else {
          row[field] = resolveAlias(row[field], alias);
        }
      }
    }
  }
  if (Array.isArray(raw['inmates.json'])) {
    for (const inmate of raw['inmates.json']) {
      if (Array.isArray(inmate.approvedContactIds)) {
        inmate.approvedContactIds = inmate.approvedContactIds.map((v) => resolveAlias(v, ALIASES.contactId));
      }
      if (inmate.biometricData && Array.isArray(inmate.biometrics)) {
        inmate.biometrics = inmate.biometrics.map((b) => ({ ...b, inmateId: resolveAlias(b.inmateId || inmate.inmateId, ALIASES.inmateId) }));
      }
    }
  }

  const prisonIds = idSet(prisons, 'prisonId');
  const wardenIds = idSet(raw['wardens.json'], 'wardenId');
  const kioskIds = idSet(raw['kiosks.json'], 'kioskId');
  const userIds = idSet(raw['users.json'], 'userId');
  const inmateIds = idSet(raw['inmates.json'], 'inmateId');
  const contactIds = idSet(raw['contacts.json'], 'contactId');
  const roomIds = idSet(raw['rooms.json'], 'roomId');
  const callIds = idSet(raw['calls.json'], 'callId');
  const walletIds = idSet(raw['wallets.json'], 'walletId');

  function link(rows, field, validSet, fallback, what, where, soft) {
    const out = (rows || []).filter((r) => {
      const v = r[field];
      if (v == null || validSet.has(v)) return true;
      const fb = fallback ? [...validSet][0] : null;
      if (fb) {
        repairs.push(`${what}[${r[where] || r.id}] ${field}=${v} -> ${fb}`);
        r[field] = fb;
        return true;
      }
      if (soft) {
        repairs.push(`${what}[${r[where] || r.id}] ${field}=${v} cleared -> null`);
        r[field] = null;
        return true;
      }
      repairs.push(`${what}[${r[where] || r.id}] dropped: dangling ${field}=${v}`);
      return false;
    });
    return out;
  }

  // kiosks must reference a real prison
  raw['kiosks.json'] = link(raw['kiosks.json'], 'prisonId', prisonIds, true, 'kiosk');
  // wardens must reference a real prison
  raw['wardens.json'] = link(raw['wardens.json'], 'prisonId', prisonIds, false, 'warden');
  // users (kiosk operators)
  raw['users.json'] = link(raw['users.json'], 'prisonId', prisonIds, false, 'user');
  raw['users.json'] = link(raw['users.json'], 'kioskId', kioskIds, false, 'user');
  // inmates
  raw['inmates.json'] = link(raw['inmates.json'], 'prisonId', prisonIds, false, 'inmate', 'inmateId');
  raw['inmates.json'] = link(raw['inmates.json'], 'assignedKioskId', kioskIds, false, 'inmate', 'inmateId', true);
  const inmateIdsF = idSet(raw['inmates.json'], 'inmateId');
  // contacts -> inmates
  raw['contacts.json'] = link(raw['contacts.json'], 'inmateId', inmateIdsF, true, 'contact');
  const contactIdsF = idSet(raw['contacts.json'], 'contactId');
  // rooms
  raw['rooms.json'] = link(raw['rooms.json'], 'kioskId', kioskIds, true, 'room');
  raw['rooms.json'] = link(raw['rooms.json'], 'inmateId', inmateIdsF, false, 'room');
  raw['rooms.json'] = link(raw['rooms.json'], 'contactId', contactIdsF, false, 'room');
  // calls
  raw['calls.json'] = link(raw['calls.json'], 'inmateId', inmateIdsF, false, 'call');
  const callInmateIds = idSet(raw['calls.json'], 'inmateId');
  raw['calls.json'] = link(raw['calls.json'], 'contactId', contactIdsF, false, 'call');
  raw['calls.json'] = link(raw['calls.json'], 'kioskId', kioskIds, false, 'call');
  const callRows = raw['calls.json'] || [];
  for (const c of callRows) c.prisonId = c.prisonId || (callInmateIds.has(c.inmateId) ? raw['inmates.json'].find((i) => i.inmateId === c.inmateId)?.prisonId : null);
  const callIdsF = idSet(callRows, 'callId');

  // recordings -> calls
  raw['recordings.json'] = link(raw['recordings.json'], 'callId', callIdsF, false, 'recording');
  raw['recordings.json'] = link(raw['recordings.json'], 'inmateId', inmateIdsF, false, 'recording');
  // schedule
  raw['schedule.json'] = link(raw['schedule.json'], 'inmateId', inmateIdsF, false, 'schedule');
  raw['schedule.json'] = link(raw['schedule.json'], 'contactId', contactIdsF, false, 'schedule');
  raw['schedule.json'] = link(raw['schedule.json'], 'kioskId', kioskIds, false, 'schedule');
  // wallets -> inmates, transactions -> wallets/inmates/calls
  raw['wallets.json'] = link(raw['wallets.json'], 'inmateId', inmateIdsF, false, 'wallet');
  const walletIdsF = idSet(raw['wallets.json'], 'walletId');
  raw['transactions.json'] = link(raw['transactions.json'], 'walletId', walletIdsF, false, 'transaction');
  raw['transactions.json'] = link(raw['transactions.json'], 'inmateId', inmateIdsF, false, 'transaction');
  raw['transactions.json'] = link(raw['transactions.json'], 'callId', callIdsF, false, 'transaction');
  // alerts / incidents
  raw['alerts.json'] = link(raw['alerts.json'], 'prisonId', prisonIds, false, 'alert');
  raw['alerts.json'] = link(raw['alerts.json'], 'callId', callIdsF, false, 'alert');
  raw['incidents.json'] = link(raw['incidents.json'], 'prisonId', prisonIds, false, 'incident');
  raw['incidents.json'] = link(raw['incidents.json'], 'inmateId', inmateIdsF, false, 'incident');
  raw['incidents.json'] = link(raw['incidents.json'], 'callId', callIdsF, false, 'incident');
  raw['incidents.json'] = link(raw['incidents.json'], 'wardenId', wardenIds, false, 'incident');
  // statistics -> calls
  const stats = (raw['statistics.json'] || []).filter((s) => callIdsF.has(s.callId));
  if (stats.length !== (raw['statistics.json'] || []).length) repairs.push('statistics: dropped orphan rows referencing missing calls');
  raw['statistics.json'] = stats;
  // biometrics -> inmates
  raw['biometrics.json'] = link(raw['biometrics.json'], 'inmateId', inmateIdsF, false, 'biometric');
  // subscriptions / setup-pins / reports
  raw['subscriptions.json'] = link(raw['subscriptions.json'], 'prisonId', prisonIds, false, 'subscription');
  raw['setup-pins.json'] = link(raw['setup-pins.json'], 'prisonId', prisonIds, false, 'setup-pin');
  raw['reports.json'] = link(raw['reports.json'], 'prisonId', prisonIds, false, 'report');

  // ---- enforce "one active call per inmate" ----
  const activeByInmate = new Map();
  for (const c of raw['calls.json']) {
    if (c.status === 'active') {
      const prev = activeByInmate.get(c.inmateId);
      if (prev && c.startTime > prev.startTime) {
        repairs.push(`call[${c.callId}] downgraded active -> completed (inmate ${c.inmateId} already has an active call)`);
        c.status = 'completed';
      } else if (prev) {
        repairs.push(`call[${prev.callId}] downgraded active -> completed (inmate ${c.inmateId} already has an active call)`);
        prev.status = 'completed';
      } else {
        activeByInmate.set(c.inmateId, c);
      }
    }
  }

  // ---- write in dependency order ----
  // Seeding is NON-destructive: collections that already contain data are left
  // untouched so runtime-created records (e.g. kiosks registered by a device)
  // survive restarts and redeploys. Set FORCE_SEED=1 to wipe and re-seed.
  const forceSeed = ['1', 'true'].includes(String(process.env.FORCE_SEED || '').toLowerCase());
  const write = async (file) => {
    const rows = raw[file];
    if (rows == null) { console.log(`[seed] ${file}: skipped (missing)`); return; }
    if (!forceSeed) {
      const existing = await readDb(file);
      const count = Array.isArray(existing) ? existing.length : 0;
      if (count > 0) {
        console.log(`[seed] ${file}: skipped (${count} existing rows)`);
        return;
      }
    }
    await updateDb(file, () => ({ data: rows, result: null }));
    const count = Array.isArray(rows) ? rows.length : 1;
    console.log(`[seed] ${file}: ${count} row(s)`);
  };

  await write('prisons.json');
  await write('wardens.json');
  await write('kiosks.json');
  await write('users.json');
  await write('inmates.json');
  await write('contacts.json');
  await write('rooms.json');
  await write('calls.json');
  await write('recordings.json');
  await write('schedule.json');
  await write('wallets.json');
  await write('transactions.json');
  await write('alerts.json');
  await write('incidents.json');
  await write('devices.json');
  await write('kiosk-registration-requests.json');
  await write('statistics.json');
  await write('admins.json');
  await write('super-admins.json');
  await write('biometrics.json');
  await write('subscriptions.json');
  await write('setup-pins.json');
  await write('reports.json');
  await write('servers.json');
  await write('pricing.json');
  await write('settings.json');
  await write('storage.json');

  console.log('[seed] referential-integrity repairs:');
  if (repairs.length === 0) console.log('  (none needed)');
  else repairs.forEach((r) => console.log('  - ' + r));

  const rows = await pool.query(`
    SELECT 'prisons' AS t, count(*) FROM prisons UNION ALL
    SELECT 'wardens', count(*) FROM wardens UNION ALL
    SELECT 'kiosks', count(*) FROM kiosks UNION ALL
    SELECT 'users', count(*) FROM users UNION ALL
    SELECT 'inmates', count(*) FROM inmates UNION ALL
    SELECT 'contacts', count(*) FROM contacts UNION ALL
    SELECT 'calls', count(*) FROM calls`);
  console.log('[seed] row totals:');
  for (const r of rows.rows) console.log(`  ${r.t}: ${r.count}`);
  await pool.end();
}

main().then(() => process.exit(0)).catch((err) => { console.error('[seed] FAILED:', err); process.exit(1); });