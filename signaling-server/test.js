require('dotenv').config();
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');

const URL = `http://127.0.0.1:${process.env.PORT || 3002}`;
const SECRET = process.env.JWT_SECRET;
const KEY = process.env.MEDIA_API_KEY;

const tokenFor = (sub, role, extra = {}) => jwt.sign({ sub, role, ...extra }, SECRET, { expiresIn: '1h' });

function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); console.log('ok -', msg); }

function connect(peerId, role = 'kiosk', extra = {}) {
  const s = createClient(URL, { auth: { token: tokenFor(peerId, role, extra) }, transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error('connect_error: ' + e.message)));
  });
}

function call(socket, event, data) {
  return new Promise((resolve) => socket.emit(event, data, (r) => resolve(r)));
}

(async () => {
  // auth rejection
  const bad = createClient(URL, { auth: { token: 'garbage' }, transports: ['websocket'] });
  await new Promise((resolve) => { bad.on('connect_error', (e) => { assert(/INVALID_TOKEN/.test(e.message), 'invalid token rejected'); resolve(); }); });
  const noAuth = createClient(URL, { transports: ['websocket'] });
  await new Promise((resolve) => { noAuth.on('connect_error', (e) => { assert(/AUTH_REQUIRED/.test(e.message), 'missing token rejected'); resolve(); }); });

  const a = await connect('INM-A', 'kiosk');
  // Family tokens are issued by the backend with a roomId claim binding them to one call room.
  const b = await connect('CONT-B', 'family', { roomId: 'ROOM-CALL-1' });

  const ja = await call(a, 'join-room', { roomId: 'ROOM-CALL-1', peerId: 'INM-A' });
  assert(ja.success && ja.routerRtpCapabilities, 'join-room returns routerRtpCapabilities');
  const jb = await call(b, 'join-room', { roomId: 'ROOM-CALL-1', peerId: 'CONT-B' });
  assert(jb.success, 'second peer joins');

  const third = await connect('INTRUDER', 'kiosk');
  const j3 = await call(third, 'join-room', { roomId: 'ROOM-CALL-1', peerId: 'INTRUDER' });
  assert(!j3.success && /full/i.test(j3.error), 'room full rejected');

  const ta = await call(a, 'createWebRtcTransport', { direction: 'send' });
  assert(ta.success && ta.data.id && ta.data.iceParameters, 'create send transport via media-server');
  const tb = await call(b, 'createWebRtcTransport', { direction: 'recv' });
  assert(tb.success && tb.data.id, 'create recv transport');

  const control = await fetch(URL + '/api/rooms/ROOM-CALL-1/recording', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY }, body: JSON.stringify({ action: 'start', recordingId: 'REC-1' }) }).then((r) => r.json());
  assert(control.success || control.error?.code === 'FFMPEG_UNAVAILABLE', 'recording control API reachable');

  const closeResp = await fetch(URL + '/api/rooms/ROOM-CALL-1/close', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY }, body: JSON.stringify({ reason: 'test' }) }).then((r) => r.json());
  assert(closeResp.success, 'close room via control API');

  await call(a, 'leave-room');
  b.disconnect(); a.disconnect(); third.disconnect();
  console.log('ALL SIGNALING TESTS PASS');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });