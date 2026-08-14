/**
 * PostgreSQL data-access layer.
 *
 * Replaces the old JSON-file store with a relational PostgreSQL backing store,
 * while keeping the exact `readDb(filename)` / `updateDb(filename, mutator)`
 * interface the route handlers already use.
 *
 * Design:
 *  - Each JSON collection maps to a table with a full-document `data` JSONB
 *    column plus relational pointer columns (foreign keys / unique values)
 *    that are kept in sync on write. This gives real foreign keys, indexes and
 *    uniqueness constraints while letting documents round-trip unchanged.
 *  - `updateDb` still runs a read-modify-write inside a single PostgreSQL
 *    transaction and a per-collection in-process mutex, preserving the old
 *    atomicity semantics.
 *  - Singleton collections (pricing, settings, storage) are stored as a single
 *    row in `singleton_config`.
 */
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL env var is required — set it in backend/.env');
}

function getPoolConfig(url) {
  const config = { connectionString: url, max: 10, idleTimeoutMillis: 30000 };
  // Allow explicit override via env var.
  const sslOverride = process.env.DATABASE_SSL;
  if (sslOverride === 'true' || sslOverride === '1') {
    config.ssl = { rejectUnauthorized: false };
    return config;
  }
  if (sslOverride === 'false' || sslOverride === '0') {
    return config;
  }
  // Auto-detect: cloud Postgres (Render, Supabase, etc.) requires SSL.
  // Local PostgreSQL (localhost / 127.0.0.1 / docker-compose service name) does not.
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === 'postgres' || host === '';
    if (!isLocal) {
      config.ssl = { rejectUnauthorized: false };
    }
  } catch (e) {
    // If URL parsing fails, enable SSL (safe default for cloud providers)
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

const pool = new Pool(getPoolConfig(DATABASE_URL));

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err.message);
});

/** Map JSON-DB filename => registration for the relational layer. */
const REGISTRY = {
  'prisons.json':      { table: 'prisons',                 idKey: 'prisonId', cols: { name: 'name', status: 'status' } },
  'wardens.json':      { table: 'wardens',                 idKey: 'wardenId', cols: { email: 'email', prisonId: 'prison_id' } },
  'users.json':        { table: 'users',                   idKey: 'userId', cols: { username: 'username', email: 'email', kioskId: 'kiosk_id', prisonId: 'prison_id' } },
  'inmates.json':      { table: 'inmates',                 idKey: 'inmateId', cols: { prisonId: 'prison_id', assignedKioskId: 'kiosk_id' } },
  'kiosks.json':       { table: 'kiosks',                  idKey: 'kioskId', cols: { prisonId: 'prison_id', deviceSerialNumber: 'serial' } },
  'contacts.json':     { table: 'contacts',                idKey: 'contactId', cols: { inmateId: 'inmate_id' } },
  'rooms.json':        { table: 'rooms',                   idKey: 'roomId', cols: { kioskId: 'kiosk_id', inmateId: 'inmate_id', contactId: 'contact_id', status: 'status' } },
  'calls.json':        { table: 'calls',                   idKey: 'callId', cols: { roomId: 'room_id', inmateId: 'inmate_id', contactId: 'contact_id', kioskId: 'kiosk_id', prisonId: 'prison_id', status: 'status', startTime: 'start_time', endTime: 'end_time' } },
  'recordings.json':   { table: 'recordings',              idKey: 'recordingId', cols: { callId: 'call_id', kioskId: 'kiosk_id', inmateId: 'inmate_id' } },
  'schedule.json':     { table: 'schedule',                idKey: 'scheduleId', cols: { inmateId: 'inmate_id', contactId: 'contact_id', kioskId: 'kiosk_id', date: 'date', timeSlot: 'time_slot', status: 'status' } },
  'wallets.json':      { table: 'wallets',                 idKey: 'walletId', cols: { inmateId: 'inmate_id' } },
  'transactions.json': { table: 'transactions',            idKey: 'transactionId', cols: { walletId: 'wallet_id', inmateId: 'inmate_id', callId: 'call_id' } },
  'alerts.json':       { table: 'alerts',                  idKey: 'alertId', cols: { prisonId: 'prison_id', kioskId: 'kiosk_id', callId: 'call_id' } },
  'incidents.json':    { table: 'incidents',               idKey: 'incidentId', cols: { prisonId: 'prison_id', inmateId: 'inmate_id', kioskId: 'kiosk_id', callId: 'call_id', wardenId: 'warden_id' } },
  'devices.json':      { table: 'devices',                 idKey: 'deviceId', cols: {} },
  'kiosk-registration-requests.json': { table: 'kiosk_registration_requests', idKey: 'requestId', cols: { prisonId: 'prison_id' } },
  'statistics.json':   { table: 'statistics',              idKey: null, idKeyFn: (d) => `${d.callId}:${d.timestamp}`, cols: { callId: 'call_id' } },
  'admins.json':       { table: 'admins',                  idKey: 'adminId', cols: {} },
  'super-admins.json': { table: 'super_admins',            idKey: 'adminId', cols: {} },
  'biometrics.json':   { table: 'biometrics',              idKey: 'biometricId', cols: { inmateId: 'inmate_id' } },
  'subscriptions.json':{ table: 'subscriptions',           idKey: 'id', cols: { prisonId: 'prison_id' } },
  'setup-pins.json':   { table: 'setup_pins',              idKey: 'prisonId', cols: { prisonId: 'prison_id' } },
  'reports.json':      { table: 'reports',                 idKey: 'reportId', cols: { prisonId: 'prison_id' } },
  'servers.json':      { table: 'servers',                 idKey: 'serverId', cols: {} },
  'pricing.json':      { singleton: true },
  'settings.json':     { singleton: true },
  'storage.json':      { singleton: true }
};

function normalizeFilename(filename) {
  if (typeof filename === 'string' && filename.endsWith('.json')) return filename;
  return `${filename}.json`;
}

function registryFor(filename) {
  const reg = REGISTRY[normalizeFilename(filename)];
  if (!reg) throw new Error(`[db] unknown collection: ${filename}`);
  return reg;
}

function entityId(reg, data) {
  if (reg.singleton) return data.id || 'singleton';
  if (reg.idKey) return data[reg.idKey] != null ? String(data[reg.idKey]) : null;
  if (reg.idKeyFn) return reg.idKeyFn(data);
  return null;
}

function deriveCols(reg, data) {
  const out = {};
  for (const [key, col] of Object.entries(reg.cols)) {
    const v = data[key];
    out[col] = v == null || v === '' ? null : v;
  }
  return out;
}

// Per-collection promise chain, mirroring the old per-file write queue.
const mutexes = new Map();
function withMutex(filename, task) {
  const prev = mutexes.get(filename) || Promise.resolve();
  const run = prev.then(task, task);
  mutexes.set(filename, run.catch(() => {}));
  return run;
}

async function readAll(reg) {
  const table = reg.table;
  const { rows } = await pool.query(`SELECT data FROM ${table}`);
  const docs = rows.map((r) => r.data);
  const bad = docs.filter((d) => d == null);
  if (bad.length) {
    console.error(`[db] readAll(${table}): ${bad.length}/${docs.length} rows have NULL data`);
  }
  return docs;
}

async function readSingleton(reg, id) {
  const { rows } = await pool.query('SELECT data FROM singleton_config WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  return rows[0].data;
}

/** Read a collection. Returns an array of documents (or a single object for singleton configs). */
function readDb(filename) {
  const reg = registryFor(filename);
  return withMutex(normalizeFilename(filename), async () => {
    if (reg.singleton) {
      const id = reg.singletonId || filename.replace('.json', '');
      const value = await readSingleton(reg, id);
      if (value) return value;
      // Seed defaults so users see a coherent config even before first write.
      const defaults = { pricing: { audio: 0, video: 0, tax: 0, billingRules: {} }, settings: { callSettings: {}, systemSettings: {}, securitySettings: {} }, storage: { total: 0, used: 0, available: 0, retentionDays: 30, encryption: true } };
      return defaults[filename.replace('.json', '')] || {};
    }
    return readAll(reg);
  });
}

/**
 * Atomic read-modify-write. `mutator(data)` receives the current documents and
 * must return { data, result }. All changes are applied inside a single
 * PostgreSQL transaction; throwing aborts the write (nothing is persisted).
 */
function updateDb(filename, mutator) {
  const reg = registryFor(filename);
  return withMutex(normalizeFilename(filename), async () => {
    // Load current documents.
    const table = reg.table;
    let currentDocs;
    let singletonId = null;
    if (reg.singleton) {
      singletonId = filename.replace('.json', '');
      const v = await readSingleton(reg, singletonId);
      currentDocs = v || {};
    } else {
      currentDocs = await readAll(reg);
    }

    const { data: nextData, result } = mutator(currentDocs);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (reg.singleton) {
        const payload = JSON.stringify(nextData || {});
        await client.query(
          `INSERT INTO singleton_config (id, data) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [singletonId, payload]
        );
      } else {
        const oldIds = new Map(currentDocs.map((d) => {
          const id = entityId(reg, d);
          return [id, true];
        }));
        const seen = new Map();
        for (const doc of nextData) {
          const id = entityId(reg, doc);
          if (id == null) throw new Error(`[db] record missing id for ${filename}`);
          const cols = deriveCols(reg, doc);
          const payload = JSON.stringify(doc);
          if (oldIds.has(id)) {
            const setClause = Object.keys(cols).map((c, i) => `${c} = $${i + 3}`).join(', ');
            if (Object.keys(cols).length) {
              await client.query(
                `UPDATE ${table} SET data = $1, ${setClause} WHERE id = $2`,
                [payload, id, ...Object.values(cols)]
              );
            } else {
              await client.query(`UPDATE ${table} SET data = $1 WHERE id = $2`, [payload, id]);
            }
          } else {
            const colNames = Object.keys(cols);
            const colsSql = colNames.length ? `, ${colNames.join(', ')}` : '';
            const vals = colNames.length ? `, ${colNames.map((_, i) => `$${i + 3}`).join(', ')}` : '';
            await client.query(
              `INSERT INTO ${table} (id, data${colsSql}) VALUES ($1, $2${vals})`,
              [id, payload, ...Object.values(cols)]
            );
          }
          seen.set(id, true);
        }
        // Delete rows that disappeared from the collection.
        for (const id of oldIds.keys()) {
          if (!seen.has(id)) {
            await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
          }
        }
      }
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}

/** Run several updateDb calls atomically across collections. */
async function transact(specs) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const { filename, mutator } of specs) {
      const reg = registryFor(filename);
      const table = reg.table;
      let current;
      if (reg.singleton) {
        current = (await readSingleton(reg, filename.replace('.json', ''))) || {};
      } else {
        current = await readAll(reg);
      }
      const { data: nextData, result } = mutator(current);
      results.push(result);
      if (reg.singleton) {
        await client.query(
          `INSERT INTO singleton_config (id, data) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [filename.replace('.json', ''), JSON.stringify(nextData || {})]
        );
      } else {
        const oldIds = new Set(current.map((d) => entityId(reg, d)));
        const seen = new Set();
        for (const doc of nextData) {
          const id = entityId(reg, doc);
          if (id == null) throw new Error(`[db] record missing id for ${filename}`);
          const cols = deriveCols(reg, doc);
          if (oldIds.has(id)) {
            if (Object.keys(cols).length) {
              const setClause = Object.keys(cols).map((c, i) => `${c} = $${i + 3}`).join(', ');
              await client.query(`UPDATE ${table} SET data = $1, ${setClause} WHERE id = $2`, [id, JSON.stringify(doc), ...Object.values(cols)]);
            } else {
              await client.query(`UPDATE ${table} SET data = $1 WHERE id = $2`, [id, JSON.stringify(doc)]);
            }
          } else {
            const colNames = Object.keys(cols);
            await client.query(`INSERT INTO ${table} (id, data${colNames.length ? ', ' + colNames.join(', ') : ''}) VALUES ($1, $2${colNames.length ? ', ' + colNames.map((_, i) => `$${i + 3}`).join(', ') : ''})`, [id, JSON.stringify(doc), ...Object.values(cols)]);
          }
          seen.add(id);
        }
        for (const id of oldIds) {
          if (!seen.has(id)) await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
        }
      }
    }
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function query(text, params) {
  return pool.query(text, params);
}

async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

module.exports = { readDb, updateDb, transact, query, ping, pool };