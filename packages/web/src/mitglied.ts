import type { Mitglied } from '@c4/shared';

type Namen = Pick<Mitglied, 'username' | 'vorname' | 'nachname' | 'email'>;

const vollerName = (m: Namen) => `${m.vorname} ${m.nachname}`.trim();

/** Primary label: the username, then the full name, then the email (not yet activated users). */
export const anzeigename = (m: Namen) => m.username ?? (vollerName(m) || m.email) ?? '';

/** Secondary label: the full name below the username. */
export const nebenname = (m: Namen) => (m.username ? vollerName(m) : '');
