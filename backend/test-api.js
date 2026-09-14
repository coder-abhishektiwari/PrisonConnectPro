const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({ hostname: '127.0.0.1', port: 3000, path, method: 'POST', headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({ hostname: '127.0.0.1', port: 3000, path, method: 'GET', headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // --- ADMIN ---
  await post('/auth/admin/identify', { kioskId: 'KIOSK-001', username: 'empsa001' });
  const adminPin = await post('/auth/admin/verify-pin', { adminId: 'ADMIN-001', password: 'admin123', kioskId: 'KIOSK-001' });
  const adminToken = adminPin.data?.accessToken;
  if (!adminToken) { console.log('NO ADMIN TOKEN'); return; }

  const adminContacts = await get('/admin/prisoners/100101/contacts', adminToken);
  console.log('=== ADMIN VIEW: /admin/prisoners/100101/contacts ===');
  console.log('Success:', adminContacts.success, 'Count:', adminContacts.data?.length);
  (adminContacts.data || []).forEach(c => console.log('  ' + c.contactId + ' | ' + (c.name || c.fullName) + ' | active=' + c.active + ' | status=' + (c.status || c.approvalStatus)));

  // --- PRISONER ---
  const pIdentify = await post('/auth/prisoner/identify', { prisonerId: '100101', kioskId: 'KIOSK-001' });
  console.log('\n=== PRISONER IDENTIFY ===');
  console.log('Success:', pIdentify.success, 'inmateId:', pIdentify.data?.inmateId);

  const pPin = await post('/auth/verify-pin', { inmateId: '100101', pin: '123456', kioskId: 'KIOSK-001' });
  console.log('Prisoner verify:', pPin.success, pPin.error?.message || '');
  const pToken = pPin.data?.accessToken || pPin.data?.token;
  if (!pToken) { console.log('NO PRISONER TOKEN'); return; }

  const inmateContacts = await get('/contacts/inmate/100101', pToken);
  console.log('\n=== INMATE VIEW: /contacts/inmate/100101 ===');
  console.log('Success:', inmateContacts.success, 'Count:', inmateContacts.data?.length);
  (inmateContacts.data || []).forEach(c => console.log('  ' + c.contactId + ' | ' + (c.name || c.fullName) + ' | active=' + c.active + ' | status=' + (c.status || c.approvalStatus)));

  // --- COMPARE ---
  const a = (adminContacts.data || []).map(c => c.contactId).sort();
  const b = (inmateContacts.data || []).map(c => c.contactId).sort();
  console.log('\n=== RESULT ===');
  console.log('Admin IDs:', JSON.stringify(a));
  console.log('Inmate IDs:', JSON.stringify(b));
  console.log('MATCH:', JSON.stringify(a) === JSON.stringify(b));
}

main().catch(console.error);
