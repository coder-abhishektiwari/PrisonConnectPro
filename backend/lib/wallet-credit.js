/**
 * Razorpay -> wallet crediting. The single source of truth is the ledger
 * (transactions.json); wallets.balance is a mutable cache guarded by an
 * idempotency marker so no code path can ever double-credit.
 *
 * Both the verify endpoint and the payment.captured webhook funnel through
 * `creditFromRazorpay()`; orderId is the idempotency key checked inside the
 * transactions mutex, so a retried webhook or a page-refresh verify can never
 * add the money twice.
 *
 * Crash model:
 *  - row 'created' + money captured (server down): webhook retries + the
 *    reconciler sweep re-probes the order -> credit lands, nothing is lost.
 *  - ledger insert done but counters not yet bumped: next run sees the ledger
 *    row and bumps the cache exactly once (lastCreditTxnId marker).
 *
 * All functions accept an optional `deps` (readDb/updateDb/fetchPayment) so
 * unit tests run against an in-memory fake without DATABASE_URL.
 */
const { readDb: realRead, updateDb: realUpdate } = require('./db');
const { pickWallet, newWalletRecord } = require('./wallets');
const razorpay = require('./razorpay');

const RECHARGE_TYPE = 'recharge';

function newTxnId() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Normalise updateDb's two return shapes: with a pool it returns the mutator's
 * `result` directly (a domain record or null); without one it returns the
 * `{ data: [], result: null }` placeholder.
 */
function mutatorResult(out) {
  if (out && typeof out === 'object' && Array.isArray(out.data) && 'result' in out) return out.result;
  return out;
}

/** Find a payment attempt by its Razorpay order id. */
async function getPaymentByOrder(orderId, deps = {}) {
  const read = deps.readDb || realRead;
  const rows = await read('wallet-payments.json');
  return rows.find((r) => r.orderId === orderId) || null;
}

/**
 * Create the payment attempt row before asking Razorpay for an order.
 * Returns null if an attempt for this orderId already exists (idempotent).
 */
async function createPaymentRow(fields, deps = {}) {
  const update = deps.updateDb || realUpdate;
  const now = new Date().toISOString();
  const record = {
    paymentId: fields.paymentId,
    orderId: fields.orderId || null,
    linkId: fields.linkId,
    contactId: fields.contactId,
    inmateId: fields.inmateId,
    amountPaise: fields.amountPaise,
    currency: 'INR',
    status: 'created',
    razorpayPaymentId: null,
    transactionId: null,
    walletId: null,
    netCreditedPaise: null,
    feePaise: null,
    taxPaise: null,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  const out = await update('wallet-payments.json', (all) => {
    if (all.some((r) => r.orderId && r.orderId === record.orderId)) {
      return { data: all, result: null };
    }
    all.push(record);
    return { data: all, result: record };
  });
  return mutatorResult(out);
}

/** Rolling-24h gross already committed by a contact (created + credited). */
async function committedPaiseByContact(contactId, deps = {}) {
  const read = deps.readDb || realRead;
  const rows = await read('wallet-payments.json');
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return rows
    .filter((r) => r.contactId === contactId &&
      (r.status === 'created' || r.status === 'credited') &&
      new Date(r.createdAt || 0).getTime() >= since)
    .reduce((sum, r) => sum + (Number(r.amountPaise) || 0), 0);
}

/** Flip an attempt to failed (payment.failed webhook). Never touches money. */
async function markPaymentFailed(orderId, reason, deps = {}) {
  const update = deps.updateDb || realUpdate;
  const out = await update('wallet-payments.json', (all) => {
    const idx = all.findIndex((r) => r.orderId === orderId);
    if (idx === -1 || all[idx].status === 'credited' || all[idx].status === 'failed') {
      return { data: all, result: null };
    }
    all[idx] = { ...all[idx], status: 'failed', failureReason: String(reason || 'failed').slice(0, 200), updatedAt: new Date().toISOString() };
    return { data: all, result: all[idx] };
  });
  return mutatorResult(out);
}

async function markPaymentExpired(orderId, deps = {}) {
  const update = deps.updateDb || realUpdate;
  const out = await update('wallet-payments.json', (all) => {
    const idx = all.findIndex((r) => r.orderId === orderId);
    if (idx === -1 || all[idx].status !== 'created') return { data: all, result: null };
    all[idx] = { ...all[idx], status: 'expired', updatedAt: new Date().toISOString() };
    return { data: all, result: all[idx] };
  });
  return mutatorResult(out);
}

/**
 * Idempotent credit. `entity` (from a webhook payload) spares an API fetch;
 * otherwise the payment is fetched authoritatively from Razorpay.
 *
 * Returns { ok, alreadyCredited?, netPaise?, transaction?, reason? }.
 */
async function creditFromRazorpay({ orderId, paymentId, entity } = {}, deps = {}) {
  const read = deps.readDb || realRead;
  const update = deps.updateDb || realUpdate;
  const fetchPayment = deps.fetchPayment || razorpay.fetchPayment;

  if (!orderId) return { ok: false, reason: 'missing_order' };

  const row = await getPaymentByOrder(orderId, deps);
  if (!row) return { ok: false, reason: 'unknown_order' };
  if (row.status === 'credited') {
    return { ok: true, alreadyCredited: true, transactionId: row.transactionId, netPaise: row.netCreditedPaise };
  }

  // --- authoritative capture data -------------------------------------
  let pay = entity || null;
  if (!pay || pay.fee == null) {
    pay = await fetchPayment(paymentId || row.razorpayPaymentId);
  }
  if (!pay) return { ok: false, reason: 'no_payment_entity' };
  if (pay.order_id && pay.order_id !== orderId) return { ok: false, reason: 'order_mismatch' };
  if (String(pay.status) !== 'captured') return { ok: false, reason: `status_${pay.status}` };
  if (pay.id && row.razorpayPaymentId && pay.id !== row.razorpayPaymentId) {
    return { ok: false, reason: 'payment_id_mismatch' };
  }
  const amountPaise = Number(pay.amount) || 0;
  if (amountPaise !== Number(row.amountPaise)) {
    console.error(`[wallet-credit] amount mismatch order=${orderId} expected=${row.amountPaise} got=${amountPaise} - NOT crediting`);
    return { ok: false, reason: 'amount_mismatch' };
  }
  const fee = Number(pay.fee) || 0;
  const tax = Number(pay.tax) || 0;
  const net = Math.max(0, amountPaise - fee - tax);

  // --- wallet (create-once inside the wallets mutex) -------------------
  let wallet = pickWallet(await read('wallets.json'), row.inmateId, null);
  if (!wallet) {
    const created = newWalletRecord(row.inmateId, null);
    wallet = mutatorResult(await update('wallets.json', (all) => {
      const again = pickWallet(all, row.inmateId, null);
      if (again) return { data: all, result: again };
      all.push(created);
      return { data: all, result: created };
    })) || created;
  }

  // --- ledger-first idempotent insert (orderId is the key) -------------
  const now = new Date().toISOString();
  const ledgerResult = mutatorResult(await update('transactions.json', (all) => {
    const existing = all.find((t) => t.type === RECHARGE_TYPE && t.orderId === orderId);
    if (existing) return { data: all, result: { inserted: false, transaction: existing } };
    const transaction = {
      transactionId: newTxnId(),
      walletId: wallet.walletId || null,
      inmateId: row.inmateId,
      type: RECHARGE_TYPE,
      status: 'completed',
      amount: net,                    // net credited - what the inmate sees
      grossAmount: amountPaise,       // what the family actually paid
      fee,
      tax,
      gateway: 'razorpay',
      orderId,
      paymentId: pay.id || paymentId || null,
      // Charges live in grossAmount/fee/tax and are rendered by each UI as a
      // sub-line; the description stays short so list rows never truncate.
      description: 'Wallet deposit via Razorpay',
      timestamp: now,
      performedBy: 'razorpay',
    };
    all.push(transaction);
    return { data: all, result: { inserted: true, transaction } };
  }));
  const { inserted, transaction } = ledgerResult || { inserted: false, transaction: null };
  if (!transaction) return { ok: false, reason: 'ledger_write_failed' };

  // --- cache counters, guarded by the ledger txn id (crash-safe) -------
  await update('wallets.json', (all) => {
    const idx = all.findIndex((w) => w.walletId === wallet.walletId);
    if (idx === -1) return { data: all, result: null };
    const w = all[idx];
    if (w.lastCreditTxnId === transaction.transactionId) return { data: all, result: w };
    w.balance = (Number(w.balance) || 0) + net;
    w.totalRecharged = (Number(w.totalRecharged) || 0) + net;
    w.lastRecharge = now;
    w.lastRechargeAmount = net;
    w.lastCreditTxnId = transaction.transactionId;
    w.updatedAt = now;
    return { data: all, result: w };
  });

  // --- flip the attempt row (verify + webhook both land here) ----------
  await update('wallet-payments.json', (all) => {
    const idx = all.findIndex((r) => r.orderId === orderId);
    if (idx === -1) return { data: all, result: null };
    all[idx] = {
      ...all[idx],
      status: 'credited',
      razorpayPaymentId: pay.id || paymentId || null,
      transactionId: transaction.transactionId,
      walletId: wallet.walletId || null,
      netCreditedPaise: net,
      feePaise: fee,
      taxPaise: tax,
      creditedAt: now,
      updatedAt: now,
    };
    return { data: all, result: all[idx] };
  });

  return { ok: true, alreadyCredited: !inserted, transaction, netPaise: net, transactionId: transaction.transactionId };
}

/**
 * Reconciler sweep: recover payments the gateway captured while our server
 * could not process the webhook (downtime, restarts). Runs on an interval from
 * server.js. Never throws - a probe failure just waits for the next tick.
 */
let sweeping = false;
async function sweepWalletPayments(deps = {}) {
  if (sweeping) return { skipped: true };
  if (!razorpay.configured()) return { skipped: true, reason: 'not_configured' };
  sweeping = true;
  const stats = { credited: 0, failed: 0, expired: 0, pending: 0, errors: 0 };
  try {
    const read = deps.readDb || realRead;
    const rows = await read('wallet-payments.json');
    const now = Date.now();
    const candidates = rows.filter((r) => r.status === 'created' && now - new Date(r.createdAt || 0).getTime() > 2 * 60 * 1000);
    for (const r of candidates) {
      try {
        const payments = await (deps.fetchPaymentsForOrder || razorpay.fetchPaymentsForOrder)(r.orderId);
        const captured = payments.find((p) => String(p.status) === 'captured');
        if (captured) {
          const out = await creditFromRazorpay({ orderId: r.orderId, paymentId: captured.id, entity: captured }, deps);
          if (out.ok) stats.credited += 1;
          else stats.errors += 1;
          continue;
        }
        const failed = payments.find((p) => String(p.status) === 'failed');
        if (failed && payments.length > 0) {
          await markPaymentFailed(r.orderId, failed.error_description || 'gateway_failed', deps);
          stats.failed += 1;
          continue;
        }
        if (payments.length === 0 && now - new Date(r.createdAt || 0).getTime() > 24 * 60 * 60 * 1000) {
          await markPaymentExpired(r.orderId, deps);
          stats.expired += 1;
          continue;
        }
        stats.pending += 1;
      } catch (err) {
        stats.errors += 1;
        console.warn(`[wallet-sweep] probe failed for ${r.orderId}: ${err.message}`);
      }
    }
  } finally {
    sweeping = false;
  }
  if (stats.credited || stats.failed || stats.expired) {
    console.log(`[wallet-sweep] credited=${stats.credited} failed=${stats.failed} expired=${stats.expired} pending=${stats.pending} errors=${stats.errors}`);
  }
  return stats;
}

module.exports = {
  RECHARGE_TYPE,
  getPaymentByOrder,
  createPaymentRow,
  committedPaiseByContact,
  markPaymentFailed,
  markPaymentExpired,
  creditFromRazorpay,
  sweepWalletPayments,
};
