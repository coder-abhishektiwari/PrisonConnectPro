/**
 * One-shot backfill: give every inmate a wallet.
 *
 * `POST /prisoners` only started provisioning wallets in this release, so any
 * inmate created before it has no wallet row — its kiosk/wallet screens 404 and
 * the call-charge path used to skip the debit entirely. This writes the missing
 * rows (balance 0) and stamps `walletId` back onto the inmate.
 *
 * Usage:  node backend/scripts/backfill-wallets.js [--dry-run]
 * Run once per environment (the DATABASE_URL decides which store it touches).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { readDb, updateDb, pool } = require('../lib/db');
const { pickWallet, newWalletRecord } = require('../lib/wallets');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const [inmates, wallets] = await Promise.all([
    readDb('inmates.json'),
    readDb('wallets.json'),
  ]);

  const rows = [];
  for (const inmate of inmates) {
    if (!inmate || !inmate.inmateId) continue;
    const wallet = pickWallet(wallets, inmate.inmateId, inmate.walletId);
    rows.push({ inmate, wallet });
  }

  const missing = rows.filter((r) => !r.wallet);
  const unstamped = rows.filter((r) => r.wallet && r.inmate.walletId !== r.wallet.walletId);
  console.log(`inmates: ${inmates.length}  wallets: ${wallets.length}`);
  console.log(`missing a wallet row: ${missing.length}  missing walletId stamp: ${unstamped.length}`);
  if (missing.length === 0 && unstamped.length === 0) return;

  const created = missing.map((r) => {
    const walletId = r.inmate.walletId || `WAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`${dryRun ? '[dry-run] would create' : 'creating'} ${walletId} for inmate ${r.inmate.inmateId}`);
    return { inmateId: r.inmate.inmateId, walletId, record: newWalletRecord(r.inmate.inmateId, walletId) };
  });
  const stamps = [
    ...created.map((c) => ({ inmateId: c.inmateId, walletId: c.walletId })),
    ...unstamped.map((r) => {
      console.log(`${dryRun ? '[dry-run] would stamp' : 'stamping'} ${r.wallet.walletId} on inmate ${r.inmate.inmateId}`);
      return { inmateId: r.inmate.inmateId, walletId: r.wallet.walletId };
    }),
  ];

  if (dryRun) return;

  if (created.length) {
    await updateDb('wallets.json', (all) => ({
      data: [...all, ...created.map((c) => c.record)],
      result: created.length,
    }));
  }

  // Stamp walletId back on the inmates so the walletId-first lookups hit.
  for (const s of stamps) {
    await updateDb('inmates.json', (all) => {
      const idx = all.findIndex((i) => i.inmateId === s.inmateId);
      if (idx === -1) return { data: all, result: null };
      all[idx].walletId = s.walletId;
      return { data: all, result: all[idx] };
    });
  }

  const [afterInmates, afterWallets] = await Promise.all([
    readDb('inmates.json'),
    readDb('wallets.json'),
  ]);
  const still = afterInmates.filter(
    (i) => i && i.inmateId && (!pickWallet(afterWallets, i.inmateId, i.walletId) || !i.walletId)
  );
  console.log(`created ${created.length} wallet(s), stamped ${stamps.length}; still missing: ${still.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool && typeof pool.end === 'function') await pool.end();
  });
