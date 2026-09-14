const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, inJailScope, adminScopeFilter, inScopeOf, scopeList, inAdminScope, kioskScopeOf } = require('../lib/scoping');

function createContactsRouter(broadcastEvent) {
  const router = express.Router();

  // ==================== CONTACT ROUTES ====================

  router.get('/', requireAuth, asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('contacts.json')))));

  // Clear all registered family-device fingerprints for a contact. The NEXT
  // call to this contact registers whatever device opens the link — use when a
  // family member changed phone/browser and verification now fails with
  // DEVICE_MISMATCH / "device not verified".
  router.delete('/:contactId/devices', requireAuth, asyncRoute(async (req, res) => {
    const { contactId } = req.params;
    const contacts = await readDb('contacts.json');
    const contact = contacts.find((c) => c.contactId === contactId);
    if (!contact || !(await inAdminScope(req, contact))) {
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
    broadcastEvent('contact-devices-cleared', cleared);
    return sendSuccess(res, cleared);
  }));

  // Single route (was two colliding '/contacts/:param' routes — the second
  // could never match). Tries contactId first, falls back to kiosk-scoped list.
  router.get('/:id', requireAuth, asyncRoute(async (req, res) => {
    const { id } = req.params;
    const contacts = await readDb('contacts.json');

    const contact = contacts.find((c) => c.contactId === id);
    if (contact) {
      if (!(await inScopeOf(req, contact))) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
      return sendSuccess(res, contact);
    }

    const inmates = await readDb('inmates.json');
    const inmate = inmates.find((i) => i.inmateId === id) ||
                   inmates.find((i) => i.assignedKioskId === id) ||
                   inmates.find((i) => i.prisonerNumber === id);
    if (inmate && !(await inScopeOf(req, inmate))) {
      return sendError(res, 'NOT_FOUND', 'Inmate not found in your kiosk/jail', 404);
    }
    const scoped = inmate ? contacts.filter((c) => (c.inmateId === inmate.inmateId || c.inmateId === `INM-${inmate.inmateId}`) && c.active !== false) : [];
    return sendSuccess(res, scoped);
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
    return sendSuccess(res, scoped);
  }));

  router.post('/admin/prisoners/:prisonerId/contacts', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { prisonerId } = req.params;
    const contactData = req.body;

    // Verify prisoner exists in the admin's scope
    const inmates = await readDb('inmates.json');
    const inmate = inmates.find((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (!inmate) return sendError(res, 'NOT_FOUND', 'Prisoner not found in your kiosk', 404);

    const newContact = {
      contactId: contactData.contactId || `CONT-${uuidv4().substring(0, 8).toUpperCase()}`,
      inmateId: prisonerId,
      name: contactData.name,
      fullName: contactData.name,
      firstName: contactData.firstName || contactData.name?.split(' ')[0] || '',
      lastName: contactData.lastName || contactData.name?.split(' ').slice(1).join(' ') || '',
      mobileNumber: contactData.mobileNumber,
      phoneNumber: contactData.mobileNumber || contactData.phone,
      phone: contactData.phone || contactData.mobileNumber,
      relationship: contactData.relationship || 'family',
      email: contactData.email,
      active: true,
      status: contactData.status || 'active',
      verified: contactData.verified !== undefined ? contactData.verified : true,
      approvalStatus: 'approved',
      verificationStatus: 'verified',
      createdAt: new Date().toISOString()
    };

    await updateDb('contacts.json', (contacts) => ({ data: [...contacts, newContact], result: newContact }));
    return sendSuccess(res, newContact, 201);
  }));

  router.put('/admin/contacts/:contactId', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { contactId } = req.params;
    const updates = req.body;

    const [contacts, inmates] = await Promise.all([readDb('contacts.json'), readDb('inmates.json')]);
    const target = contacts.find((c) => c.contactId === contactId);
    if (!target) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);

    // Resolve owner inmate (try both formats)
    const owner = inmates.find((i) => i.inmateId === target.inmateId) ||
                  inmates.find((i) => `INM-${i.inmateId}` === target.inmateId);
    if (!owner) return sendError(res, 'NOT_FOUND', 'Inmate not found for this contact', 404);

    // Scope check (kiosk admin can only edit their own kiosk's contacts)
    if (!inAdminScope(req, owner)) {
      return sendError(res, 'FORBIDDEN', 'Contact not in your kiosk scope', 403);
    }

    const updated = await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const merged = { ...all[idx], ...updates };
      if (updates.name) { merged.fullName = updates.name; merged.firstName = updates.name.split(' ')[0]; merged.lastName = updates.name.split(' ').slice(1).join(' '); }
      if (updates.mobileNumber) { merged.phoneNumber = updates.mobileNumber; merged.phone = updates.mobileNumber; }
      all[idx] = merged;
      return { data: all, result: all[idx] };
    });

    if (!updated) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    return sendSuccess(res, updated);
  }));

  router.patch('/admin/contacts/:contactId/status', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { contactId } = req.params;
    let { status, active } = req.body;

    // Android sends { active: true/false }, translate to status
    if (active !== undefined && !status) {
      status = active ? 'approved' : 'rejected';
    }

    if (!status) return sendError(res, 'INVALID_REQUEST', 'status or active is required', 400);
    const allowedStatuses = ['pending', 'approved', 'active', 'rejected', 'inactive', 'suspended', 'blocked'];
    if (!allowedStatuses.includes(status)) {
      return sendError(res, 'INVALID_STATUS', `Status must be one of: ${allowedStatuses.join(', ')}`, 400);
    }

    // Normalize status
    const normalizedStatus = status === 'active' ? 'approved' : status === 'inactive' ? 'rejected' : status;
    const isActive = ['approved', 'pending', 'active'].includes(normalizedStatus);

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
      all[idx] = { ...all[idx], status: normalizedStatus, active: isActive, approvalStatus: normalizedStatus };
      return { data: all, result: all[idx] };
    });

    if (!updated) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);
    return sendSuccess(res, updated);
  }));

  router.delete('/admin/contacts/:contactId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
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

    const deleted = await updateDb('contacts.json', (all) => {
      const filtered = all.filter((c) => c.contactId !== contactId);
      return { data: filtered, result: { deleted: true, contactId } };
    });
    return sendSuccess(res, deleted.result);
  }));

  // ==================== ADMIN ALIASES ====================

  // Admin alias for listing all contacts (maps to GET /contacts with admin auth)
  router.get('/admin', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const contacts = await readDb('contacts.json');
    return sendSuccess(res, contacts.filter(adminScopeFilter(req)));
  }));

  // Admin alias for getting a single contact by contactId
  router.get('/admin/:contactId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { contactId } = req.params;
    const contacts = await readDb('contacts.json');
    const target = contacts.find((c) => c.contactId === contactId);
    if (!target) return sendError(res, 'NOT_FOUND', 'Contact not found', 404);

    const inmates = await readDb('inmates.json');
    const owner = inmates.find((i) => i.inmateId === target.inmateId) ||
                  inmates.find((i) => `INM-${i.inmateId}` === target.inmateId);
    if (!owner) return sendError(res, 'NOT_FOUND', 'Inmate not found for this contact', 404);
    if (!inAdminScope(req, owner)) {
      return sendError(res, 'FORBIDDEN', 'Contact not in your kiosk scope', 403);
    }
    return sendSuccess(res, target);
  }));

  return router;
}

module.exports = createContactsRouter;
