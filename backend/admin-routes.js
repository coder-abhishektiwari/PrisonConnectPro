const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { readDb, updateDb } = require('./lib/db');
const { hashSecret } = require('./lib/auth');
const { requireRole } = require('./middleware/auth');
const { inAdminScope, adminScopeFilter, jailScopeOf, kioskScopeOf } = require('./lib/scoping');
const { paginate } = require('./lib/paginate');
const { inmateDeleteHandler, validateInmateRefs } = require('./routes/inmates');

const ALL_ROLES = ['admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'];
const ADMIN_ROLES = ['admin', 'warden', 'super-admin', 'super_admin'];

function normalizeContact(c) {
  if (!c) return c;
  const out = { ...c };
  if (!out.name && out.fullName) out.name = out.fullName;
  delete out.fullName;
  const phone = out.mobileNumber || out.phoneNumber || out.phone;
  if (phone) {
    if (!out.mobileNumber) out.mobileNumber = phone;
    if (!out.phoneNumber) out.phoneNumber = phone;
    if (!out.phone) out.phone = phone;
  }
  return out;
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

// ==================== PRISONER ROUTES (must be before /:adminId) ====================

router.get('/prisoners', requireRole(...ALL_ROLES), async (req, res) => {
  const inmates = await readDb('inmates.json');
  const scoped = inmates.filter(adminScopeFilter(req)).map(normalizeInmate);
  const result = await paginate({
    req, data: scoped,
    search: (i, q) =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.inmateId || '').toLowerCase().includes(q) ||
      (i.facility || '').toLowerCase().includes(q),
    searchFields: [],
    defaultSort: 'name',
  });
  return res.json({ success: true, data: result.items });
});

router.get('/prisoners/:prisonerId', requireRole(...ALL_ROLES), async (req, res) => {
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i));
  if (!inmate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: normalizeInmate(inmate) });
});

router.post('/prisoners', requireRole(...ALL_ROLES), async (req, res) => {
  const inmateData = req.body;
  const jailId = jailScopeOf(req);
  const kioskId = kioskScopeOf(req);
  if (jailId && inmateData.prisonId && inmateData.prisonId !== jailId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create prisoner outside your jail' } });
  }
  if (kioskId && inmateData.assignedKioskId && inmateData.assignedKioskId !== kioskId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create prisoner for another kiosk' } });
  }
  const refs = await validateInmateRefs({
    prisonId: jailId || inmateData.prisonId,
    assignedKioskId: kioskId || inmateData.assignedKioskId,
    cellId: inmateData.cellId,
    blockId: inmateData.blockId,
  });
  if (!refs.ok) {
    return res.status(422).json({ success: false, error: { code: 'INVALID_REFERENCE', message: refs.message } });
  }
  const record = {
    ...inmateData,
    inmateId: inmateData.inmateId || `INM-${uuidv4().substring(0, 8).toUpperCase()}`,
    prisonId: jailId || inmateData.prisonId,
    facility: jailId || inmateData.facility,
    assignedKioskId: kioskId || inmateData.assignedKioskId,
    status: inmateData.status || 'active',
    dateOfAdmission: inmateData.dateOfAdmission || new Date().toISOString().slice(0, 10),
    biometricData: inmateData.biometricData || {
      fingerprintRegistered: false, rfidRegistered: false, lastBiometricUpdate: null
    },
    createdAt: new Date().toISOString()
  };
  if (record.pin && !/^\$2[aby]\$/.test(record.pin)) {
    record.pin = await hashSecret(String(record.pin));
  }
  if (record.name) {
    record.firstName = record.name.split(' ')[0];
    record.lastName = record.name.split(' ').slice(1).join(' ');
  }
  const updated = await updateDb('inmates.json', (inmates) => ({ data: [...inmates, record], result: record }));
  return res.status(201).json({ success: true, data: normalizeInmate(updated) });
});

router.put('/prisoners/:prisonerId', requireRole(...ALL_ROLES), async (req, res) => {
  const updates = { ...req.body };
  delete updates.inmateId; delete updates.createdAt;
  // A prisoner's jail never changes through an edit — same rule as the
  // /inmates handler, and prison_id is a foreign key.
  delete updates.prisonId;
  const refs = await validateInmateRefs({
    assignedKioskId: updates.assignedKioskId,
    cellId: updates.cellId,
    blockId: updates.blockId,
  });
  if (!refs.ok) {
    return res.status(422).json({ success: false, error: { code: 'INVALID_REFERENCE', message: refs.message } });
  }
  if (updates.name) {
    updates.firstName = updates.name.split(' ')[0];
    updates.lastName = updates.name.split(' ').slice(1).join(' ');
  }
  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updates };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: normalizeInmate(updated) });
});

router.post('/prisoners/:prisonerId/reset-pin', requireRole(...ALL_ROLES), async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{6}$/.test(String(pin))) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_PIN', message: 'PIN must be exactly 6 digits' } });
  }
  const hashedPin = await hashSecret(String(pin));
  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], pin: hashedPin };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: { message: 'PIN reset successfully' } });
});

router.patch('/prisoners/:prisonerId/status', requireRole(...ALL_ROLES), async (req, res) => {
  const { prisonerId } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'status is required' } });
  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], status };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: updated });
});

router.delete('/prisoners/:prisonerId', requireRole(...ALL_ROLES), async (req, res) => {
  // Delegate to the guarded handler behind /inmates: it refuses while a call
  // is live, archives the money and call trail, and clears bookings and rooms
  // before the row goes away.
  return inmateDeleteHandler(req, res);
});

// ==================== PRISONER CONTACTS (via prisoner) ====================

router.get('/prisoners/:prisonerId/contacts', requireRole(...ALL_ROLES), async (req, res) => {
  const inmates = await readDb('inmates.json');
  if (!inmates.find((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i))) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  }
  const contacts = await readDb('contacts.json');
  return res.json({ success: true, data: contacts.filter((c) => c.inmateId === req.params.prisonerId).map(normalizeContact) });
});

router.post('/prisoners/:prisonerId/contacts', requireRole(...ALL_ROLES), async (req, res) => {
  const inmates = await readDb('inmates.json');
  const owner = inmates.find((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i));
  if (!owner) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  }
  const contactData = req.body || {};
  // The client payload comes first: contactId and inmateId are the primary key
  // and a foreign key, so they are server-owned and must not be overridable.
  const newContact = {
    ...contactData,
    contactId: contactData.contactId || `CONT-${uuidv4().substring(0, 8).toUpperCase()}`,
    inmateId: req.params.prisonerId,
    // The jail a contact belongs to follows its prisoner.
    prisonId: owner.prisonId || null,
    status: 'approved',
    active: true,
    approvalStatus: 'approved',
    createdAt: new Date().toISOString()
  };
  const existing = await readDb('contacts.json');
  if (existing.some((c) => c.contactId === newContact.contactId)) {
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'A contact with this ID already exists' } });
  }
  const updated = await updateDb('contacts.json', (contacts) => ({ data: [...contacts, newContact], result: newContact }));
  return res.status(201).json({ success: true, data: normalizeContact(updated) });
});

// ==================== CONTACT CRUD (direct contactId) ====================

router.put('/contacts/:contactId', requireRole(...ALL_ROLES), async (req, res) => {
  const { contactId } = req.params;
  const updates = { ...req.body };
  delete updates.contactId; delete updates.createdAt;
  const inmates = await readDb('inmates.json');
  const contacts = await readDb('contacts.json');
  const contact = contacts.find((c) => c.contactId === contactId);
  let owner = null;
  if (contact) {
    owner = inmates.find((i) => i.inmateId === contact.inmateId);
    if (owner && !inAdminScope(req, owner)) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
    }
  }
  const updated = await updateDb('contacts.json', (ct) => {
    const idx = ct.findIndex((c) => c.contactId === contactId);
    if (idx === -1) return { data: ct, result: null };
    const merged = { ...ct[idx], ...updates };
    if (updates.name) { merged.firstName = updates.name.split(' ')[0]; merged.lastName = updates.name.split(' ').slice(1).join(' '); }
    // Keep the three phone aliases in sync — the edit form posts phoneNumber
    // while older kiosk records only carry mobileNumber, so a one-way sync
    // would leave readers disagreeing about which number is current.
    const newPhone = updates.phoneNumber || updates.phone || updates.mobileNumber;
    if (newPhone) { merged.phoneNumber = newPhone; merged.phone = newPhone; merged.mobileNumber = newPhone; }
    // Pointers stay put: a payload must never re-parent a contact or point it
    // at a jail/prisoner that does not exist (both are foreign keys).
    merged.contactId = ct[idx].contactId;
    merged.inmateId = ct[idx].inmateId;
    merged.prisonId = ct[idx].prisonId || (owner && owner.prisonId) || null;
    ct[idx] = merged;
    return { data: ct, result: ct[idx] };
  });
  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
  return res.json({ success: true, data: normalizeContact(updated) });
});

router.patch('/contacts/:contactId/status', requireRole(...ALL_ROLES), async (req, res) => {
  const { contactId } = req.params;
  let { status, active } = req.body;

  // Android sends { active: true/false }, translate to status
  if (active !== undefined && !status) {
    status = active ? 'approved' : 'rejected';
  }

  if (!status) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'status or active is required' } });
  const allowedStatuses = ['pending', 'approved', 'active', 'rejected', 'inactive', 'suspended', 'blocked'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: `Status must be one of: ${allowedStatuses.join(', ')}` } });
  }

  // Normalize status: active → approved, inactive → rejected
  const normalizedStatus = status === 'active' ? 'approved' : status === 'inactive' ? 'rejected' : status;
  const isActive = ['approved', 'pending', 'active'].includes(normalizedStatus);

  const inmates = await readDb('inmates.json');
  const contacts = await readDb('contacts.json');
  const contact = contacts.find((c) => c.contactId === contactId);
  if (contact) {
    const inmate = inmates.find((i) => i.inmateId === contact.inmateId);
    if (inmate && !inAdminScope(req, inmate)) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
    }
  }
  const updated = await updateDb('contacts.json', (ct) => {
    const idx = ct.findIndex((c) => c.contactId === contactId);
    if (idx === -1) return { data: ct, result: null };
    ct[idx] = { ...ct[idx], status: normalizedStatus, active: isActive, approvalStatus: normalizedStatus };
    return { data: ct, result: ct[idx] };
  });
  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
  return res.json({ success: true, data: normalizeContact(updated) });
});

router.delete('/contacts/:contactId', requireRole(...ALL_ROLES), async (req, res) => {
  const { contactId } = req.params;
  const inmates = await readDb('inmates.json');
  const contacts = await readDb('contacts.json');
  const contact = contacts.find((c) => c.contactId === contactId);
  if (contact) {
    const inmate = inmates.find((i) => i.inmateId === contact.inmateId);
    if (inmate && !inAdminScope(req, inmate)) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
    }
  }
  const deleted = await updateDb('contacts.json', (ct) => {
    const idx = ct.findIndex((c) => c.contactId === contactId);
    if (idx === -1) return { data: ct, result: null };
    const [removed] = ct.splice(idx, 1);
    return { data: ct, result: removed };
  });
  if (!deleted) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
  return res.json({ success: true, data: { message: 'Contact deleted', contactId } });
});

// ==================== DEVICES ====================

router.get('/devices', requireRole(...ALL_ROLES), async (req, res) => {
  const devices = await readDb('devices.json');
  const result = await paginate({
    req, data: devices,
    search: (d, q) =>
      (d.deviceId || '').toLowerCase().includes(q) ||
      (d.name || '').toLowerCase().includes(q) ||
      (d.location || '').toLowerCase().includes(q),
    searchFields: [],
    defaultSort: 'deviceId',
  });
  return res.json({ success: true, data: result.items });
});

router.get('/devices/:deviceId', requireRole(...ALL_ROLES), async (req, res) => {
  const devices = await readDb('devices.json');
  const device = devices.find((d) => d.deviceId === req.params.deviceId);
  if (!device) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
  return res.json({ success: true, data: device });
});

// ==================== BIOMETRICS ====================

router.get('/prisoners/:prisonerId/biometrics', requireRole(...ALL_ROLES), async (req, res) => {
  const { prisonerId } = req.params;
  const inmates = await readDb('inmates.json');
  const inmate = inmates.find((i) => i.inmateId === prisonerId && inAdminScope(req, i));
  if (!inmate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  const biometricData = inmate.biometricData || {};
  const biometricsList = inmate.biometrics || [];
  const result = biometricsList.length > 0 ? biometricsList : [
    biometricData.fingerprintRegistered ? { biometricId: `BIO-${prisonerId}-FGP`, prisonerId, type: 'fingerprint', status: 'registered', registeredAt: biometricData.lastBiometricUpdate } : null,
    biometricData.rfidRegistered ? { biometricId: `BIO-${prisonerId}-RFID`, prisonerId, type: 'rfid', status: 'registered', registeredAt: biometricData.lastBiometricUpdate } : null,
  ].filter(Boolean);
  return res.json({ success: true, data: result });
});

router.post('/prisoners/:prisonerId/biometrics', requireRole(...ALL_ROLES), async (req, res) => {
  const { prisonerId } = req.params;
  const { type, capture, rfidToken } = req.body;

  if (!['fingerprint', 'rfid'].includes(type)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'type must be fingerprint or rfid' } });
  }

  const inmates = await readDb('inmates.json');
  const inmateIdx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
  if (inmateIdx === -1) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });

  let updateFields = {};
  let biometricRecord = null;

  if (type === 'fingerprint') {
    if (!capture) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'capture is required for fingerprint' } });
    updateFields = {
      biometricData: { ...inmates[inmateIdx].biometricData, fingerprintRegistered: true, fingerprintTemplate: capture, lastBiometricUpdate: new Date().toISOString() }
    };
    biometricRecord = { biometricId: `BIO-${prisonerId}-FGP`, prisonerId, type: 'fingerprint', status: 'registered', registeredAt: new Date().toISOString() };
  } else if (type === 'rfid') {
    if (!rfidToken) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'rfidToken is required for RFID' } });
    updateFields = {
      biometricData: { ...inmates[inmateIdx].biometricData, rfidRegistered: true, rfidToken, lastBiometricUpdate: new Date().toISOString() }
    };
    biometricRecord = { biometricId: `BIO-${prisonerId}-RFID`, prisonerId, type: 'rfid', status: 'registered', registeredAt: new Date().toISOString() };
  }

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updateFields };
    const existingBiometrics = inmates[idx].biometrics || [];
    const withoutType = existingBiometrics.filter(b => b.type !== type);
    inmates[idx].biometrics = [...withoutType, biometricRecord];
    return { data: inmates, result: inmates[idx] };
  });

  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: { biometricId: biometricRecord.biometricId, type, status: 'registered' } });
});

// Type suffixes actually used by the ID convention BIO-<prisonerId>-<SUFFIX>.
// Fingerprint's suffix is FGP (not the word "fingerprint"), so an ID parse
// alone used to reject the only biometric people delete most often.
const BIOMETRIC_TYPES = ['fingerprint', 'rfid'];
const TYPE_FROM_SUFFIX = {
  fingerprint: 'fingerprint',
  fgp: 'fingerprint',
  finger: 'fingerprint',
  rfid: 'rfid',
  tag: 'rfid'
};

/**
 * Resolve the biometric type for an ID. Prefers the record's own `type`
 * field (authoritative) and only falls back to the ID suffix, because IDs
 * may be synthesized (BIO-<prisonerId>-FGP) when no record is stored.
 */
function resolveBiometricType(inmate, biometricId) {
  const record = (inmate.biometrics || []).find((b) => b.biometricId === biometricId);
  if (record && BIOMETRIC_TYPES.includes(record.type)) return record.type;
  const suffix = String(biometricId).split('-').pop().toLowerCase();
  return TYPE_FROM_SUFFIX[suffix] || null;
}

router.delete('/biometrics/:biometricId', requireRole(...ALL_ROLES), async (req, res) => {
  const { biometricId } = req.params;
  const prisonerId = req.query.prisonerId;
  if (!prisonerId) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'prisonerId query param is required' } });

  // Resolve first so an unrecognised id or an out-of-scope prisoner never
  // reaches the write.
  const current = await readDb('inmates.json');
  const inmate = current.find((i) => i.inmateId === prisonerId && inAdminScope(req, i));
  if (!inmate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  const type = resolveBiometricType(inmate, biometricId);
  if (!type) return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'Invalid biometric type in ID' } });

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    const biometricData = { ...(inmates[idx].biometricData || {}) };
    if (type === 'fingerprint') { biometricData.fingerprintRegistered = false; biometricData.fingerprintTemplate = null; }
    else if (type === 'rfid') { biometricData.rfidRegistered = false; biometricData.rfidToken = null; }
    biometricData.lastBiometricUpdate = new Date().toISOString();
    // Drop by id AND by type: one record per type is allowed, so a stale or
    // differently-formatted id must not leave the biometric behind.
    const biometrics = (inmates[idx].biometrics || []).filter(b => b.biometricId !== biometricId && b.type !== type);
    inmates[idx] = { ...inmates[idx], biometricData, biometrics };
    return { data: inmates, result: inmates[idx] };
  });
  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: { message: 'Biometric deleted', biometricId, prisonerId } });
});

// ==================== ADMIN CRUD (must be LAST — catch-all /:adminId) ====================

router.get('/', requireRole('super-admin', 'super_admin'), async (req, res) => {
  const admins = await readDb('admins.json');
  return res.json({ success: true, data: admins });
});

router.get('/:adminId', requireRole('super-admin', 'super_admin'), async (req, res) => {
  const admins = await readDb('admins.json');
  const admin = admins.find((a) => a.adminId === req.params.adminId);
  if (!admin) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Admin not found' } });
  const { password, pin, ...safe } = admin;
  return res.json({ success: true, data: safe });
});

router.post('/', requireRole('super-admin', 'super_admin'), async (req, res) => {
  const adminData = req.body;
  const record = {
    adminId: adminData.adminId || `ADMIN-${Date.now().toString(36).toUpperCase()}`,
    ...adminData,
    status: adminData.status || 'active',
    createdAt: new Date().toISOString()
  };
  if (record.pin && !/^\$2[aby]\$/.test(record.pin)) record.pin = await hashSecret(String(record.pin));
  if (record.password && !/^\$2[aby]\$/.test(record.password)) record.password = await hashSecret(String(record.password));
  const updated = await updateDb('admins.json', (all) => ({ data: [...all, record], result: record }));
  return res.status(201).json({ success: true, data: updated });
});

router.patch('/:adminId', requireRole('super-admin', 'super_admin'), async (req, res) => {
  const { adminId } = req.params;
  const updates = { ...req.body };
  if (updates.pin && !/^\$2[aby]\$/.test(updates.pin)) updates.pin = await hashSecret(String(updates.pin));
  if (updates.password && !/^\$2[aby]\$/.test(updates.password)) updates.password = await hashSecret(String(updates.password));
  const updated = await updateDb('admins.json', (all) => {
    const idx = all.findIndex((a) => a.adminId === adminId);
    if (idx === -1) return { data: all, result: null };
    all[idx] = { ...all[idx], ...updates };
    return { data: all, result: all[idx] };
  });
  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Admin not found' } });
  return res.json({ success: true, data: updated });
});

router.delete('/:adminId', requireRole('super-admin', 'super_admin'), async (req, res) => {
  const { adminId } = req.params;
  const deleted = await updateDb('admins.json', (all) => {
    const idx = all.findIndex((a) => a.adminId === adminId);
    if (idx === -1) return { data: all, result: null };
    const [removed] = all.splice(idx, 1);
    return { data: all, result: removed };
  });
  if (!deleted) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Admin not found' } });
  return res.json({ success: true, data: { message: 'Admin deleted', adminId } });
});

module.exports = { router };
