require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SCHEMA_DIR = path.join(__dirname, '..', 'db-schema');

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL env var is required to run migrations.');
  return new Pool({ connectionString: url, max: 2 });
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
