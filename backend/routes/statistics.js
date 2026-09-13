const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inAdminScope, inScopeOf, scopeList } = require('../lib/scoping');

const router = express.Router();

function createStatisticsRouter(broadcastEvent) {
  router.get('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const stats = await readDb('statistics.json');
    const calls = await readDb('calls.json');
    const scoped = [];
    for (const s of stats) {
      const call = calls.find((c) => c.callId === s.callId);
      if (call && !inAdminScope(req, call)) continue;
      if (!call && !(await inScopeOf(req, s))) continue;
      scoped.push(s);
    }
    return sendSuccess(res, scoped);
  }));

  router.get('/:callId', requireAuth, asyncRoute(async (req, res) => {
    const statistics = await readDb('statistics.json');
    const callStats = statistics.find((s) => s.callId === req.params.callId);
    if (!callStats) return sendError(res, 'NOT_FOUND', 'Statistics not found for call', 404);
    const call = (await readDb('calls.json')).find((c) => c.callId === req.params.callId);
    if (!inAdminScope(req, call)) return sendError(res, 'NOT_FOUND', 'Statistics not found for call', 404);
    return sendSuccess(res, callStats);
  }));

  router.patch('/:callId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { callId } = req.params;
    const updates = req.body;
    const call = (await readDb('calls.json')).find((c) => c.callId === callId);
    if (!call || !inAdminScope(req, call)) {
      return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    }
    const result = await updateDb('statistics.json', (statistics) => {
      const idx = statistics.findIndex((s) => s.callId === callId);
      const record = idx === -1
        ? {
            callId, packetLoss: updates.packetLoss || 0, latency: updates.latency || 0, bitrate: updates.bitrate || 0,
            jitter: updates.jitter || 0, audioLevel: updates.audioLevel || 0, fps: updates.fps || 0,
            networkHealth: updates.networkHealth || 'good', timestamp: new Date().toISOString()
          }
        : { ...statistics[idx], ...updates, timestamp: new Date().toISOString() };
      const nextData = idx === -1 ? [...statistics, record] : (statistics[idx] = record, statistics);
      return { data: nextData, result: record };
    });
    broadcastEvent('statistics-updated', result);
    return sendSuccess(res, result);
  }));

  return router;
}

module.exports = createStatisticsRouter;
