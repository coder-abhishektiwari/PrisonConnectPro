const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = http.request({ hostname: '127.0.0.1', port: 3000, path, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function pr(label, data) {
  console.log('\n' + label);
  if (!data) return;
  const items = Array.isArray(data) ? data : [data];
  items.forEach(c => console.log('  ' + c.contactId + ' | ' + (c.fullName || c.name) + ' | phone=' + (c.phoneNumber || c.phone) + ' | active=' + c.active));
}

async function main() {
  // 1. Admin token
  await req('POST', '/auth/admin/identify', { kioskId: 'KIOSK-001', username: 'empsa001' });
  const ar = await req('POST', '/auth/admin/verify-pin', { adminId: 'ADMIN-001', password: 'admin123', kioskId: 'KIOSK-001' });
  const at = ar.data.accessToken;

  // 2. Prisoner token
  const pr2 = await req('POST', '/auth/verify-pin', { inmateId: '100101', pin: '123456', kioskId: 'KIOSK-001' });
  const pt = pr2.data.accessToken;

  // 3. BASELINE - both views
  const aBefore = await req('GET', '/admin/prisoners/100101/contacts', null, at);
  const iBefore = await req('GET', '/contacts/100101', null, pt);
  pr('BEFORE - ADMIN VIEW:', aBefore.data);
  pr('BEFORE - INMATE VIEW:', iBefore.data);

  // 4. UPDATE Bob Doe's name and phone via admin API
  const bob = aBefore.data.find(c => c.fullName === 'Bob Doe');
  if (!bob) { console.log('Bob Doe not found!'); return; }
  console.log('\n>>> UPDATING: ' + bob.contactId + ' | Bob Doe -> Bobby Doe | phone +919876543211 -> +919999999999');

  const updateResult = await req('PUT', '/admin/contacts/' + bob.contactId, {
    name: 'Bobby Doe',
    mobileNumber: '+919999999999'
  }, at);
  console.log('Update success:', updateResult.success);
  if (!updateResult.success) console.log('Error:', JSON.stringify(updateResult));

  // 5. VERIFY - both views
  const aAfter = await req('GET', '/admin/prisoners/100101/contacts', null, at);
  const iAfter = await req('GET', '/contacts/100101', null, pt);
  pr('AFTER - ADMIN VIEW:', aAfter.data);
  pr('AFTER - INMATE VIEW:', iAfter.data);

  // 6. Compare
  console.log('\n=== RESULT ===');
  const adminBob = aAfter.data.find(c => c.contactId === bob.contactId);
  const inmateBob = iAfter.data.find(c => c.contactId === bob.contactId);
  console.log('Admin sees:  ' + (adminBob?.fullName) + ' | ' + (adminBob?.phoneNumber || adminBob?.phone));
  console.log('Inmate sees: ' + (inmateBob?.fullName) + ' | ' + (inmateBob?.phoneNumber || inmateBob?.phone));
  console.log('MATCH:', adminBob?.fullName === inmateBob?.fullName && (adminBob?.phoneNumber || adminBob?.phone) === (inmateBob?.phoneNumber || inmateBob?.phone));

  // 7. REVERT back to original
  console.log('\n>>> REVERTING back to Bob Doe | +919876543211');
  await req('PUT', '/admin/contacts/' + bob.contactId, { name: 'Bob Doe', mobileNumber: '+919876543211' }, at);
  const aRevert = await req('GET', '/admin/prisoners/100101/contacts', null, at);
  const revertBob = aRevert.data.find(c => c.contactId === bob.contactId);
  console.log('Reverted: ' + revertBob?.fullName + ' | ' + (revertBob?.phoneNumber || revertBob?.phone));
}

main().catch(console.error);
