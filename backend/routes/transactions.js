const express = require('express');
const { readDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inScopeOf, scopeList } = require('../lib/scoping');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => sendSuccess(res, await scopeList(req, await readDb('transactions.json')))));

router.get('/:transactionId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
  const transactions = await readDb('transactions.json');
  const transaction = transactions.find((t) => t.transactionId === req.params.transactionId);
  if (!transaction || !(await inScopeOf(req, transaction))) return sendError(res, 'NOT_FOUND', 'Transaction not found', 404);
  return sendSuccess(res, transaction);
}));

router.get('/wallet/:walletId', requireAuth, asyncRoute(async (req, res) => {
  const transactions = await readDb('transactions.json');
  return sendSuccess(res, await scopeList(req, transactions.filter((t) => t.walletId === req.params.walletId)));
}));

module.exports = router;
