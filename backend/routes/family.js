const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { sendSms, otpTemplateVars, linkTemplateVars } = require('../lib/sms');
const { maskedPhone, contactPhone, buildLinkSms, buildCallLink, deviceRegisteredForCall, registerOrVerifyFingerprint } = require('../lib/familySecurity');
const { signAccessToken } = require('../lib/auth');

const router = express.Router();

// 1. POST /secure-call/link
router.post('/secure-call/link/:linkToken', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const [calls, inmates, contacts] = await Promise.all([readDb('calls.json'), readDb('inmates.json'), readDb('contacts.json')]);
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }

  const inmate = inmates.find((i) => i.inmateId === call.inmateId);
  const contact = contacts.find((c) => c.contactId === call.contactId);

  // Record the first time the family member actually opens the link so the
  // kiosk can show real progress instead of a generic "waiting" spinner.
  if (!call.linkOpenedAt) {
    await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.callId === call.callId);
      if (idx === -1) return { data: all, result: null };
      if (!all[idx].linkOpenedAt) all[idx].linkOpenedAt = new Date().toISOString();
      return { data: all, result: all[idx] };
    });
  }

  // Report whether this phone has a registered device fingerprint so the
  // portal can route first-time (collect fingerprint) vs returning (verify).
  const { registered, maskedPhone: phone } = await deviceRegisteredForCall(call);
  const familyPhone = contactPhone(contact);

  return sendSuccess(res, {
    callId: call.callId,
    roomId: call.roomId,
    inmateName: inmate ? `${inmate.firstName} ${inmate.lastName || ''}`.trim() : call.inmateName || '',
    contactName: contact?.fullName || contact?.name || call.familyMemberName || 'Family member',
    callType: call.type,
    scheduledAt: call.scheduledAt || call.startTime,
    maxDurationMinutes: call.maxDurationMinutes,
    ratePerMinute: call.ratePerMinute,
    deviceRegistered: registered,
    phoneMasked: phone || (familyPhone ? maskedPhone(familyPhone) : null)
  });
}));

// 2. POST /secure-call/send-otp
router.post('/secure-call/send-otp/:linkToken', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const [calls, contacts] = await Promise.all([readDb('calls.json'), readDb('contacts.json')]);
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }

  // First-time call to this number: OTP is dispatched BEFORE the fingerprint
  // is collected (so we first prove the SIM is in the phone). Returning call:
  // the stored device fingerprint must match BEFORE an OTP is sent.
  const { registered: deviceRegistered } = await deviceRegisteredForCall(call);
  if (deviceRegistered && !call.family?.deviceVerified) {
    return sendError(res, 'DEVICE_VERIFICATION_REQUIRED', 'Device verification is required before sending the OTP', 403);
  }

  const contact = contacts.find((c) => c.contactId === call.contactId);
  const familyPhone = contactPhone(contact);
  if (!familyPhone) return sendError(res, 'NO_PHONE', 'Family phone number is not registered', 400);

  // Rotate the OTP on every dispatch so a stale code can never be replayed.
  const otp = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + (parseInt(process.env.SMS_OTP_EXPIRY_MINUTES || '5', 10) * 60000)).toISOString();

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].otp = otp;
    all[idx].otpExpiresAt = expiresAt;
    all[idx].otpDispatchCount = (all[idx].otpDispatchCount || 0) + 1;
    return { data: all, result: all[idx] };
  });

  let smsResult = null;
  try {
    smsResult = await sendSms({
      phone: familyPhone,
      message: `OTP ${otp} for call ${call.callId}`,
      kind: 'otp',
      callId: call.callId,
      templateVars: otpTemplateVars(otp)
    });
  } catch (err) {
    console.error('[otp] send failed:', err.message);
  }

  return sendSuccess(res, {
    sent: true,
    transport: smsResult?.provider || 'log',
    expiresAt,
    phoneMasked: maskedPhone(familyPhone)
  });
}));

// 3. POST /secure-call/verify-otp
router.post('/secure-call/verify-otp/:linkToken', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const { otp } = req.body || {};
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }

  // First-time call: OTP may be redeemed before the fingerprint is collected.
  // Returning call: OTP is only valid after the stored fingerprint matched.
  const { registered: deviceRegistered } = await deviceRegisteredForCall(call);
  if (deviceRegistered && !call.family?.deviceVerified) {
    return sendError(res, 'DEVICE_VERIFICATION_REQUIRED', 'Device verification is required before entering the OTP', 403);
  }

  // Reject stale OTPs past their expiry window.
  if (call.otpExpiresAt && Date.now() > new Date(call.otpExpiresAt).getTime()) {
    return sendError(res, 'OTP_EXPIRED', 'This OTP has expired. Tap resend to get a new code.', 401);
  }

  const valid = String(otp) === String(call.otp);
  if (!valid) {
    // Track failed attempts so the kiosk can show the step in red.
    await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.linkToken === linkToken);
      if (idx === -1) return { data: all, result: null };
      all[idx].family = {
        ...(all[idx].family || {}),
        otpFailedAttempts: (all[idx].family?.otpFailedAttempts || 0) + 1
      };
      return { data: all, result: all[idx] };
    });
    return sendError(res, 'INVALID_OTP', 'Incorrect one-time password', 401);
  }

  const sessionToken = signAccessToken({
    sub: call.contactId, role: 'family',
    callId: call.callId, roomId: call.roomId, kioskId: call.kioskId
  });

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].family = { ...(all[idx].family || {}), otpVerified: true, otpVerifiedAt: new Date().toISOString(), sessionToken };
    return { data: all, result: all[idx] };
  });

  return sendSuccess(res, { verified: true, sessionToken });
}));

// 4. POST /secure-call/device
router.post('/secure-call/device/:linkToken', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const body = req.body || {};
  const [calls, contacts] = await Promise.all([readDb('calls.json'), readDb('contacts.json')]);
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);

  const { fingerprint, signals } = body;

  // A fingerprint is mandatory. deviceInfo is kept for legacy clients.
  if (!fingerprint) {
    return sendError(res, 'INVALID_REQUEST', 'Device fingerprint is required', 400);
  }

  const contact = contacts.find((c) => c.contactId === call.contactId);
  const familyPhone = contactPhone(contact);

  // First call to this number -> register the fingerprint.
  // Returning call  -> require the fingerprint to match the stored one.
  const result = await registerOrVerifyFingerprint(call.contactId, familyPhone, { hash: String(fingerprint), signals });

  if (!result.verified) {
    // Track failed attempts so the kiosk can show the step in red.
    await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.linkToken === linkToken);
      if (idx === -1) return { data: all, result: null };
      all[idx].family = {
        ...(all[idx].family || {}),
        deviceFailedAttempts: (all[idx].family?.deviceFailedAttempts || 0) + 1
      };
      return { data: all, result: all[idx] };
    });
    if (result.reason === 'DEVICE_MISMATCH') {
      return sendError(res, 'DEVICE_MISMATCH', 'This device is not authorized for this call link', 403);
    }
    return sendError(res, 'DEVICE_VERIFICATION_FAILED', result.reason || 'Device verification failed', 400);
  }

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].family = {
      ...(all[idx].family || {}),
      deviceInfo: body.deviceInfo || {},
      deviceVerified: true,
      isFirstTime: result.isFirstTime === true,
      deviceVerifiedAt: new Date().toISOString()
    };
    return { data: all, result: all[idx] };
  });

  return sendSuccess(res, {
    verified: true,
    isFirstTime: result.isFirstTime === true,
    // OTP may only be dispatched after a successful device check.
    otpAllowed: true
  });
}));

// 5. GET /secure-call/heartbeat/:linkToken
router.get('/secure-call/heartbeat/:linkToken', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.family?.otpVerified) return sendSuccess(res, { ok: true, done: true });
  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].family = { ...(all[idx].family || {}), lastSeenAt: new Date().toISOString() };
    return { data: all, result: all[idx] };
  });
  return sendSuccess(res, { ok: true });
}));

// 6. GET /secure-call/info/:linkToken
router.get('/secure-call/info/:linkToken', asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  if (process.env.NODE_ENV === 'production' || (process.env.SMS_PROVIDER || '').toLowerCase() === 'fast2sms') {
    return sendError(res, 'FORBIDDEN', 'OTP debug endpoint is disabled', 403);
  }
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);
  if (call.status === 'completed' || call.status === 'cancelled') {
    return sendError(res, 'CALL_ENDED', 'This call has already ended', 410);
  }
  if (call.family?.otpVerified) return sendError(res, 'ALREADY_VERIFIED', 'OTP already verified', 409);
  if (!call.otp) return sendError(res, 'NO_OTP', 'No pending OTP; dispatch it first', 404);
  return sendSuccess(res, { otp: String(call.otp), expiresAt: call.otpExpiresAt || null });
}));

module.exports = router;
