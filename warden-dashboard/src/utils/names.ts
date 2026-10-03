/**
 * One place decides how a person's name is written on screen.
 *
 * Three sources disagree in practice: the live `inmates`/`contacts` records
 * (`name`, served normalized), the snapshot frozen onto the call row at
 * creation (`inmateName` / `familyMemberName`), and — when both are missing —
 * the raw id. Reading whichever is convenient is how the warden dashboard ended
 * up showing `CONT-010` for a person. Order here: live record, then the call's
 * own fields, then the id, never an empty cell.
 */

const clean = (value?: string | null): string => (value ?? '').trim();

export function inmateLabel(
  call: { inmateName?: string; inmateId?: string } | null | undefined,
  inmate?: { name?: string } | null
): string {
  return clean(inmate?.name) || clean(call?.inmateName) || clean(call?.inmateId) || '-';
}

export function contactLabel(
  call: { contactName?: string; familyMemberName?: string; contactId?: string } | null | undefined,
  contact?: { name?: string } | null
): string {
  return (
    clean(contact?.name) ||
    clean(call?.contactName) ||
    clean(call?.familyMemberName) ||
    clean(call?.contactId) ||
    '-'
  );
}
