const { io } = require('socket.io-client');

const BASE = 'http://127.0.0.1:59354';
const SIG = 'http://127.0.0.1:3002';
const INMATE_TOKEN = process.argv[2];

async function main() {
  if (!INMATE_TOKEN) { console.error('usage: node repro-join.js <inmateToken>'); process.exit(1); }
  // 1. create a fresh call
  const body = { inmateId: '100101', contactId: 'CONT-001', kioskId: 'KIOSK-001', type: 'video' };
  const res = await fetch(`${BASE}/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INMATE_TOKEN}`, 'X-Device-Fingerprint': 'jit', 'X-Device-IP': '10.219.127.69' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  console.log('createCall ->', res.status, j.success ? 'OK' : JSON.stringify(j.error));
  if (!j.success) process.exit(1);
  const d = j.data;
  console.log('callId:', d.callId, 'roomId:', d.roomId, 'linkToken:', d.linkToken);

  // 2. connect socket with the room-bound signaling token
  const socket = io(SIG, { auth: { token: d.signalingToken }, transports: ['websocket'], timeout: 8000 });
  socket.on('connect_error', (err) => { console.error('connect_error:', err.message); process.exit(1); });
  socket.on('connect', () => {
    console.log('socket connected id=', socket.id);
    socket.emitWithAck('join-room', { roomId: d.roomId, peerId: 'kiosk-repro' }).then(
      (ack) => {
        console.log('join-room ACK:', JSON.stringify(ack));
        if (ack && ack.success) {
          console.log('routerRtpCapabilities length:', (ack.routerRtpCapabilities || '').length);
          socket.emitWithAck('createWebRtcTransport', { roomId: d.roomId, peerId: 'kiosk-repro', direction: 'send' }).then(
            (tack) => console.log('createWebRtcTransport ACK:', JSON.stringify(tack).slice(0, 120)),
            (e) => console.error('transport ack error:', e.message),
          );
        }
        socket.disconnect();
        process.exit(0);
      },
      (e) => { console.error('join ack error:', e.message); socket.disconnect(); process.exit(1); },
    );
  });
}

main().catch((e) => { console.error(e); process.exit(1); });