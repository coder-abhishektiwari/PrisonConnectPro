/**
 * Backend E2E check: kiosk recording-upload contract.
 * Flow: pick a REAL call from /calls -> upload base64 MP4 for it ->
 * verify ACK + stored file -> confirm unknown callId gets clean 404.
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3011';
const SECRET = process.env.TEST_JWT_SECRET || 'bonmkJ5PAT4QXOxavgWpFyIKU6YMeBuGDlE19r8Cf7Zw0htz';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}${detail ? ' | ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' | ' + detail : ''}`); }
}

async function main() {
  // super_admin sees all calls regardless of prison scoping and satisfies
  // inScopeOf for uploads; swap to a real wardenId via TEST_ROLE/TEST_SUB
  // if you want to exercise warden scoping.
  const role = process.env.TEST_ROLE || 'super_admin';
  const sub = process.env.TEST_SUB || 'test-admin';
  const wardenToken = jwt.sign(
    { sub, role, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET
  );
  const headers = { Authorization: `Bearer ${wardenToken}`, 'Content-Type': 'application/json' };

  // ---- 0. Unknown callId must give a CLEAN 404 (FK guard), not 500 ----
  const badRes = await fetch(`${BASE}/recordings/upload`, {
    method: 'POST', headers,
    body: JSON.stringify({ callId: 'ROOM-DOES-NOT-EXIST', base64Data: 'aGVsbG8=', fileName: 'x.mp4' }),
  });
  const badJson = await badRes.json().catch(() => ({}));
  check('unknown callId -> clean 404 CALL_NOT_FOUND', badRes.status === 404 && badJson?.error?.code === 'CALL_NOT_FOUND',
    `status=${badRes.status} code=${badJson?.error?.code}`);

  // ---- 1. Pick a real call ----
  const callsRes = await fetch(`${BASE}/calls`, { headers });
  const callsJson = await callsRes.json();
  const call = Array.isArray(callsJson.data) ? callsJson.data[0] : null;
  if (!call) { console.log('  SKIP no calls exist to attach recording to'); process.exit(1); }
  const CALL_ID = call.callId;
  console.log(`  using existing call ${CALL_ID} (room ${call.roomId})`);

  // ---- 2. Upload (base64 JSON body, exactly what the kiosk sends) ----
  const fakeMp4 = Buffer.alloc(256 * 1024, 7);
  const upRes = await fetch(`${BASE}/recordings/upload`, {
    method: 'POST', headers,
    body: JSON.stringify({
      callId: CALL_ID,
      base64Data: fakeMp4.toString('base64'),
      fileName: `rec-${CALL_ID}.mp4`,
      mimeType: 'video/mp4',
    }),
  });
  const upJson = await upRes.json().catch(() => ({}));
  check('upload accepted', upRes.status === 200 && upJson.success === true, `status=${upRes.status}`);
  const recId = upJson?.data?.recordingId;
  check('ACK carries recordingId', typeof recId === 'string' && recId.length > 0, recId);
  check('status=completed', upJson?.data?.status === 'completed', upJson?.data?.status);

  // ---- 3. Call metadata reflects the recording ----
  const callRes = await fetch(`${BASE}/calls/${CALL_ID}`, { headers });
  const callJson = await callRes.json().catch(() => ({}));
  check('call.recordingStatus=completed', callJson?.data?.recordingStatus === 'completed', callJson?.data?.recordingStatus);
  check('call.recordingId linked', callJson?.data?.recordingId === recId, callJson?.data?.recordingId);

  // Local-only: file lands on disk (Render FS is ephemeral but writable).
  if (!BASE.includes('onrender.com')) {
    const recFile = path.join(__dirname, 'recordings', upJson?.data?.fileName || '');
    if (upJson?.data?.fileName && fs.existsSync(recFile)) {
      check('stored bytes match upload', fs.statSync(recFile).size === fakeMp4.length);
      fs.unlinkSync(recFile);
    } else {
      check('file stored on disk', false, recFile);
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
