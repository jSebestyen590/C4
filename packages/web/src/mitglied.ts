import type { Mitglied } from '@c4/shared';

type Namen = Pick<Mitglied, 'username' | 'vorname' | 'nachname' | 'email'>;

const vollerName = (m: Namen) => `${m.vorname} ${m.nachname}`.trim();

/** Primary label: the username, then the full name, then the email (not yet activated users). */
export const anzeigename = (m: Namen) => m.username ?? (vollerName(m) || m.email) ?? '';

/** Secondary label: the full name below the username. */
export const nebenname = (m: Namen) => (m.username ? vollerName(m) : '');

/** URL of the detail page: by username, or by sub while the member has not chosen one. */
export const mitgliedLink = (m: Pick<Mitglied, 'username' | 'sub'>) =>
  `/mitglieder/${encodeURIComponent(m.username ?? m.sub)}`;

/** The details the contact channel links are built from. */
export const kontaktangaben = (m: Pick<Mitglied, 'telefon' | 'email' | 'discordName'>) => ({
  telefon: m.telefon,
  email: m.email,
  discordName: m.discordName,
});
