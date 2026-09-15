const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { hashSecret, verifySecret } = require('../lib/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { jailScopeOf, inAdminScope, adminScopeFilter, inScopeOf, scopeList } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');

const router = express.Router();

// ==================== KIOSK VERIFICATION (public — pre-auth) ====================

router.post('/verify', asyncRoute(async (req, res) => {
  const { deviceSerialNumber } = req.body;
  if (!deviceSerialNumber) return sendError(res, 'INVALID_REQUEST', 'Device serial number is required', 400);

  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) =>
    k.deviceSerialNumber === deviceSerialNumber ||
    k.kioskId === deviceSerialNumber ||
    k.deviceFingerprint === deviceSerialNumber
  );
  if (!kiosk) return sendSuccess(res, { success: true, authorized: false, kiosk: null });

  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === kiosk.prisonId);

  const authorized = !!(
    prison && prison.status === 'active' &&
    kiosk.authorizationStatus === 'authorized' &&
    kiosk.status !== 'disabled' && kiosk.status !== 'unauthorized'
  );

  if (!authorized) return sendSuccess(res, { success: true, authorized: false, kiosk: null });

  return sendSuccess(res, {
    success: true,
    authorized: true,
    kiosk: {
      kioskId: kiosk.kioskId,
      deviceSerialNumber: kiosk.deviceSerialNumber,
      prisonId: kiosk.prisonId,
      prisonName: prison.name,
      status: kiosk.status,
      authorized: true,
      location: kiosk.location,
      ipAddress: kiosk.ipAddress
    }
  });
}));

// ==================== KIOSK REGISTRATION (public — after PIN validation) ====================

router.post('/register', asyncRoute(async (req, res) => {
  const { 
    deviceSerialNumber, 
    prisonId, 
    deviceModel, 
    deviceBrand, 
    ipAddress, 
    location, 
    androidVersion, 
    appVersion,
    deviceFingerprint 
  } = req.body;
  
  if (!deviceSerialNumber || !prisonId) {
    return sendError(res, 'INVALID_REQUEST', 'deviceSerialNumber and prisonId are required', 400);
  }
  
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  if (!prison) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  
  const kiosks = await readDb('kiosks.json');
  
  // Check if kiosk already exists
  const existingKiosk = kiosks.find((k) => k.deviceSerialNumber === deviceSerialNumber);
  if (existingKiosk) {
    // Re-registering a previously rejected/disabled device queues a fresh approval
    const needsReapproval =
      existingKiosk.authorizationStatus !== 'authorized' ||
      existingKiosk.status === 'disabled' ||
      existingKiosk.status === 'unauthorized';
    // Update existing kiosk
    const updated = await updateDb('kiosks.json', (kiosks) => {
      const idx = kiosks.findIndex((k) => k.deviceSerialNumber === deviceSerialNumber);
      if (idx === -1) return { data: kiosks, result: null };
      
      kiosks[idx] = {
        ...kiosks[idx],
        ...(needsReapproval
          ? { status: 'pending', authorizationStatus: 'pending', reviewedBy: null, reviewedAt: null }
          : {}),
        ipAddress: ipAddress || kiosks[idx].ipAddress,
        location: location || kiosks[idx].location,
        firmwareVersion: appVersion || kiosks[idx].firmwareVersion,
        lastSeen: new Date().toISOString(),
        deviceFingerprint: deviceFingerprint || kiosks[idx].deviceFingerprint,
        prisonName: prison.name
      };
      return { data: kiosks, result: kiosks[idx] };
    });
    
    return sendSuccess(res, {
      success: true,
      kiosk: updated,
      requestId: updated.kioskId,
      kioskId: updated.kioskId,
      status: needsReapproval ? 'pending' : (updated.status || updated.authorizationStatus || 'pending'),
      message: needsReapproval ? 'Kiosk re-registered for approval' : 'Kiosk updated successfully'
    });
  }
  
  // Create new kiosk registration request
  const newKiosk = {
    kioskId: `KIOSK-${Date.now().toString(36).toUpperCase()}`,
    deviceSerialNumber,
    prisonId,
    prisonName: prison.name,
    status: 'pending',
    authorizationStatus: 'pending',
    location: location || 'Unknown',
    ipAddress: ipAddress || 'Unknown',
    firmwareVersion: appVersion || 'Unknown',
    lastSeen: new Date().toISOString(),
    hardware: {
      model: deviceModel || 'Unknown',
      manufacturer: deviceBrand || 'Unknown',
      serialNumber: deviceSerialNumber,
      screenSize: 'Unknown',
      touchScreen: true,
      processor: 'Unknown',
      ram: 'Unknown',
      storage: 'Unknown'
    },
    camera: { status: 'unknown', resolution: 'Unknown', lastTested: null },
    microphone: { status: 'unknown', sensitivity: 'unknown', lastTested: null },
    speaker: { status: 'unknown', volume: 0, lastTested: null },
    printer: { status: 'unknown', paperLevel: 0, lastTested: null },
    network: { status: 'unknown', type: 'unknown', signalStrength: 0, bandwidth: '0Mbps' },
    installationDate: null,
    lastMaintenance: null,
    assignedBlock: null,
    assignedCellArea: null,
    deviceFingerprint: deviceFingerprint || 'Unknown',
    createdAt: new Date().toISOString()
  };
  
  const created = await updateDb('kiosks.json', (kiosks) => {
    kiosks.push(newKiosk);
    return { data: kiosks, result: newKiosk };
  });
  
  return sendSuccess(res, {
    success: true,
    kiosk: newKiosk,
    requestId: newKiosk.kioskId,
    kioskId: newKiosk.kioskId,
    status: newKiosk.status,
    message: 'Kiosk registration request submitted successfully'
  }, 201);
}));

// ==================== KIOSK REGISTRATION REQUESTS ====================

// Public endpoint used by kiosk devices to check registration status by serial number
router.get('/registration-status/:serialNumber', asyncRoute(async (req, res) => {
  const serial = req.params.serialNumber;
  // Check existing kiosks first
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.deviceSerialNumber === serial || k.kioskId === serial);
  if (kiosk) {
    const mappedStatus = kiosk.authorizationStatus === 'authorized'
      ? 'approved'
      : kiosk.authorizationStatus === 'unauthorized'
        ? 'rejected'
        : (kiosk.authorizationStatus || 'pending');
    return sendSuccess(res, {
      status: mappedStatus,
      requestId: kiosk.kioskId,
      prisonId: kiosk.prisonId || null,
      authorized: kiosk.authorizationStatus === 'authorized'
    });
  }

  // Fall back to registration requests file
  const requests = await readDb('kiosk-registration-requests.json');
  const reqRec = requests.find((r) => r.deviceSerialNumber === serial);
  if (reqRec) {
    return sendSuccess(res, {
      status: reqRec.status || 'pending',
      requestId: reqRec.requestId,
      prisonId: reqRec.prisonId || null,
      authorized: reqRec.status === 'approved'
    });
  }

  return sendError(res, 'NOT_FOUND', 'Kiosk registration status not found', 404);
}));

router.get('/registration-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const [kiosks, prisons] = await Promise.all([readDb('kiosks.json'), readDb('prisons.json')]);
  const registrationRequests = kiosks.filter((k) => k.status === 'pending' || k.authorizationStatus === 'pending');
  const mapped = (await scopeList(req, registrationRequests)).map((k) => {
    const prison = prisons.find((p) => p.prisonId === k.prisonId);
    return {
      requestId: k.kioskId,
      prisonId: k.prisonId,
      prisonName: prison?.name || 'Unknown Prison',
      deviceSerialNumber: k.deviceSerialNumber,
      deviceModel: k.hardware?.model || 'Unknown',
      deviceBrand: k.hardware?.manufacturer || 'Unknown',
      ipAddress: k.ipAddress,
      location: k.location,
      androidVersion: 'Unknown',
      appVersion: k.firmwareVersion || 'Unknown',
      registrationTimestamp: k.createdAt,
      deviceFingerprint: k.deviceSerialNumber || 'Unknown',
      status: k.authorizationStatus === 'authorized' ? 'approved' : k.authorizationStatus === 'unauthorized' ? 'rejected' : 'pending',
      reviewedBy: k.reviewedBy || null,
      reviewedAt: k.reviewedAt || null,
    };
  });
  const result = await paginate({
    req, data: mapped,
    search: (r, q) =>
      (r.requestId || '').toLowerCase().includes(q) ||
      (r.deviceSerialNumber || '').toLowerCase().includes(q) ||
      (r.prisonName || '').toLowerCase().includes(q) ||
      (r.location || '').toLowerCase().includes(q),
    searchFields: [],
    defaultSort: 'registrationTimestamp',
  });
  return sendSuccess(res, result);
}));

router.put('/registration/:requestId/approve', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const kiosk = (await readDb('kiosks.json')).find((k) => k.kioskId === requestId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  }
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === requestId);
    if (idx === -1) return { data: kiosks, result: null };
    kiosks[idx] = { 
      ...kiosks[idx], 
      authorizationStatus: 'authorized',
      status: 'active',
      reviewedBy: req.auth.sub,
      reviewedAt: new Date().toISOString()
    };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  return sendSuccess(res, { success: true });
}));

router.put('/registration/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const kiosk = (await readDb('kiosks.json')).find((k) => k.kioskId === requestId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  }
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === requestId);
    if (idx === -1) return { data: kiosks, result: null };
    kiosks[idx] = { 
      ...kiosks[idx], 
      authorizationStatus: 'unauthorized',
      status: 'disabled',
      reviewedBy: req.auth.sub,
      reviewedAt: new Date().toISOString()
    };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Registration request not found', 404);
  return sendSuccess(res, { success: true });
}));

// ==================== KIOSK ROUTES (CRUD added — was read-only) ====================

router.get('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  return sendSuccess(res, kiosks.filter(adminScopeFilter(req)));
}));
router.get('/:kioskId', requireAuth, asyncRoute(async (req, res) => {
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
  if (!kiosk) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, kiosk);
}));
router.post('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const kioskData = req.body;
  const jailId = jailScopeOf(req);
  if (jailId && kioskData.prisonId && kioskData.prisonId !== jailId) {
    return sendError(res, 'FORBIDDEN', 'Cannot create a kiosk outside your jail', 403);
  }
  const newKiosk = {
    kioskId: `KIOSK-${uuidv4().substring(0, 8).toUpperCase()}`,
    ...kioskData,
    prisonId: jailId || kioskData.prisonId,
    status: kioskData.status || 'pending',
    authorizationStatus: kioskData.authorizationStatus || 'pending',
    createdAt: new Date().toISOString()
  };
  await updateDb('kiosks.json', (k) => ({ data: [...k, newKiosk], result: newKiosk }));
  return sendSuccess(res, newKiosk, 201);
}));
router.patch('/:kioskId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const updated = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
    if (idx === -1) return { data: kiosks, result: null };
    kiosks[idx] = { ...kiosks[idx], ...req.body };
    return { data: kiosks, result: kiosks[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, updated);
}));
router.delete('/:kioskId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const deleted = await updateDb('kiosks.json', (kiosks) => {
    const idx = kiosks.findIndex((k) => k.kioskId === req.params.kioskId && inAdminScope(req, k));
    if (idx === -1) return { data: kiosks, result: null };
    const [removed] = kiosks.splice(idx, 1);
    return { data: kiosks, result: removed };
  });
  if (!deleted) return sendError(res, 'NOT_FOUND', 'Kiosk not found in your kiosk/jail', 404);
  return sendSuccess(res, { message: 'Kiosk deleted successfully', kioskId: deleted.kioskId });
}));

// ==================== KIOSK SETUP PIN ====================

router.get('/setup-pin/:prisonId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId } = req.params;
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);

  // The setup PIN is stored bcrypt-hashed; never return the value itself.
  return sendSuccess(res, {
    prisonId: prison.prisonId,
    pinSet: Boolean(prison.setupPin),
    updatedAt: prison.updatedAt || null
  });
}));

// ==================== SETUP PIN VALIDATION (public - for kiosk setup) ====================

router.post('/validate-setup-pin', asyncRoute(async (req, res) => {
  const { pin, prisonId } = req.body;
  if (!pin || !prisonId) {
    return sendError(res, 'INVALID_REQUEST', 'pin and prisonId are required', 400);
  }
  
  // Validate PIN length (6 digits)
  if (!/^\d{6}$/.test(pin)) {
    return sendError(res, 'INVALID_PIN', 'PIN must be exactly 6 digits', 400);
  }
  
  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  
  if (!prison) {
    return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  }
  
  const valid = await verifySecret(pin, prison.setupPin);
  if (!valid) {
    return sendError(res, 'INVALID_CREDENTIALS', 'Invalid setup PIN', 401);
  }
  
  return sendSuccess(res, {
    success: true,
    prisonId: prison.prisonId,
    prisonName: prison.name,
    message: 'Setup PIN validated successfully'
  });
}));

router.put('/setup-pin', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId, pin } = req.body;
  if (!prisonId || !pin) return sendError(res, 'INVALID_REQUEST', 'prisonId and pin are required', 400);

  const prison = (await readDb('prisons.json')).find((p) => p.prisonId === prisonId);
  if (!prison || !(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);

  // Validate PIN length (6 digits)
  if (!/^\d{6}$/.test(pin)) {
    return sendError(res, 'INVALID_PIN', 'PIN must be exactly 6 digits', 400);
  }
  
  const hashedPin = await hashSecret(String(pin));
  const updated = await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === prisonId);
    if (idx === -1) return { data: prisons, result: null };
    prisons[idx] = { 
      ...prisons[idx], 
      setupPin: hashedPin,
      updatedAt: new Date().toISOString()
    };
    return { data: prisons, result: prisons[idx] };
  });
  if (!updated) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, { success: true });
}));

// ==================== PIN CHANGE REQUESTS ====================

router.post('/pin-change-request', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId, currentPin, newPin, reason } = req.body;
  if (!prisonId || !currentPin || !newPin) {
    return sendError(res, 'INVALID_REQUEST', 'prisonId, currentPin, and newPin are required', 400);
  }
  
  // Validate PIN length (6 digits)
  if (!/^\d{6}$/.test(newPin)) {
    return sendError(res, 'INVALID_PIN', 'PIN must be exactly 6 digits', 400);
  }

  const prisons = await readDb('prisons.json');
  const prison = prisons.find((p) => p.prisonId === prisonId);
  if (!prison) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  if (!(await inScopeOf(req, prison))) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  
  const valid = await verifySecret(currentPin, prison.setupPin);
  if (!valid) {
    return sendError(res, 'INVALID_CREDENTIALS', 'Current PIN is incorrect', 401);
  }

  const hashedNewPin = await hashSecret(String(newPin));
  // Create PIN change request
  const changeRequest = {
    requestId: 'PIN-' + Date.now().toString(36).toUpperCase(),
    prisonId,
    requestedBy: req.auth.sub,
    requestedByRole: req.auth.role,
    newPinHash: hashedNewPin,
    reason: reason || 'Routine security update',
    status: 'pending',
    requestedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    reviewedByRole: null,
    comments: null
  };

  const updated = await updateDb('prisons.json', (prisons) => {
    const idx = prisons.findIndex((p) => p.prisonId === prisonId);
    if (idx === -1) return { data: prisons, result: null };
    
    if (!prisons[idx].pinChangeRequests) {
      prisons[idx].pinChangeRequests = [];
    }
    prisons[idx].pinChangeRequests.push(changeRequest);
    return { data: prisons, result: prisons[idx] };
  });

  if (!updated) return sendError(res, 'NOT_FOUND', 'Prison not found', 404);
  return sendSuccess(res, changeRequest, 201);
}));

router.get('/pin-change-requests', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { prisonId } = req.query;
  const prisons = await readDb('prisons.json');
  let requests = [];
  for (const prison of prisons) {
    if (prison.pinChangeRequests && prison.pinChangeRequests.length > 0) {
      // Scoped staff only see pin-change requests for prisons in their jail.
      if (!(await inScopeOf(req, prison))) continue;
      if (!prisonId || prison.prisonId === prisonId) {
        const prisonName = prison.name;
        requests.push(...prison.pinChangeRequests.map((req) => ({
          ...req,
          prisonName
        })));
      }
    }
  }

  // Sort by requestedAt descending (newest first)
  requests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  
  return sendSuccess(res, requests);
}));

router.put('/pin-change-request/:requestId/approve', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const { comments } = req.body;
  
  const allPrisons = await readDb('prisons.json');
  const owner = allPrisons.find((p) => p.pinChangeRequests && p.pinChangeRequests.some((r) => r.requestId === requestId));
  if (!owner || !(await inScopeOf(req, owner))) {
    return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  }
  let found = false;
  
  const updated = await updateDb('prisons.json', (prisons) => {
    for (const prison of prisons) {
      if (prison.pinChangeRequests) {
        const reqIdx = prison.pinChangeRequests.findIndex((r) => r.requestId === requestId);
        if (reqIdx !== -1) {
          const request = prison.pinChangeRequests[reqIdx];
          
          // Only approve if still pending
          if (request.status !== 'pending') {
            return { data: prisons, result: null };
          }
          
          // Update the PIN
          prison.setupPin = request.newPinHash;
          
          // Update request status
          prison.pinChangeRequests[reqIdx] = {
            ...request,
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.auth.sub,
            reviewedByRole: req.auth.role,
            comments: comments || 'Approved'
          };
          
          found = true;
          break;
        }
      }
    }
    return { data: prisons, result: prisons };
  });

  if (!found) return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  return sendSuccess(res, { success: true, message: 'PIN changed successfully' });
}));

router.put('/pin-change-request/:requestId/reject', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { requestId } = req.params;
  const { comments } = req.body;
  
  const allPrisons = await readDb('prisons.json');
  const owner = allPrisons.find((p) => p.pinChangeRequests && p.pinChangeRequests.some((r) => r.requestId === requestId));
  if (!owner || !(await inScopeOf(req, owner))) {
    return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  }
  let found = false;
  
  const updated = await updateDb('prisons.json', (prisons) => {
    for (const prison of prisons) {
      if (prison.pinChangeRequests) {
        const reqIdx = prison.pinChangeRequests.findIndex((r) => r.requestId === requestId);
        if (reqIdx !== -1) {
          const request = prison.pinChangeRequests[reqIdx];
          
          // Only reject if still pending
          if (request.status !== 'pending') {
            return { data: prisons, result: null };
          }
          
          // Update request status (don't change PIN)
          prison.pinChangeRequests[reqIdx] = {
            ...request,
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.auth.sub,
            reviewedByRole: req.auth.role,
            comments: comments || 'Rejected'
          };
          
          found = true;
          break;
        }
      }
    }
    return { data: prisons, result: prisons };
  });

  if (!found) return sendError(res, 'NOT_FOUND', 'PIN change request not found or already processed', 404);
  return sendSuccess(res, { success: true, message: 'PIN change request rejected' });
}));

module.exports = router;
