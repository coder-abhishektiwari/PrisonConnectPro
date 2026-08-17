require('dotenv').config();

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const PORT = parseInt(process.env.PORT || '3002', 10);
const JWT_SECRET = process.env.JWT_SECRET;
const MEDIA_SERVER_URL = process.env.MEDIA_SERVER_URL || 'http://127.0.0.1:3003';
const MEDIA_API_KEY = process.env.MEDIA_API_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');
if (!MEDIA_API_KEY) throw new Error('MEDIA_API_KEY env var is required');

const H = { 'Content-Type': 'application/json', 'X-API-Key': MEDIA_API_KEY, Connection: 'close' };

async function media(method, path, body) {
  const res = await fetch(MEDIA_SERVER_URL + path, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || `media ${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.code = json.error?.code || 'MEDIA_ERROR';
    throw err;
  }
  return json;
}

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

// roomId -> Map(peerId -> socket)
const rooms = new Map();

function roomPeers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    socket.data.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('INVALID_TOKEN'));
  }
});

function isStaff(auth) {
  return ['warden', 'admin', 'super-admin', 'super_admin'].includes(auth?.role);
}

function isFamily(auth) {
  return auth?.role === 'family';
}

function isKiosk(auth) {
  return auth?.role === 'kiosk';
}

io.on('connection', (socket) => {
  const auth = socket.data.auth;
  console.log(`[signaling] connected ${socket.id} (peer=${auth.sub} role=${auth.role} room=${auth.roomId || '-'})`);
  let currentRoomId = null;
  let currentPeerId = null;
  // Mediasoup transport ids for this socket, populated by createWebRtcTransport.
  // Clients (family-web, android-kiosk) do not send transportId on transport
  // events, so we resolve it from the socket state instead of failing.
  let sendTransportId = null;
  let recvTransportId = null;

  socket.on('join-room', async (data = {}, callback) => {
    const { roomId, peerId } = data;
    console.log(`[join-room] sid=${socket.id} roomId=${roomId} peerId=${peerId} authRole=${auth.role} authRoom=${auth.roomId || '-'}`);
    if (!roomId || !peerId) { console.log('[join-room] REJECT missing roomId/peerId'); return callback?.({ success: false, error: 'roomId and peerId required' }); }
    // A family or kiosk token is bound to one specific room — it must not be
    // reused elsewhere.
    if ((isFamily(auth) || isKiosk(auth)) && auth.roomId !== roomId) {
      console.log(`[join-room] REJECT FORBIDDEN (authRoom=${auth.roomId || '-'} != ${roomId})`);
      return callback?.({ success: false, error: 'FORBIDDEN' });
    }
    // Only the room's owner (kiosk/family identity) or staff may enter under this peerId.
    if (!isStaff(auth) && !isFamily(auth) && !isKiosk(auth) && peerId !== auth.sub) {
      console.log('[join-room] REJECT peerId FORBIDDEN');
      return callback?.({ success: false, error: 'FORBIDDEN' });
    }

    const peers = roomPeers(roomId);
    const already = [...peers.values()].filter((s) => s.id !== socket.id).length;
    const roomMax = parseInt(process.env.ROOM_MAX_PARTICIPANTS || '2', 10);
    if (already >= roomMax) { console.log(`[join-room] REJECT full already=${already}`); return callback?.({ success: false, error: 'Room is full' }); }

    try {
      await media('POST', '/rooms', { roomId });
      const info = await media('GET', `/rooms/${roomId}`);
      if (!peers.has(peerId)) peers.set(peerId, socket);
      socket.join(roomId);
      currentRoomId = roomId;
      currentPeerId = peerId;
      socket.to(roomId).emit('peer-joined', { peerId });
      console.log(`[join-room] OK roomId=${roomId} peerId=${peerId} rtpCapsCodecs=${info.data.rtpCapabilities && info.data.rtpCapabilities.codecs ? info.data.rtpCapabilities.codecs.length : '?'}`);
      return callback?.({ success: true, routerRtpCapabilities: info.data.rtpCapabilities });
    } catch (err) {
      console.error(`[signaling] join-room media error (${err.message})`);
      return callback?.({ success: false, error: 'MEDIA_UNAVAILABLE' });
    }
  });

  socket.on('leave-room', async (_data, callback) => {
    await doLeave();
    callback?.({ success: true });
  });

  async function doLeave() {
    const roomId = currentRoomId;
    const peerId = currentPeerId;
    if (!roomId || !peerId) return;
    rooms.get(roomId)?.delete(peerId);
    socket.to(roomId).emit('peer-left', { peerId });
    socket.leave(roomId);
    currentRoomId = null;
    currentPeerId = null;
    if ((rooms.get(roomId)?.size || 0) === 0) {
      rooms.delete(roomId);
      try { await media('DELETE', `/rooms/${roomId}`); } catch (_) {}
    }
  }

  const requireRoom = () => (currentRoomId && currentPeerId ? null : 'Not in a room');

  socket.on('createWebRtcTransport', async (data = {}, callback) => {
    const err = requireRoom();
    if (err) return callback?.({ success: false, error: err });
    try {
      const direction = data.direction || 'send';
      const r = await media('POST', `/rooms/${currentRoomId}/transports`, { peerId: currentPeerId, direction });
      if (direction === 'recv') recvTransportId = r.data.id;
      else sendTransportId = r.data.id;
      return callback?.({ success: true, data: r.data });
    } catch (e) {
      return callback?.({ success: false, error: 'Failed to create transport' });
    }
  });

  socket.on('connectWebRtcTransport', async (data = {}, callback) => {
    try {
      const tid = data.transportId || (data.direction === 'recv' ? recvTransportId : sendTransportId);
      if (!tid) return callback?.({ success: false, error: 'No transport for this socket' });
      await media('POST', `/transports/${tid}/connect`, { dtlsParameters: data.dtlsParameters });
      return callback?.({ success: true });
    } catch (e) {
      return callback?.({ success: false, error: 'Failed to connect transport' });
    }
  });

  socket.on('produce', async (data = {}, callback) => {
    try {
      const tid = data.transportId || sendTransportId;
      if (!tid) return callback?.({ success: false, error: 'No send transport for this socket' });
      const r = await media('POST', `/transports/${tid}/produce`, { kind: data.kind, rtpParameters: data.rtpParameters, appData: data.appData });
      socket.to(currentRoomId).emit('new-producer', { peerId: currentPeerId, producerId: r.id, kind: r.kind });
      return callback?.({ success: true, id: r.id, kind: r.kind });
    } catch (e) {
      return callback?.({ success: false, error: 'Failed to produce' });
    }
  });

  socket.on('consume', async (data = {}, callback) => {
    const err = requireRoom();
    if (err) return callback?.({ success: false, error: err });
    try {
      const r = await media('POST', `/rooms/${currentRoomId}/consume`, { peerId: currentPeerId, producerId: data.producerId, rtpCapabilities: data.rtpCapabilities });
      return callback?.({ success: true, id: r.id, producerId: r.producerId, kind: r.kind, rtpParameters: r.rtpParameters });
    } catch (e) {
      return callback?.({ success: false, error: 'Failed to consume' });
    }
  });

  socket.on('resumeConsumer', async (data = {}, callback) => {
    try { await media('POST', `/consumers/${data.consumerId}/resume`); callback?.({ success: true }); }
    catch (e) { callback?.({ success: false, error: 'Failed to resume consumer' }); }
  });
  socket.on('pauseConsumer', async (data = {}, callback) => {
    try { await media('POST', `/consumers/${data.consumerId}/pause`); callback?.({ success: true }); }
    catch (e) { callback?.({ success: false, error: 'Failed to pause consumer' }); }
  });
  socket.on('closeProducer', async (data = {}, callback) => {
    try { await media('POST', `/transports/${data.transportId || 'x'}/close`); } catch (_) {}
    socket.to(currentRoomId).emit('producer-closed', { peerId: currentPeerId, producerId: data.producerId });
    callback?.({ success: true });
  });
  socket.on('closeConsumer', async (data = {}, callback) => {
    try { await media('POST', `/consumers/${data.consumerId}/close`); } catch (_) {}
    callback?.({ success: true });
  });
  socket.on('trickle-ice', async (data = {}, callback) => {
    try {
      const tid = data.transportId || sendTransportId || recvTransportId;
      if (tid) await media('POST', `/transports/${tid}/trickle`, { candidate: data.candidate });
      return callback?.({ success: true });
    } catch (_) {
      return callback?.({ success: true });
    }
  });

  socket.on('disconnect', async () => {
    console.log(`[signaling] disconnected ${socket.id}`);
    await doLeave();
  });
});

// ---- HTTP control API (called by the backend) ----
function serviceAuth(req, res, next) {
  if (req.path === '/health') return next();
  if (req.get('x-api-key') !== MEDIA_API_KEY) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'invalid api key' } });
  }
  next();
}
app.use('/api', serviceAuth);

app.post('/api/rooms/:roomId/control', async (req, res) => {
  const { action, target } = req.body || {};
  const roomId = req.params.roomId;
  try {
    await media('POST', `/rooms/${roomId}/control`, { action, targetPeerId: target || null });
    io.to(roomId).emit('call-control', { action, target });
    if (action === 'terminate') {
      io.to(roomId).emit('call-ended', { roomId, reason: 'terminated by staff' });
      try { await media('DELETE', `/rooms/${roomId}`); } catch (_) {}
      rooms.delete(roomId);
    }
    return res.json({ success: true, data: { action, target } });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: { code: err.code || 'INTERNAL_ERROR', message: err.message } });
  }
});

app.post('/api/rooms/:roomId/recording', async (req, res) => {
  const { action, recordingId } = req.body || {};
  const roomId = req.params.roomId;
  if (!recordingId) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'recordingId is required' } });
  try {
    if (action === 'start') {
      const r = await media('POST', `/rooms/${roomId}/record`, { recordingId });
      io.to(roomId).emit('recording-started', { recordingId });
      return res.json({ success: true, data: r.data || { status: 'recording' } });
    }
    if (action === 'stop') {
      const r = await media('POST', `/rooms/${roomId}/record/stop`, { recordingId });
      io.to(roomId).emit('recording-finished', { recordingId, ...(r.data || {}) });
      return res.json({ success: true, data: r.data });
    }
    return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'action must be start or stop' } });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: { code: err.code || 'INTERNAL_ERROR', message: err.message } });
  }
});

app.post('/api/rooms/:roomId/close', async (req, res) => {
  const roomId = req.params.roomId;
  const { reason } = req.body || {};
  io.to(roomId).emit('call-ended', { roomId, reason });
  try { await media('DELETE', `/rooms/${roomId}`); } catch (_) {}
  rooms.delete(roomId);
  return res.json({ success: true });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const peers = [...(rooms.get(req.params.roomId)?.keys() || [])];
  return res.json({ success: true, data: { roomId: req.params.roomId, participants: peers } });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

server.listen(PORT, () => {
  console.log(`[signaling] listening on ${PORT}`);
  console.log(`[signaling] media-server: ${MEDIA_SERVER_URL}`);
});