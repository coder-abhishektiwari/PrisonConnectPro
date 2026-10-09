/**
 * Family wallet links - long-lived bearer links (no OTP, no login) that let a
 * family member see one inmate's wallet balance and pay money in.
 *
 * Security rules:
 *  - 32 random bytes, base64url; only the SHA-256 hash is persisted, so a DB
 *    dump never yields a working link.
 *  - One active link per contact: every rotation revokes the previous tokens
 *    (old links answer 410 GONE).
 *  - The raw token exists only in the SMS we send and in the URL the family
 *    opens - never logged, never returned by any API after issuance.
 */
const crypto = require('crypto');
const { readDb: realRead, updateDb: realUpdate } = require('./db');
const { sendSms, linkTemplateVars } = require('./sms');
const { contactPhone, maskedPhone } = require('./familySecurity');
const { personName } = require('./names');
const FAMILY_WEB_URL = process.env.FAMILY_WEB_URL || '';

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

/** Family-web wallet page URL: /w?<token> (token stripped from the address
 *  bar by the page itself via history.replaceState). */
function buildWalletLink(token) {
  return `${FAMILY_WEB_URL}/w?${encodeURIComponent(token)}`;
}

/**
 * Issue a fresh active link for a contact, atomically revoking any previous
 * active link (rotation). Returns `{ linkId, token }` - the raw token is here
 * exactly once, for the SMS; callers must not store or log it.
 */
async function issueWalletLink({ contactId, inmateId }, deps = {}) {
  const update = deps.updateDb || realUpdate;
  const linkId = `WL-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const token = generateToken();
  const record = {
    linkId,
    contactId,
    inmateId,
    tokenHash: hashToken(token),
    status: 'active',
    createdAt: now,
    lastSentAt: null,
    sendCount: 0,
  };

  await update('wallet-links.json', (all) => {
    const data = all.map((l) =>
      l.contactId === contactId && l.status === 'active'
        ? { ...l, status: 'revoked', revokedAt: now, revokedBy: 'rotation' }
        : l
    );
    return { data: [...data, record], result: record };
  });

  return { linkId, token };
}

/** Resolve a raw token to its active link row (null if unknown/revoked). */
async function findActiveLink(rawToken, deps = {}) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 20) return null;
  const read = deps.readDb || realRead;
  const hash = hashToken(rawToken);
  const links = await read('wallet-links.json');
  const hit = links.find((l) => l.status === 'active' && l.tokenHash === hash);
  return hit || null;
}

/** Kill every active link for a contact (contact removed / number changed). */
async function revokeLinksForContact(contactId, deps = {}) {
  const update = deps.updateDb || realUpdate;
  const now = new Date().toISOString();
  await update('wallet-links.json', (all) => ({
    data: all.map((l) =>
      l.contactId === contactId && l.status === 'active'
        ? { ...l, status: 'revoked', revokedAt: now, revokedBy: 'contact_update' }
        : l
    ),
    result: null,
  }));
}

/** Phone with the mobileNumber-only legacy shape covered. */
function walletContactPhone(contact) {
  return contactPhone(contact) || (contact && contact.mobileNumber) || null;
}

function walletLinkMessage(inmate, linkUrl) {
  const name = personName(inmate) || 'your inmate';
  return `PrisonConnect: ${name} ka wallet balance dekhein aur online payment karein: ${linkUrl}`;
}

/**
 * Issue (rotate) + SMS the wallet link for a contact. Fire-and-forget friendly:
 * never throws for a missing phone - returns `{ sent, reason, linkId, phone }`.
 */
async function issueAndSendWalletSms(contact, inmate) {
  const phone = walletContactPhone(contact);
  if (!phone) return { sent: false, reason: 'NO_PHONE' };
  if (!FAMILY_WEB_URL) return { sent: false, reason: 'FAMILY_WEB_URL_NOT_SET' };

  const { linkId, token } = await issueWalletLink({
    contactId: contact.contactId,
    inmateId: contact.inmateId || (inmate && inmate.inmateId),
  });
  const linkUrl = buildWalletLink(token);
  const name = contact.name || contact.fullName || '';

  await sendSms({
    phone,
    message: walletLinkMessage(inmate, linkUrl),
    kind: 'link',
    templateVars: linkTemplateVars(name, linkUrl),
  });

  await realUpdate('wallet-links.json', (all) => ({
    data: all.map((l) =>
      l.linkId === linkId
        ? { ...l, lastSentAt: new Date().toISOString(), sendCount: (l.sendCount || 0) + 1, lastSentTo: maskedPhone(phone) }
        : l
    ),
    result: null,
  }));

  return { sent: true, linkId, phone };
}

module.exports = {
  generateToken,
  hashToken,
  buildWalletLink,
  issueWalletLink,
  findActiveLink,
  revokeLinksForContact,
  walletContactPhone,
  issueAndSendWalletSms,
};
