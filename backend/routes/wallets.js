const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { scopeList, inScopeOf } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');
const { v4: uuidv4 } = require('uuid');
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
router.get('/:inmateId', requireAuth, asyncRoute(async (req, res) => {
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

// POST /wallets/:inmateId/recharge — recharge wallet
router.post('/:inmateId/recharge', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const { amount, description } = req.body;
  if (!amount || amount <= 0) return sendError(res, 'BAD_REQUEST', 'Invalid amount');

  const wallets = await readDb('wallets.json');
  let wallet = wallets.find((w) => w.inmateId === req.params.inmateId);

  // Scope check: verify warden can access this inmate
  if (wallet) {
    if (!(await inScopeOf(req, wallet))) return sendError(res, 'NOT_FOUND', 'Wallet not found', 404);
  } else {
    // New wallet — verify the inmate belongs to warden's prison
    const inmates = await readDb('inmates.json');
    const inmate = inmates.find((i) => i.inmateId === req.params.inmateId);
    if (!inmate || !(await inScopeOf(req, inmate))) return sendError(res, 'NOT_FOUND', 'Inmate not found', 404);
  }

  const transaction = {
    transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    walletId: wallet ? wallet.walletId : null,
    inmateId: req.params.inmateId,
    type: 'recharge',
    status: 'completed',
    amount: Number(amount),
    description: description || 'Wallet recharge',
    timestamp: new Date().toISOString(),
    performedBy: req.auth?.sub || 'system'
  };

  if (wallet) {
    // Update existing wallet
    await updateDb('wallets.json', (all) => {
      const idx = all.findIndex((w) => w.inmateId === req.params.inmateId);
      if (idx !== -1) {
        all[idx].balance = (all[idx].balance || 0) + Number(amount);
        all[idx].lastRecharge = new Date().toISOString();
        all[idx].lastRechargeAmount = Number(amount);
        all[idx].totalRecharged = (all[idx].totalRecharged || 0) + Number(amount);
        all[idx].updatedAt = new Date().toISOString();
      }
      return { data: all, result: all[idx] };
    });

    // Record transaction
    await updateDb('transactions.json', (all) => {
      all.push(transaction);
      return { data: all, result: transaction };
    });

    // Re-read wallet to get updated data
    const updatedWallets = await readDb('wallets.json');
    const updatedWallet = updatedWallets.find((w) => w.inmateId === req.params.inmateId);
    return sendSuccess(res, { wallet: updatedWallet, transaction });
  } else {
    // Create new wallet
    const newWallet = {
      walletId: `WAL-${Date.now()}`,
      inmateId: req.params.inmateId,
      balance: Number(amount),
      currency: 'INR',
      totalSpent: 0,
      totalRecharged: Number(amount),
      lastRecharge: new Date().toISOString(),
      lastRechargeAmount: Number(amount),
      remainingMinutes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await updateDb('wallets.json', (all) => {
      all.push(newWallet);
      return { data: all, result: newWallet };
    });

    await updateDb('transactions.json', (all) => {
      all.push(transaction);
      return { data: all, result: transaction };
    });

    return sendSuccess(res, { wallet: newWallet, transaction });
  }
}));

module.exports = router;
