const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inScopeOf, scopeList, inAdminScope } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');

function normalizeContact(c) {
  if (!c) return c;
  const out = { ...c };
  if (!out.name && out.fullName) out.name = out.fullName;
  delete out.fullName;
  // A family member is only name + relationship + mobile. Everything else
  // (email, address, city, state, derived name parts) is gone from the API
  // even for rows written before the trim.
  stripContactExtras(out);
  // Contacts are created with either mobileNumber (kiosk) or phoneNumber
  // (warden dashboard); expose one consistent value on all three aliases.
  const phone = out.mobileNumber || out.phoneNumber || out.phone;
  if (phone) {
    if (!out.mobileNumber) out.mobileNumber = phone;
    if (!out.phoneNumber) out.phoneNumber = phone;
    if (!out.phone) out.phone = phone;
  }
  return out;
}

// The only detail fields a contact may carry beyond its ids/status/timestamps.
const CONTACT_EXTRA_FIELDS = ['email', 'address', 'city', 'state', 'firstName', 'lastName'];

function stripContactExtras(c) {
  if (!c || typeof c !== 'object') return c;
  for (const key of CONTACT_EXTRA_FIELDS) delete c[key];
  return c;
}

function hasContactExtras(c) {
  return !!c && typeof c === 'object' && CONTACT_EXTRA_FIELDS.some((k) => k in c);
}

function createContactsRouter() {
  const router = express.Router();

  // One-time table cleanup: older rows (and stale clients) stored email,
  // address, city, state and derived name parts. A contact is only
  // name + relationship + mobile — sweep the junk out of the stored rows
  // once at boot so the table itself matches what the UI shows.
  setImmediate(async () => {
    try {
      const rows = await readDb('contacts.json');
      const needsSweep = (c) => !!c && (hasContactExtras(c) || (!!c.fullName && !c.name));
      if (!Array.isArray(rows) || rows.length === 0 || !rows.some(needsSweep)) return;
      await updateDb('contacts.json', (all) => {
        all.forEach((c) => {
          // Legacy rows carry fullName instead of name — fold it in first so
          // nothing below loses the person's name.
          if (!c.name && c.fullName) c.name = c.fullName;
          delete c.fullName;
          stripContactExtras(c);
        });
        return { data: all, result: { swept: all.length } };
      });
      console.log('[contacts] swept legacy detail fields from stored rows');
    } catch (err) {
      console.warn('[contacts] field sweep skipped:', err.message);
    }
  });

  // ==================== CONTACT ROUTES ====================

  router.get('/', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const contacts = await readDb('contacts.json');
    const scoped = await scopeList(req, contacts);
    const inmateIdFilter = req.query.inmateId;
    const relationshipFilter = req.query.relationship;
    let filtered = scoped;
    if (inmateIdFilter && inmateIdFilter !== 'all') {
      filtered = filtered.filter((c) => c.inmateId === inmateIdFilter);
    }
    if (relationshipFilter && relationshipFilter !== 'all') {
      filtered = filtered.filter((c) => c.relationship === relationshipFilter);
    }
    const result = await paginate({
      req, data: filtered.map(normalizeContact),
      search: (c, q) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.contactId || '').toLowerCase().includes(q) ||
        (c.inmateId || '').toLowerCase().includes(q) ||
        (c.phoneNumber || '').toLowerCase().includes(q) ||
        (c.relationship || '').toLowerCase().includes(q),
      searchFields: [],
      defaultSort: 'name',
    });
    return sendSuccess(res, result);
  }));

  // Clear all registered family-device fingerprints for a contact. The NEXT
  // call to this contact registers whatever device opens the link — use when a
  // family member changed phone/browser and verification now fails with
  // DEVICE_MISMATCH / "device not verified".
  router.delete('/:contactId/devices', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { contactId } = req.params;
    const contacts = await readDb('contacts.json');
    const contact = contacts.find((c) => c.contactId === contactId);
    // Contacts carry only inmateId — scope must be resolved through the owner
    // inmate (inScopeOf). inAdminScope() checks record.prisonId, which contacts
    // never have, and would reject every warden.
    if (!contact || !(await inScopeOf(req, contact))) {
      return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    }
    // NOTE: updateDb resolves to the MUTATOR's inner `result` directly
    // (db.js does `return result`, not `{data, result}`).
    const cleared = await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const removed = Array.isArray(all[idx].deviceFingerprints) ? all[idx].deviceFingerprints.length : 0;
      all[idx].deviceFingerprints = [];
      return { data: all, result: { contactId, removedDevices: removed, clearedAt: new Date().toISOString() } };
    });
    if (!cleared) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    return sendSuccess(res, cleared);
  }));

  // Remove ONE registered family device (fingerprint) from a contact. The
  // next call opens a fresh registration flow for that number.
  router.delete('/:contactId/devices/:fingerprintId', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { contactId, fingerprintId } = req.params;
    const contacts = await readDb('contacts.json');
    const contact = contacts.find((c) => c.contactId === contactId);
    // Same as above: scope contacts through their owner inmate, not record.prisonId.
    if (!contact || !(await inScopeOf(req, contact))) {
      return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    }
    const removed = await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const list = Array.isArray(all[idx].deviceFingerprints) ? all[idx].deviceFingerprints : [];
      const target = list.find((f) => f.fingerprintId === fingerprintId);
      if (!target) return { data: all, result: null };
      all[idx].deviceFingerprints = list.filter((f) => f.fingerprintId !== fingerprintId);
      return { data: all, result: { contactId, fingerprintId, phone: target.phone || null, removedAt: new Date().toISOString() } };
    });
    if (!removed) return sendError(res, 'NOT_FOUND', 'Device not found for this contact', 404);
    return sendSuccess(res, removed);
  }));

  // Single route (was two colliding '/contacts/:param' routes — the second
  // could never match). Tries contactId first, falls back to kiosk-scoped list.
  router.get('/:id', requireAuth, asyncRoute(async (req, res) => {
    const { id } = req.params;
    const contacts = await readDb('contacts.json');

    const contact = contacts.find((c) => c.contactId === id);
    if (contact) {
      if (!(await inScopeOf(req, contact))) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
      return sendSuccess(res, normalizeContact(contact));
    }

    const inmates = await readDb('inmates.json');
    const inmate = inmates.find((i) => i.inmateId === id) ||
                   inmates.find((i) => i.assignedKioskId === id) ||
                   inmates.find((i) => i.prisonerNumber === id);
    if (inmate && !(await inScopeOf(req, inmate))) {
      return sendError(res, 'NOT_FOUND', 'Inmate not found in your kiosk/jail', 404);
    }
    const scoped = inmate ? contacts.filter((c) => (c.inmateId === inmate.inmateId || c.inmateId === `INM-${inmate.inmateId}`) && c.active !== false) : [];
    return sendSuccess(res, scoped.map(normalizeContact));
  }));

  // ==================== ANDROID COMPATIBILITY: PRISONER-SPECIFIC CONTACTS ====================

  router.get('/admin/prisoners/:prisonerId/contacts', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { prisonerId } = req.params;
    const inmates = await readDb('inmates.json');
    if (!inmates.find((i) => i.inmateId === prisonerId && inAdminScope(req, i))) {
      return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);
    }
    const contacts = await readDb('contacts.json');
    const scoped = contacts.filter((c) => c.inmateId === prisonerId);
    return sendSuccess(res, scoped.map(normalizeContact));
  }));

  // Toggle contact active/inactive
  router.patch('/admin/contacts/:contactId/toggle', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { contactId } = req.params;
    const [contacts, inmates] = await Promise.all([readDb('contacts.json'), readDb('inmates.json')]);
    const target = contacts.find((c) => c.contactId === contactId);
    if (!target) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    const owner = inmates.find((i) => i.inmateId === target.inmateId) ||
                  inmates.find((i) => `INM-${i.inmateId}` === target.inmateId);
    if (!owner) return sendError(res, 'NOT_FOUND', 'Inmate not found for this contact', 404);
    if (!inAdminScope(req, owner)) {
      return sendError(res, 'FORBIDDEN', 'Contact not in your kiosk scope', 403);
    }
    const updated = await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const newActive = all[idx].active === false ? true : false;
      all[idx] = { ...all[idx], active: newActive, status: newActive ? 'approved' : 'rejected' };
      return { data: all, result: all[idx] };
    });
    if (!updated) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    return sendSuccess(res, updated);
  }));

  return router;
}

module.exports = createContactsRouter;
