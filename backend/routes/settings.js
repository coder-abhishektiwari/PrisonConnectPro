const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, asyncRoute, deepMerge } = require('../lib/response');

const router = express.Router();

function createSettingsRouter(broadcastEvent) {
  // Settings
  // NOTE: singletons are stored as 1-element arrays after any PATCH
  // ({ data: [result] }) — always unwrap so clients get the object itself.
  router.get('/', requireAuth, asyncRoute(async (req, res) => {
    const raw = await readDb('settings.json');
    return sendSuccess(res, Array.isArray(raw) ? (raw[0] || {}) : raw);
  }));

  // Call limits & facility settings — VENDOR (super admin) ONLY.
  // Wardens may read (chips on Live Calls / Call Logs) but never change them.
  router.patch('/', requireAuth, requireRole('vendor', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const merged = await updateDb('settings.json', (all) => {
      const patch = { ...req.body };
      const base = all.length ? { ...all[0] } : {};
      const result = deepMerge(base, patch);
      return { data: [result], result };
    });
    broadcastEvent('settings-updated', merged);
    return sendSuccess(res, merged);
  }));

  return router;
}

module.exports = createSettingsRouter;
