const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { deepMerge } = require('../lib/response');
const { scopeList } = require('../lib/scoping');

const router = express.Router();

function createSettingsRouter(broadcastEvent) {
  // Settings
  router.get('/', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await readDb('settings.json'))));

  router.patch('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const merged = await updateDb('settings.json', (all) => {
      const patch = { ...req.body };
      const base = all.length ? { ...all[0] } : {};
      const result = deepMerge(base, patch);
      return { data: [result], result };
    });
    broadcastEvent('settings-updated', merged.result);
    return sendSuccess(res, merged.result);
  }));

  // Reports
  router.get('/reports', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('reports.json')))));

  router.get('/reports/:reportId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const reports = await readDb('reports.json');
    const report = reports.find((r) => r.reportId === req.params.reportId);
    if (!report || !(await require('../lib/scoping').inScopeOf(req, report))) return sendError(res, 'NOT_FOUND', 'Report not found', 404);
    return sendSuccess(res, report);
  }));

  // Pricing
  router.get('/pricing', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await readDb('pricing.json'))));

  router.patch('/pricing', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const merged = await updateDb('pricing.json', (all) => {
      const base = all.length ? { ...all[0] } : {};
      const result = deepMerge(base, { ...req.body });
      return { data: [result], result };
    });
    broadcastEvent('pricing-updated', merged.result);
    return sendSuccess(res, merged.result);
  }));

  // Subscriptions, servers, storage
  router.get('/subscriptions', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('subscriptions.json')))));
  router.get('/servers', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('servers.json')))));
  router.get('/storage-stats', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => sendSuccess(res, await readDb('storage.json'))));

  // Super admins
  router.get('/super-admins', requireAuth, requireRole('super-admin'), asyncRoute(async (req, res) => sendSuccess(res, await readDb('super-admins.json'))));
  router.get('/super-admins/:adminId', requireAuth, requireRole('super-admin'), asyncRoute(async (req, res) => {
    const admins = await readDb('super-admins.json');
    const admin = admins.find((a) => a.adminId === req.params.adminId);
    if (!admin) return sendError(res, 'NOT_FOUND', 'Super admin not found', 404);
    return sendSuccess(res, admin);
  }));

  return router;
}

module.exports = createSettingsRouter;
