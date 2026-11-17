/**
 * Query keys of areas without their own data file. The other areas define their keys next to their
 * hooks (`todoKeys` in `todoDaten.tsx`, `warenKeys` in `warenDaten.ts`, ...). A key is a prefix of
 * the keys below it, so invalidating `alle` refreshes the whole area; keep the arrays unchanged.
 */

/** The signed-in member (`me`), the own profile (`mitglied`) and the member list/detail pages. */
export const mitgliederKeys = {
  me: ['me'] as const,
  mitglied: ['mitglied'] as const,
  alle: ['mitglieder'] as const,
  /** The member list; with deactivated members it is a separate cache entry below `alle`. */
  liste: (mitDeaktivierten: boolean) =>
    mitDeaktivierten
      ? (['mitglieder', { deaktivierte: true }] as const)
      : (['mitglieder'] as const),
  eins: (kennung: string | undefined) => ['mitglieder', kennung] as const,
  statusHistorie: (sub: string) => ['mitglied-historie', sub] as const,
  statusHistorieAlle: ['mitglied-historie'] as const,
  deaktivierenVorschau: (sub: string) => ['deaktivieren-vorschau', sub] as const,
  vcardToken: ['vcard-token'] as const,
};

export const historieKeys = {
  alle: ['historie'] as const,
  eins: (kennung: string | undefined) => ['historie', kennung] as const,
};

export const postenKeys = {
  alle: ['posten'] as const,
  liste: (archiv: boolean) => ['posten', { archiv }] as const,
  eins: (id: string | undefined) => ['posten', id] as const,
};

export const inventurKeys = {
  alle: ['inventuren'] as const,
  offen: ['inventuren', 'offen'] as const,
  eine: (id: string | undefined) => ['inventuren', id] as const,
  zusammenfassung: (inventurId: string | null, iso: string | null) =>
    ['inventuren', inventurId, 'zusammenfassung', iso] as const,
};

export const systemKeys = {
  health: ['health'] as const,
};
