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

const { readDb, updateDb } = require('./db');

const FAMILY_WEB_URL = (process.env.FAMILY_WEB_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');

/** Normalize a phone to a canonical comparable form: +91XXXXXXXXXX. */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) p = '+' + p;
  return p;
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
  return `${FAMILY_WEB_URL}/call/${encodeURIComponent(linkToken)}`;
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
  const stored = fingerprintFor(contact, normalized);

  const { hash, signals } = fingerprintPayload || {};
  if (!hash) {
    return { verified: false, isFirstTime: false, reason: 'NO_FINGERPRINT' };
  }

  if (!stored) {
    // First call to this number — register the device fingerprint.
    await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const fingerprints = Array.isArray(all[idx].deviceFingerprints) ? all[idx].deviceFingerprints : [];
      all[idx].deviceFingerprints = [
        ...fingerprints,
        {
          fingerprintId: `DEV-${Date.now().toString(36).toUpperCase()}`,
          phone: normalized,
          hash,
          signals: signals || {},
          firstSeenAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString(),
          verifiedCount: 1
        }
      ];
      return { data: all, result: all[idx] };
    });
    return { verified: true, isFirstTime: true };
  }

  if (stored.hash === hash) {
    await updateDb('contacts.json', (all) => {
      const idx = all.findIndex((c) => c.contactId === contactId);
      if (idx === -1) return { data: all, result: null };
      const fp = all[idx].deviceFingerprints;
      const fi = fp.findIndex((f) => f.fingerprintId === stored.fingerprintId);
      if (fi !== -1) {
        fp[fi].lastVerifiedAt = new Date().toISOString();
        fp[fi].verifiedCount = (fp[fi].verifiedCount || 0) + 1;
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

/** Build the SMS message for the initial call-link SMS. */
function buildLinkSms(call) {
  const link = buildCallLink(call.linkToken);
  return `[PrisonConnect] You have an incoming video call from ${call.inmateName || 'an inmate'}. Open this secure link to join: ${link}`;
}

/** Build the WebOTP-formatted OTP SMS message. */
function buildOtpSms(call) {
  const { buildOtpMessage } = require('./sms');
  return buildOtpMessage(call.otp, 'call');
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
  buildOtpSms,
  FAMILY_WEB_URL
};