import { centAnzeigen, type BuchungRichtungDto } from '@c4/shared';

/** How many accounts of one side the journal names before it says "+ N weitere". */
export const RICHTUNG_MAX = 2;

export interface RichtungKurz {
  /** Names shown directly. */
  namen: string[];
  /** Number of accounts hidden behind "+ N weitere". */
  weitere: number;
}

/** Shortens one side of a booking: up to two names, else the first one and a count. */
export function richtungKurz(konten: readonly BuchungRichtungDto[]): RichtungKurz {
  if (konten.length <= RICHTUNG_MAX) return { namen: konten.map((k) => k.kontoName), weitere: 0 };
  return { namen: [konten[0]!.kontoName], weitere: konten.length - 1 };
}

/** "Bank (Fyrst)", "Bank, Safe" or "Bank + 3 weitere"; "–" when the side is empty. */
export function richtungText(konten: readonly BuchungRichtungDto[]): string {
  const { namen, weitere } = richtungKurz(konten);
  if (namen.length === 0) return '–';
  const text = namen.join(', ');
  return weitere > 0 ? `${text} + ${weitere} weitere` : text;
}

/** "Bank (Fyrst) → Geldtransit". */
export function vonNachText(
  abgang: readonly BuchungRichtungDto[],
  zugang: readonly BuchungRichtungDto[],
): string {
  return `${richtungText(abgang)} → ${richtungText(zugang)}`;
}

/** "Bank: 25,50 €" lines for the tooltip of a shortened side. */
export function richtungZeilen(konten: readonly BuchungRichtungDto[]): string[] {
  return konten.map((k) => `${k.kontoName}: ${centAnzeigen(k.betragCent)}`);
}

/** "Zugang 25,50 €" / "Abgang 25,50 €": word plus amount, so the direction is not only a color. */
export function bewegungText(betragCent: number): string {
  if (betragCent === 0) return centAnzeigen(0);
  return `${betragCent > 0 ? 'Zugang' : 'Abgang'} ${centAnzeigen(Math.abs(betragCent))}`;
}

/** Running balance; negative values carry an explicit minus sign and are marked by the caller. */
export function saldoText(saldoCent: number): string {
  return centAnzeigen(saldoCent).replace('-', '−');
}
