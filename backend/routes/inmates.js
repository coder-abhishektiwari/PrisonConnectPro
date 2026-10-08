const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { hashSecret } = require('../lib/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, inJailScope, kioskScopeOf, inAdminScope, adminScopeFilter, inScopeOf, scopeList } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');
const { ensureWallet } = require('../lib/wallets');

const router = express.Router();

const INMATE_IMMUTABLE_FIELDS = ['inmateId', 'createdAt'];

// Cell, Block, Security Level and Sentence were dropped from the inmate
// record entirely. Strip them from every write so older clients cannot
// resurrect the fields after the cleanup migration has run.
const REMOVED_INMATE_FIELDS = [
  'cellId', 'blockId', 'cellBlock', 'cellNumber',
  'cellName', 'blockName', 'securityLevel',
  'sentenceDetails', 'sentenceStart', 'sentenceEnd',
];

function stripRemovedInmateFields(payload) {
  const out = { ...payload };
  REMOVED_INMATE_FIELDS.forEach((f) => delete out[f]);
  return out;
}

/**
 * Biometric tokens are stored hashed at rest; login verifies them via
 * routes/auth.js matchesBiometric (bcrypt at rest, legacy plain accepted).
 * Applied wherever biometricData may enter a write so create/update payloads
 * never persist a raw card number or fingerprint template. Values that are
 * already bcrypt hashes pass through untouched.
 */
async function hashBiometricData(biometricData) {
  if (!biometricData) return biometricData;
  const out = { ...biometricData };
  if (out.rfidToken && !/^\$2[aby]\$/.test(String(out.rfidToken))) {
    out.rfidCardNumber = String(out.rfidToken); // display copy for inmate details
    out.rfidToken = await hashSecret(String(out.rfidToken));
  }
  if (out.fingerprintTemplate && !/^\$2[aby]\$/.test(String(out.fingerprintTemplate))) {
    out.fingerprintTemplate = await hashSecret(String(out.fingerprintTemplate));
  }
  return out;
}

/**
 * Every pointer on a prisoner row (jail, kiosk) is a foreign key.
 * Checking the ids against the tables they name turns a database
 * error (500) into a clear 422 the caller can act on.
 * Returns `{ ok: true }` or `{ ok: false, message }`.
 */
async function validateInmateRefs(refs) {
  const wanted = [
    ['prisonId', refs.prisonId, 'prisons.json', 'prisonId'],
    ['assignedKioskId', refs.assignedKioskId, 'kiosks.json', 'kioskId'],
  ].filter(([, value]) => value);
  if (!wanted.length) return { ok: true };
  try {
    const tables = await Promise.all(wanted.map(([, , file]) => readDb(file)));
    const missing = [];
    wanted.forEach(([label, value, , key], i) => {
      if (!tables[i].some((row) => row[key] === value)) {
        missing.push(`${label} '${value}' does not exist`);
      }
    });
    return missing.length ? { ok: false, message: missing.join('; ') } : { ok: true };
  } catch (err) {
    // If a lookup table cannot be read, let the write proceed and let the
    // database decide — validation must never become an outage.
    return { ok: true };
  }
}

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

async function enrichInmates(inmates) {
  const kiosks = await readDb('kiosks.json').catch(() => []);
  const kioskMap = new Map(kiosks.map(k => [k.kioskId, k.kioskId]));
  return inmates.map(i => ({
    ...i,
    kioskName: i.assignedKioskId ? (kioskMap.get(i.assignedKioskId) || i.assignedKioskId) : '',
  }));
}

function inmateListHandler(req, res) {
  return asyncRoute(async (req, res) => {
    const inmates = await readDb('inmates.json');
    const scoped = inmates.filter(adminScopeFilter(req)).map(normalizeInmate);
    const facilityFilter = req.query.facility;
    const filtered = (facilityFilter && facilityFilter !== 'all')
      ? scoped.filter((i) => i.facility === facilityFilter)
      : scoped;
    const enriched = await enrichInmates(filtered);
    const result = await paginate({
      req, data: enriched,
      search: (i, q) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.inmateId || '').toLowerCase().includes(q) ||
        (i.prisonerNumber || '').toLowerCase().includes(q) ||
        (i.idNumber || '').toLowerCase().includes(q) ||
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
    const [enriched] = await enrichInmates([normalizeInmate(inmate)]);
    return sendSuccess(res, enriched);
  })(req, res);
}

async function inmateCreateHandler(req, res) {
  const inmateData = stripRemovedInmateFields(req.body);
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && inmateData.prisonId && inmateData.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create an inmate outside your jail', 403);
  }
  if (kioskId && inmateData.assignedKioskId && inmateData.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create an inmate for another kiosk', 403);
  }
  // Verify assigned kiosk belongs to the same prison
  const assignedKiosk = inmateData.assignedKioskId;
  if (jailId && assignedKiosk) {
    const kiosks = await readDb('kiosks.json');
    const kiosk = kiosks.find((k) => k.kioskId === assignedKiosk);
    if (!kiosk) {
      return sendError(res, 'NOT_FOUND', 'Assigned kiosk not found', 404);
    }
    if (kiosk.prisonId && kiosk.prisonId !== jailId) {
      return sendError(res, 'FORBIDDEN', 'Cannot assign a kiosk from another prison', 403);
    }
  }
  const refs = await validateInmateRefs({
    prisonId: jailId || inmateData.prisonId || inmateData.facility,
    assignedKioskId: kioskId || inmateData.assignedKioskId,
  });
  if (!refs.ok) return sendError(res, 'INVALID_REFERENCE', refs.message, 422);
  try {
    const newInmate = await updateDb('inmates.json', async (inmates) => {
      if (inmateData.prisonerNumber && inmates.find((i) => i.prisonerNumber === inmateData.prisonerNumber)) {
        const err = new Error('Inmate with this prisoner number already exists');
        err.code = 'DUPLICATE';
        throw err;
      }
      let inmateId = inmateData.inmateId;
      if (!inmateId) {
        const maxId = inmates.reduce((max, i) => {
          const n = parseInt(i.inmateId, 10);
          return !isNaN(n) && n > max ? n : max;
        }, 100000);
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = String(maxId + 1 + attempt);
          if (!inmates.find(i => i.inmateId === candidate)) { inmateId = candidate; break; }
        }
        if (!inmateId) {
          const err = new Error('Failed to generate unique inmate ID');
          err.code = 'GENERATION_FAILED';
          throw err;
        }
      } else if (inmates.find((i) => i.inmateId === inmateId)) {
        const err = new Error('Inmate with this ID already exists');
        err.code = 'DUPLICATE';
        throw err;
      }
      const record = {
        ...inmateData,
        inmateId: inmateId,
        // Wallet is provisioned below with this exact id. Shipping an inmate
        // without one means the call-charge path finds no wallet to debit and
        // silently bills ₹0 — free calls for the whole sentence.
        walletId: inmateData.walletId || `WAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prisonId: jailId || inmateData.prisonId || inmateData.facility,
        facility: jailId || inmateData.facility || inmateData.prisonId,
        assignedKioskId: kioskId || inmateData.assignedKioskId,
        status: inmateData.status || 'active',
        pin: inmateData.pin ? await hashSecret(String(inmateData.pin)) : await hashSecret(uuidv4().substring(0, 8)),
        biometricData: await hashBiometricData(inmateData.biometricData || {
          fingerprintRegistered: false, rfidRegistered: false, lastBiometricUpdate: null
        }),
        createdAt: new Date().toISOString()
      };
      return { data: [...inmates, record], result: record };
    });
    if (!newInmate) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
    // Persist the wallet row. The inmate already carries its walletId, and the
    // charge path lazily ensures the row too, so a failure here must not fail
    // the whole creation.
    await ensureWallet(newInmate.inmateId, newInmate.walletId).catch((err) =>
      console.error(`[wallet] provision failed for ${newInmate.inmateId}:`, err.message)
    );
    return sendSuccess(res, newInmate, 201);
  } catch (err) {
    if (err.code === 'DUPLICATE') return sendError(res, 'DUPLICATE', err.message, 409);
    throw err;
  }
}

async function inmateUpdateHandler(req, res) {
  const id = req.params.inmateId || req.params.prisonerId;
  const updates = stripRemovedInmateFields(req.body);
  INMATE_IMMUTABLE_FIELDS.forEach((f) => delete updates[f]);
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && updates.prisonId && updates.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot move an inmate to another jail', 403);
  }
  if (kioskId && updates.assignedKioskId && updates.assignedKioskId !== kioskId) {
    return sendError(res, 'FORBIDDEN', 'Cannot reassign an inmate to another kiosk', 403);
  }
  // Verify assigned kiosk belongs to the same prison
  if (jailId && updates.assignedKioskId) {
    const kiosks = await readDb('kiosks.json');
    const kiosk = kiosks.find((k) => k.kioskId === updates.assignedKioskId);
    if (!kiosk) {
      return sendError(res, 'NOT_FOUND', 'Assigned kiosk not found', 404);
    }
    if (kiosk.prisonId && kiosk.prisonId !== jailId) {
      return sendError(res, 'FORBIDDEN', 'Cannot assign a kiosk from another prison', 403);
    }
  }
  delete updates.prisonId;
  if (updates.biometricData) updates.biometricData = await hashBiometricData(updates.biometricData);
  const updatedRefs = await validateInmateRefs({
    assignedKioskId: updates.assignedKioskId,
  });
  if (!updatedRefs.ok) return sendError(res, 'INVALID_REFERENCE', updatedRefs.message, 422);
  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === id && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updates };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  // Self-healing for inmates created before wallets were auto-provisioned:
  // any edit is enough to give them the wallet they never got.
  if (!updated.walletId) {
    const wallet = await ensureWallet(updated.inmateId).catch((err) => {
      console.error(`[wallet] provision failed for ${updated.inmateId}:`, err.message);
      return null;
    });
    if (wallet) {
      updated.walletId = wallet.walletId;
      await updateDb('inmates.json', (all) => {
        const i = all.findIndex((r) => r.inmateId === updated.inmateId);
        if (i === -1) return { data: all, result: null };
        all[i].walletId = wallet.walletId;
        return { data: all, result: all[i] };
      });
    }
  }
  return sendSuccess(res, updated);
}

async function inmateDeleteHandler(req, res) {
  const id = req.params.inmateId || req.params.prisonerId;
  const existing = (await readDb('inmates.json')).find((i) => i.inmateId === id && inAdminScope(req, i));
  if (!existing) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);

  const [calls, transactions, schedule, rooms] = await Promise.all([
    readDb('calls.json'),
    readDb('transactions.json'),
    readDb('schedule.json'),
    readDb('rooms.json'),
  ]);
  const active = calls.find((c) => c.inmateId === id && c.status === 'active');
  if (active) return sendError(res, 'CONFLICT', 'This prisoner has a call in progress', 409);

  // Money and call history outlive the prisoner. Deleting the row makes the
  // wallet cascade away and the foreign keys null the call/transaction links,
  // so the archive pointer has to be written first or the trail disappears.
  const stampHistory = (rows) => rows.map((r) => {
    if (r.inmateId !== id) return r;
    const stamped = { ...r, inmateId: null, archivedInmateId: r.inmateId };
    if (r.walletId) { stamped.archivedWalletId = r.walletId; stamped.walletId = null; }
    return stamped;
  });
  await updateDb('calls.json', (rows) => ({ data: stampHistory(rows), result: null }));
  await updateDb('transactions.json', (rows) => ({ data: stampHistory(rows), result: null }));

  // Bookings and rooms without a prisoner can never be used again.
  await updateDb('schedule.json', (rows) => ({ data: rows.filter((s) => s.inmateId !== id), result: null }));
  await updateDb('rooms.json', (rows) => ({ data: rows.filter((r) => r.inmateId !== id), result: null }));

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

router.get('/next-id', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const inmates = await readDb('inmates.json');
  const maxId = inmates.reduce((max, i) => {
    const n = parseInt(i.inmateId, 10);
    return !isNaN(n) && n > max ? n : max;
  }, 100000);
  return sendSuccess(res, { nextId: String(maxId + 1) });
}));

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

// Toggle inmate active/inactive
router.patch('/admin/prisoners/:prisonerId/toggle', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonerId } = req.params;
  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    const newStatus = inmates[idx].status === 'active' ? 'inactive' : 'active';
    inmates[idx] = { ...inmates[idx], status: newStatus };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  // Self-healing for inmates created before wallets were auto-provisioned:
  // any edit is enough to give them the wallet they never got.
  if (!updated.walletId) {
    const wallet = await ensureWallet(updated.inmateId).catch((err) => {
      console.error(`[wallet] provision failed for ${updated.inmateId}:`, err.message);
      return null;
    });
    if (wallet) {
      updated.walletId = wallet.walletId;
      await updateDb('inmates.json', (all) => {
        const i = all.findIndex((r) => r.inmateId === updated.inmateId);
        if (i === -1) return { data: all, result: null };
        all[i].walletId = wallet.walletId;
        return { data: all, result: all[i] };
      });
    }
  }
  return sendSuccess(res, updated);
}));

// ==================== INMATE ROUTES (parameterized — LAST) ====================

router.get('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateListHandler));

router.get('/:inmateId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateGetHandler));

router.post('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(inmateCreateHandler));

router.put('/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateUpdateHandler));

router.delete('/:inmateId', requireAuth, requireRole('admin', 'warden'), asyncRoute(inmateDeleteHandler));

module.exports = router;
// Shared with admin-routes.js so its duplicate prisoner endpoints run the very
// same guarded logic instead of a stripped-down copy.
module.exports.inmateCreateHandler = inmateCreateHandler;
module.exports.inmateUpdateHandler = inmateUpdateHandler;
module.exports.inmateDeleteHandler = inmateDeleteHandler;
module.exports.validateInmateRefs = validateInmateRefs;
module.exports.stripRemovedInmateFields = stripRemovedInmateFields;
module.exports.hashBiometricData = hashBiometricData;
