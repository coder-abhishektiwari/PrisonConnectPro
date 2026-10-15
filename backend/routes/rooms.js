const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inScopeOf } = require('../lib/scoping');

const router = express.Router();

// Rooms are only joined and left over HTTP; creating a room and listing the
// room registry happened to be used by nobody, so they were removed. Media
// itself runs on the signaling server.
function createRoomsRouter() {
  router.post('/join', requireAuth, asyncRoute(async (req, res) => {
    const { roomId, participantId } = req.body;
    const rooms = await readDb('rooms.json');
    const room = rooms.find((r) => r.roomId === roomId);
    if (!room || !(await inScopeOf(req, room))) return sendError(res, 'NOT_FOUND', 'Room not found', 404);
    if (room.expiresAt && new Date(room.expiresAt).getTime() < Date.now()) {
      return sendError(res, 'ROOM_EXPIRED', 'Room has expired', 410);
    }
    return sendSuccess(res, { roomId, participantId, status: 'use the join-room socket event to establish media' });
  }));

  router.post('/leave', requireAuth, asyncRoute(async (req, res) => {
    const { roomId, participantId } = req.body;
    if (!roomId || !participantId) return sendError(res, 'INVALID_REQUEST', 'roomId and participantId are required', 400);
    const rooms = await readDb('rooms.json');
    const room = rooms.find((r) => r.roomId === roomId);
    if (!room || !(await inScopeOf(req, room))) return sendError(res, 'NOT_FOUND', 'Room not found', 404);
    await updateDb('rooms.json', (all) => {
      const idx = all.findIndex((r) => r.roomId === roomId);
      if (idx === -1) return { data: all, result: null };
      const room = all[idx];
      room.participants = (room.participants || []).filter((p) => p !== participantId);
      room.participantCount = room.participants.length;
      return { data: all, result: room };
    });
    return sendSuccess(res, { status: 'left' });
  }));

  return router;
}

module.exports = createRoomsRouter;
