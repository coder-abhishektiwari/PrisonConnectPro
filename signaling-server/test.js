require('dotenv').config();
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');

// Start server in-process
require('./server');

const URL = `http://127.0.0.1:${process.env.PORT || 3002}`;
const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

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
  // Give server a moment to bind
  await new Promise((r) => setTimeout(r, 500));

  // auth rejection
  const bad = createClient(URL, { auth: { token: 'garbage' }, transports: ['websocket'] });
  await new Promise((resolve) => { bad.on('connect_error', (e) => { assert(/INVALID_TOKEN/.test(e.message), 'invalid token rejected'); resolve(); }); });
  const noAuth = createClient(URL, { transports: ['websocket'] });
  await new Promise((resolve) => { noAuth.on('connect_error', (e) => { assert(/AUTH_REQUIRED/.test(e.message), 'missing token rejected'); resolve(); }); });

  const a = await connect('INM-A', 'kiosk');
  const b = await connect('CONT-B', 'family', { roomId: 'ROOM-CALL-1' });

  const ja = await call(a, 'join-room', { roomId: 'ROOM-CALL-1', peerId: 'INM-A' });
  assert(ja.success && Array.isArray(ja.iceServers), 'join-room returns success and iceServers');

  const jbPromise = call(b, 'join-room', { roomId: 'ROOM-CALL-1', peerId: 'CONT-B' });
  const peerJoinedPromise = new Promise((resolve) => a.on('peer-joined', (data) => resolve(data)));
  const jb = await jbPromise;
  const peerJoined = await peerJoinedPromise;

  assert(jb.success, 'second peer joins');
  assert(peerJoined.peerId === 'CONT-B', 'peer-joined event received by peer A');

  // SDP Offer / Answer Exchange
  const answerReceivedPromise = new Promise((resolve) => a.on('answer', (data) => resolve(data)));
  const offerReceivedPromise = new Promise((resolve) => b.on('offer', (data) => resolve(data)));

  await call(a, 'offer', { sdp: 'fake-sdp-offer', target: 'CONT-B' });
  const offer = await offerReceivedPromise;
  assert(offer.sdp === 'fake-sdp-offer' && offer.sender === 'INM-A', 'offer delivered to peer B');

  await call(b, 'answer', { sdp: 'fake-sdp-answer', target: 'INM-A' });
  const answer = await answerReceivedPromise;
  assert(answer.sdp === 'fake-sdp-answer' && answer.sender === 'CONT-B', 'answer delivered to peer A');

  // ICE Candidate Exchange
  const iceCandidatePromise = new Promise((resolve) => b.on('ice-candidate', (data) => resolve(data)));
  await call(a, 'ice-candidate', { candidate: { candidate: 'candidate:1 1 UDP 12345 127.0.0.1 5000 typ host' }, target: 'CONT-B' });
  const candidate = await iceCandidatePromise;
  assert(candidate.candidate.candidate.includes('127.0.0.1'), 'ice candidate delivered to peer B');

  const third = await connect('INTRUDER', 'kiosk');
  const j3 = await call(third, 'join-room', { roomId: 'ROOM-CALL-1', peerId: 'INTRUDER' });
  assert(!j3.success && /full/i.test(j3.error), 'room full rejected');

  await call(a, 'leave-room');
  b.disconnect(); a.disconnect(); third.disconnect();
  console.log('ALL SIGNALING TESTS PASS');
  process.exit(0);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });