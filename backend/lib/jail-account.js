/**
 * Jail-account integration layer.
 *
 * The kiosk wallet screen must reflect the inmate's REAL jail account balance
 * and the deductions applied to it. When JAIL_ACCOUNT_API_URL is configured
 * this module calls the external prison/jail accounting API. Otherwise it falls
 * back to the internal Postgres-backed collections (wallets.json /
 * transactions.json) so the kiosk keeps working during development.
 */
const { readDb } = require('./db');

const JAIL_ACCOUNT_API_URL = process.env.JAIL_ACCOUNT_API_URL || '';
const JAIL_ACCOUNT_TIMEOUT_MS = parseInt(process.env.JAIL_ACCOUNT_TIMEOUT_MS || '4000', 10);

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
  return transactions.filter((t) => t.walletId === wallet.walletId);
}

/** Try the external jail accounting API. Returns null when not configured/failing. */
async function externalStatement(wallet) {
  if (!JAIL_ACCOUNT_API_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JAIL_ACCOUNT_TIMEOUT_MS);
  try {
    const res = await fetch(`${JAIL_ACCOUNT_API_URL}/accounts/${encodeURIComponent(wallet.walletId)}/statement`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      console.error(`[jail-account] external API ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[jail-account] external API fetch failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a wallet statement (balance + transactions) for an inmate.
 * Always returns { wallet, transactions } with internal data as fallback.
 */
async function getStatement(id) {
  const inmate = await resolveInmate(id);
  if (!inmate) return null;

  const wallet = await internalWallet(inmate);
  if (!wallet) return null;

  const external = await externalStatement(wallet);
  if (external && (external.wallet || external.balance != null) && Array.isArray(external.transactions)) {
    return {
      wallet: {
        walletId: wallet.walletId,
        inmateId: wallet.inmateId || inmate.inmateId,
        balance: external.balance != null ? external.balance : external.wallet?.balance,
        currency: external.currency || external.wallet?.currency || wallet.currency || 'INR',
        status: external.status || external.wallet?.status || wallet.status || 'active'
      },
      transactions: external.transactions
    };
  }

  const transactions = await internalTransactions(wallet);
  return {
    wallet: {
      walletId: wallet.walletId,
      inmateId: wallet.inmateId || inmate.inmateId,
      balance: wallet.balance,
      currency: wallet.currency || 'INR',
      status: wallet.status || 'active'
    },
    transactions
  };
}

module.exports = { getStatement, resolveInmate };