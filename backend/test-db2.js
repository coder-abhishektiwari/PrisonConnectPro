const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: 'postgres://prisonconnect:PrisonConnect2024!@127.0.0.1:5378/prisonconnect',
    ssl: false
  });

  try {
    const admins = await pool.query('SELECT data FROM admins');
    admins.rows.forEach(r => {
      const d = r.data;
      console.log(`adminId=${d.adminId} emp=${d.employeeId} role=${d.role} kiosk=${d.kioskId} pin=${d.pin} password=${d.password} secret=${d.secret}`);
    });
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

main();
