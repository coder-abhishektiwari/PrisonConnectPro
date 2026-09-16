const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { readDb, updateDb } = require('./lib/db');
const { hashSecret } = require('./lib/auth');
const { requireRole } = require('./middleware/auth');
const { inAdminScope, adminScopeFilter, jailScopeOf, kioskScopeOf } = require('./lib/scoping');
const { paginate } = require('./lib/paginate');

const ALL_ROLES = ['admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'];
const ADMIN_ROLES = ['admin', 'warden', 'super-admin', 'super_admin'];

function normalizeContact(c) {
  if (!c) return c;
  const out = { ...c };
  if (!out.name && out.fullName) out.name = out.fullName;
  delete out.fullName;
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
  const record = {
    ...inmateData,
    inmateId: inmateData.inmateId || `INM-${uuidv4().substring(0, 8).toUpperCase()}`,
    prisonId: jailId || inmateData.prisonId,
    facility: jailId || inmateData.facility,
    assignedKioskId: kioskId || inmateData.assignedKioskId,
    status: inmateData.status || 'active',
    biometricData: inmateData.biometricData || {
      faceRegistered: false, faceEmbedding: null,
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
  return res.status(201).json({ success: true, data: normalizeInmate(updated.result) });
});

router.put('/prisoners/:prisonerId', requireRole(...ALL_ROLES), async (req, res) => {
  const updates = { ...req.body };
  delete updates.inmateId; delete updates.createdAt;
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
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_PIN', message: 'PIN must be exactly 4 digits' } });
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
  const deleted = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    const [removed] = inmates.splice(idx, 1);
    return { data: inmates, result: removed };
  });
  if (!deleted) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: { message: 'Prisoner deleted', prisonerId: req.params.prisonerId } });
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
  if (!inmates.find((i) => i.inmateId === req.params.prisonerId && inAdminScope(req, i))) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  }
  const contactData = req.body;
  const newContact = {
    contactId: contactData.contactId || `CONT-${uuidv4().substring(0, 8).toUpperCase()}`,
    inmateId: req.params.prisonerId,
    ...contactData,
    status: 'approved',
    active: true,
    approvalStatus: 'approved',
    createdAt: new Date().toISOString()
  };
  const updated = await updateDb('contacts.json', (contacts) => ({ data: [...contacts, newContact], result: newContact }));
  return res.status(201).json({ success: true, data: normalizeContact(updated.result) });
});

// ==================== CONTACT CRUD (direct contactId) ====================

router.put('/contacts/:contactId', requireRole(...ALL_ROLES), async (req, res) => {
  const { contactId } = req.params;
  const updates = { ...req.body };
  delete updates.contactId; delete updates.createdAt;
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
    const merged = { ...ct[idx], ...updates };
    if (updates.name) { merged.firstName = updates.name.split(' ')[0]; merged.lastName = updates.name.split(' ').slice(1).join(' '); }
    if (updates.mobileNumber) { merged.phoneNumber = updates.mobileNumber; merged.phone = updates.mobileNumber; }
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
    biometricData.faceRegistered ? { biometricId: `BIO-${prisonerId}-FACE`, prisonerId, type: 'face', status: 'registered', registeredAt: biometricData.lastBiometricUpdate } : null,
    biometricData.fingerprintRegistered ? { biometricId: `BIO-${prisonerId}-FGP`, prisonerId, type: 'fingerprint', status: 'registered', registeredAt: biometricData.lastBiometricUpdate } : null,
    biometricData.rfidRegistered ? { biometricId: `BIO-${prisonerId}-RFID`, prisonerId, type: 'rfid', status: 'registered', registeredAt: biometricData.lastBiometricUpdate } : null,
  ].filter(Boolean);
  return res.json({ success: true, data: result });
});

router.post('/prisoners/:prisonerId/biometrics', requireRole(...ALL_ROLES), async (req, res) => {
  const { prisonerId } = req.params;
  const { type, image, capture, rfidToken } = req.body;

  if (!['face', 'fingerprint', 'rfid'].includes(type)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'type must be face, fingerprint, or rfid' } });
  }

  const inmates = await readDb('inmates.json');
  const inmateIdx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
  if (inmateIdx === -1) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });

  let updateFields = {};
  let biometricRecord = null;

  if (type === 'face') {
    if (!image) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'image (base64) is required for face registration' } });

    let imageBase64 = image;
    if (imageBase64.startsWith('data:image')) imageBase64 = imageBase64.split(',')[1];
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    try {
      const { detectAndEmbed, isLive } = require('./lib/faceRecognition');
      const probeResult = await detectAndEmbed(imageBuffer);

      const livenessThreshold = parseFloat(process.env.FACE_LIVENESS_THRESHOLD || '0.5');
      if (!isLive(probeResult.liveness, probeResult.antispoof, livenessThreshold)) {
        return res.status(403).json({ success: false, error: { code: 'LIVENESS_FAILED', message: 'Liveness check failed' } });
      }

      updateFields = {
        biometricData: {
          ...inmates[inmateIdx].biometricData,
          faceRegistered: true,
          faceEmbedding: probeResult.embedding,
          faceLiveness: probeResult.liveness,
          faceAntispoof: probeResult.antispoof,
          lastBiometricUpdate: new Date().toISOString()
        }
      };
      biometricRecord = { biometricId: `BIO-${Date.now()}-FACE`, prisonerId, type: 'face', status: 'registered', registeredAt: new Date().toISOString() };
    } catch (err) {
      if (err.message === 'NO_FACE_DETECTED') return res.status(400).json({ success: false, error: { code: 'NO_FACE', message: 'No face detected' } });
      if (err.message === 'MULTIPLE_FACES_DETECTED') return res.status(400).json({ success: false, error: { code: 'MULTIPLE_FACES', message: 'Multiple faces detected' } });
      console.error('[biometric-register] error:', err.message);
      return res.status(500).json({ success: false, error: { code: 'FACE_REG_ERROR', message: 'Face registration failed' } });
    }
  } else if (type === 'fingerprint') {
    if (!capture) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'capture is required for fingerprint' } });
    updateFields = {
      biometricData: { ...inmates[inmateIdx].biometricData, fingerprintRegistered: true, fingerprintTemplate: capture, lastBiometricUpdate: new Date().toISOString() }
    };
    biometricRecord = { biometricId: `BIO-${Date.now()}-FGP`, prisonerId, type: 'fingerprint', status: 'registered', registeredAt: new Date().toISOString() };
  } else if (type === 'rfid') {
    if (!rfidToken) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'rfidToken is required for RFID' } });
    updateFields = {
      biometricData: { ...inmates[inmateIdx].biometricData, rfidRegistered: true, rfidToken, lastBiometricUpdate: new Date().toISOString() }
    };
    biometricRecord = { biometricId: `BIO-${Date.now()}-RFID`, prisonerId, type: 'rfid', status: 'registered', registeredAt: new Date().toISOString() };
  }

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updateFields };
    const existingBiometrics = inmates[idx].biometrics || [];
    inmates[idx].biometrics = [...existingBiometrics, biometricRecord];
    return { data: inmates, result: inmates[idx] };
  });

  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: { biometricId: biometricRecord.biometricId, type, status: 'registered' } });
});

router.delete('/biometrics/:biometricId', requireRole(...ALL_ROLES), async (req, res) => {
  const { biometricId } = req.params;
  const parts = biometricId.split('-');
  if (parts.length < 3) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid biometric ID' } });
  const type = parts[parts.length - 1].toLowerCase();
  const prisonerId = req.query.prisonerId || req.body.prisonerId;
  if (!prisonerId) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'prisonerId is required' } });

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId && inAdminScope(req, i));
    if (idx === -1) return { data: inmates, result: null };
    const biometricData = { ...inmates[idx].biometricData };
    if (type === 'face') { biometricData.faceRegistered = false; biometricData.faceEmbedding = null; }
    else if (type === 'fingerprint') { biometricData.fingerprintRegistered = false; biometricData.fingerprintTemplate = null; }
    else if (type === 'rfid') { biometricData.rfidRegistered = false; biometricData.rfidToken = null; }
    else return { data: inmates, result: null };
    biometricData.lastBiometricUpdate = new Date().toISOString();
    inmates[idx] = { ...inmates[idx], biometricData };
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
  return res.status(201).json({ success: true, data: updated.result });
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
  return res.json({ success: true, data: updated.result });
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
