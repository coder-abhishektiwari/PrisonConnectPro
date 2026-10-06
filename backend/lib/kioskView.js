// Shared view helpers for kiosk devices: which rows are seeded demo units and
// which wards/prisoners are actually attached to a device.

// The seeded demo fleet ships with a fake serial (PC-KSK-2024-00NN). Real
// kiosks register with the hardware serial read from the device, so the prefix
// reliably separates demo rows from kiosks installed in a jail. Demo rows stay
// in the database (legacy calls/inmates point at them) but are never listed or
// reported on.
const DEMO_SERIAL_PREFIX = 'PC-KSK-';

function isDemoKiosk(k) {
  return !!k && String(k.deviceSerialNumber || '').startsWith(DEMO_SERIAL_PREFIX);
}

// Ward label an inmate carries: the normalized block first, then the free-text
// cellBlock. There is no per-cell range on a kiosk — the ward is derived from
// the prisoners actually registered on the device.
function wardLabel(inmate, blockMap) {
  return (inmate.blockId && blockMap.get(inmate.blockId)) || inmate.blockName || inmate.cellBlock || '';
}

// One pass over the inmates: how many are registered on each kiosk and which
// wards they live in, so listing kiosks stays O(inmates + kiosks) instead of a
// lookup per row.
function buildWardIndex({ inmates, blocks, inScope }) {
  const blockMap = new Map((blocks || []).map((b) => [b.blockId, b.name]));
  const inmateCount = new Map();
  const wardSet = new Map();

  for (const i of inmates || []) {
    if (!i.assignedKioskId || (inScope && !inScope(i))) continue;
    const id = i.assignedKioskId;
    inmateCount.set(id, (inmateCount.get(id) || 0) + 1);
    const w = wardLabel(i, blockMap);
    if (w) {
      if (!wardSet.has(id)) wardSet.set(id, new Set());
      wardSet.get(id).add(w);
    }
  }

  return {
    countFor: (kioskId) => inmateCount.get(kioskId) || 0,
    wardsFor: (kioskId) => [...(wardSet.get(kioskId) || [])],
    wardFor(kioskId) {
      const wards = [...(wardSet.get(kioskId) || [])];
      return wards.length ? wards.join(', ') : null;
    },
  };
}

module.exports = { isDemoKiosk, wardLabel, buildWardIndex };
