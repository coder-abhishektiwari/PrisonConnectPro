const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { hashSecret } = require('../lib/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, inJailScope, kioskScopeOf, inAdminScope, adminScopeFilter, inScopeOf, scopeList } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');

const router = express.Router();

const INMATE_IMMUTABLE_FIELDS = ['inmateId', 'createdAt'];

function normalizeInmate(i) {
  if (!i) return i;
  const out = { ...i };
  if (!out.name) {
    out.name = out.fullName || [out.firstName, out.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
  }
  delete out.fullName;
  delete out.firstName;
  delete out.lastName;
  return out;
}

function inmateListHandler(req, res) {
  return asyncRoute(async (req, res) => {
    const inmates = await readDb('inmates.json');
    const scoped = inmates.filter(adminScopeFilter(req)).map(normalizeInmate);
    const result = await paginate({
      req, data: scoped,
      search: (i, q) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.inmateId || '').toLowerCase().includes(q) ||
        (i.facility || '').toLowerCase().includes(q) ||
        (i.prisonId || '').toLowerCase().includes(q),
      searchFields: [],
      defaultSort: 'name',
    });
    return sendSuccess(res, result);
  })(req, res);
}

function inmateGetHandler(req, res) {
  return asyncRoute(async (req, res) => {
    const inmates = await readDb('inmates.json');
    const id = req.params.inmateId || req.params.prisonerId;
    const inmate = inmates.find((i) => i.inmateId === id && inAdminScope(req, i));
    if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
    return sendSuccess(res, normalizeInmate(inmate));
  })(req, res);
}

async function inmateCreateHandler(req, res) {
  const inmateData = req.body;
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && inmateData.prisonId && inmateData.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create an inmate outside your jail', 403);
  }
  if (kioskId && inmateData.assignedKioskId && inmateData.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create an inmate for another kiosk', 403);
  }
  try {
    const newInmate = await updateDb('inmates.json', async (inmates) => {
      if (inmates.find((i) => i.inmateId === inmateData.inmateId) ||
          (inmateData.prisonerNumber && inmates.find((i) => i.prisonerNumber === inmateData.prisonerNumber))) {
        const err = new Error('Inmate with this ID or prisoner number already exists');
        err.code = 'DUPLICATE';
        throw err;
      }
      const record = {
        ...inmateData,
        inmateId: inmateData.inmateId || `INM-${uuidv4().substring(0, 8).toUpperCase()}`,
        prisonId: jailId || inmateData.prisonId || inmateData.facility,
        facility: jailId || inmateData.facility || inmateData.prisonId,
        assignedKioskId: kioskId || inmateData.assignedKioskId,
        status: inmateData.status || 'active',
        pin: inmateData.pin ? await hashSecret(String(inmateData.pin)) : await hashSecret(uuidv4().substring(0, 8)),
        biometricData: inmateData.biometricData || {
          faceRegistered: false, faceEmbedding: null,
          fingerprintRegistered: false, rfidRegistered: false, lastBiometricUpdate: null
        },
        createdAt: new Date().toISOString()
      };
      return { data: [...inmates, record], result: record };
    });
    return sendSuccess(res, newInmate, 201);
  } catch (err) {
    if (err.code === 'DUPLICATE') return sendError(res, 'DUPLICATE', err.message, 409);
    throw err;
  }
}

async function inmateUpdateHandler(req, res) {
  const id = req.params.inmateId || req.params.prisonerId;
  const updates = { ...req.body };
  INMATE_IMMUTABLE_FIELDS.forEach((f) => delete updates[f]);
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && updates.prisonId && updates.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot move an inmate to another jail', 403);
  }
  if (kioskId && updates.assignedKioskId && updates.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot reassign an inmate to another kiosk', 403);
  }
  delete updates.prisonId;
  delete updates.facility;
  delete updates.assignedKioskId;
  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === id && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updates };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  return sendSuccess(res, updated);
}

async function inmateDeleteHandler(req, res) {
  const id = req.params.inmateId || req.params.prisonerId;
  const deleted = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === id && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    const [removed] = inmates.splice(idx, 1);
    return { data: inmates, result: removed };
  });
  if (!deleted) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  return sendSuccess(res, { message: 'Inmate deleted successfully', inmateId: deleted.inmateId });
}

// ==================== SHORT ALIASES (must be before /:inmateId) ====================

router.get('/prisoners', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateListHandler));
router.get('/prisoners/:inmateId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateGetHandler));
router.post('/prisoners', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateCreateHandler));
router.put('/prisoners/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateUpdateHandler));
router.delete('/prisoners/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateDeleteHandler));

router.get('/admin', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateListHandler));
router.get('/admin/:inmateId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateGetHandler));
router.post('/admin', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateCreateHandler));
router.put('/admin/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateUpdateHandler));
router.delete('/admin/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateDeleteHandler));

router.get('/admin/prisoners', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(inmateListHandler));
router.get('/admin/prisoners/:prisonerId', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(inmateGetHandler));
router.post('/admin/prisoners', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(inmateCreateHandler));
router.put('/admin/prisoners/:prisonerId', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(inmateUpdateHandler));
router.patch('/admin/prisoners/:prisonerId/status', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonerId } = req.params;
  const { status } = req.body;
  if (!status) return sendError(res, 'INVALID_REQUEST', 'status is required', 400);
  const allowedStatuses = ['active', 'inactive', 'suspended', 'released', 'transferred'];
  if (!allowedStatuses.includes(status)) return sendError(res, 'INVALID_STATUS', `Status must be one of: ${allowedStatuses.join(', ')}`, 400);
  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], status };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Prisoner not found', 404);
  return sendSuccess(res, updated);
}));
router.delete('/admin/prisoners/:prisonerId', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(inmateDeleteHandler));

// ==================== INMATE ROUTES (parameterized — LAST) ====================

router.get('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateListHandler));

router.get('/:inmateId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateGetHandler));

router.post('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateCreateHandler));

router.put('/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateUpdateHandler));

router.delete('/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateDeleteHandler));

module.exports = router;
