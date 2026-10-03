/**
 * Canonical person-name resolution.
 *
 * Storage is deliberately mixed: legacy rows carry `name`, contacts carry
 * `fullName`, inmates carry `firstName`/`lastName`, and call records snapshot
 * `inmateName`/`familyMemberName` at creation time. Picking a field inline is
 * how the warden dashboard, the family portal and the kiosk ended up showing
 * different strings (or a raw `CONT-010`) for the same person.
 *
 * Every surface that renders a person must go through these helpers.
 */

/** Best-effort display name for any person-shaped record. Never returns
 *  "undefined"/"null" — always a plain string (possibly empty). */
function personName(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const candidates = [
    typeof doc.name === 'string' ? doc.name : '',
    typeof doc.fullName === 'string' ? doc.fullName : '',
    [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim(),
    typeof doc.familyMemberName === 'string' ? doc.familyMemberName : '',
  ];
  return candidates.map((s) => s.trim()).find(Boolean) || '';
}

const inmateName = (doc) => personName(doc);
const contactName = (doc) => personName(doc);

/** Name to show for the inmate side of a call. Prefers the live record over
 *  the snapshot taken when the call was created. */
function callInmateName(call, inmate) {
  return personName(inmate) || (call && personName({ name: call.inmateName })) || '';
}

/** Name to show for the family side of a call. */
function callContactName(call, contact) {
  return personName(contact)
    || (call && personName({ name: call.contactName || call.familyMemberName }))
    || '';
}

module.exports = { personName, inmateName, contactName, callInmateName, callContactName };
