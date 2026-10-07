// Shared view helpers for kiosk devices: which rows are seeded demo units and
// which prisoners are actually attached to a device.

// The seeded demo fleet ships with a fake serial (PC-KSK-2024-00NN). Real
// kiosks register with the hardware serial read from the device, so the prefix
// reliably separates demo rows from kiosks installed in a jail. Demo rows stay
// in the database (legacy calls/inmates point at them) but are never listed or
// reported on.
const DEMO_SERIAL_PREFIX = 'PC-KSK-';

function isDemoKiosk(k) {
  return !!k && String(k.deviceSerialNumber || '').startsWith(DEMO_SERIAL_PREFIX);
}

// Ward labels used to be derived from each inmate's block/cell — those fields
// are gone from the inmate record, so a kiosk's location is simply the device
// location now. All that is left of this helper is the per-kiosk headcount.

// One pass over the inmates: how many are registered on each kiosk, so
// listing kiosks stays O(inmates + kiosks) instead of a lookup per row.
function buildInmateIndex({ inmates, inScope }) {
  const inmateCount = new Map();

  for (const i of inmates || []) {
    if (!i.assignedKioskId || (inScope && !inScope(i))) continue;
    const id = i.assignedKioskId;
    inmateCount.set(id, (inmateCount.get(id) || 0) + 1);
  }

  return {
    countFor: (kioskId) => inmateCount.get(kioskId) || 0,
  };
}

module.exports = { isDemoKiosk, buildInmateIndex };
