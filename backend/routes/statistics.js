const express = require('express');
const { readDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, asyncRoute } = require('../lib/response');
const { inAdminScope, inScopeOf } = require('../lib/scoping');

const router = express.Router();

// Per-call statistics detail (GET /:callId) and the stats writer
// (PATCH /:callId) had no dashboard caller; the list view is all the monitor
// screen needs.
function createStatisticsRouter() {
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

  return router;
}

module.exports = createStatisticsRouter;
