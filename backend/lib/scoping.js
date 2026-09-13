const { readDb } = require('./db');

function jailScopeOf(req) {
  return req.auth?.prisonId || req.auth?.jailId || null;
}

function inJailScope(req, record) {
  const jailId = jailScopeOf(req);
  if (!jailId) return true;
  return !!record && (record.prisonId === jailId || record.facility === jailId || record.jailId === jailId);
}

function scopeFilter(req) {
  const jailId = jailScopeOf(req);
  return (x) => !jailId || x.prisonId === jailId || x.facility === jailId || x.jailId === jailId;
}

function kioskScopeOf(req) {
  return req.auth?.kioskId || null;
}

function inKioskScope(req, record) {
  const kioskId = kioskScopeOf(req);
  if (!kioskId) return true;
  return !!record && (record.assignedKioskId === kioskId || record.kioskId === kioskId);
}

function inAdminScope(req, record) {
  return inJailScope(req, record) && inKioskScope(req, record);
}

function adminScopeFilter(req) {
  return (x) => inAdminScope(req, x);
}

async function inScopeOf(req, record) {
  const kioskId = kioskScopeOf(req);
  const jailId = jailScopeOf(req);
  if (!kioskId && !jailId) return true;
  if (!record) return false;

  let recKiosk = record.kioskId || record.assignedKioskId || null;
  let recJail = record.prisonId || record.jailId || record.facility || null;
  let refInmateId = record.inmateId || null;

  if (record.walletId) {
    const wallets = await readDb('wallets.json');
    const wallet = wallets.find((w) => w.walletId === record.walletId);
    if (wallet) refInmateId = wallet.inmateId;
  }

  if (refInmateId) {
    const inmates = await readDb('inmates.json');
    const owner = inmates.find((i) => i.inmateId === refInmateId) ||
                  inmates.find((i) => i.inmateId === `INM-${refInmateId}`);
    if (owner) {
      recKiosk = recKiosk || owner.assignedKioskId || owner.kioskId;
      recJail = recJail || owner.prisonId;
    }
  }

  if (!recJail && recKiosk) {
    const kiosks = await readDb('kiosks.json');
    const k = kiosks.find((x) => x.kioskId === recKiosk);
    if (k) recJail = k.prisonId;
  }

  if (kioskId && recKiosk && recKiosk !== kioskId) return false;
  if (jailId && recJail && recJail !== jailId) return false;
  return true;
}

async function scopeList(req, records) {
  const out = [];
  for (const r of records) if (await inScopeOf(req, r)) out.push(r);
  return out;
}

module.exports = {
  jailScopeOf, inJailScope, scopeFilter,
  kioskScopeOf, inKioskScope, inAdminScope, adminScopeFilter,
  inScopeOf, scopeList
};
