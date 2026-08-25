require('dotenv').config();
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');

const URL = process.env.PROBE_URL || 'https://prisonconnect-signaling.onrender.com';
const SECRET = process.env.JWT_SECRET;
const tokenFor = (sub, role, extra = {}) => jwt.sign({ sub, role, ...extra }, SECRET, { expiresIn: '1h' });

function connect(peerId, role = 'kiosk', extra = {}) {
  const s = createClient(URL, { auth: { token: tokenFor(peerId, role, extra) }, transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error('connect_error: ' + e.message)));
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
}

(async () => {
  console.log('Probing', URL);
  const a = await connect('PROBE-KIOSK-9', 'kiosk');
  const b = await connect('PROBE-FAM-9', 'family', { roomId: 'ROOM-PROBE-END' });
  await new Promise((r) => a.emit('join-room', { roomId: 'ROOM-PROBE-END', peerId: 'PROBE-KIOSK-9' }, r));
  await new Promise((r) => b.emit('join-room', { roomId: 'ROOM-PROBE-END', peerId: 'PROBE-FAM-9' }, r));

  const received = new Promise((resolve) => b.on('call-ended', (d) => resolve(d)));
  const acked = await new Promise((resolve) => {
    let done = false;
    a.emit('call-ended', { reason: 'probe' }, (resp) => { done = true; resolve({ acked: true, resp }); });
    setTimeout(() => { if (!done) resolve({ acked: false }); }, 5000);
  });
  const got = await Promise.race([received, new Promise((r) => setTimeout(() => r(null), 5000))]);

  console.log('ACK:', JSON.stringify(acked));
  console.log('RELAYED:', JSON.stringify(got));
  console.log(acked.acked && got ? 'RESULT: call-ended relay IS LIVE' : 'RESULT: call-ended relay NOT DEPLOYED');

  a.disconnect(); b.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
