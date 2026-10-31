const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { sendSms, otpTemplateVars, linkTemplateVars } = require('../lib/sms');
const { maskedPhone, contactPhone, buildLinkSms, buildCallLink, deviceRegisteredForCall, registerOrVerifyFingerprint, saveDeviceFirstLocation } = require('../lib/familySecurity');
const { reverseGeocode } = require('../lib/geocode');
const { callInmateName, callContactName } = require('../lib/names');
const { signAccessToken, hashSecret, verifySecret } = require('../lib/auth');

const router = express.Router();

// ---- Rate limiting -------------------------------------------------------
// These routes were wide open while the money routes were locked down: an
// attacker holding one link token could hammer verify-otp (6-digit code,
// 900k combinations) or blast send-otp (paid SMS) with no ceiling at all.
//
// Keys are sha256(linkToken) so a spoofed X-Forwarded-For can't dodge them and
// one family's traffic can never burn another family's budget. Carrier NAT
// shares one public IP across many phones, so the per-IP limits stay generous
// — the per-token ceiling is the real control.
const rateMessage = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many requests - please wait a moment and try again' },
};
const tokenKey = (req) => crypto.createHash('sha256').update(String(req.params.linkToken || '')).digest('hex').slice(0, 32);

const callTokenLimiter = rateLimit({
  windowMs: 60 * 60_000, limit: 90,
  standardHeaders: true, legacyHeaders: false, message: rateMessage,
  keyGenerator: tokenKey,
});
// SMS costs money and is a harassment vector: 6 dispatches/hour per link is
// far more than a real family ever needs (resend cooldown is on the client).
const otpSendTokenLimiter = rateLimit({
  windowMs: 60 * 60_000, limit: 6,
  standardHeaders: true, legacyHeaders: false, message: rateMessage,
  keyGenerator: tokenKey,
});
const otpVerifyTokenLimiter = rateLimit({
  windowMs: 60_000, limit: 10,
  standardHeaders: true, legacyHeaders: false, message: rateMessage,
  keyGenerator: tokenKey,
});
const otpSendIpLimiter = rateLimit({
  windowMs: 60 * 60_000, limit: 60,
  standardHeaders: true, legacyHeaders: false, message: rateMessage,
});

// Wrong guesses before the code itself is burned. The counter already existed
// on the record — it was incremented and never read, so brute force had no
// ceiling beyond the 5-minute expiry.
const MAX_OTP_ATTEMPTS = 5;

/**
 * Compare without leaking length or content through early-exit timing.
 * SHA-256 both sides first so the buffers are always the same length, then
 * one fixed-cost comparison.
 */
function constantTimeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * OTP verification. New codes are bcrypt-hashed at rest (otpHash) exactly like
 * the warden password-reset codes; a plaintext `otp` is only accepted from rows
 * written before this migration, and even then via the constant-time path.
 */
async function otpMatches(input, call) {
  const candidate = String(input ?? '');
  if (call.otpHash) return verifySecret(candidate, call.otpHash);
  if (call.otp) return constantTimeEqual(candidate, call.otp);
  return false;
}

// 1. POST /secure-call/link
router.post('/secure-call/link/:linkToken', callTokenLimiter, asyncRoute(async (req, res) => {
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
    inmateName: callInmateName(call, inmate),
    contactName: callContactName(call, contact) || 'Family member',
    callType: call.type,
    scheduledAt: call.scheduledAt || call.startTime,
    maxDurationMinutes: call.maxDurationMinutes,
    ratePerMinute: call.ratePerMinute,
    deviceRegistered: registered,
    phoneMasked: phone || (familyPhone ? maskedPhone(familyPhone) : null)
  });
}));

// 2. POST /secure-call/send-otp
router.post('/secure-call/send-otp/:linkToken', callTokenLimiter, otpSendTokenLimiter, otpSendIpLimiter, asyncRoute(async (req, res) => {
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
  // Only the bcrypt hash is persisted: a leaked DB dump must not yield a
  // working code, exactly like the warden password-reset codes.
  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = await hashSecret(otp);
  const expiresAt = new Date(Date.now() + (parseInt(process.env.SMS_OTP_EXPIRY_MINUTES || '5', 10) * 60000)).toISOString();

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].otpHash = otpHash;
    // A fresh code also resets the wrong-guess budget and any legacy plaintext
    // form, so a locked-out family can always recover by resending.
    delete all[idx].otp;
    all[idx].otpExpiresAt = expiresAt;
    all[idx].otpDispatchCount = (all[idx].otpDispatchCount || 0) + 1;
    all[idx].family = { ...(all[idx].family || {}), otpFailedAttempts: 0 };
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
router.post('/secure-call/verify-otp/:linkToken', callTokenLimiter, otpVerifyTokenLimiter, asyncRoute(async (req, res) => {
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

  // Wrong-guess budget. The counter below was already being written on every
  // failure — it was simply never read, so nothing capped a brute-force walk
  // of the 900k-code space inside the 5-minute expiry window.
  const failedAttempts = Number(call.family?.otpFailedAttempts) || 0;
  if (failedAttempts >= MAX_OTP_ATTEMPTS) {
    await burnOtp(linkToken);
    return sendError(res, 'OTP_LOCKED', 'Too many incorrect attempts. Tap resend to get a new code.', 429);
  }

  // Reject stale OTPs past their expiry window.
  if (call.otpExpiresAt && Date.now() > new Date(call.otpExpiresAt).getTime()) {
    return sendError(res, 'OTP_EXPIRED', 'This OTP has expired. Tap resend to get a new code.', 401);
  }

  // Never `===` on attacker-controlled input: bcrypt for hashed codes, a
  // length-normalised timingSafeEqual for legacy plaintext rows.
  const valid = await otpMatches(otp, call);
  if (!valid) {
    // Track failed attempts so the kiosk can show the step in red — and burn
    // the code the moment the budget is spent, so guess number six never runs.
    const bumped = await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.linkToken === linkToken);
      if (idx === -1) return { data: all, result: null };
      const attempts = (Number(all[idx].family?.otpFailedAttempts) || 0) + 1;
      all[idx].family = { ...(all[idx].family || {}), otpFailedAttempts: attempts };
      return { data: all, result: { attempts } };
    });
    if (bumped && bumped.attempts >= MAX_OTP_ATTEMPTS) {
      await burnOtp(linkToken);
      return sendError(res, 'OTP_LOCKED', 'Too many incorrect attempts. Tap resend to get a new code.', 429);
    }
    return sendError(res, 'INVALID_OTP', 'Incorrect one-time password', 401);
  }

  // TTL covers the 5-min call itself plus the post-call recharge window: the
  // family portal uses this same token to top up the inmate's wallet from the
  // call-ended screen (routes/call-wallet.js). Default 20m, env-overridable.
  const sessionToken = signAccessToken(
    {
      sub: call.contactId, role: 'family',
      callId: call.callId, roomId: call.roomId, kioskId: call.kioskId
    },
    process.env.FAMILY_CALL_TOKEN_TTL || '20m'
  );

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    // One-time use: burning the code here stops the same OTP from minting a
    // fresh sessionToken on every replay until it expired on its own.
    delete all[idx].otp;
    delete all[idx].otpHash;
    delete all[idx].otpExpiresAt;
    all[idx].family = {
      ...(all[idx].family || {}),
      otpVerified: true,
      otpVerifiedAt: new Date().toISOString(),
      sessionToken,
      otpFailedAttempts: 0
    };
    return { data: all, result: all[idx] };
  });

  return sendSuccess(res, { verified: true, sessionToken });
}));

/**
 * Burn an OTP so it can never be redeemed. Used by the lockout path and by
 * the success path (one-time use). The failure counter is deliberately left
 * alone — it only resets when send-otp issues a genuinely fresh code.
 */
async function burnOtp(linkToken) {
  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    delete all[idx].otp;
    delete all[idx].otpHash;
    delete all[idx].otpExpiresAt;
    return { data: all, result: all[idx] };
  });
}

// 4. POST /secure-call/device
router.post('/secure-call/device/:linkToken', callTokenLimiter, asyncRoute(async (req, res) => {
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
  const result = await registerOrVerifyFingerprint(call.contactId, familyPhone, {
    hash: String(fingerprint),
    signals,
    deviceInfo: body.deviceInfo || null
  });

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

// 4b. POST /secure-call/location
// Sent right after a SUCCESSFUL device verification (never before), so the
// fingerprint flow stays untouched: a denied, timed-out or missing location
// simply means no request at all, and the call proceeds as if it never
// existed. Two distinct stores come out of this one write:
//   - call.family.location          -> this call only (live call card + history)
//   - deviceFingerprints[0].location -> once per device, never overwritten
//       (the Verified Device card in the warden dashboard)
// Auth is the link token, same as every other family route.
function parseLocation(body) {
  if (!body || typeof body !== 'object') return null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const accuracy = Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null;
  return { lat, lng, accuracy };
}

router.post('/secure-call/location/:linkToken', callTokenLimiter, asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const calls = await readDb('calls.json');
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);

  const point = parseLocation(req.body);
  if (!point) return sendError(res, 'INVALID_REQUEST', 'lat and lng are required', 400);

  // Reverse geocoding is free (BigDataCloud, no key) and runs here inside the
  // request because the browser fires this call without waiting on it - a 3s
  // timeout only leaves area/city/state empty.
  let place = null;
  try {
    place = await reverseGeocode(point.lat, point.lng);
  } catch (err) {
    console.warn('[family] geocode failed:', err.message);
  }

  const location = {
    ...point,
    area: place?.area || null,
    city: place?.city || null,
    state: place?.state || null,
    country: place?.country || null,
    at: new Date().toISOString()
  };

  await updateDb('calls.json', (all) => {
    const idx = all.findIndex((c) => c.linkToken === linkToken);
    if (idx === -1) return { data: all, result: null };
    all[idx].family = { ...(all[idx].family || {}), location };
    return { data: all, result: all[idx] };
  });

  await saveDeviceFirstLocation(call.contactId, location);

  return sendSuccess(res, { location });
}));

// 5. GET /secure-call/heartbeat/:linkToken
//
// Doubles as the family portal's clock source: it returns the server's time
// and the billing anchor (`mediaConnectedAt`) so the browser timer counts the
// exact same seconds the kiosk is billing — no client drift, no second clock.
router.get('/secure-call/heartbeat/:linkToken', callTokenLimiter, asyncRoute(async (req, res) => {
  const { linkToken } = req.params;
  const [calls, inmates, contacts] = await Promise.all([
    readDb('calls.json'), readDb('inmates.json'), readDb('contacts.json')
  ]);
  const call = calls.find((c) => c.linkToken === linkToken);
  if (!call) return sendError(res, 'NOT_FOUND', 'Invalid or expired call link', 404);

  const inmate = inmates.find((i) => i.inmateId === call.inmateId);
  const contact = contacts.find((c) => c.contactId === call.contactId);
  const payload = {
    ok: true,
    done: !!call.family?.otpVerified,
    serverTime: new Date().toISOString(),
    status: call.status,
    startTime: call.startTime || null,
    mediaConnectedAt: call.mediaConnectedAt || null,
    maxDurationMinutes: call.maxDurationMinutes,
    ratePerMinute: call.ratePerMinute,
    inmateName: callInmateName(call, inmate),
    contactName: callContactName(call, contact) || 'Family member'
  };

  // Only chase `lastSeenAt` while we are still proving the visitor is alive —
  // during an active call that would be a needless write every few seconds.
  if (!call.family?.otpVerified) {
    await updateDb('calls.json', (all) => {
      const idx = all.findIndex((c) => c.linkToken === linkToken);
      if (idx === -1) return { data: all, result: null };
      all[idx].family = { ...(all[idx].family || {}), lastSeenAt: new Date().toISOString() };
      return { data: all, result: all[idx] };
    });
  }
  return sendSuccess(res, payload);
}));

module.exports = router;
