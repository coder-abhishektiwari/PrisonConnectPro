const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, kioskScopeOf, inScopeOf, scopeList } = require('../lib/scoping');

const router = express.Router();

router.get('/list', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('prisons.json')))));

router.get('/', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('prisons.json')))));

router.get('/:prisonId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === req.params.prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, prison);
}));

router.post('/', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => {
  const prisonData = req.body;
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId || kioskId) {
    if (prisonData.prisonId && prisonData.prisonId !== jailId) {
      return sendError(res, 'FORBIDDEN', 'Cannot create a prison outside your jail', 403);
    }
    prisonData.prisonId = jailId || prisonData.prisonId;
  }
  try {
    const newPrison = await updateDb('prisons.json', (prisons) => {
      if (prisonData.name && prisons.find((p) => p.name === prisonData.name)) {
        const err = new Error('A prison with this name already exists');
        err.code = 'DUPLICATE';
        throw err;
      }
      const record = { prisonId: `PRISON-${uuidv4().substring(0, 8).toUpperCase()}`, ...prisonData, status: prisonData.status || 'active' };
      return { data: [...prisons, record], result: record };
    });
    return sendSuccess(res, newPrison, 201);
  } catch (err) {
    if (err.code === 'DUPLICATE') return sendError(res, 'DUPLICATE', err.message, 409);
    throw err;
  }
}));

router.patch('/:prisonId', requireAuth, requireRole('admin'), asyncRoute(async (req, res) => {
  const existing = (await readDb('prisons.json')).find((p) => p.prisonId === req.params.prisonId);
  if (!existing || !(await inScopeOf(req, existing))) {
    return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  }
  const IMMUTABLE_FIELDS = ['prisonId', 'setupPin', 'wardenId', 'createdAt'];
  const patch = { ...req.body };
  IMMUTABLE_FIELDS.forEach((f) => delete patch[f]);
  const updated = await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === req.params.prisonId);
    if (idx === -1) return { data: prisons, result: null };
    prisons[idx] = { ...prisons[idx], ...patch };
    return { data: prisons, result: prisons[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, updated);
}));

module.exports = router;
