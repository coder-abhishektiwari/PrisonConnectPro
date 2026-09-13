const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, kioskScopeOf, inScopeOf, scopeList } = require('../lib/scoping');

const router = express.Router();

function createAlertsRouter(broadcastEvent) {
  router.get('/', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('alerts.json')))));

  router.post('/', requireAuth, asyncRoute(async (req, res) => {
    const alertData = req.body;
    const kioskId = kioskScopeOf(req);
    const jailId = jailScopeOf(req);
    const newAlert = {
      alertId: `ALERT-${uuidv4().substring(0, 8).toUpperCase()}`,
      type: alertData.type || 'system', severity: alertData.severity || 'medium',
      message: alertData.message, source: alertData.source || 'system', sourceId: alertData.sourceId || 'system',
      kioskId: kioskId || alertData.kioskId || null,
      prisonId: jailId || alertData.prisonId || null,
      timestamp: new Date().toISOString(), resolved: false, resolvedAt: null, resolvedBy: null
    };
    await updateDb('alerts.json', (a) => ({ data: [...a, newAlert], result: newAlert }));
    broadcastEvent('alert-generated', newAlert);
    return sendSuccess(res, newAlert, 201);
  }));

  router.patch('/:alertId/resolve', requireAuth, asyncRoute(async (req, res) => {
    const existing = (await readDb('alerts.json')).find((a) => a.alertId === req.params.alertId);
    if (!existing || !(await inScopeOf(req, existing))) {
      return sendError(res, 'NOT_FOUND', 'Alert not found', 404);
    }
    const { resolvedBy } = req.body;
    const updated = await updateDb('alerts.json', (alerts) => {
      const idx = alerts.findIndex((a) => a.alertId === req.params.alertId);
      if (idx === -1) return { data: alerts, result: null };
      alerts[idx] = { ...alerts[idx], resolved: true, resolvedAt: new Date().toISOString(), resolvedBy: resolvedBy || req.auth?.sub };
      return { data: alerts, result: alerts[idx] };
    });
    if (!updated) return sendError(res, 'NOT_FOUND', 'Alert not found', 404);
    return sendSuccess(res, updated);
  }));

  return router;
}

module.exports = createAlertsRouter;
