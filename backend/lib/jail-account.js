/**
 * Wallet statement layer.
 *
 * The wallet statement is the SINGLE source of truth for everything the app
 * shows about money (balance, total spent, last recharge). Derived values are
 * computed here once, from the transaction ledger, so the dashboard, profile
 * and wallet screens always agree and the frontend never has to re-derive them.
 *
 * There is no external accounting API. Money only ever enters a wallet through
 * the platform's own Razorpay flow (lib/wallet-credit.js) and leaves it through
 * call charges, so transactions.json is a complete ledger on its own.
 */
const { readDb } = require('./db');

/** Resolve an inmate record by inmateId / assignedKioskId / prisonerNumber. */
async function resolveInmate(id) {
  const inmates = await readDb('inmates.json');
  return (
    inmates.find((i) => i.inmateId === id) ||
    inmates.find((i) => i.assignedKioskId === id) ||
    inmates.find((i) => i.prisonerNumber === id) ||
    null
  );
}

/** Find the internal wallet for an inmate, via walletId first, then inmateId. */
async function internalWallet(inmate) {
  const wallets = await readDb('wallets.json');
  return (
    wallets.find((w) => inmate.walletId && w.walletId === inmate.walletId) ||
    wallets.find((w) => w.inmateId === inmate.inmateId) ||
    wallets.find((w) => w.inmateId === `INM-${inmate.inmateId}`) ||
    null
  );
}

/** All internal transactions belonging to a wallet. */
async function internalTransactions(wallet) {
  const transactions = await readDb('transactions.json');
  return transactions.filter((t) => t.walletId === wallet.walletId || t.inmateId === wallet.inmateId);
}

/** Derive wallet summary (total spent, last recharge) from a settled ledger. */
function deriveSummary(transactions, wallet = {}) {
  const settled = transactions.filter((t) => {
    const s = String(t.status || '').toLowerCase();
    return s === 'completed';
  });
  const charges = settled.filter((t) => String(t.type || '').toLowerCase() === 'charge');
  const recharges = settled.filter((t) => String(t.type || '').toLowerCase() === 'recharge');

  const totalSpent = charges.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const lastRecharge = recharges.sort((a, b) => {
    const at = new Date(a.timestamp || 0).getTime();
    const bt = new Date(b.timestamp || 0).getTime();
    return bt - at;
  })[0] || null;

  // Recompute the balance from the ledger (recharges minus charges) so the
  // stored counter and the ledger never drift apart. Zero stays zero.
  const deposit = recharges.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const balance = Math.max(0, deposit - totalSpent);

  return {
    balance: Number.isFinite(balance) ? balance : 0,
    totalSpent: Number.isFinite(totalSpent) ? totalSpent : 0,
    lastRecharge: lastRecharge ? lastRecharge.timestamp : null,
    lastRechargeAmount: lastRecharge ? Number(lastRecharge.amount) || 0 : null,
    remainingMinutes: 0,
    transactionCount: settled.length
  };
}

/**
 * Fetch a wallet statement (balance + transactions) for an inmate.
 * Always returns `{ wallet, transactions }`, or null when the inmate/wallet is
 * unknown.
 */
async function getStatement(id) {
  const inmate = await resolveInmate(id);
  if (!inmate) return null;

  const wallet = await internalWallet(inmate);
  if (!wallet) return null;

  const rawTransactions = await internalTransactions(wallet);
  // Normalize: ensure every transaction has status='completed' (standardize on single value)
  const transactions = rawTransactions.map((t) => ({
    ...t,
    status: (t.status === 'success' || t.status === 'completed') ? 'completed' : (t.status || 'completed')
  }));
  const summary = deriveSummary(transactions, wallet);
  return {
    wallet: {
      walletId: wallet.walletId,
      inmateId: wallet.inmateId || inmate.inmateId,
      balance: summary.balance,
      currency: wallet.currency || 'INR',
      status: wallet.status || 'active',
      totalSpent: summary.totalSpent,
      lastRecharge: summary.lastRecharge,
      lastRechargeAmount: summary.lastRechargeAmount,
      remainingMinutes: summary.remainingMinutes
    },
    transactions
  };
}

module.exports = { getStatement, resolveInmate, deriveSummary };
