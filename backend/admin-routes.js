const express = require('express');
const router = express.Router();
const { readDb, updateDb } = require('./lib/db');
const { hashSecret } = require('./lib/auth');
const { requireRole } = require('./middleware/auth');

// Admin CRUD — restricted to super-admins only.
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
  if (record.pin && !/^\$2[aby]\$/.test(record.pin)) {
    record.pin = await hashSecret(String(record.pin));
  }
  if (record.password && !/^\$2[aby]\$/.test(record.password)) {
    record.password = await hashSecret(String(record.password));
  }
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

// Biometric registration for prisoners (real face embedding + fingerprint/RFID)
router.post('/prisoners/:prisonerId/biometrics', requireRole('super-admin', 'super_admin', 'admin', 'warden'), async (req, res) => {
  const { prisonerId } = req.params;
  const { type, image, capture, rfidToken } = req.body;

  if (!['face', 'fingerprint', 'rfid'].includes(type)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'type must be face, fingerprint, or rfid' } });
  }

  const inmates = await readDb('inmates.json');
  const inmateIdx = inmates.findIndex((i) => i.inmateId === prisonerId);
  if (inmateIdx === -1) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });

  let updateFields = {};
  let biometricRecord = null;

  if (type === 'face') {
    if (!image) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'image (base64) is required for face registration' } });

    let imageBase64 = image;
    if (imageBase64.startsWith('data:image')) imageBase64 = imageBase64.split(',')[1];
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    try {
      const { detectAndEmbed, isLive } = require('../lib/faceRecognition');
      const probeResult = await detectAndEmbed(imageBuffer);

      // Liveness check during registration - reject spoofed faces
      const livenessThreshold = parseFloat(process.env.FACE_LIVENESS_THRESHOLD || '0.5');
      if (!isLive(probeResult.liveness, probeResult.antispoof, livenessThreshold)) {
        return res.status(403).json({ success: false, error: { code: 'LIVENESS_FAILED', message: 'Liveness check failed - possible spoof attempt' } });
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
      if (err.message === 'NO_FACE_DETECTED') return res.status(400).json({ success: false, error: { code: 'NO_FACE', message: 'No face detected in image' } });
      if (err.message === 'MULTIPLE_FACES_DETECTED') return res.status(400).json({ success: false, error: { code: 'MULTIPLE_FACES', message: 'Multiple faces detected in image' } });
      console.error('[biometric-register] error:', err.message);
      return res.status(500).json({ success: false, error: { code: 'FACE_REGISTRATION_ERROR', message: 'Face registration failed' } });
    }
  } else if (type === 'fingerprint') {
    if (!capture) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'capture (base64) is required for fingerprint registration' } });
    updateFields = {
      biometricData: {
        ...inmates[inmateIdx].biometricData,
        fingerprintRegistered: true,
        fingerprintTemplate: capture,
        lastBiometricUpdate: new Date().toISOString()
      }
    };
    biometricRecord = { biometricId: `BIO-${Date.now()}-FGP`, prisonerId, type: 'fingerprint', status: 'registered', registeredAt: new Date().toISOString() };
  } else if (type === 'rfid') {
    if (!rfidToken) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'rfidToken is required for RFID registration' } });
    updateFields = {
      biometricData: {
        ...inmates[inmateIdx].biometricData,
        rfidRegistered: true,
        rfidToken,
        lastBiometricUpdate: new Date().toISOString()
      }
    };
    biometricRecord = { biometricId: `BIO-${Date.now()}-RFID`, prisonerId, type: 'rfid', status: 'registered', registeredAt: new Date().toISOString() };
  }

  const updated = await updateDb('inmates.json', (inmates) => {
    const idx = inmates.findIndex((i) => i.inmateId === prisonerId);
    if (idx === -1) return { data: inmates, result: null };
    inmates[idx] = { ...inmates[idx], ...updateFields };
    const existingBiometrics = inmates[idx].biometrics || [];
    inmates[idx].biometrics = [...existingBiometrics, biometricRecord];
    return { data: inmates, result: inmates[idx] };
  });

  if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prisoner not found' } });
  return res.json({ success: true, data: { biometricId: biometricRecord.biometricId, type, status: 'registered' } });
});

module.exports = { router };
