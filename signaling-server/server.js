require('dotenv').config();

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const PORT = parseInt(process.env.PORT || '3002', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

// roomId -> Map(peerId -> socket)
const rooms = new Map();

// Teardown timers for transient socket drop grace periods
const DISCONNECT_GRACE_MS = parseInt(process.env.DISCONNECT_GRACE_MS || '15000', 10);
const roomTeardownTimers = new Map(); // roomId -> Timeout

function hasLiveSocket(roomId) {
  const peers = rooms.get(roomId);
  if (!peers) return false;
  for (const s of peers.values()) {
    if (s && s.connected) return true;
  }
  return false;
}

function cancelRoomTeardown(roomId) {
  const t = roomTeardownTimers.get(roomId);
  if (t) {
    clearTimeout(t);
    roomTeardownTimers.delete(roomId);
  }
}

function teardownRoom(roomId, reason) {
  cancelRoomTeardown(roomId);
  rooms.delete(roomId);
  io.to(roomId).emit('call-ended', { roomId, reason });
}

function scheduleRoomTeardown(roomId, reason) {
  if (hasLiveSocket(roomId)) return;
  if (roomTeardownTimers.has(roomId)) return;
  const t = setTimeout(() => {
    roomTeardownTimers.delete(roomId);
    if (hasLiveSocket(roomId)) return;
    teardownRoom(roomId, reason);
  }, DISCONNECT_GRACE_MS);
  roomTeardownTimers.set(roomId, t);
}

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
function isFamily(auth) { return auth?.role === 'family'; }
function isKiosk(auth) { return auth?.role === 'kiosk'; }
function isInmate(auth) { return auth?.role === 'inmate'; }

io.on('connection', (socket) => {
  const auth = socket.data.auth;
  console.log(`[signaling] connected ${socket.id} (peer=${auth.sub} role=${auth.role} room=${auth.roomId || '-'})`);
  let currentRoomId = null;
  let currentPeerId = null;

  socket.on('join-room', async (data = {}, callback) => {
    const { roomId, peerId } = data;
    console.log(`[join-room] sid=${socket.id} roomId=${roomId} peerId=${peerId} authRole=${auth.role}`);

    if (!roomId || !peerId) {
      return callback?.({ success: false, error: 'roomId and peerId required' });
    }

    if ((isFamily(auth) || isKiosk(auth) || isInmate(auth)) && auth.roomId && auth.roomId !== roomId) {
      console.log(`[join-room] REJECT FORBIDDEN (authRoom=${auth.roomId} != ${roomId})`);
      return callback?.({ success: false, error: 'FORBIDDEN' });
    }

    if (!isStaff(auth) && !isFamily(auth) && !isKiosk(auth) && !isInmate(auth) && peerId !== auth.sub) {
      console.log('[join-room] REJECT peerId FORBIDDEN');
      return callback?.({ success: false, error: 'FORBIDDEN' });
    }

    const peers = roomPeers(roomId);
    const roomMax = parseInt(process.env.ROOM_MAX_PARTICIPANTS || '2', 10);
    const activePeers = [...peers.values()].filter((s) => s.id !== socket.id);

    if (activePeers.length >= roomMax) {
      console.log(`[join-room] REJECT full already=${activePeers.length}`);
      return callback?.({ success: false, error: 'Room is full' });
    }

    peers.set(peerId, socket);
    socket.join(roomId);
    currentRoomId = roomId;
    currentPeerId = peerId;

    cancelRoomTeardown(roomId);

    // Notify room of existing peers and notify other peer about this join
    const existingPeers = [...peers.keys()].filter((p) => p !== peerId);
    socket.to(roomId).emit('peer-joined', { peerId, role: auth.role });

    console.log(`[join-room] OK roomId=${roomId} peerId=${peerId} existingPeers=${existingPeers.length}`);
    return callback?.({
      success: true,
      existingPeers,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
  });

  // ---- Pure P2P WebRTC Signaling Events ----

  socket.on('offer', (data = {}, callback) => {
    const { sdp, target } = data;
    if (!currentRoomId || !currentPeerId) return callback?.({ success: false, error: 'Not in a room' });
    console.log(`[signaling] SDP OFFER from ${currentPeerId} in ${currentRoomId}`);
    if (target) {
      const targetSocket = rooms.get(currentRoomId)?.get(target);
      if (targetSocket) {
        targetSocket.emit('offer', { sdp, sender: currentPeerId, peerId: currentPeerId });
      }
    } else {
      socket.to(currentRoomId).emit('offer', { sdp, sender: currentPeerId, peerId: currentPeerId });
    }
    callback?.({ success: true });
  });

  socket.on('answer', (data = {}, callback) => {
    const { sdp, target } = data;
    if (!currentRoomId || !currentPeerId) return callback?.({ success: false, error: 'Not in a room' });
    console.log(`[signaling] SDP ANSWER from ${currentPeerId} in ${currentRoomId}`);
    if (target) {
      const targetSocket = rooms.get(currentRoomId)?.get(target);
      if (targetSocket) {
        targetSocket.emit('answer', { sdp, sender: currentPeerId, peerId: currentPeerId });
      }
    } else {
      socket.to(currentRoomId).emit('answer', { sdp, sender: currentPeerId, peerId: currentPeerId });
    }
    callback?.({ success: true });
  });

  socket.on('ice-candidate', (data = {}, callback) => {
    const { candidate, target } = data;
    if (!currentRoomId || !currentPeerId) return callback?.({ success: false, error: 'Not in a room' });
    if (target) {
      const targetSocket = rooms.get(currentRoomId)?.get(target);
      if (targetSocket) {
        targetSocket.emit('ice-candidate', { candidate, sender: currentPeerId, peerId: currentPeerId });
      }
    } else {
      socket.to(currentRoomId).emit('ice-candidate', { candidate, sender: currentPeerId, peerId: currentPeerId });
    }
    callback?.({ success: true });
  });

  // Backwards compatibility handler for trickle-ice
  socket.on('trickle-ice', (data = {}, callback) => {
    const { candidate, target } = data;
    if (currentRoomId && currentPeerId) {
      if (target) {
        rooms.get(currentRoomId)?.get(target)?.emit('ice-candidate', { candidate, sender: currentPeerId, peerId: currentPeerId });
      } else {
        socket.to(currentRoomId).emit('ice-candidate', { candidate, sender: currentPeerId, peerId: currentPeerId });
      }
    }
    callback?.({ success: true });
  });

  socket.on('leave-room', async (_data, callback) => {
    await doLeave({ immediate: true });
    callback?.({ success: true });
  });

  async function doLeave({ immediate = false } = {}) {
    const roomId = currentRoomId;
    const peerId = currentPeerId;
    if (!roomId || !peerId) return;
    rooms.get(roomId)?.delete(peerId);
    const remaining = rooms.get(roomId)?.size || 0;
    socket.to(roomId).emit('peer-left', { peerId });
    socket.leave(roomId);
    currentRoomId = null;
    currentPeerId = null;
    if (remaining === 0) {
      if (immediate) {
        teardownRoom(roomId, 'call ended');
      } else {
        scheduleRoomTeardown(roomId, 'peer disconnected');
      }
    }
  }

  socket.on('disconnect', async () => {
    console.log(`[signaling] disconnected ${socket.id}`);
    await doLeave();
  });
});

// ---- HTTP Control API ----
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/rooms/:roomId/control', (req, res) => {
  const { action, target } = req.body || {};
  const roomId = req.params.roomId;
  io.to(roomId).emit('call-control', { action, target });
  if (action === 'terminate') {
    io.to(roomId).emit('call-ended', { roomId, reason: 'terminated by staff' });
    teardownRoom(roomId, 'terminated by staff');
  }
  return res.json({ success: true, data: { action, target } });
});

app.post('/api/rooms/:roomId/close', (req, res) => {
  const roomId = req.params.roomId;
  const { reason } = req.body || {};
  teardownRoom(roomId, reason || 'room closed');
  return res.json({ success: true });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const peers = [...(rooms.get(req.params.roomId)?.keys() || [])];
  return res.json({ success: true, data: { roomId: req.params.roomId, participants: peers } });
});

let listenAttempts = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && listenAttempts < 10) {
    listenAttempts += 1;
    console.warn(`[signaling] port ${PORT} in use, retrying in 2s (attempt ${listenAttempts}/10)...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 2000);
    return;
  }
  console.error('[signaling] server error:', err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[signaling] P2P signaling server listening on ${PORT}`);
});
