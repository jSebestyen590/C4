import type { Mengen } from './bargeldFormular';
import type { NachschubMap } from './kassenFormular';

// Draft of a started Kassenabrechnung: kept per Kasse in localStorage so a reload does not lose the
// typed counts. A draft only fits while the preview it was typed against (`basis`) is unchanged.

export interface KassenEntwurf {
  v: 1;
  /** Fingerprint of the preview the draft belongs to. */
  basis: string;
  datum: string;
  ist: Mengen;
  erloesWahl: string | null;
  zielWahl: string | null;
  transferEingabe: Mengen | null;
  nachschub: NachschubMap;
  eventEingabe: Record<string, number | null>;
  schluessel: { schluessel: string; inhalt: string } | null;
}

type Speicher = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const entwurfKey = (kontoId: string) => `c4.kassenabrechnung.entwurf.${kontoId}`;

/** Fingerprint of what an Abrechnung is based on: stock, last Abrechnung and the open counts. */
export const entwurfBasis = (p: {
  saldoCent: number;
  letzteAbrechnungId: string | null;
  zaehlungIds: readonly string[];
}): string => JSON.stringify([p.saldoCent, p.letzteAbrechnungId, [...p.zaehlungIds].sort()]);

export type EntwurfLesen =
  { art: 'keiner' } | { art: 'entwurf'; entwurf: KassenEntwurf } | { art: 'verworfen' };

/** Reads the draft; a draft of an older basis (or an unreadable one) is removed and reported as `verworfen`. */
export function entwurfLesen(speicher: Speicher, kontoId: string, basis: string): EntwurfLesen {
  try {
    const roh = speicher.getItem(entwurfKey(kontoId));
    if (roh === null) return { art: 'keiner' };
    const e = JSON.parse(roh) as Partial<KassenEntwurf> | null;
    if (!e || e.v !== 1 || e.basis !== basis) {
      speicher.removeItem(entwurfKey(kontoId));
      return { art: 'verworfen' };
    }
    return { art: 'entwurf', entwurf: e as KassenEntwurf };
  } catch {
    return { art: 'keiner' };
  }
}

export function entwurfSchreiben(speicher: Speicher, kontoId: string, entwurf: KassenEntwurf) {
  try {
    speicher.setItem(entwurfKey(kontoId), JSON.stringify(entwurf));
  } catch {
    // Storage full or blocked: the page still works without a draft.
  }
}

export function entwurfLoeschen(speicher: Speicher, kontoId: string) {
  try {
    speicher.removeItem(entwurfKey(kontoId));
  } catch {
    // Ignore.
  }
}
