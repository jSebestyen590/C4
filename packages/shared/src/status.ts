/** Membership category: candidate, member, honorary member, external person (own category, same rights as a candidate for now). Only admins change it. */
export const MITGLIED_STATI = ['anwaerter', 'mitglied', 'em', 'extern'] as const;
export type MitgliedStatus = (typeof MITGLIED_STATI)[number];
