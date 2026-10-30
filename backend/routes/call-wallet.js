/**
 * Call-session wallet endpoints (JWT-authenticated post-call recharge).
 *
 * Parallel to routes/wallet-link.js but authenticated by the OTP-verified
 * family call JWT instead of a bearer token in an SMS link. The family
 * member finishes a call and can top up the inmate's wallet from the same
 * browser session without hunting for the wallet SMS.
 *
 * Auth contract:
 *   Authorization: Bearer <sessionToken from verify-otp>
 *   Claims: { sub: contactId, role: 'family', callId, roomId, kioskId }
 *
 * Endpoints (all scoped to the JWT's contact + the inmate of its call):
 *   GET  /family/call-wallet/info    - inmate name, balance, limits
 *   POST /family/call-wallet/order   - create Razorpay order (min/max + daily cap)
 *   POST /family/call-wallet/verify  - HMAC check, credit net amount
 *
 * Money path is identical to wallet-link: createOrder -> Razorpay Checkout ->
 * verifyPaymentSignature -> creditFromRazorpay (idempotent by orderId). The
 * webhook and 15-min sweeper also credit any captured payment they find, so a
 * lost verify response can never lose money.
 *
 * Hardening mirrors wallet-link: per-IP rate limits, strict family-web Origin
 * on writes, 8KB body cap, no-store on every response, contact must be active.
 * The daily cap is shared with the SMS wallet-link flow (same contactId key),
 * so a family cannot exceed the rolling 24h limit by using both paths.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { readDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const { getPaymentByOrder, committedPaiseByContact, reservePaymentSlot, creditFromRazorpay } = require('../lib/wallet-credit');
const { createOrder, verifyPaymentSignature, configured, keyId, RazorpayError } = require('../lib/razorpay');
const { getStatement } = require('../lib/jail-account');
const { callInmateName } = require('../lib/names');

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
let originUnconfiguredWarned = false;
function familyOriginOnly(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowed = (process.env.FAMILY_WEB_URL || '').trim();
  if (allowed) {
    try {
      if (new URL(origin).origin === new URL(allowed).origin) return next();
    } catch { /* fall through */ }
    return sendError(res, 'FORBIDDEN', 'Origin not allowed', 403);
  }
  if (process.env.NODE_ENV !== 'production') {
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host === '127.0.0.1') return next();
    } catch { /* fall through */ }
  }
  if (!originUnconfiguredWarned) {
    originUnconfiguredWarned = true;
    console.warn('[call-wallet] FAMILY_WEB_URL is not set - rejecting browser payment requests.');
  }
  return sendError(res, 'FORBIDDEN', 'Origin not allowed', 403);
}

// Post-parse body cap (same 8KB bound as wallet-link; closes the chunked hole).
router.use((req, res, next) => {
  if (req.rawBody && req.rawBody.length > 8 * 1024) {
    return sendError(res, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413);
  }
  next();
});

function noStore(res) {
  res.set('Cache-Control', 'no-store');
}

/**
 * Validate the family call JWT. On success attaches
 * req.family = { contactId, callId, roomId, kioskId }.
 */
function requireFamilyCallJwt(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return sendError(res, 'UNAUTHORIZED', 'Session token required', 401);
  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    return sendError(res, 'UNAUTHORIZED', 'Session expired. Please start again.', 401);
  }
  // Claims must be plain strings. A crafted JWT can put an object/array in
  // `sub`/`callId`; String(obj) throws on objects with a non-function toString,
  // which would crash the middleware with an unhandled 500 (attack test B4).
  if (
    claims.role !== 'family' ||
    typeof claims.sub !== 'string' || !claims.sub ||
    typeof claims.callId !== 'string' || !claims.callId
  ) {
    return sendError(res, 'UNAUTHORIZED', 'Invalid session', 401);
  }
  req.family = {
    contactId: claims.sub,
    callId: claims.callId,
    roomId: typeof claims.roomId === 'string' ? claims.roomId : null,
    kioskId: typeof claims.kioskId === 'string' ? claims.kioskId : null,
  };
  next();
}

/**
 * Resolve the call + contact behind the JWT. Returns null (and has already
 * answered) when the call is missing, belongs to another contact, or the
 * contact is no longer approved. The call may already be 'completed' — the
 * whole point of this surface is post-call recharge.
 */
async function resolveCallSession(req, res) {
  const { contactId, callId } = req.family;
  const [calls, contacts] = await Promise.all([readDb('calls.json'), readDb('contacts.json')]);
  const call = calls.find((c) => c.callId === callId);
  // Cross-contact guard: the JWT must belong to this exact call's contact.
  if (!call || call.contactId !== contactId) {
    sendError(res, 'NOT_FOUND', 'Call session not found', 404);
    return null;
  }
  const contact = contacts.find((c) => c.contactId === contactId);
  if (!contact || contact.approvalStatus === 'rejected' || contact.status === 'blocked' || contact.active === false) {
    sendError(res, 'CONTACT_DISABLED', 'This family contact is no longer approved', 403);
    return null;
  }
  return { call, contact, inmateId: call.inmateId };
}

async function findInmate(inmateId) {
  const inmates = await readDb('inmates.json');
  return inmates.find((i) => i.inmateId === inmateId) ||
    inmates.find((i) => i.inmateId === `INM-${inmateId}`) ||
    inmates.find((i) => `INM-${i.inmateId}` === inmateId) ||
    null;
}

/** Balance as derived from the ledger (never the cache alone). */
async function balanceCopy(inmateId) {
  const stmt = await getStatement(inmateId);
  return stmt && stmt.wallet ? (Number(stmt.wallet.balance) || 0) : 0;
}

// ---------------------------------------------------------------------------
// GET /family/call-wallet/info
// ---------------------------------------------------------------------------
router.get('/call-wallet/info', requireFamilyCallJwt, infoLimiter, asyncRoute(async (req, res) => {
  noStore(res);
  const session = await resolveCallSession(req, res);
  if (!session) return;

  const inmate = await findInmate(session.inmateId);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate record not found', 404);

  return sendSuccess(res, {
    inmateName: callInmateName(session.call, inmate),
    balance: await balanceCopy(session.inmateId),
    currency: 'INR',
    limits: { minRupees: MIN_RUPEES, maxRupees: MAX_RUPEES },
  });
}));

// ---------------------------------------------------------------------------
// POST /family/call-wallet/order
// ---------------------------------------------------------------------------
router.post('/call-wallet/order', requireFamilyCallJwt, orderLimiter, familyOriginOnly, asyncRoute(async (req, res) => {
  noStore(res);
  const session = await resolveCallSession(req, res);
  if (!session) return;

  const amountRupees = req.body && req.body.amount;
  if (!Number.isInteger(amountRupees) || amountRupees < MIN_RUPEES || amountRupees > MAX_RUPEES) {
    return sendError(res, 'INVALID_AMOUNT', `Amount must be a whole number between ₹${MIN_RUPEES} and ₹${MAX_RUPEES}`, 400);
  }

  const inmate = await findInmate(session.inmateId);
  if (!inmate) return sendError(res, 'NOT_FOUND', 'Inmate record not found', 404);

  if (!configured()) {
    return sendError(res, 'PAYMENT_NOT_CONFIGURED', 'Online payment is not available right now', 503);
  }

  const amountPaise = amountRupees * 100;
  const capPaise = DAILY_CAP_RUPEES * 100;
  // Quick non-atomic pre-check: fast-fails the common case WITHOUT creating a
  // gateway order. The authoritative enforcement is the atomic reserve below.
  const alreadyCommitted = await committedPaiseByContact(session.contact.contactId);
  if (alreadyCommitted + amountPaise > capPaise) {
    return sendError(res, 'DAILY_LIMIT', `Daily deposit limit is ₹${DAILY_CAP_RUPEES}. Please try again tomorrow.`, 400);
  }

  const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  let order;
  try {
    order = await createOrder({
      amountPaise,
      receipt: paymentId,
      notes: {
        source: 'call-session',
        callId: session.call.callId,
        contactId: session.contact.contactId,
        inmateId: session.inmateId,
      },
    });
  } catch (err) {
    if (err instanceof RazorpayError && err.code === 'PAYMENT_NOT_CONFIGURED') {
      return sendError(res, 'PAYMENT_NOT_CONFIGURED', 'Online payment is not available right now', 503);
    }
    throw err;
  }

  // Atomic cap check + row insert inside the wallet-payments mutex. Closes
  // the TOCTOU race where two concurrent order requests both read
  // committed=0 and both pass the pre-check above. If the cap is hit here
  // the orphan gateway order is harmless — no payment was made against it.
  // linkId is null: this attempt is not tied to an SMS wallet-link token.
  const reservation = await reservePaymentSlot({
    paymentId,
    orderId: order.id,
    linkId: null,
    contactId: session.contact.contactId,
    inmateId: session.inmateId,
    amountPaise,
    dailyCapPaise: capPaise,
  });
  if (!reservation.ok) {
    if (reservation.reason === 'daily_limit') {
      return sendError(res, 'DAILY_LIMIT', `Daily deposit limit is ₹${DAILY_CAP_RUPEES}. Please try again tomorrow.`, 400);
    }
    return sendError(res, 'ORDER_EXISTS', 'A payment attempt for this order already exists', 409);
  }

  console.log(`[call-wallet] order-created orderId=${order.id} call=${session.call.callId} contact=${session.contact.contactId} inmate=${session.inmateId} paise=${amountPaise} ip=${req.ip}`);

  return sendSuccess(res, {
    orderId: order.id,
    amountPaise,
    currency: 'INR',
    keyId: keyId(),
    balance: await balanceCopy(session.inmateId),
  });
}));

// ---------------------------------------------------------------------------
// POST /family/call-wallet/verify
// ---------------------------------------------------------------------------
router.post('/call-wallet/verify', requireFamilyCallJwt, verifyLimiter, familyOriginOnly, asyncRoute(async (req, res) => {
  noStore(res);
  const session = await resolveCallSession(req, res);
  if (!session) return;

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return sendError(res, 'BAD_REQUEST', 'Missing payment verification fields', 400);
  }

  const attempt = await getPaymentByOrder(razorpayOrderId);
  // Cross-contact guard: the attempt must belong to THIS contact + inmate.
  if (!attempt || attempt.contactId !== session.contact.contactId || attempt.inmateId !== session.inmateId) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Payment session not found for this call', 404);
  }
  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    console.warn(`[call-wallet] signature-rejected orderId=${razorpayOrderId} contact=${session.contact.contactId} ip=${req.ip}`);
    return sendError(res, 'SIGNATURE_INVALID', 'Payment verification failed', 400);
  }

  const out = await creditFromRazorpay({ orderId: razorpayOrderId, paymentId: razorpayPaymentId });
  if (!out.ok) {
    if (String(out.reason || '').startsWith('status_')) {
      return sendError(res, 'PAYMENT_NOT_CAPTURED', 'Payment is not captured yet', 400);
    }
    if (out.reason === 'amount_mismatch' || out.reason === 'order_mismatch' || out.reason === 'payment_id_mismatch') {
      console.warn(`[call-wallet] credit-rejected reason=${out.reason} orderId=${razorpayOrderId} ip=${req.ip}`);
      return sendError(res, 'SIGNATURE_INVALID', 'Payment verification failed', 400);
    }
    throw new Error(`wallet credit failed for ${razorpayOrderId}: ${out.reason}`);
  }

  if (!out.alreadyCredited) {
    console.log(`[call-wallet] credited orderId=${razorpayOrderId} call=${session.call.callId} contact=${session.contact.contactId} inmate=${session.inmateId} netPaise=${out.netPaise} tx=${out.transactionId} ip=${req.ip}`);
  }

  return sendSuccess(res, {
    ok: true,
    creditedPaise: out.netPaise != null ? out.netPaise : (attempt.netCreditedPaise || 0),
    balance: await balanceCopy(session.inmateId),
  });
}));

module.exports = router;
