const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inAdminScope, kioskScopeOf, inScopeOf, scopeList } = require('../lib/scoping');
const { saveUploadedRecording } = require('../lib/recorder');

const router = express.Router();

function createRecordingsRouter(broadcastEvent) {
  router.get('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('recordings.json')))));

  router.get('/:recordingId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === req.params.recordingId);
    if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);
    return sendSuccess(res, recording);
  }));

  router.post('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { callId } = req.body;
    if (!callId) return sendError(res, 'INVALID_REQUEST', 'callId is required', 400);
    const call = (await readDb('calls.json')).find((c) => c.callId === callId);
    if (!call || !inAdminScope(req, call)) {
      return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    }
    const newRecording = {
      recordingId: `REC-${uuidv4().substring(0, 8).toUpperCase()}`,
      callId, kioskId: call.kioskId || kioskScopeOf(req) || null,
      inmateId: call.inmateId || null,
      status: 'not_started', startTime: null, endTime: null, duration: 0,
      createdAt: new Date().toISOString()
    };
    await updateDb('recordings.json', (r) => ({ data: [...r, newRecording], result: newRecording }));
    return sendSuccess(res, newRecording, 201);
  }));

  router.post('/upload', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { callId, base64Data, fileName, mimeType } = req.body || {};
    if (!callId) return sendError(res, 'INVALID_REQUEST', 'callId is required', 400);

    const call = (await readDb('calls.json')).find((c) => c.callId === callId || c.roomId === callId);
    if (!call || !(await inScopeOf(req, call))) {
      return sendError(res, 'CALL_NOT_FOUND', 'No call matches the given callId', 404);
    }

    let fileBuffer;
    if (base64Data) {
      fileBuffer = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(req.body)) {
      fileBuffer = req.body;
    } else {
      return sendError(res, 'INVALID_REQUEST', 'No recording data provided (base64Data or raw body required)', 400);
    }

    let rec;
    try {
      rec = await saveUploadedRecording({
        callId,
        kioskId: call.kioskId || null,
        inmateId: req.body?.inmateId || call.inmateId || null,
        contactId: req.body?.contactId || call.contactId || null,
        fileBuffer,
        fileName: fileName || `kiosk-rec-${callId}.mp4`,
        mimeType: mimeType || 'video/mp4'
      });
    } catch (err) {
      console.error('[recordings] failed persisting upload:', err.message);
      return sendError(res, 'STORAGE_ERROR', 'Failed to store uploaded recording', 500);
    }

    await updateDb('recordings.json', (all) => {
      const existingIdx = all.findIndex((r) => r.callId === callId || r.recordingId === rec.recordingId);
      if (existingIdx !== -1) {
        all[existingIdx] = { ...all[existingIdx], ...rec };
        return { data: all, result: all[existingIdx] };
      }
      return { data: [...all, rec], result: rec };
    });

    await updateDb('calls.json', (calls) => {
      const c = calls.find((x) => x.callId === callId || x.roomId === callId);
      if (c) {
        c.recordingStatus = 'completed';
        c.recordingId = rec.recordingId;
      }
      return { data: calls, result: c };
    });

    broadcastEvent('recording-finished', rec);
    return sendSuccess(res, rec, 200);
  }));

  router.post('/:recordingId/start', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { recordingId } = req.params;
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === recordingId);
    if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);

    const updated = await updateDb('recordings.json', (all) => {
      const idx = all.findIndex((r) => r.recordingId === recordingId);
      all[idx] = { ...all[idx], status: 'recording', startTime: new Date().toISOString() };
      return { data: all, result: all[idx] };
    });

    broadcastEvent('recording-started', updated);
    return sendSuccess(res, updated);
  }));

  router.post('/:recordingId/stop', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { recordingId } = req.params;
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === recordingId);
    if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);

    const updated = await updateDb('recordings.json', (all) => {
      const idx = all.findIndex((r) => r.recordingId === recordingId);
      const startMs = all[idx].startTime ? new Date(all[idx].startTime).getTime() : Date.now();
      all[idx] = {
        ...all[idx], status: 'completed', endTime: new Date().toISOString(),
        duration: Math.max(1, Math.round((Date.now() - startMs) / 1000))
      };
      return { data: all, result: all[idx] };
    });

    broadcastEvent('recording-finished', updated);
    return sendSuccess(res, updated);
  }));

  return router;
}

module.exports = createRecordingsRouter;
