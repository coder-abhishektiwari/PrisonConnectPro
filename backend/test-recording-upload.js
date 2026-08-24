/**
 * Backend E2E check: kiosk recording-upload contract + active-call tracking.
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
  const wardenToken = jwt.sign(
    { sub: 'warden-test', role: 'warden', exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET
  );

  // ---- 1. Recording upload (base64 JSON body, exactly what the kiosk sends) ----
  const CALL_ID = 'ROOM-RECTEST-' + Date.now();
  const fakeMp4 = Buffer.alloc(512 * 1024, 7); // 512KB pseudo-MP4
  const upRes = await fetch(`${BASE}/recordings/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${wardenToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      callId: CALL_ID,
      inmateId: '100101',
      contactId: null,
      base64Data: fakeMp4.toString('base64'),
      fileName: `rec-${CALL_ID}.mp4`,
      mimeType: 'video/mp4',
    }),
  });
  const upJson = await upRes.json();
  check('upload accepted', upRes.status === 200 && upJson.success === true, `status=${upRes.status}`);
  const recId = upJson?.data?.recordingId;
  check('ACK carries recordingId', typeof recId === 'string' && recId.length > 0, recId);
  check('status=completed', upJson?.data?.status === 'completed', upJson?.data?.status);

  const recDir = path.join(__dirname, 'recordings');
  const recFile = path.join(recDir, upJson?.data?.fileName || '');
  check('ACK carries fileName', !!upJson?.data?.fileName, upJson?.data?.fileName);
  if (upJson?.data?.fileName && fs.existsSync(recFile)) {
    const sizeOk = fs.statSync(recFile).size === fakeMp4.length;
    check('stored bytes match upload', sizeOk);
    fs.unlinkSync(recFile); // cleanup test artifact
  }

  // ---- 2. Recordings listing reflects the new recording ----
  const listRes = await fetch(`${BASE}/recordings`, { headers: { Authorization: `Bearer ${wardenToken}` } });
  const listJson = await listRes.json();
  const found = Array.isArray(listJson.data) && listJson.data.some((r) => r.recordingId === recId.replace(/^REC-/, '') || r.recordingId === recId);
  check('recording listed in /recordings', found, JSON.stringify(listJson.data?.length));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
