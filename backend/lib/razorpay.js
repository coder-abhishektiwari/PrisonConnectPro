/**
 * Razorpay REST client + signature verification.
 *
 * All money math stays in integer paise end to end. The gateway is the
 * authority for what a payment actually cost (fee/tax) - we never estimate.
 *
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
 * Without keys every call rejects with a clear PAYMENT_NOT_CONFIGURED error so
 * deployments can ship the feature disabled until live keys arrive.
 */
const crypto = require('crypto');

const API_BASE = 'https://api.razorpay.com/v1';

function keyId() { return (process.env.RAZORPAY_KEY_ID || '').trim(); }
function keySecret() { return (process.env.RAZORPAY_KEY_SECRET || '').trim(); }
function webhookSecret() { return (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(); }

function configured() {
  return Boolean(keyId() && keySecret());
}

class RazorpayError extends Error {
  constructor(status, code, message) {
    super(message || code || 'Razorpay request failed');
    this.name = 'RazorpayError';
    this.status = status;
    this.code = code || 'GATEWAY_ERROR';
  }
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  if (!configured()) throw new RazorpayError(503, 'PAYMENT_NOT_CONFIGURED', 'Razorpay keys are not configured');
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString('base64');
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const code = json && json.error && json.error.code;
    const desc = json && json.error && json.error.description;
    throw new RazorpayError(res.status, code, desc || `Razorpay ${method} ${path} failed (${res.status})`);
  }
  return json;
}

/**
 * Create an order the family pays. `receipt` is our paymentId (idempotent key
 * on the way back), notes carry the row ids for reconciliation forensics.
 */
async function createOrder({ amountPaise, receipt, notes }) {
  const order = await apiRequest('/orders', {
    method: 'POST',
    body: {
      amount: amountPaise,
      currency: 'INR',
      receipt: String(receipt || '').slice(0, 40),
      notes: notes || {},
    },
  });
  if (!order || !order.id) throw new RazorpayError(502, 'GATEWAY_ERROR', 'Razorpay order creation returned no id');
  return order;
}

/** Authoritative payment entity (amount, fee, tax, status, order_id). */
async function fetchPayment(paymentId) {
  return apiRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

/** All payments ever made against an order - reconciler probe. */
async function fetchPaymentsForOrder(orderId) {
  const out = await apiRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
  return Array.isArray(out && out.items) ? out.items : Array.isArray(out) ? out : [];
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Signature = HMAC-SHA256(order_id|payment_id, key_secret), hex. */
function verifyPaymentSignature(orderId, paymentId, signature) {
  if (!keySecret()) return false;
  const expected = crypto
    .createHmac('sha256', keySecret())
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature = HMAC-SHA256(rawBody, webhook_secret), hex. */
function verifyWebhookSignature(rawBody, signature) {
  const secret = webhookSecret();
  if (!secret || rawBody == null) return false;
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * Net rupees added to the wallet = amount - fee - tax, never below zero.
 * Pure integer math (paise in, paise out) so it is unit-testable without a
 * gateway or a database.
 */
function netFromCharge({ amountPaise, feePaise, taxPaise }) {
  const amount = Math.max(0, Math.trunc(Number(amountPaise) || 0));
  const fee = Math.max(0, Math.trunc(Number(feePaise) || 0));
  const tax = Math.max(0, Math.trunc(Number(taxPaise) || 0));
  return { amountPaise: amount, feePaise: fee, taxPaise: tax, netPaise: Math.max(0, amount - fee - tax) };
}

module.exports = {
  RazorpayError,
  configured,
  keyId,
  createOrder,
  fetchPayment,
  fetchPaymentsForOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  netFromCharge,
};
