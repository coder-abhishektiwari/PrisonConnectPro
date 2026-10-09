/**
 * Family wallet-link endpoints (no login, no OTP - bearer token in the link).
 *
 * The token is the only credential: it authorises exactly three calls, all
 * scoped to one contact/one inmate:
 *   GET  /family/wallet-link/:token/info    - masked inmate name, balance copy,
 *                                             pending requested amount (no ids)
 *   POST /family/wallet-link/:token/order   - create a Razorpay order (min/max
 *                                             + rolling-24h cap enforced)
 *   POST /family/wallet-link/:token/verify  - verify signature, credit net
 *                                             (idempotent with the webhook)
 *
 * Hardening: per-IP rate limits, strict family-web Origin on writes, no-store
 * on every response, generic 410 for dead links (no probing), tokens never
 * logged and never echoed back.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { readDb } = require('../lib/db');
const { findActiveLink } = require('../lib/wallet-links');
const { getPaymentByOrder, createPaymentRow, committedPaiseByContact, creditFromRazorpay } = require('../lib/wallet-credit');
const { createOrder, verifyPaymentSignature, configured, keyId, RazorpayError } = require('../lib/razorpay');
const { getStatement } = require('../lib/jail-account');
const { personName } = require('../lib/names');

const router = express.Router();

const MIN_RUPEES = Math.max(1, Number(process.env.WALLET_MIN_RUPEES) || 10);
const MAX_RUPEES = Math.max(MIN_RUPEES, Number(process.env.WALLET_MAX_RUPEES) || 2000);
const DAILY_CAP_RUPEES = Math.max(MAX_RUPEES, Number(process.env.WALLET_DAILY_CAP_RUPEES) || 5000);

const rateMessage = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many requests - please wait a moment and try again' },
};

const infoLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: rateMessage });
const orderLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: rateMessage });
const verifyLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: rateMessage });

/** Reject browser calls from anywhere but the family portal itself. */
function familyOriginOnly(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients: the token still gates
  const allowed = (process.env.FAMILY_WEB_URL || '').trim();
  if (!allowed) return next();
  try {
    if (new URL(origin).origin === new URL(allowed).origin) return next();
  } catch { /* fall through */ }
  return sendError(res, 'FORBIDDEN', 'Origin not allowed', 403);
}

function noStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Resolve the bearer token or answer a uniform 410 (dead/revoked/unknown). */
async function resolveLink(req, res) {
  const link = await findActiveLink(req.params.token);
  if (!link) {
    sendError(res, 'LINK_INVALID', 'This link is no longer valid. Ask the jail office to send you a new one.', 410);
    return null;
  }
  return link;
}

async function findInmate(inmateId) {
  const inmates = await readDb('inmates.json');
  return inmates.find((i) => i.inmateId === inmateId) ||
    inmates.find((i) => i.inmateId === `INM-${inmateId}`) ||
    inmates.find((i) => `INM-${i.inmateId}` === inmateId) ||
    null;
}

async function findContact(contactId) {
  const contacts = await readDb('contacts.json');
  return contacts.find((c) => c.contactId === contactId) || null;
}

/** Balance as derived from the ledger (never the cache alone). */
async function balanceCopy(inmateId) {
  const stmt = await getStatement(inmateId);
  return stmt && stmt.wallet ? (Number(stmt.wallet.balance) || 0) : 0;
}

/** Latest pending offline-cash request amount for the inmate (0 when none). */
async function pendingRequestedAmount(inmateId) {
  const requests = await readDb('wallet-requests.json');
  const mine = requests
    .filter((r) => (r.inmateId === inmateId || r.inmateId === `INM-${inmateId}` || `INM-${r.inmateId}` === inmateId) &&
      String(r.status || '').toLowerCase() === 'pending')
    .sort((a, b) => new Date(b.requestedAt || b.createdAt || 0) - new Date(a.requestedAt || a.createdAt || 0));
  return mine.length ? (Number(mine[0].amount) || 0) : 0;
}

// ---------------------------------------------------------------------------
// GET /family/wallet-link/:token/info - the only read the family ever makes.
// ---------------------------------------------------------------------------
router.get('/wallet-link/:token/info', infoLimiter, asyncRoute(async (req, res) => {
  noStore(res);
  const link = await resolveLink(req, res);
  if (!link) return;

  const [inmate, contact, balance, requestedAmount] = await Promise.all([
    findInmate(link.inmateId),
    findContact(link.contactId),
    balanceCopy(link.inmateId),
    pendingRequestedAmount(link.inmateId),
  ]);
  if (!inmate || !contact) {
    return sendError(res, 'LINK_INVALID', 'This link is no longer valid. Ask the jail office to send you a new one.', 410);
  }
  if (contact.approvalStatus === 'rejected' || contact.status === 'blocked' || contact.active === false) {
    return sendError(res, 'CONTACT_DISABLED', 'This family contact is no longer approved', 403);
  }

  return sendSuccess(res, {
    inmateName: personName(inmate),
    balance,
    currency: 'INR',
    requestedAmount,
    limits: { minRupees: MIN_RUPEES, maxRupees: MAX_RUPEES },
  });
}));

// ---------------------------------------------------------------------------
// POST /family/wallet-link/:token/order - start a Razorpay checkout.
// ---------------------------------------------------------------------------
router.post('/wallet-link/:token/order', orderLimiter, familyOriginOnly, asyncRoute(async (req, res) => {
  noStore(res);
  const link = await resolveLink(req, res);
  if (!link) return;

  const amountRupees = req.body && req.body.amount;
  if (!Number.isInteger(amountRupees) || amountRupees < MIN_RUPEES || amountRupees > MAX_RUPEES) {
    return sendError(res, 'INVALID_AMOUNT', `Amount must be a whole number between ₹${MIN_RUPEES} and ₹${MAX_RUPEES}`, 400);
  }

  const [inmate, contact] = await Promise.all([findInmate(link.inmateId), findContact(link.contactId)]);
  if (!inmate || !contact) {
    return sendError(res, 'LINK_INVALID', 'This link is no longer valid. Ask the jail office to send you a new one.', 410);
  }
  if (contact.approvalStatus === 'rejected' || contact.status === 'blocked' || contact.active === false) {
    return sendError(res, 'CONTACT_DISABLED', 'This family contact is no longer approved', 403);
  }
  if (!configured()) {
    return sendError(res, 'PAYMENT_NOT_CONFIGURED', 'Online payment is not available right now', 503);
  }

  const amountPaise = amountRupees * 100;
  const alreadyCommitted = await committedPaiseByContact(contact.contactId);
  if (alreadyCommitted + amountPaise > DAILY_CAP_RUPEES * 100) {
    return sendError(res, 'DAILY_LIMIT', `Daily deposit limit is ₹${DAILY_CAP_RUPEES}. Please try again tomorrow.`, 400);
  }

  const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  let order;
  try {
    order = await createOrder({
      amountPaise,
      receipt: paymentId,
      notes: { linkId: link.linkId, contactId: contact.contactId, inmateId: link.inmateId },
    });
  } catch (err) {
    if (err instanceof RazorpayError && err.code === 'PAYMENT_NOT_CONFIGURED') {
      return sendError(res, 'PAYMENT_NOT_CONFIGURED', 'Online payment is not available right now', 503);
    }
    throw err;
  }

  const attempt = await createPaymentRow({
    paymentId,
    orderId: order.id,
    linkId: link.linkId,
    contactId: contact.contactId,
    inmateId: link.inmateId,
    amountPaise,
  });
  if (!attempt) return sendError(res, 'ORDER_EXISTS', 'A payment attempt for this order already exists', 409);

  return sendSuccess(res, {
    orderId: order.id,
    amountPaise,
    currency: 'INR',
    keyId: keyId(),
    balance: await balanceCopy(link.inmateId),
  });
}));

// ---------------------------------------------------------------------------
// POST /family/wallet-link/:token/verify - signature-checked, net-of-charges
// credit. Same helper as the webhook, so a double call credits once.
// ---------------------------------------------------------------------------
router.post('/wallet-link/:token/verify', verifyLimiter, familyOriginOnly, asyncRoute(async (req, res) => {
  noStore(res);
  const link = await resolveLink(req, res);
  if (!link) return;

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return sendError(res, 'BAD_REQUEST', 'Missing payment verification fields', 400);
  }

  const attempt = await getPaymentByOrder(razorpayOrderId);
  if (!attempt || attempt.linkId !== link.linkId || attempt.inmateId !== link.inmateId) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Payment session not found for this link', 404);
  }
  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return sendError(res, 'SIGNATURE_INVALID', 'Payment verification failed', 400);
  }

  const out = await creditFromRazorpay({ orderId: razorpayOrderId, paymentId: razorpayPaymentId });
  if (!out.ok) {
    if (String(out.reason || '').startsWith('status_')) {
      return sendError(res, 'PAYMENT_NOT_CAPTURED', 'Payment is not captured yet', 400);
    }
    if (out.reason === 'amount_mismatch' || out.reason === 'order_mismatch' || out.reason === 'payment_id_mismatch') {
      return sendError(res, 'SIGNATURE_INVALID', 'Payment verification failed', 400);
    }
    throw new Error(`wallet credit failed for ${razorpayOrderId}: ${out.reason}`);
  }

  return sendSuccess(res, {
    ok: true,
    creditedPaise: out.netPaise != null ? out.netPaise : (attempt.netCreditedPaise || 0),
    balance: await balanceCopy(link.inmateId),
  });
}));

module.exports = router;
