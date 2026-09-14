const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: 'postgres://prisonconnect:PrisonConnect2024!@127.0.0.1:5378/prisonconnect',
    ssl: false
  });

  try {
    // Get admins
    const admins = await pool.query('SELECT data FROM admins LIMIT 10');
    console.log('=== ADMINS ===');
    admins.rows.forEach(r => {
      const d = r.data;
      console.log(`  ${d.adminId || d.employeeId} | role=${d.role} | kioskId=${d.kioskId}`);
    });

    // Get all inmates
    const inmates = await pool.query('SELECT data FROM inmates');
    console.log('\n=== INMATES ===');
    inmates.rows.forEach(r => {
      const d = r.data;
      console.log(`  ${d.inmateId} | ${d.firstName} ${d.lastName} | active=${d.active} | status=${d.status}`);
    });

    // Get all contacts
    const contacts = await pool.query('SELECT data FROM contacts');
    console.log('\n=== CONTACTS ===');
    contacts.rows.forEach(r => {
      const d = r.data;
      console.log(`  ${d.contactId} | inmate=${d.inmateId} | ${d.name || d.fullName} | active=${d.active} | status=${d.status}`);
    });

    // Now test: Admin contacts for inmate 100101
    console.log('\n=== ADMIN VIEW: contacts for 100101 ===');
    const adminContacts = contacts.rows.filter(r => {
      const d = r.data;
      return d.inmateId === '100101' || d.inmateId === 'INM-100101' || d.inmateId === 'INM100101';
    });
    adminContacts.forEach(r => {
      const d = r.data;
      console.log(`  ${d.contactId} | ${d.name || d.fullName} | active=${d.active} | status=${d.status}`);
    });

    // Inmate view contacts for 100101 (same query, should be same result)
    console.log('\n=== INMATE VIEW: contacts for 100101 ===');
    const inmateContacts = contacts.rows.filter(r => {
      const d = r.data;
      return (d.inmateId === '100101' || d.inmateId === 'INM-100101' || d.inmateId === 'INM100101') && d.active !== false;
    });
    inmateContacts.forEach(r => {
      const d = r.data;
      console.log(`  ${d.contactId} | ${d.name || d.fullName} | active=${d.active} | status=${d.status}`);
    });

    console.log(`\nAdmin count: ${adminContacts.length}, Inmate count: ${inmateContacts.length}`);
    console.log(`SAME DATA: ${JSON.stringify(adminContacts.map(r=>r.data.contactId).sort()) === JSON.stringify(inmateContacts.map(r=>r.data.contactId).sort())}`);

  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

main();
