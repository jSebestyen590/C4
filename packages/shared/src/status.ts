/** Membership category: candidate, member, honorary member, external. Only admins change it. */
export const MITGLIED_STATI = ['anwaerter', 'mitglied', 'em', 'extern'] as const;
export type MitgliedStatus = (typeof MITGLIED_STATI)[number];

/** The usual path through the club; each step goes to the next one. */
const STUFEN: readonly MitgliedStatus[] = ['anwaerter', 'mitglied', 'em'];

/**
 * Whether a status change follows the usual order: Anwärter -> Mitglied -> EM, one step at a time.
 * Becoming Externe:r is always usual, and an Externe:r may start the path as Anwärter:in. Any other
 * change (skipping a step, going back) is allowed but asks for confirmation in the UI.
 */
export function statusUebergangUeblich(von: MitgliedStatus, nach: MitgliedStatus): boolean {
  if (von === nach || nach === 'extern') return true;
  if (von === 'extern') return nach === 'anwaerter';
  return STUFEN.indexOf(nach) === STUFEN.indexOf(von) + 1;
}
