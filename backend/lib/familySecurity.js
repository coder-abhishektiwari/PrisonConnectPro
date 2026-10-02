/**
 * Family secure-call security helpers.
 *
 * Responsibilities:
 *  - Normalize / mask phone numbers used in SMS dispatch.
 *  - Build the family-web call link that is sent to the family member.
 *  - Maintain a per-phone device-fingerprint registry. The FIRST time a call
 *    is made to a given phone the fingerprint is registered; on LATER calls
 *    the fingerprint must match the stored one before an OTP is sent.
 *
 * Fingerprints are stored on the contact record (`contacts` collection) so
 * they travel with the JSONB round-trip already used across the API.
 */

const crypto = require('crypto');
const { readDb, updateDb } = require('./db');

const FAMILY_WEB_URL = (process.env.FAMILY_WEB_URL || '').replace(/\/+$/, '');

console.log(`[family] FAMILY_WEB_URL="${FAMILY_WEB_URL}"`);

if (!FAMILY_WEB_URL) {
  throw new Error('FAMILY_WEB_URL env var is required - set it to the public family-web base URL (e.g. https://family-web.onrender.com) before starting the server');
}
if (process.env.NODE_ENV === 'production' && /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(FAMILY_WEB_URL)) {
  throw new Error('FAMILY_WEB_URL must be a public https URL in production (got: ' + FAMILY_WEB_URL + ') - call links would otherwise point at localhost');
}

/**
 * Normalize a phone to a canonical comparable form: +91XXXXXXXXXX.
 *
 * Handles the trunk-prefix / country-code variants people actually type
 * (0XXXXXXXXXX, 91XXXXXXXXXX, 0091...) so the SAME phone always resolves to
 * the SAME device-fingerprint entry instead of registering a duplicate.
 * Non-Indian numbers are left alone.
 */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (p.startsWith('+')) return p;
  let d = p.replace(/^0+/, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 10) d = '91' + d;
  return '+' + (d || p);
}

/** Mask for safe display in the browser, e.g. +91******3210. Keep country + last4. */
function maskedPhone(phone) {
  const p = normalizePhone(phone);
  const last4 = p.slice(-4);
  const prefix = p.startsWith('+') ? `+${p.slice(1, 3)}` : p.slice(0, 2);
  return `${prefix}******${last4}`;
}

/** Build the clickable family-web link for a call. */
function buildCallLink(linkToken) {
  return `${FAMILY_WEB_URL}/c?${encodeURIComponent(linkToken)}`;
}

const LOOKUP_KEYS = ['contactId', 'phone', 'phoneNumber', 'fullName'];

function findContactById(contacts, contactId) {
  return contacts.find((c) => c.contactId === contactId) || null;
}

/** Resolve the phone number for a contact, preferring explicit phone fields. */
function contactPhone(contact) {
  if (!contact) return null;
  return contact.phoneNumber || contact.phone || contact.mobile || null;
}

/** Get the stored fingerprint record for a phone number, if registered. */
function fingerprintFor(contact, phone) {
  if (!contact?.deviceFingerprints || !phone) return null;
  const key = normalizePhone(phone);
  return contact.deviceFingerprints.find((f) => normalizePhone(f.phone) === key) || null;
}

/** Orientation-independent resolution: always "smaller x bigger". */
function normalizeScreen(screen) {
  const m = /^(\d+)x(\d+)$/.exec(String(screen || ''));
  if (!m) return String(screen || '');
  const a = Number(m[1]);
  const b = Number(m[2]);
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

/**
 * Recompute a fingerprint hash from a stored signals blob using the CURRENT
 * algorithm. MUST stay in sync with fingerprintHash() in family-web.
 *
 * Only device-stable signals are hashed — userAgent, language and timezone
 * were removed because they change (browser update, settings, travel) on an
 * unchanged device and caused false DEVICE_MISMATCH rejections.
 */
function hashSignals(signals) {
  if (!signals || !signals.deviceId) return null;
  const stable = {
    deviceId: String(signals.deviceId),
    platform: String(signals.platform || ''),
    hardwareConcurrency: Number(signals.hardwareConcurrency) || 0,
    deviceMemory: typeof signals.deviceMemory === 'number' ? signals.deviceMemory : null,
    screen: normalizeScreen(signals.screen),
    touchPoints: Number(signals.touchPoints) || 0,
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable), 'utf8').digest('hex');
}

/** Compare an incoming hash against every fingerprint stored for a phone. */
function hashMatchesStored(storedList, incomingHash) {
  return storedList.find((f) => {
    if (f.hash === incomingHash) return true;
    // Legacy entries were hashed with an older signal set — recompute from
    // the stored signals with the current algorithm before giving up.
    const recomputed = hashSignals(f.signals);
    return recomputed !== null && recomputed === incomingHash;
  }) || null;
}

/**
 * Register (first-time) OR verify (returning) a device fingerprint for the
 * phone number a call's link is addressed to.
 *
 * @param {string} contactId  The contact tied to the call.
 * @param {string|null} phone Explicit phone (optional — falls back to contact).
 * @param {object} fingerprintPayload { hash, signals }
 * @returns {Promise<{verified: boolean, isFirstTime: boolean, reason?: string}>}
 *   - first time  -> { verified: true, isFirstTime: true }   (registered)
 *   - match       -> { verified: true, isFirstTime: false }
 *   - mismatch    -> { verified: false, isFirstTime: false, reason: 'DEVICE_MISMATCH' }
 */
async function registerOrVerifyFingerprint(contactId, phone, fingerprintPayload) {
  const contacts = await readDb('contacts.json');
  const contact = findContactById(contacts, contactId);
  if (!contact) {
    return { verified: false, isFirstTime: false, reason: 'CONTACT_NOT_FOUND' };
  }

  const targetPhone = phone || contactPhone(contact);
  if (!targetPhone) {
    return { verified: false, isFirstTime: false, reason: 'NO_PHONE' };
  }

  const normalized = normalizePhone(targetPhone);
  const entriesForPhone = (contact.deviceFingerprints || []).filter(
    (f) => normalizePhone(f.phone) === normalized
  );

  const { hash, signals, deviceInfo } = fingerprintPayload || {};
  if (!hash) {
    return { verified: false, isFirstTime: false, reason: 'NO_FINGERPRINT' };
  }

  if (entriesForPhone.length === 0) {
    // First call to this number — register the device fingerprint.
    const writeResult = await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const list = Array.isArray(all[idx].deviceFingerprints) ? all[idx].deviceFingerprints : [];
      // Re-check inside the write: a concurrent request may have registered
      // this phone already — never store two entries for the same number.
      const dupe = list.find((f) => normalizePhone(f.phone) === normalized);
      if (dupe) {
        dupe.lastVerifiedAt = new Date().toISOString();
        dupe.verifiedCount = (dupe.verifiedCount || 0) + 1;
        if (deviceInfo && !dupe.deviceInfo) dupe.deviceInfo = deviceInfo;
        return { data: all, result: { registered: false, record: dupe } };
      }
      const record = {
        fingerprintId: `DEV-${Date.now().toString(36).toUpperCase()}`,
        phone: normalized,
        hash,
        signals: signals || {},
        deviceInfo: deviceInfo || null,
        firstSeenAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        verifiedCount: 1
      };
      list.push(record);
      all[idx].deviceFingerprints = list;
      return { data: all, result: { registered: true, record } };
    });
    if (!writeResult) return { verified: false, isFirstTime: false, reason: 'CONTACT_NOT_FOUND' };
    return { verified: true, isFirstTime: writeResult.registered === true };
  }

  // Returning device: exact hash match, OR a recompute of the stored signals
  // with the current algorithm (legacy registrations). NO silent re-register.
  const matched = hashMatchesStored(entriesForPhone, hash);
  if (matched) {
    await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const fp = all[idx].deviceFingerprints || [];
      const fi = fp.findIndex((f) => f.fingerprintId === matched.fingerprintId);
      if (fi !== -1) {
        fp[fi].lastVerifiedAt = new Date().toISOString();
        fp[fi].verifiedCount = (fp[fi].verifiedCount || 0) + 1;
        if (deviceInfo) fp[fi].deviceInfo = deviceInfo;
        if (signals) fp[fi].signals = signals;
      }
      return { data: all, result: all[idx] };
    });
    return { verified: true, isFirstTime: false };
  }

  return { verified: false, isFirstTime: false, reason: 'DEVICE_MISMATCH' };
}

/** Returns whether a device fingerprint is already registered for the call's contact. */
async function deviceRegisteredForCall(call) {
  const contacts = await readDb('contacts.json');
  const contact = findContactById(contacts, call.contactId);
  const phone = contactPhone(contact);
  if (!phone) return { registered: false, maskedPhone: null };
  return { registered: !!fingerprintFor(contact, phone), maskedPhone: maskedPhone(phone) };
}

/** Build the SMS message for logging (actual SMS comes from DLT template). */
function buildLinkSms(call) {
  const link = buildCallLink(call.linkToken);
  return `Dear ${call.inmateName || 'an inmate'}, Your secure video call with DSS Solutions has been scheduled. Link: ${link}`;
}

module.exports = {
  normalizePhone,
  maskedPhone,
  buildCallLink,
  contactPhone,
  fingerprintFor,
  registerOrVerifyFingerprint,
  deviceRegisteredForCall,
  buildLinkSms,
  FAMILY_WEB_URL
};