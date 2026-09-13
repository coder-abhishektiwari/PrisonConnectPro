const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, kioskScopeOf, inScopeOf, scopeList } = require('../lib/scoping');

const router = express.Router();

function createIncidentsRouter(broadcastEvent) {
  router.get('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('incidents.json')))));

  router.post('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const incidentData = req.body;
    const newIncident = {
      incidentId: `INC-${uuidv4().substring(0, 8).toUpperCase()}`,
      category: incidentData.category || 'other', severity: incidentData.severity || 'medium',
      remarks: incidentData.remarks || '', time: incidentData.time || new Date().toISOString(),
      officerName: req.auth?.sub || incidentData.officerName || 'unknown',
      callId: incidentData.callId || null,
      kioskId: kioskScopeOf(req) || incidentData.kioskId || null,
      prisonId: jailScopeOf(req) || incidentData.prisonId || null,
      inmateId: incidentData.inmateId || null,
      createdAt: new Date().toISOString()
    };
    await updateDb('incidents.json', (i) => ({ data: [...i, newIncident], result: newIncident }));
    broadcastEvent('incident-created', newIncident);
    return sendSuccess(res, newIncident, 201);
  }));

  router.get('/:incidentId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const incidents = await readDb('incidents.json');
    const incident = incidents.find((i) => i.incidentId === req.params.incidentId);
    if (!incident || !(await inScopeOf(req, incident))) return sendError(res, 'NOT_FOUND', 'Incident not found', 404);
    return sendSuccess(res, incident);
  }));

  return router;
}

module.exports = createIncidentsRouter;
