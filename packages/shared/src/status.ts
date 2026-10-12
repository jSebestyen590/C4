/** Membership category: candidate, member, honorary member. Only admins change it. */
export const MITGLIED_STATI = ['anwaerter', 'mitglied', 'em'] as const;
export type MitgliedStatus = (typeof MITGLIED_STATI)[number];
