/**
 * Shared RFID card-number rules — every write path enforces the same
 * strict 10-digit format from registration through storage.
 */

const BCRYPT_RE = /^\$2[aby]\$/;
const RFID_10_DIGITS = /^\d{10}$/;

/** Strict format check: exactly 10 digits, nothing else. */
function isValidRfidNumber(value) {
  return RFID_10_DIGITS.test(value == null ? '' : String(value));
}

/**
 * Display copy of the RFID card number for inmate details. Registration keeps
 * a plain rfidCardNumber next to the bcrypt-hashed rfidToken; legacy rows hold
 * the raw value in rfidToken itself. Hashed-only rows return null.
 */
function rfidCardNumberFor(i) {
  const bio = i.biometricData || {};
  if (!bio.rfidRegistered) return null;
  if (bio.rfidCardNumber) return String(bio.rfidCardNumber);
  const token = bio.rfidToken;
  if (token && !BCRYPT_RE.test(String(token))) return String(token);
  return null;
}

/**
 * Validates inline biometricData before it is hashed/persisted.
 * Returns an error message, or null when the payload is acceptable.
 * Already-bcrypt tokens (admin edits round-tripping stored data) pass
 * through untouched so legacy rows keep saving.
 */
function biometricValidationError(biometricData) {
  const token = biometricData && biometricData.rfidToken;
  if (!token) return null;
  if (BCRYPT_RE.test(String(token))) return null;
  if (!isValidRfidNumber(token)) return 'RFID card number must be exactly 10 digits';
  return null;
}

module.exports = { isValidRfidNumber, rfidCardNumberFor, biometricValidationError, BCRYPT_RE };
