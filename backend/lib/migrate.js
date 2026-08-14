require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SCHEMA_DIR = path.join(__dirname, '..', 'db-schema');

function getPoolConfig(url) {
  const config = { connectionString: url, max: 2 };
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

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL env var is required to run migrations.');
  return new Pool(getPoolConfig(url));
}

async function migrate() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) {
      console.log('[migrate] no migration files found');
      return { applied: [] };
    }

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    const ran = [];

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
      console.log(`[migrate] applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ran.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAILED on ${file}: ${err.message}`);
        throw err;
      }
    }
    console.log(`[migrate] done. applied: ${ran.length ? ran.join(', ') : '(none)'}`);
    return { applied: ran };
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
