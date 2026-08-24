require('dotenv').config();
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');

// Probe the DEPLOYED signaling server to see how it relays ice-candidate.
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

function call(socket, event, data) {
  return new Promise((resolve) => socket.emit(event, data, (r) => resolve(r)));
}

(async () => {
  console.log('Probing', URL);
  const a = await connect('PROBE-KIOSK-1', 'kiosk');
  const b = await connect('PROBE-FAM-1', 'family', { roomId: 'ROOM-PROBE-ICE' });

  await call(a, 'join-room', { roomId: 'ROOM-PROBE-ICE', peerId: 'PROBE-KIOSK-1' });
  await call(b, 'join-room', { roomId: 'ROOM-PROBE-ICE', peerId: 'PROBE-FAM-1' });
  console.log('Both peers joined.');

  const received = new Promise((resolve) => b.on('ice-candidate', (data) => resolve(data)));

  // Kiosk sends the FLAT shape it uses in production
  await call(a, 'ice-candidate', {
    candidate: 'candidate:842163049 1 udp 1677729535 192.168.1.5 55555 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
  });

  const relayed = await received;
  console.log('RELAYED PAYLOAD:', JSON.stringify(relayed, null, 2));

  if (relayed.candidate && typeof relayed.candidate === 'object' && relayed.candidate.sdpMid === '0') {
    console.log('RESULT: NEW CODE LIVE (normalized object)');
  } else if (typeof relayed.candidate === 'string') {
    console.log('RESULT: OLD CODE STILL LIVE (flattened string, mid/line LOST)');
  } else {
    console.log('RESULT: UNEXPECTED SHAPE');
  }

  a.disconnect(); b.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
