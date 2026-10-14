const express = require('express');
const { readDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { scopeList, inScopeOf } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');
const { deriveSummary } = require('../lib/jail-account');

const router = express.Router();

// GET /wallets — list all wallets (balance derived from transactions ledger)
router.get('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const wallets = await readDb('wallets.json');
  const transactions = await readDb('transactions.json');

  // Derive accurate balance from transactions for each wallet
  const enriched = wallets.map((w) => {
    const walletTxns = transactions
      .filter((t) => t.walletId === w.walletId || t.inmateId === w.inmateId)
      .map((t) => ({ ...t, status: (t.status === 'success' || t.status === 'completed') ? 'completed' : (t.status || 'completed') }));
    const summary = deriveSummary(walletTxns, w);
    return { ...w, ...summary };
  });

  const scoped = await scopeList(req, enriched);
  const result = await paginate({
    req, data: scoped,
    search: (w, q) =>
      (w.inmateId || '').toLowerCase().includes(q) ||
      (w.walletId || '').toLowerCase().includes(q),
    searchFields: [],
    defaultSort: 'balance',
  });
  return sendSuccess(res, result);
}));

// GET /wallets/:inmateId — get wallet by inmate ID (balance derived from transactions)
router.get('/:inmateId', requireAuth, requireRole('admin', 'warden', 'kiosk_admin', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const wallets = await readDb('wallets.json');
  const transactions = await readDb('transactions.json');
  const wallet = wallets.find((w) => w.inmateId === req.params.inmateId);
  if (!wallet || !(await inScopeOf(req, wallet))) return sendError(res, 'NOT_FOUND', 'Wallet not found', 404);
  const walletTxns = transactions
    .filter((t) => t.walletId === wallet.walletId || t.inmateId === wallet.inmateId)
    .map((t) => ({ ...t, status: (t.status === 'success' || t.status === 'completed') ? 'completed' : (t.status || 'completed') }));
  const summary = deriveSummary(walletTxns, wallet);
  return sendSuccess(res, { ...wallet, ...summary });
}));

// POST /wallets/:inmateId/recharge was REMOVED: wallet money can only enter
// through the family Razorpay wallet-link flow (routes/wallet-link.js), where
// the amount is enforced by the gateway's own payment entity.

module.exports = router;
