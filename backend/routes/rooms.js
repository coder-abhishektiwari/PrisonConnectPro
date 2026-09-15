const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { resolveInmate } = require('../lib/jail-account');
const { requireAuth } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { kioskScopeOf, inScopeOf, scopeList } = require('../lib/scoping');

const router = express.Router();

function createRoomsRouter(broadcastEvent) {
  router.get('/', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('rooms.json')))));

  router.post('/', requireAuth, asyncRoute(async (req, res) => {
    const roomData = req.body;
    const inmate = await resolveInmate(roomData.inmateId);
    if (!inmate) return sendError(res, 'INVALID_REFERENCE', 'inmateId does not exist', 422);
    if (!(await inScopeOf(req, inmate))) {
      return sendError(res, 'FORBIDDEN', 'Cannot create a room for an inmate outside your kiosk/jail', 403);
    }
    const newRoom = {
      roomId: roomData.roomId || `ROOM-${uuidv4().substring(0, 8).toUpperCase()}`,
      kioskId: kioskScopeOf(req) || roomData.kioskId,
      inmateId: roomData.inmateId, contactId: roomData.contactId,
      status: 'idle', participants: [], participantCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };
    await updateDb('rooms.json', (rooms) => ({ data: [...rooms, newRoom], result: newRoom }));
    broadcastEvent('room-created', newRoom);
    return sendSuccess(res, newRoom, 201);
  }));

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
    await updateDb('rooms.json', (rooms) => {
      const idx = rooms.findIndex((r) => r.roomId === roomId);
      if (idx === -1) return { data: rooms, result: null };
      const room = rooms[idx];
      room.participants = (room.participants || []).filter((p) => p !== participantId);
      room.participantCount = room.participants.length;
      return { data: rooms, result: room };
    });
    broadcastEvent('room-participant-left', { roomId, participantId });
    return sendSuccess(res, { status: 'left' });
  }));

  return router;
}

module.exports = createRoomsRouter;
