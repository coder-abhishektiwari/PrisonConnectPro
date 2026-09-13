const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { adminScopeFilter, inAdminScope, inScopeOf, scopeList } = require('../lib/scoping');

const router = express.Router();

function createDevicesRouter(broadcastEvent) {
  router.get('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('devices.json')))));

  router.get('/:deviceId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const devices = await readDb('devices.json');
    const device = devices.find((d) => d.deviceId === req.params.deviceId);
    if (!device) return sendError(res, 'NOT_FOUND', 'Device not found', 404);
    if (!(await inScopeOf(req, device))) return sendError(res, 'FORBIDDEN', 'Device outside your scope', 403);
    return sendSuccess(res, device);
  }));

  router.patch('/:deviceId/status', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ['online', 'offline', 'maintenance', 'decommissioned'];
    if (status && !allowedStatuses.includes(status)) {
      return sendError(res, 'INVALID_STATUS', `Status must be one of: ${allowedStatuses.join(', ')}`, 400);
    }
    const updated = await updateDb('devices.json', (devices) => {
      const idx = devices.findIndex((d) => d.deviceId === req.params.deviceId);
      if (idx === -1) return { data: devices, result: null };
      devices[idx] = { ...devices[idx], status, lastSeen: new Date().toISOString() };
      return { data: devices, result: devices[idx] };
    });
    if (!updated) return sendError(res, 'NOT_FOUND', 'Device not found', 404);
    broadcastEvent('device-status-change', updated);
    return sendSuccess(res, updated);
  }));

  // Android compatibility: admin device aliases
  router.get('/admin', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const kiosks = await readDb('kiosks.json');
    return sendSuccess(res, kiosks.filter(adminScopeFilter(req)));
  }));

  router.get('/admin/:deviceId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const kiosks = await readDb('kiosks.json');
    const kiosk = kiosks.find(
      (k) => (k.kioskId === req.params.deviceId || k.deviceSerialNumber === req.params.deviceId) && inAdminScope(req, k)
    );
    if (!kiosk) return sendError(res, 'NOT_FOUND', 'Device not found', 404);
    return sendSuccess(res, kiosk);
  }));

  return router;
}

module.exports = createDevicesRouter;
