const { readDb, updateDb } = require('./db');

/**
 * Wallet provisioning.
 *
 * An inmate without a wallet row is a silent money leak: the call-charge path
 * in routes/calls.js resolves a wallet, finds nothing and skips the debit, so
 * the inmate talks for free. Every code path that can produce or encounter an
 * inmate goes through these helpers instead of hand-rolling the lookup.
 */

/**
 * Canonical wallet shape — mirrors the row routes/wallets.js creates on first
 * recharge, so list/summary code sees one shape no matter which path created it.
 */
function newWalletRecord(inmateId, walletId) {
  const now = new Date().toISOString();
  return {
    walletId: walletId || `WAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    inmateId,
    balance: 0,
    currency: 'INR',
    status: 'active',
    totalSpent: 0,
    totalRecharged: 0,
    remainingMinutes: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Resolve an inmate's wallet using the same precedence everywhere:
 * explicit walletId -> inmateId -> the legacy `INM-` prefixed inmateId.
 */
function pickWallet(wallets, inmateId, walletId) {
  return (
    wallets.find((w) => walletId && w.walletId === walletId) ||
    wallets.find((w) => w.inmateId === inmateId) ||
    wallets.find((w) => w.inmateId === `INM-${inmateId}`) ||
    null
  );
}

/**
 * Idempotent: return the wallet for `inmateId`, creating it (balance 0) if it
 * does not exist yet. Safe to call concurrently — the inner check runs inside
 * the wallets.json mutex.
 *
 * @param {string} inmateId
 * @param {string} [walletId] Pre-allocated id from the inmate record, if any.
 * @returns {Promise<object|null>}
 */
async function ensureWallet(inmateId, walletId) {
  if (!inmateId) return null;

  const existing = pickWallet(await readDb('wallets.json'), inmateId, walletId);
  if (existing) return existing;

  const record = newWalletRecord(inmateId, walletId);
  const created = await updateDb('wallets.json', (all) => {
    // Re-check under the mutex: a parallel ensure may have won.
    const again = pickWallet(all, inmateId, walletId);
    if (again) return { data: all, result: again };
    all.push(record);
    return { data: all, result: record };
  });
  // updateDb hands back `{data, result}` when there is no pool — only trust a
  // real wallet row.
  return created && created.walletId ? created : record;
}

module.exports = { newWalletRecord, pickWallet, ensureWallet };
