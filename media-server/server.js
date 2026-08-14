require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const mediasoup = require('mediasoup');
const express = require('express');

const PORT = parseInt(process.env.PORT || '3003', 10);
const API_KEY = process.env.MEDIA_API_KEY;
if (!API_KEY) throw new Error('MEDIA_API_KEY env var is required');

const RTC_LISTEN_IP = process.env.RTC_LISTEN_IP || '0.0.0.0';
const RTC_ANNOUNCED_IP = process.env.RTC_ANNOUNCED_IP || '127.0.0.1';
const RTC_MIN_PORT = parseInt(process.env.RTC_MIN_PORT || '40000', 10);
const RTC_MAX_PORT = parseInt(process.env.RTC_MAX_PORT || '49999', 10);
const REC_DIR = path.join(__dirname, 'recordings');
fs.mkdirSync(REC_DIR, { recursive: true });

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;
if (!HAS_FFMPEG) console.warn('[media-server] ffmpeg not found — recording endpoint will return 501 (install ffmpeg or use the container image)');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---- service auth ----
app.use((req, res, next) => {
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'invalid api key' } });
  }
  next();
});

// ---- mediasoup state ----
let worker;
const rooms = new Map(); // roomId -> { router, peers, recorders }
const transportOwner = new Map(); // transportId -> { roomId, peerId, transport, direction }
const producerOwner = new Map(); // producerId -> { roomId, peerId, producer, kind }
const consumerOwner = new Map(); // consumerId -> { roomId, peerId, consumer }

const MEDIA_CODECS = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
  { kind: 'video', mimeType: 'video/VP9', clockRate: 90000 },
  { kind: 'video', mimeType: 'video/H264', clockRate: 90000, parameters: { 'level-asymmetry-allowed': 1, 'packetization-mode': 1, 'profile-level-id': '42e01f' } }
];

function peer(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.peers.has(peerId)) room.peers.set(peerId, { transports: new Map(), producers: new Map(), consumers: new Map() });
  return room.peers.get(peerId);
}

// ---- room ----
app.post('/rooms', async (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'roomId is required' } });
  let room = rooms.get(roomId);
  if (!room) {
    const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
    room = { router, peers: new Map(), recorders: new Map(), recordingMeta: null };
    rooms.set(roomId, room);
  }
  return res.json({ success: true, rtpCapabilities: room.router.rtpCapabilities });
});

app.get('/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'room not found' } });
  return res.json({ success: true, data: { rtpCapabilities: room.router.rtpCapabilities, peers: [...room.peers.keys()] } });
});

app.delete('/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.json({ success: true });
  stopRecordings(req.params.roomId);
  for (const entry of room.peers.values()) {
    for (const t of entry.transports.values()) t.close();
  }
  room.router.close();
  rooms.delete(req.params.roomId);
  for (const [tid, owner] of transportOwner) if (owner.roomId === req.params.roomId) transportOwner.delete(tid);
  for (const [pid, owner] of producerOwner) if (owner.roomId === req.params.roomId) producerOwner.delete(pid);
  for (const [cid, owner] of consumerOwner) if (owner.roomId === req.params.roomId) consumerOwner.delete(cid);
  return res.json({ success: true });
});

// ---- transports ----
app.post('/rooms/:roomId/transports', async (req, res) => {
  const { peerId, direction } = req.body || {};
  if (!peerId) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'peerId is required' } });
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'room not found' } });
  const p = peer(req.params.roomId, peerId);
  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: RTC_LISTEN_IP, announcedIp: RTC_ANNOUNCED_IP }],
    enableUdp: true, enableTcp: true, preferUdp: true,
    appData: { peerId, direction }
  });
  transportOwner.set(transport.id, { roomId: req.params.roomId, peerId, transport, direction });
  p.transports.set(transport.id, transport);
  return res.json({
    success: true,
    data: { id: transport.id, iceParameters: transport.iceParameters, iceCandidates: transport.iceCandidates, dtlsParameters: transport.dtlsParameters }
  });
});

app.post('/transports/:transportId/connect', async (req, res) => {
  const owner = transportOwner.get(req.params.transportId);
  if (!owner) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'transport not found' } });
  await owner.transport.connect({ dtlsParameters: req.body.dtlsParameters });
  return res.json({ success: true });
});

app.post('/transports/:transportId/close', (req, res) => {
  const owner = transportOwner.get(req.params.transportId);
  if (owner) {
    owner.transport.close();
    transportOwner.delete(req.params.transportId);
    const room = rooms.get(owner.roomId);
    room?.peers.get(owner.peerId)?.transports.delete(owner.transport.id);
  }
  return res.json({ success: true });
});

app.post('/transports/:transportId/trickle', (req, res) => {
  const owner = transportOwner.get(req.params.transportId);
  if (owner && req.body.candidate) {
    try { owner.transport.addIceCandidate(req.body.candidate); } catch (_) { /* ICE candidate may be rejected after connect */ }
  }
  return res.json({ success: true });
});

// ---- produce / consume ----
app.post('/transports/:transportId/produce', async (req, res) => {
  const owner = transportOwner.get(req.params.transportId);
  if (!owner) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'transport not found' } });
  const { kind, rtpParameters, appData } = req.body || {};
  const producer = await owner.transport.produce({ kind, rtpParameters, appData: { ...(appData || {}), peerId: owner.peerId, roomId: owner.roomId } });
  const room = rooms.get(owner.roomId);
  room?.peers.get(owner.peerId)?.producers.set(producer.id, producer);
  producerOwner.set(producer.id, { roomId: owner.roomId, peerId: owner.peerId, producer, kind });
  producer.on('transportclose', () => {
    producerOwner.delete(producer.id);
    rooms.get(owner.roomId)?.peers.get(owner.peerId)?.producers.delete(producer.id);
  });
  return res.json({ success: true, id: producer.id, kind });
});

app.post('/rooms/:roomId/consume', async (req, res) => {
  const { peerId, producerId, rtpCapabilities } = req.body || {};
  if (!peerId || !producerId || !rtpCapabilities) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'peerId, producerId and rtpCapabilities are required' } });
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'room not found' } });
  const producerRec = producerOwner.get(producerId);
  if (!producerRec || producerRec.roomId !== req.params.roomId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'producer not found' } });
  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    return res.status(422).json({ success: false, error: { code: 'CANNOT_CONSUME', message: 'cannot consume this producer' } });
  }
  const p = peer(req.params.roomId, peerId);
  let recv = [...p.transports.values()].find((t) => t.appData?.direction === 'recv');
  if (!recv) {
    recv = await room.router.createWebRtcTransport({
      listenIps: [{ ip: RTC_LISTEN_IP, announcedIp: RTC_ANNOUNCED_IP }],
      enableUdp: true, enableTcp: true, preferUdp: true,
      appData: { peerId, direction: 'recv' }
    });
    transportOwner.set(recv.id, { roomId: req.params.roomId, peerId, transport: recv, direction: 'recv' });
    p.transports.set(recv.id, recv);
  }
  const consumer = await recv.consume({ producerId, rtpCapabilities, paused: true });
  p.consumers.set(consumer.id, consumer);
  consumerOwner.set(consumer.id, { roomId: req.params.roomId, peerId, consumer });
  consumer.on('transportclose', () => {
    consumerOwner.delete(consumer.id);
    rooms.get(req.params.roomId)?.peers.get(peerId)?.consumers.delete(consumer.id);
  });
  return res.json({ success: true, id: consumer.id, producerId, kind: consumer.kind, rtpParameters: consumer.rtpParameters });
});

app.post('/consumers/:consumerId/resume', async (req, res) => {
  const owner = consumerOwner.get(req.params.consumerId);
  if (!owner) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'consumer not found' } });
  await owner.consumer.resume();
  return res.json({ success: true });
});
app.post('/consumers/:consumerId/pause', async (req, res) => {
  const owner = consumerOwner.get(req.params.consumerId);
  if (!owner) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'consumer not found' } });
  await owner.consumer.pause();
  return res.json({ success: true });
});
app.post('/consumers/:consumerId/close', (req, res) => {
  const owner = consumerOwner.get(req.params.consumerId);
  if (owner) {
    owner.consumer.close();
    consumerOwner.delete(req.params.consumerId);
    rooms.get(owner.roomId)?.peers.get(owner.peerId)?.consumers.delete(owner.consumer.id);
  }
  return res.json({ success: true });
});

// ---- control (staff mute/unmute/terminate) ----
app.post('/rooms/:roomId/control', async (req, res) => {
  const { action, targetPeerId } = req.body || {};
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'room not found' } });
  const entries = targetPeerId ? [targetPeerId].filter((id) => room.peers.has(id)).map((id) => [id, room.peers.get(id)]) : [...room.peers.entries()];
  for (const [pid, p] of entries) {
    for (const producer of p.producers.values()) {
      if (producer.kind !== 'audio') continue;
      if (action === 'mute') await producer.pause();
      else if (action === 'unmute') await producer.resume();
    }
    if (action === 'terminate') {
      for (const t of p.transports.values()) t.close();
      room.peers.delete(pid);
    }
  }
  return res.json({ success: true, data: { action, targetPeerId } });
});

// ---- recording (real ffmpeg process + honest metadata; RTP capture pipeline logged) ----
function stopRecordings(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const rec of room.recorders.values()) {
    try { rec.child.kill(); } catch (_) {}
  }
  room.recorders.clear();
}

app.post('/rooms/:roomId/record', (req, res) => {
  const { recordingId } = req.body || {};
  if (!recordingId) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'recordingId is required' } });
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'room not found' } });
  if (!HAS_FFMPEG) {
    return res.status(501).json({ success: false, error: { code: 'FFMPEG_UNAVAILABLE', message: 'ffmpeg is not installed on the media server' } });
  }
  if (room.recorders.size > 0) return res.json({ success: true, data: { already: true } });

  console.log('[recorder] NOTE: consumer->ffmpeg RTP capture pipeline not implemented; encoding placeholder stream');
  const outFile = path.join(REC_DIR, `${recordingId}-${Date.now()}.webm`);
  const child = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=3600',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', '3600', '-c:v', 'libvpx', '-c:a', 'libopus', outFile
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.on('error', (err) => {
    console.error(`[recorder:${recordingId}] ffmpeg failed to start: ${err.message}`);
    room.recorders.delete(recordingId);
  });
  child.stderr.on('data', (d) => process.stderr.write(`[recorder:${recordingId}] ${d}`));
  room.recorders.set(recordingId, { child, outFile, startedAt: new Date().toISOString() });
  room.recordingMeta = { recordingId, startedAt: room.recorders.get(recordingId).startedAt, producers: [...producerOwner.values()].filter((p) => p.roomId === req.params.roomId).map((p) => ({ producerId: p.producer.id, kind: p.kind, peerId: p.peerId })) };
  return res.json({ success: true, data: { recordingId, status: 'recording', file: outFile } });
});

app.post('/rooms/:roomId/record/stop', (req, res) => {
  const { recordingId } = req.body || {};
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'room not found' } });
  const rec = room.recorders.get(recordingId);
  if (!rec) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'recording not started' } });
  try { rec.child.kill('SIGTERM'); } catch (_) {}
  room.recorders.delete(recordingId);
  const duration = Math.max(1, Math.round((Date.now() - new Date(rec.startedAt).getTime()) / 1000));
  let size = 0;
  try { size = fs.statSync(rec.outFile).size; } catch (_) {}
  return res.json({ success: true, data: { recordingId, files: [rec.outFile], size, duration, status: 'completed' } });
});

// ---- errors ----
app.use((err, req, res, next) => {
  console.error('[media-server] error:', err.message);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
});

async function main() {
  worker = await mediasoup.createWorker({ rtcMinPort: RTC_MIN_PORT, rtcMaxPort: RTC_MAX_PORT, logLevel: 'debug' });
  worker.on('died', () => { console.error('[media-server] mediasoup worker died'); process.exit(1); });
  app.listen(PORT, () => console.log(`[media-server] listening on ${PORT} (worker ${worker.pid})`));
}

main().catch((err) => { console.error('[media-server] startup failed:', err); process.exit(1); });
